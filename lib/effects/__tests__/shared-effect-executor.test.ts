import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock 外部依賴 ──────────────────────────────────────────────────────────────

vi.mock('@/lib/game/update-character-data', () => ({
  updateCharacterData: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/game/get-character-data', () => ({
  getCharacterData: vi.fn(),
}))
vi.mock('@/lib/websocket/events', () => ({
  emitInventoryUpdated: vi.fn().mockResolvedValue(undefined),
  emitCharacterAffected: vi.fn().mockResolvedValue(undefined),
  emitRoleUpdated: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/character-cleanup', () => ({
  cleanItemData: vi.fn((items) => items),
}))

import { computeStatChange, applyItemTransfer } from '../shared-effect-executor'
import { updateCharacterData } from '@/lib/game/update-character-data'
import { getCharacterData } from '@/lib/game/get-character-data'
import type { StatLike, ItemLike } from '../shared-effect-executor'

// ─── computeStatChange 純函數 ──────────────────────────────────────────────────

describe('computeStatChange', () => {
  it('value target: 正常增加', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 10, maxValue: 20 }
    const r = computeStatChange(stat, 5, 'value', false)
    expect(r.newValue).toBe(15)
    expect(r.deltaValue).toBe(5)
    expect(r.newMaxValue).toBe(20)
    expect(r.deltaMax).toBe(0)
    expect(r.message).toBe('HP +5')
    expect(r.effectiveTarget).toBe('value')
  })

  it('value target: 上限截斷至 maxValue', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 18, maxValue: 20 }
    const r = computeStatChange(stat, 10, 'value', false)
    expect(r.newValue).toBe(20)
    expect(r.deltaValue).toBe(2)
  })

  it('value target: 下限截斷至 0', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 3, maxValue: 20 }
    const r = computeStatChange(stat, -10, 'value', false)
    expect(r.newValue).toBe(0)
    expect(r.deltaValue).toBe(-3)
    expect(r.message).toBe('HP -10')
  })

  it('value target: 無 maxValue 時不截斷', () => {
    const stat: StatLike = { id: 's1', name: 'STR', value: 5 }
    const r = computeStatChange(stat, 100, 'value', false)
    expect(r.newValue).toBe(105)
    expect(r.newMaxValue).toBeUndefined()
  })

  it('maxValue target: 修改最大值，目前值夾緊', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 10, maxValue: 20 }
    const r = computeStatChange(stat, 5, 'maxValue', false)
    expect(r.newMaxValue).toBe(25)
    expect(r.deltaMax).toBe(5)
    expect(r.newValue).toBe(10) // 未超過新 maxValue，不變
    expect(r.deltaValue).toBe(0)
    expect(r.message).toBe('HP 最大值 +5')
    expect(r.effectiveTarget).toBe('maxValue')
  })

  it('maxValue target: 目前值超過新 maxValue 時夾緊', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 18, maxValue: 20 }
    const r = computeStatChange(stat, -5, 'maxValue', false)
    expect(r.newMaxValue).toBe(15)
    expect(r.newValue).toBe(15) // 夾緊至新 maxValue
    expect(r.deltaValue).toBe(-3)
  })

  it('maxValue target + syncValue: 同步修改目前值', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 10, maxValue: 20 }
    const r = computeStatChange(stat, 5, 'maxValue', true)
    expect(r.newMaxValue).toBe(25)
    expect(r.newValue).toBe(15) // 同步調整
    expect(r.deltaValue).toBe(5)
    expect(r.message).toBe('HP 最大值 +5，目前值同步調整')
  })

  it('maxValue target: 無 maxValue 時退回 value target', () => {
    const stat: StatLike = { id: 's1', name: 'STR', value: 5 }
    const r = computeStatChange(stat, 3, 'maxValue', false)
    expect(r.effectiveTarget).toBe('value')
    expect(r.newValue).toBe(8)
    expect(r.newMaxValue).toBeUndefined()
  })

  it('maxValue target: 最大值不低於 1', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 2, maxValue: 3 }
    const r = computeStatChange(stat, -5, 'maxValue', false)
    expect(r.newMaxValue).toBe(1)
    expect(r.deltaMax).toBe(-2) // 3 → 1
  })

  it('負 delta 訊息不重複顯示負號', () => {
    const stat: StatLike = { id: 's1', name: 'HP', value: 10, maxValue: 20 }
    const r = computeStatChange(stat, -3, 'value', false)
    expect(r.message).toBe('HP -3')
  })
})

