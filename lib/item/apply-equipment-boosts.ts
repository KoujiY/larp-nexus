/**
 * 裝備加成 materialization 工具
 *
 * 將裝備的 statBoosts 實體化為 base stats 的變動（DB 寫入）：
 * - 裝備（apply）：將每個 boost 加到對應的 base stat
 * - 卸除（revert）：依照「最大值恢復規則」逆轉每個 boost
 *
 * 最大值恢復規則（與時效性效果過期 lib/effects/check-expired-effects.ts 一致）：
 *   用 `min(current, newMax)` 實作以下兩種情境：
 *   - 原 boost 為 +max（卸除時 max 下降）：當前值超過新 max 才 clamp 下來，
 *     未超過則不調整（例如裝備期間受傷，HP 已經降低，不應再下修）。
 *   - 原 boost 為 -max（卸除時 max 上升）：新 max 總是 ≥ 當前值，
 *     所以 min 會自然等於當前值 → 當前值不被「補回」。
 *
 * 純 value boost（target='value'）不涉及 max，卸除時採對稱反向。
 */

import type { Stat, StatBoost } from '@/types/character';

/**
 * 將單一 boost 套用到（或反向於）指定 stat，回傳新的 value/maxValue
 *
 * 注意：卸除（revert）時 target='both' 與 target='maxValue' 都採用
 * 「最大值恢復規則」（見檔案 header 第 8–15 行），而非對稱反向。
 * 此規則與時效性效果過期邏輯 lib/effects/check-expired-effects.ts 中
 * `statChangeTarget='maxValue' + syncValue=true` 的行為完全一致。
 *
 * @param stat - 當前 stat 狀態（已包含之前 boost 的累積）
 * @param boost - 要套用的 statBoost
 * @param mode - 'apply' = 裝備時套用；'revert' = 卸除時反向
 * @returns 新的 value 與 maxValue
 */
function applyOneBoost(
  stat: { value: number; maxValue?: number },
  boost: StatBoost,
  mode: 'apply' | 'revert',
): { value: number; maxValue: number | undefined } {
  const target = boost.target ?? 'value';
  const affectsMax = target === 'maxValue' || target === 'both';
  const affectsValue = target === 'value' || target === 'both';

  let newValue = stat.value;
  let newMax = stat.maxValue;

  if (mode === 'apply') {
    // 裝備：加上 boost
    if (affectsMax && stat.maxValue !== undefined) {
      newMax = Math.max(1, stat.maxValue + boost.value);
    }
    if (affectsValue) {
      newValue = stat.value + boost.value;
    }
    // clamp value 至 [0, newMax]
    newValue = Math.max(0, newValue);
    if (newMax !== undefined) {
      newValue = Math.min(newValue, newMax);
    }
  } else {
    // 卸除：反向
    const maxAffected = affectsMax && stat.maxValue !== undefined;
    if (maxAffected) {
      newMax = Math.max(1, stat.maxValue! - boost.value);
      // 涉及 max 的 boost → 採用「恢復規則」
      newValue = Math.min(stat.value, newMax);
    } else if (affectsValue) {
      // 純 value boost（不涉及 max）→ 對稱反向
      newValue = Math.max(0, stat.value - boost.value);
      if (stat.maxValue !== undefined) {
        newValue = Math.min(newValue, stat.maxValue);
      }
    }
  }

  return { value: newValue, maxValue: newMax };
}

/**
 * 計算裝備/卸除後的 stat 變動，回傳 MongoDB $set 格式的 updates
 *
 * @param stats - 角色當前的 base stats
 * @param boosts - 裝備的 statBoosts
 * @param mode - 'apply' = 裝備；'revert' = 卸除
 * @returns Record<string, number>，key 格式為 `stats.{index}.value` / `stats.{index}.maxValue`
 */
