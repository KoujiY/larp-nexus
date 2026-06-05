/**
 * field-updaters 內部共用 helpers
 * 供 skills.ts 和 items.ts 使用
 */

import type { UsageCondition } from '@/types/character';

/**
 * Feature 3: 正規化使用條件陣列（供 Skills / Items 共用）
 *
 * 同時擔任 sanitization：丟棄缺欄位或數量非正的無效條件，
 * 避免 GM 編輯時的空白列被存入 DB。
 */
export function normalizeUsageConditions(raw: unknown): UsageCondition[] {
  if (!Array.isArray(raw)) return [];

  const result: UsageCondition[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const cond = entry as Record<string, unknown>;
    const consume = Boolean(cond.consume);

    if (cond.type === 'stat') {
      const statName = typeof cond.statName === 'string' ? cond.statName.trim() : '';
      const value = Number(cond.value);
      if (statName && Number.isFinite(value) && value > 0) {
        result.push({ type: 'stat', statName, value, consume });
      }
    } else if (cond.type === 'item') {
      const itemName = typeof cond.itemName === 'string' ? cond.itemName.trim() : '';
      const quantity = Number(cond.quantity);
      if (itemName && Number.isFinite(quantity) && quantity > 0) {
        result.push({ type: 'item', itemName, quantity, consume });
      }
    }
  }
  return result;
}

/**
 * 正規化單一效果物件，供 Skills / Items 共用
 * @param effect 原始效果資料（以 Record 接收，避免重複定義型別）
 * @param withTaskId 是否包含 targetTaskId（技能效果專用）
 */
export function normalizeEffectData(
  effect: Record<string, unknown>,
  withTaskId = false
): Record<string, unknown> {
  const type = effect.type as string;
  const defaultTargetType =
    (type === 'item_take' || type === 'item_steal') ? 'other' : 'self';
  const normalizedTargetType =
    (effect.targetType as string | undefined) ?? defaultTargetType;
  const effectData: Record<string, unknown> = {
    type,
    targetType: normalizedTargetType,
    requiresTarget: effect.requiresTarget != null
      ? Boolean(effect.requiresTarget)
      : normalizedTargetType !== 'self',
  };
  if (effect.targetStat != null) effectData.targetStat = String(effect.targetStat);
  if (effect.value != null) effectData.value = Number(effect.value);
  if (effect.statChangeTarget != null) effectData.statChangeTarget = String(effect.statChangeTarget);
  if (effect.syncValue != null) effectData.syncValue = Boolean(effect.syncValue);
  if (effect.targetItemId != null) effectData.targetItemId = String(effect.targetItemId);
  if (withTaskId && effect.targetTaskId != null) effectData.targetTaskId = String(effect.targetTaskId);
  if (effect.duration != null) effectData.duration = Number(effect.duration);
  if (effect.description != null) effectData.description = String(effect.description);
  return effectData;
}

/** normalizeCheckConfig が返す設定パッチ型 */
type CheckConfigPatch = {
  contestConfig?: unknown;
  randomConfig?: { maxValue: number; threshold: number };
};

/**
 * 從 randomConfig 衍生合法的 { maxValue, threshold }，缺漏時補上預設值。
 * 供 random 和 random_contest 類型共用。
 */
function ensureRandomConfig(
  name: string,
  randomConfig: { maxValue?: number; threshold?: number } | undefined,
): { maxValue: number; threshold: number } {
  const maxValue = randomConfig?.maxValue;
  const threshold = randomConfig?.threshold;
  if (!maxValue || threshold == null) {
    console.warn(`[field-updaters] ${name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`);
    return {
      maxValue: maxValue && maxValue > 0 ? maxValue : 100,
      threshold: threshold != null && threshold > 0 ? threshold : 50,
    };
  }
  return { maxValue, threshold: Math.min(threshold, maxValue) };
}

/**
 * 正規化檢定設定，回傳應合併至道具/技能資料的設定欄位
 * 供 Skills / Items 共用。
 *
 * - contest         : 只需要 contestConfig
 * - random          : 只需要 randomConfig（缺漏補預設）
 * - random_contest  : 同時需要 contestConfig 和 randomConfig（缺漏補預設）
 *
 * @returns 應合併至資料物件的設定欄位（spread 使用）
 */
export function normalizeCheckConfig(
  name: string,
  checkType: string | undefined,
  contestConfig: unknown,
  randomConfig: { maxValue?: number; threshold?: number } | undefined,
): CheckConfigPatch {
  if (checkType === 'contest') {
    if (contestConfig) {
      return { contestConfig };
    }
    console.error(`[field-updaters] ${name} 設定為對抗檢定但沒有 contestConfig`);
    return {};
  }

  if (checkType === 'random_contest') {
    // random_contest 同時需要兩種設定；randomConfig 缺漏時自動補預設值
    // 這會讓過去被 bug 腐蝕（缺少 randomConfig）的舊資料在下一次儲存時自動修復
    const patch: CheckConfigPatch = {
      randomConfig: ensureRandomConfig(name, randomConfig),
    };
    if (contestConfig) {
      patch.contestConfig = contestConfig;
    } else {
      console.error(`[field-updaters] ${name} 設定為對抗檢定但沒有 contestConfig`);
    }
    return patch;
  }

  if (checkType === 'random') {
    return { randomConfig: ensureRandomConfig(name, randomConfig) };
  }

  return {};
}
