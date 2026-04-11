import { describe, it, expect } from 'vitest';
import { computeEffectiveStats, getEffectiveStatValue } from '../compute-effective-stats';
import type { Stat, Item } from '@/types/character';

/**
 * 自 materialize 重構後，computeEffectiveStats 是純 passthrough。
 * 所有裝備加成邏輯改由 lib/item/apply-equipment-boosts.ts 處理並寫入 DB。
 * 這裡的測試只驗證 passthrough 行為。
 */

function makeStat(name: string, value: number, maxValue?: number): Stat {
  return { id: `stat-${name}`, name, value, maxValue };
}

function makeEquipment(
  name: string,
  statBoosts: Array<{ statName: string; value: number; target?: 'value' | 'maxValue' | 'both' }>,
  equipped = true,
): Item {
  return {
    id: `item-${name}`,
    name,
    description: '',
    type: 'equipment',
    quantity: 1,
    isTransferable: true,
    acquiredAt: new Date(),
    equipped,
    statBoosts,
  };
}

describe('computeEffectiveStats (passthrough)', () => {
  it('無裝備時回傳原始值', () => {
    const stats = [makeStat('HP', 10, 20), makeStat('ATK', 5)];
    const result = computeEffectiveStats(stats, []);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'HP',
      value: 10,
      maxValue: 20,
      equipmentBonus: 0,
      equipmentMaxBonus: 0,
      baseValue: 10,
      baseMaxValue: 20,
    });
    expect(result[1]).toMatchObject({
      name: 'ATK',
      value: 5,
      maxValue: undefined,
      equipmentBonus: 0,
      equipmentMaxBonus: 0,
      baseValue: 5,
    });
  });

  it('即使有已裝備 item，也不再動態加成（已 materialize 至 base）', () => {
    const stats = [makeStat('HP', 10, 20)];
    const items = [makeEquipment('Ring', [{ statName: 'HP', value: 5 }])];
    const result = computeEffectiveStats(stats, items);

    // Passthrough: 回傳值與 base stats 相同
    expect(result[0]).toMatchObject({
      name: 'HP',
      value: 10,
      maxValue: 20,
      equipmentBonus: 0,
      equipmentMaxBonus: 0,
    });
  });

  it('多個 stat 結構維持', () => {
    const stats = [makeStat('HP', 10, 20), makeStat('ATK', 5), makeStat('DEF', 3, 10)];
    const result = computeEffectiveStats(stats, []);

    expect(result[0]).toMatchObject({ name: 'HP', value: 10, maxValue: 20 });
    expect(result[1]).toMatchObject({ name: 'ATK', value: 5, maxValue: undefined });
    expect(result[2]).toMatchObject({ name: 'DEF', value: 3, maxValue: 10 });
  });

  it('不修改輸入 stats（immutable）', () => {
    const stats = [makeStat('HP', 10, 20)];
    const snapshot = JSON.parse(JSON.stringify(stats));
    computeEffectiveStats(stats, []);
    expect(stats).toEqual(snapshot);
  });
});

describe('getEffectiveStatValue (passthrough)', () => {
  it('取得指定數值', () => {
    const stats = [makeStat('HP', 10, 20), makeStat('ATK', 5)];
    expect(getEffectiveStatValue(stats, [], 'ATK')).toBe(5);
    expect(getEffectiveStatValue(stats, [], 'HP')).toBe(10);
  });

  it('數值不存在時回傳 undefined', () => {
    const stats = [makeStat('HP', 10, 20)];
    expect(getEffectiveStatValue(stats, [], 'NONEXIST')).toBeUndefined();
  });
});
