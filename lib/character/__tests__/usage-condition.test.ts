import { describe, it, expect } from 'vitest';
import {
  checkUsageConditions,
  buildConsumeDeltas,
  buildConsumeUpdate,
  type UsageConditionContext,
} from '@/lib/character/usage-condition';
import type { UsageCondition } from '@/types/character';

const ctx: UsageConditionContext = {
  stats: [
    { name: 'MP', value: 10 },
    { name: 'HP', value: 30 },
  ],
  items: [
    { id: 'item-mana', quantity: 2, name: '魔力結晶' },
    { id: 'item-coin', quantity: 5, name: '金幣' },
  ],
};

describe('checkUsageConditions', () => {
  it('無條件時視為滿足', () => {
    expect(checkUsageConditions(undefined, ctx)).toEqual({ satisfied: true });
    expect(checkUsageConditions([], ctx)).toEqual({ satisfied: true });
  });

  it('stat 門檻達標 → 滿足', () => {
    const conds: UsageCondition[] = [{ type: 'stat', statName: 'MP', value: 10, consume: true }];
    expect(checkUsageConditions(conds, ctx).satisfied).toBe(true);
  });

  it('stat 門檻未達 → 不滿足且回傳通用 reason', () => {
    const conds: UsageCondition[] = [{ type: 'stat', statName: 'MP', value: 20, consume: true }];
    const result = checkUsageConditions(conds, ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toBe('未滿足使用條件');
  });

  it('stat 不存在 → 視為 0，未達門檻', () => {
    const conds: UsageCondition[] = [{ type: 'stat', statName: '怒氣', value: 1, consume: false }];
    expect(checkUsageConditions(conds, ctx).satisfied).toBe(false);
  });

  it('item 依名稱加總達標 → 滿足', () => {
    const conds: UsageCondition[] = [{ type: 'item', itemName: '魔力結晶', quantity: 2, consume: true }];
    expect(checkUsageConditions(conds, ctx).satisfied).toBe(true);
  });

  it('item 依名稱跨多個同名條目加總', () => {
    const multiCtx: UsageConditionContext = {
      stats: [],
      items: [
        { id: 'bomb-1', quantity: 1, name: '炸彈' },
        { id: 'bomb-2', quantity: 3, name: '炸彈' },
      ],
    };
    // 需 4 個炸彈：1 + 3 = 4 → 滿足
    const conds: UsageCondition[] = [{ type: 'item', itemName: '炸彈', quantity: 4, consume: true }];
    expect(checkUsageConditions(conds, multiCtx).satisfied).toBe(true);
    // 需 5 個 → 不足
    expect(
      checkUsageConditions([{ type: 'item', itemName: '炸彈', quantity: 5, consume: true }], multiCtx).satisfied,
    ).toBe(false);
  });

  it('item 數量不足 → 不滿足且回傳通用 reason', () => {
    const conds: UsageCondition[] = [{ type: 'item', itemName: '魔力結晶', quantity: 3, consume: true }];
    const result = checkUsageConditions(conds, ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toBe('未滿足使用條件');
  });

  it('未持有的名稱 → 視為 0，不滿足', () => {
    const conds: UsageCondition[] = [{ type: 'item', itemName: '不存在道具', quantity: 1, consume: false }];
    expect(checkUsageConditions(conds, ctx).satisfied).toBe(false);
  });

  it('多條件 AND：全部滿足才滿足', () => {
    const conds: UsageCondition[] = [
      { type: 'stat', statName: 'MP', value: 5, consume: true },
      { type: 'item', itemName: '金幣', quantity: 3, consume: false },
    ];
    expect(checkUsageConditions(conds, ctx).satisfied).toBe(true);
  });

  it('多條件 AND：任一不滿足即回傳通用 reason', () => {
    const conds: UsageCondition[] = [
      { type: 'stat', statName: 'MP', value: 5, consume: true },
      { type: 'item', itemName: '金幣', quantity: 99, consume: false },
    ];
    const result = checkUsageConditions(conds, ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toBe('未滿足使用條件');
  });
});

describe('buildConsumeDeltas', () => {
  it('無條件 → 空陣列', () => {
    expect(buildConsumeDeltas(undefined)).toEqual([]);
    expect(buildConsumeDeltas([])).toEqual([]);
  });

  it('只回傳 consume=true 的條件', () => {
    const conds: UsageCondition[] = [
      { type: 'stat', statName: 'MP', value: 10, consume: true },
      { type: 'stat', statName: 'HP', value: 5, consume: false },
    ];
    expect(buildConsumeDeltas(conds)).toEqual([{ kind: 'stat', key: 'MP', amount: 10 }]);
  });

  it('stat 與 item 混合扣除（item key 為名稱）', () => {
    const conds: UsageCondition[] = [
      { type: 'stat', statName: 'MP', value: 10, consume: true },
      { type: 'item', itemName: '魔力結晶', quantity: 1, consume: true },
    ];
    expect(buildConsumeDeltas(conds)).toEqual([
      { kind: 'stat', key: 'MP', amount: 10 },
      { kind: 'item', key: '魔力結晶', amount: 1 },
    ]);
  });

  it('amount 為 0 或負時略過', () => {
    const conds: UsageCondition[] = [
      { type: 'stat', statName: 'MP', value: 0, consume: true },
      { type: 'item', itemName: '魔力結晶', quantity: 0, consume: true },
    ];
    expect(buildConsumeDeltas(conds)).toEqual([]);
  });
});

describe('buildConsumeUpdate', () => {
  const stats = [
    { id: 'stat-mp', name: 'MP' },
    { id: 'stat-hp', name: 'HP' },
  ];
  const items = [
    { id: 'item-x', name: '魔力結晶', quantity: 5 },
  ];

  it('無可扣除項 → null', () => {
    expect(buildConsumeUpdate(undefined, stats, items)).toBeNull();
    expect(buildConsumeUpdate([{ type: 'stat', statName: 'MP', value: 5, consume: false }], stats, items)).toBeNull();
  });

  it('stat 扣除 → $inc 以「id」定位（對齊裝備系統）', () => {
    const result = buildConsumeUpdate([{ type: 'stat', statName: 'MP', value: 10, consume: true }], stats, items);
    expect(result!.inc).toEqual({ 'stats.$[cus0].value': -10 });
    expect(result!.arrayFilters).toEqual([{ 'cus0.id': 'stat-mp' }]);
    expect(result!.pullItemIds).toEqual([]);
  });

  it('stat 名稱找不到對應 id → 略過', () => {
    const result = buildConsumeUpdate([{ type: 'stat', statName: '怒氣', value: 10, consume: true }], stats, items);
    expect(result).toBeNull();
  });

  it('item 部分扣減（未耗盡）→ $inc 以 id 定位', () => {
    // item-x 有 5 個，扣 2 → 剩 3（部分扣減）
    const result = buildConsumeUpdate(
      [{ type: 'item', itemName: '魔力結晶', quantity: 2, consume: true }],
      stats,
      items,
    );
    expect(result!.inc).toEqual({ 'items.$[cus0].quantity': -2 });
    expect(result!.arrayFilters).toEqual([{ 'cus0.id': 'item-x' }]);
    expect(result!.pullItemIds).toEqual([]);
  });

  it('item 完全耗盡 → 移除整個條目（pullItemIds）', () => {
    // item-x 有 5 個，扣 5 → 耗盡，移除
    const result = buildConsumeUpdate(
      [{ type: 'item', itemName: '魔力結晶', quantity: 5, consume: true }],
      stats,
      items,
    );
    expect(result!.inc).toEqual({});
    expect(result!.pullItemIds).toEqual(['item-x']);
  });

  it('item 跨多個同名條目：耗盡者移除、部分者扣減', () => {
    const multiItems = [
      { id: 'bomb-1', name: '炸彈', quantity: 1 },
      { id: 'bomb-2', name: '炸彈', quantity: 3 },
    ];
    // 需扣 2：bomb-1 扣 1（耗盡→移除）、bomb-2 扣 1（部分→$inc）
    const result = buildConsumeUpdate(
      [{ type: 'item', itemName: '炸彈', quantity: 2, consume: true }],
      stats,
      multiItems,
    );
    expect(result!.pullItemIds).toEqual(['bomb-1']);
    expect(result!.inc).toEqual({ 'items.$[cus0].quantity': -1 });
    expect(result!.arrayFilters).toEqual([{ 'cus0.id': 'bomb-2' }]);
  });

  it('多條件 → placeholder 各自獨立不衝突', () => {
    const result = buildConsumeUpdate(
      [
        { type: 'stat', statName: 'MP', value: 5, consume: true },
        { type: 'item', itemName: '魔力結晶', quantity: 1, consume: true },
      ],
      stats,
      items,
    );
    expect(Object.keys(result!.inc)).toHaveLength(2);
    expect(result!.arrayFilters).toHaveLength(2);
    expect(result!.inc['stats.$[cus0].value']).toBe(-5);
    expect(result!.inc['items.$[cus1].quantity']).toBe(-1);
    expect(result!.pullItemIds).toEqual([]);
  });
});
