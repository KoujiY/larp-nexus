import { describe, it, expect } from 'vitest';
import { canUseSkill } from '@/lib/utils/skill-validators';
import { canUseItem } from '@/lib/utils/item-validators';
import type { Skill, Item } from '@/types/character';

const ctx = {
  stats: [{ name: 'MP', value: 5 }],
  items: [{ id: 'i-bomb', name: '炸彈', quantity: 1 }],
};

const baseSkill: Skill = {
  id: 's1',
  name: '法術',
  description: '',
  checkType: 'none',
};

const baseItem: Item = {
  id: 'i1',
  name: '藥水',
  description: '',
  type: 'consumable',
  quantity: 1,
  isTransferable: true,
  acquiredAt: new Date('2026-01-01'),
  effects: [{ type: 'stat_change', targetType: 'self' }],
};

describe('canUseSkill — 使用條件 (Feature 3)', () => {
  it('未傳 ctx → 略過條件檢查（向後相容）', () => {
    const skill: Skill = { ...baseSkill, usageConditions: [{ type: 'stat', statName: 'MP', value: 999, consume: true }] };
    expect(canUseSkill(skill).canUse).toBe(true);
  });

  it('傳 ctx 且條件未達 → 不可用，reason 為通用文字', () => {
    const skill: Skill = { ...baseSkill, usageConditions: [{ type: 'stat', statName: 'MP', value: 10, consume: true }] };
    const result = canUseSkill(skill, ctx);
    expect(result.canUse).toBe(false);
    expect(result.reason).toBe('未滿足使用條件');
  });

  it('傳 ctx 且條件達標 → 可用', () => {
    const skill: Skill = { ...baseSkill, usageConditions: [{ type: 'stat', statName: 'MP', value: 5, consume: true }] };
    expect(canUseSkill(skill, ctx).canUse).toBe(true);
  });
});

describe('canUseItem — 使用條件 (Feature 3)', () => {
  it('未傳 ctx → 略過條件檢查（向後相容）', () => {
    const item: Item = { ...baseItem, usageConditions: [{ type: 'item', itemName: '炸彈', quantity: 99, consume: true }] };
    expect(canUseItem(item).canUse).toBe(true);
  });

  it('傳 ctx 且持有量不足 → 不可用', () => {
    const item: Item = { ...baseItem, usageConditions: [{ type: 'item', itemName: '炸彈', quantity: 99, consume: true }] };
    expect(canUseItem(item, ctx).canUse).toBe(false);
  });

  it('傳 ctx 且持有量足夠 → 可用', () => {
    const item: Item = { ...baseItem, usageConditions: [{ type: 'item', itemName: '炸彈', quantity: 1, consume: true }] };
    expect(canUseItem(item, ctx).canUse).toBe(true);
  });
});