// ─── applyItemTransfer ──────────────────────────────────────────────────────────

describe('applyItemTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const makeItem = (overrides: Partial<ItemLike> = {}): ItemLike => ({
    id: 'item-1',
    name: '回復藥',
    description: '回復 HP',
    quantity: 1,
    acquiredAt: new Date(),
    ...overrides,
  })

  it('item_take: 數量為 1 時直接移除', async () => {
    const result = await applyItemTransfer({
      targetIdStr: 'char-target',
      sourceIdStr: 'char-source',
      targetItem: makeItem({ quantity: 1 }),
      effectType: 'item_take',
      notification: {
        sourceCharacterId: 'char-source',
        sourceCharacterName: '攻擊者',
        sourceType: 'skill',
        sourceName: '掠奪技能',
        hasStealthTag: false,
      },
    })

    expect(result.message).toBe('移除了 回復藥')
    expect(result.pendingRevealReceiverId).toBeUndefined()
    expect(updateCharacterData).toHaveBeenCalledWith('char-target', {
      $pull: { items: { id: 'item-1' } },
    })
  })

  it('item_take: 數量 > 1 時先 $pull 再 $push 減量版', async () => {
    const result = await applyItemTransfer({
      targetIdStr: 'char-target',
      sourceIdStr: 'char-source',
      targetItem: makeItem({ quantity: 3 }),
      effectType: 'item_take',
      notification: {
        sourceCharacterId: 'char-source',
        sourceCharacterName: '攻擊者',
        sourceType: 'item',
        sourceName: '剪刀',
        hasStealthTag: false,
      },
    })

    expect(result.message).toBe('移除了 回復藥')
    const calls = vi.mocked(updateCharacterData).mock.calls
    expect(calls[0]).toEqual(['char-target', { $pull: { items: { id: 'item-1' } } }])
    expect(calls[1][0]).toBe('char-target')
    expect((calls[1][1] as { $push: { items: { quantity: number } } }).$push.items.quantity).toBe(2)
  })

  it('item_steal: 偷竊並轉移給來源角色，回傳 pendingRevealReceiverId', async () => {
    vi.mocked(getCharacterData).mockResolvedValue({
      items: [],
    } as never)

    const result = await applyItemTransfer({
      targetIdStr: 'char-target',
      sourceIdStr: 'char-source',
      targetItem: makeItem({ quantity: 1 }),
      effectType: 'item_steal',
      notification: {
        sourceCharacterId: 'char-source',
        sourceCharacterName: '盜賊',
        sourceType: 'skill',
        sourceName: '偷竊術',
        hasStealthTag: false,
      },
    })

    expect(result.message).toBe('偷竊了 回復藥')
    expect(result.pendingRevealReceiverId).toBe('char-source')
    // 應該呼叫 updateCharacterData 把道具加給 source
    const calls = vi.mocked(updateCharacterData).mock.calls
    const pushCall = calls.find(
      (c) => c[0] === 'char-source' && (c[1] as { $push?: unknown }).$push != null
    )
    expect(pushCall).toBeDefined()
  })

  it('item_steal: 來源已有相同道具時增加數量', async () => {
    vi.mocked(getCharacterData).mockResolvedValue({
      items: [{ id: 'item-1', name: '回復藥', quantity: 2 }],
    } as never)

    await applyItemTransfer({
      targetIdStr: 'char-target',
      sourceIdStr: 'char-source',
      targetItem: makeItem({ quantity: 1 }),
      effectType: 'item_steal',
      notification: {
        sourceCharacterId: 'char-source',
        sourceCharacterName: '盜賊',
        sourceType: 'skill',
        sourceName: '偷竊術',
        hasStealthTag: false,
      },
    })

    const calls = vi.mocked(updateCharacterData).mock.calls
    // 應有一個 $push 呼叫，且 quantity = 3
    const pushCall = calls.find(
      (c) =>
        c[0] === 'char-source' &&
        (c[1] as { $push?: { items?: { quantity?: number } } }).$push?.items?.quantity === 3
    )
    expect(pushCall).toBeDefined()
  })
})