export function buildEquipmentBoostUpdates(
  stats: Stat[],
  boosts: StatBoost[] | undefined,
  mode: 'apply' | 'revert',
): Record<string, number> {
  const updates: Record<string, number> = {};
  if (!boosts || boosts.length === 0) return updates;

  // 多個 boost 可能作用於同一 stat，用 Map 追蹤工作狀態，循序套用
  const working = new Map<number, { value: number; maxValue: number | undefined }>();

  for (const boost of boosts) {
    const statIndex = stats.findIndex((s) => s.name === boost.statName);
    if (statIndex === -1) continue;

    const current = working.get(statIndex) ?? {
      value: stats[statIndex].value,
      maxValue: stats[statIndex].maxValue,
    };

    const next = applyOneBoost(current, boost, mode);
    working.set(statIndex, next);
  }

  for (const [statIndex, state] of working) {
    updates[`stats.${statIndex}.value`] = state.value;
    if (state.maxValue !== undefined) {
      updates[`stats.${statIndex}.maxValue`] = state.maxValue;
    }
  }

  return updates;
}

/**
 * Stat delta 結構：描述裝備/卸除帶來的 value/maxValue 變動
 *
 * - `valueDelta` / `maxValueDelta`：供 `$inc` 使用的相對變動量，可與其他
 *   並發 `$inc` 交換律結合，避免 absolute `$set` 的 lost-write。
 * - `expectedValue` / `expectedMaxValue`：在「無並發變動」假設下的新值，
 *   僅供 WebSocket 廣播使用（非資料庫真實狀態）。
 */
export interface StatBoostDelta {
  statId: string;
  statName: string;
  valueDelta: number;
  maxValueDelta: number;
  expectedValue: number;
  expectedMaxValue: number | undefined;
}

/**
 * 計算裝備/卸除後的 stat 變動（delta 形式）
 *
 * 與 `buildEquipmentBoostUpdates` 的差異：
 * - 本函數回傳 delta 與目標 stat id（而非絕對值與 stats 索引），
 *   讓呼叫端可以組合出 `$inc` + arrayFilters 的 identity-based 更新，
 *   避免 `stats.${index}.value` 在並發情境下的 lost-write / index 漂移。
 * - `expected*` 欄位用於 WebSocket 廣播，省去寫入後的第二次 DB 讀取。
 *
 * @param stats - 角色當前的 base stats（用於計算 delta 基準）
 * @param boosts - 裝備的 statBoosts
 * @param mode - 'apply' = 裝備；'revert' = 卸除
 * @returns StatBoostDelta 陣列（每個受影響的 stat 一筆，無變動則不回傳）
 */
export function buildEquipmentBoostDeltas(
  stats: Stat[],
  boosts: StatBoost[] | undefined,
  mode: 'apply' | 'revert',
): StatBoostDelta[] {
  if (!boosts || boosts.length === 0) return [];

  const working = new Map<number, { value: number; maxValue: number | undefined }>();

  for (const boost of boosts) {
    const statIndex = stats.findIndex((s) => s.name === boost.statName);
    if (statIndex === -1) continue;

    const current = working.get(statIndex) ?? {
      value: stats[statIndex].value,
      maxValue: stats[statIndex].maxValue,
    };

    const next = applyOneBoost(current, boost, mode);
    working.set(statIndex, next);
  }

  const deltas: StatBoostDelta[] = [];
  for (const [statIndex, state] of working) {
    const original = stats[statIndex];
    const valueDelta = state.value - original.value;
    // maxValue 可能為 undefined（非上限型 stat），此時 delta 視為 0
    const originalMax = original.maxValue ?? 0;
    const nextMax = state.maxValue ?? 0;
    const maxValueDelta = nextMax - originalMax;

    // 完全沒變動的 stat 不需進 update spec
    if (valueDelta === 0 && maxValueDelta === 0) continue;

    deltas.push({
      statId: original.id,
      statName: original.name,
      valueDelta,
      maxValueDelta,
      expectedValue: state.value,
      expectedMaxValue: state.maxValue,
    });
  }

  return deltas;
}
