/**
 * Feature 3: 技能/物品使用條件 — 共用純邏輯
 *
 * 同時供玩家端驗證器（canUseSkill / canUseItem）與 server 端強制驗證使用，
 * 避免條件判斷與扣除邏輯雙寫導致前後端不一致。
 */

import type { UsageCondition } from '@/types/character';

/** 條件檢查所需的角色上下文（只取必要欄位，方便各呼叫端組裝） */
export interface UsageConditionContext {
  stats: ReadonlyArray<{ name: string; value: number }>;
  items: ReadonlyArray<{ id: string; quantity: number; name?: string }>;
}

export interface ConditionCheckResult {
  satisfied: boolean;
  /** 第一個未滿足條件的說明（用於禁用按鈕提示） */
  reason?: string;
}

/** 提交使用時需扣除的單筆變化（純資料，由呼叫端轉換為實際 DB 更新） */
export interface ConsumeDelta {
  kind: 'stat' | 'item';
  /** stat 為 statName，item 為 itemName */
  key: string;
  amount: number;
}

/**
 * 檢查多條件（AND）是否全部滿足。回傳第一個未滿足條件的 reason。
 */
export function checkUsageConditions(
  conditions: readonly UsageCondition[] | undefined,
  ctx: UsageConditionContext,
): ConditionCheckResult {
  if (!conditions || conditions.length === 0) {
    return { satisfied: true };
  }

  for (const condition of conditions) {
    if (condition.type === 'stat') {
      const current = ctx.stats.find((s) => s.name === condition.statName)?.value ?? 0;
      if (current < condition.value) {
        // reason 用通用文字：詳細條件由 UI 的「使用條件」區塊呈現，按鈕只需精簡提示
        return { satisfied: false, reason: '未滿足使用條件' };
      }
    } else {
      // item：依「名稱」加總所有同名條目的數量（同名可能有多個不同 id 的條目）
      const owned = ctx.items
        .filter((i) => i.name === condition.itemName)
        .reduce((sum, i) => sum + (i.quantity ?? 0), 0);
      if (owned < condition.quantity) {
        return { satisfied: false, reason: '未滿足使用條件' };
      }
    }
  }

  return { satisfied: true };
}

/**
 * 由條件推導「提交使用時」需扣除的變化清單（僅 consume=true 且數量為正者）。
 */
export function buildConsumeDeltas(
  conditions: readonly UsageCondition[] | undefined,
): ConsumeDelta[] {
  if (!conditions) return [];

  const deltas: ConsumeDelta[] = [];
  for (const condition of conditions) {
    if (!condition.consume) continue;
    if (condition.type === 'stat' && condition.value > 0) {
      deltas.push({ kind: 'stat', key: condition.statName, amount: condition.value });
    } else if (condition.type === 'item' && condition.quantity > 0) {
      deltas.push({ kind: 'item', key: condition.itemName, amount: condition.quantity });
    }
  }
  return deltas;
}

/** MongoDB `$inc` + `arrayFilters` 形式的扣除更新（identity-based，index 穩定） */
export interface ConsumeUpdate {
  inc: Record<string, number>;
  arrayFilters: Array<Record<string, unknown>>;
  /** 完全耗盡（扣到 0）的物品 id → 整個條目移除（$pull），與偷竊/移除效果一致，比留下數量 0 更直觀 */
  pullItemIds: string[];
}

/**
 * 將 consume 條件轉為 `$inc` 更新。
 *
 * - stat：依 stat 名稱定位（名稱唯一），`$inc -amount`
 * - item：依「名稱」加總後，**跨同名條目貪婪扣減**：
 *   - 條目被完全扣盡（take ≥ 數量）→ 整個條目移除（`pullItemIds`，比留下數量 0 更直觀）
 *   - 條目部分扣減（take < 數量）→ 以其 id 定位 `$inc`（相對扣減）
 *
 * 採 `$inc`（相對扣減）而非 `$set`，使其能在效果套用「之後」正確疊加；
 * arrayFilters 以 identity 定位，避免 item_take/steal 重排陣列後 index 錯位。
 * 扣減計畫以傳入的 items 快照規劃。無可扣除項時回傳 null。
 *
 * @param stats 角色數值快照（將 stat 名稱解析為 id，以 id 定位 — 對齊裝備系統的 proven pattern）
 * @param items 角色物品快照（規劃同名條目的扣減分配）
 */
export function buildConsumeUpdate(
  conditions: readonly UsageCondition[] | undefined,
  stats: ReadonlyArray<{ id: string; name: string }>,
  items: ReadonlyArray<{ id: string; name: string; quantity: number }>,
): ConsumeUpdate | null {
  const deltas = buildConsumeDeltas(conditions);
  if (deltas.length === 0) return null;

  const inc: Record<string, number> = {};
  const arrayFilters: Array<Record<string, unknown>> = [];
  const pullItemIds: string[] = [];
  let ph = 0;

  for (const delta of deltas) {
    if (delta.kind === 'stat') {
      // 以 stat id 定位（與裝備系統一致），名稱僅用於解析
      const statId = stats.find((s) => s.name === delta.key)?.id;
      if (!statId) continue;
      const key = `cus${ph++}`;
      inc[`stats.$[${key}].value`] = -delta.amount;
      arrayFilters.push({ [`${key}.id`]: statId });
    } else {
      // 跨同名條目貪婪扣減：依序從每個條目扣到滿足總量
      let remaining = delta.amount;
      for (const item of items.filter((i) => i.name === delta.key)) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, item.quantity);
        if (take <= 0) continue;
        if (take >= item.quantity) {
          // 完全耗盡 → 移除整個條目（與偷竊/移除效果一致）
          pullItemIds.push(item.id);
        } else {
          // 部分扣減 → $inc（剩餘必 > 0）
          const key = `cus${ph++}`;
          inc[`items.$[${key}].quantity`] = -take;
          arrayFilters.push({ [`${key}.id`]: item.id });
        }
        remaining -= take;
      }
    }
  }

  if (Object.keys(inc).length === 0 && pullItemIds.length === 0) return null;
  return { inc, arrayFilters, pullItemIds };
}
