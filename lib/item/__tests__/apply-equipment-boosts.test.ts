import { describe, it, expect } from 'vitest';
import { buildEquipmentBoostUpdates } from '../apply-equipment-boosts';
import type { Stat, StatBoost } from '@/types/character';

function makeStat(name: string, value: number, maxValue?: number): Stat {
  return { id: `stat-${name}`, name, value, maxValue };
}

describe('buildEquipmentBoostUpdates - apply (裝備)', () => {
  it('target=both 同時調整 value 與 maxValue', () => {
    const stats = [makeStat('HP', 6, 10)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: -1, target: 'both' }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.value']).toBe(5);
    expect(updates['stats.0.maxValue']).toBe(9);
  });

  it('target=value 只調整 value', () => {
    const stats = [makeStat('HP', 10, 20)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: 5, target: 'value' }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.value']).toBe(15);
    expect(updates['stats.0.maxValue']).toBe(20);
  });

  it('target=maxValue 只調整 maxValue，value 維持', () => {
    const stats = [makeStat('HP', 10, 20)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: 5, target: 'maxValue' }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.value']).toBe(10);
    expect(updates['stats.0.maxValue']).toBe(25);
  });

  it('value 被 clamp 至 [0, newMax]', () => {
    const stats = [makeStat('HP', 3, 10)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: -5 }]; // 預設 target=value
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.value']).toBe(0);
  });

  it('maxValue 不會低於 1', () => {
    const stats = [makeStat('HP', 5, 3)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: -10, target: 'both' }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.maxValue']).toBe(1);
    expect(updates['stats.0.value']).toBe(0); // clamped
  });

  it('未指定 target 預設為 value', () => {
    const stats = [makeStat('HP', 10, 20)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: 5 }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.value']).toBe(15);
    expect(updates['stats.0.maxValue']).toBe(20);
  });

  it('stat 不存在時忽略 boost', () => {
    const stats = [makeStat('HP', 10, 20)];
    const boosts: StatBoost[] = [{ statName: 'MP', value: 5 }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates).toEqual({});
  });

  it('多個 boost 作用於同一 stat 時循序累積', () => {
    const stats = [makeStat('HP', 10, 20)];
    const boosts: StatBoost[] = [
      { statName: 'HP', value: 3, target: 'value' },
      { statName: 'HP', value: 2, target: 'value' },
    ];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.value']).toBe(15);
  });

  it('stat 無 maxValue 時，maxValue target boost 不寫入 max', () => {
    const stats = [makeStat('ATK', 5)];
    const boosts: StatBoost[] = [{ statName: 'ATK', value: 3, target: 'maxValue' }];
    const updates = buildEquipmentBoostUpdates(stats, boosts, 'apply');

    expect(updates['stats.0.maxValue']).toBeUndefined();
    expect(updates['stats.0.value']).toBe(5); // 未影響
  });
});

describe('buildEquipmentBoostUpdates - revert (卸除)', () => {
  // 使用者情境：裝備 HP -1 target=both，當前值同步調整，卸除後當前值不應補回
  it('使用者情境：6/10 → 裝備 -1 both → 5/9 → 卸除 → 5/10（當前值不補回）', () => {
    // Step 1: 裝備
    const initial = [makeStat('HP', 6, 10)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: -1, target: 'both' }];
    const equipUpdates = buildEquipmentBoostUpdates(initial, boosts, 'apply');
    expect(equipUpdates['stats.0.value']).toBe(5);
    expect(equipUpdates['stats.0.maxValue']).toBe(9);

    // Step 2: 卸除（state 為 5/9）
    const equipped = [makeStat('HP', 5, 9)];
    const revertUpdates = buildEquipmentBoostUpdates(equipped, boosts, 'revert');
    expect(revertUpdates['stats.0.value']).toBe(5); // 不補回
    expect(revertUpdates['stats.0.maxValue']).toBe(10); // max 恢復
  });

  it('+max both 卸除時：當前值未超過新 max → 不調整', () => {
    // 裝備 +1 both：6/10 → 7/11
    // 裝備期間受傷：7 → 5，狀態 5/11
    // 卸除：newMax=10，當前值 5 ≤ 10，不調整
    const equipped = [makeStat('HP', 5, 11)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: 1, target: 'both' }];
    const updates = buildEquipmentBoostUpdates(equipped, boosts, 'revert');

    expect(updates['stats.0.value']).toBe(5);
    expect(updates['stats.0.maxValue']).toBe(10);
  });

  it('+max both 卸除時：當前值超過新 max → clamp 下來', () => {
    // 裝備 +1 both：6/10 → 7/11，未受傷
    // 卸除：newMax=10，當前值 7 < 10，無需 clamp
    // 構造 clamp 情境：裝備 +5 both，10/10 → 15/15，無受傷，卸除 → 10/10
    const equipped = [makeStat('HP', 15, 15)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: 5, target: 'both' }];
    const updates = buildEquipmentBoostUpdates(equipped, boosts, 'revert');

    expect(updates['stats.0.value']).toBe(10);
    expect(updates['stats.0.maxValue']).toBe(10);
  });

  it('-max maxValue-only 卸除：最大值恢復、當前值不動', () => {
    // 裝備 -5 maxValue：10/20 → 10/15（value 未受 clamp）
    // 卸除：newMax=20，當前值 10 ≤ 20，不調整
    const equipped = [makeStat('HP', 10, 15)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: -5, target: 'maxValue' }];
    const updates = buildEquipmentBoostUpdates(equipped, boosts, 'revert');

    expect(updates['stats.0.value']).toBe(10);
    expect(updates['stats.0.maxValue']).toBe(20);
  });

  it('純 value boost 卸除採對稱反向', () => {
    // 裝備 +5 value：10/20 → 15/20
    // 卸除：-5 → 10/20
    const equipped = [makeStat('HP', 15, 20)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: 5, target: 'value' }];
    const updates = buildEquipmentBoostUpdates(equipped, boosts, 'revert');

    expect(updates['stats.0.value']).toBe(10);
    expect(updates['stats.0.maxValue']).toBe(20);
  });

  it('純 value -5 卸除：對稱反向補回 value', () => {
    // 裝備 -5 value：15/20 → 10/20
    // 卸除：+5 → 15/20（value-only 不適用最大值恢復規則）
    const equipped = [makeStat('HP', 10, 20)];
    const boosts: StatBoost[] = [{ statName: 'HP', value: -5, target: 'value' }];
    const updates = buildEquipmentBoostUpdates(equipped, boosts, 'revert');

    expect(updates['stats.0.value']).toBe(15);
  });

  it('空 boost 陣列回傳空 updates', () => {
    const stats = [makeStat('HP', 10, 20)];
    expect(buildEquipmentBoostUpdates(stats, undefined, 'apply')).toEqual({});
    expect(buildEquipmentBoostUpdates(stats, [], 'revert')).toEqual({});
  });
});
