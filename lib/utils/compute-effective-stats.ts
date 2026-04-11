/**
 * 有效數值計算（passthrough 版本）
 *
 * 從 v2 起，裝備的 statBoosts 會在裝備時 materialize 到 base stats（DB 寫入），
 * 卸除時依照最大值恢復規則反向（見 lib/item/apply-equipment-boosts.ts）。
 *
 * 因此這個檔案過去的「動態疊加裝備加成」邏輯已不再需要 — base stats 本身就是
 * 玩家/GM 看到的實際數值。此函式保留是為了維持呼叫端 API 穩定（EffectiveStat 型別），
 * 內部純粹 passthrough。
 *
 * 若未來要顯示「此數值被裝備影響」的視覺提示，應該直接從 items.statBoosts 判斷，
 * 而非依賴 equipmentBonus 欄位（已固定為 0）。
 */

import type { Stat, Item } from '@/types/character';

export interface EffectiveStat extends Stat {
  /** 裝備加成總量。自 materialize 重構後恆為 0（bonuses 已寫入 base）。 */
  equipmentBonus: number;
  /** 裝備對 maxValue 的加成總量。自 materialize 重構後恆為 0。 */
  equipmentMaxBonus: number;
  /** DB 中的原始 value（與 value 相同）。 */
  baseValue: number;
  /** DB 中的原始 maxValue（與 maxValue 相同）。 */
  baseMaxValue?: number;
}

/**
 * 將 base stats 包裝為 EffectiveStat（passthrough）
 *
 * @param stats - 角色的 base stats（已含所有 materialized 加成）
 * @param _items - 道具列表（保留參數以維持呼叫端相容性，不再使用）
 */
export function computeEffectiveStats(
  stats: Stat[],
  _items: Item[],
): EffectiveStat[] {
  return stats.map((stat) => ({
    id: stat.id,
    name: stat.name,
    value: stat.value,
    maxValue: stat.maxValue,
    equipmentBonus: 0,
    equipmentMaxBonus: 0,
    baseValue: stat.value,
    baseMaxValue: stat.maxValue,
  }));
}

/**
 * 取得指定數值名稱的值（含 materialized 加成）
 *
 * @param stats - 角色的 base stats
 * @param _items - 道具列表（保留參數，不再使用）
 * @param statName - 數值名稱
 */
export function getEffectiveStatValue(
  stats: Stat[],
  _items: Item[],
  statName: string,
): number | undefined {
  return stats.find((s) => s.name === statName)?.value;
}
