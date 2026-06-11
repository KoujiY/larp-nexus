import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock external dependencies before importing the module ──────────────────

vi.mock('@/lib/db/models/Character', () => ({
  default: { findByIdAndUpdate: vi.fn() },
}))

vi.mock('@/lib/db/models/CharacterRuntime', () => ({
  default: { findByIdAndUpdate: vi.fn() },
}))

vi.mock('@/lib/game/get-character-data', () => ({
  getCharacterData: vi.fn(),
}))

vi.mock('@/lib/reveal/reveal-event-emitter', () => ({
  emitSecretRevealed: vi.fn().mockResolvedValue(undefined),
  emitTaskRevealed: vi.fn().mockResolvedValue(undefined),
  emitSkillRevealed: vi.fn().mockResolvedValue(undefined),
  emitSkillHidden: vi.fn().mockResolvedValue(undefined),
  emitItemRevealed: vi.fn().mockResolvedValue(undefined),
  emitItemHidden: vi.fn().mockResolvedValue(undefined),
}))

import { executeAutoReveal } from '../auto-reveal-evaluator'
import { getCharacterData } from '@/lib/game/get-character-data'
import Character from '@/lib/db/models/Character'

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<{
  secretInfo: { secrets: unknown[] }
  tasks: unknown[]
  viewedItems: Array<{ itemId: string }>
  items: Array<{ id: string; name?: string; isHidden?: boolean; autoRevealCondition?: unknown }>
  skills: Array<{ id: string; name?: string; isHidden?: boolean; autoRevealCondition?: unknown }>
}> = {}) {
  return {
    _id: 'char-id',
    secretInfo: { secrets: [] },
    tasks: [],
    viewedItems: [],
    items: [],
    skills: [],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executeAutoReveal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when character not found', async () => {
    vi.mocked(getCharacterData).mockRejectedValue(new Error('Not found'))
    const result = await executeAutoReveal('nonexistent-id', { type: 'items_viewed', itemIds: [] })
    expect(result).toEqual([])
  })

  it('returns empty array when no auto-reveal conditions exist', async () => {
    const character = makeCharacter({
      secretInfo: { secrets: [{ id: 's1', title: 'Secret', isRevealed: false }] },
      tasks: [{ id: 't1', title: 'Task', isHidden: true, isRevealed: false }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    const result = await executeAutoReveal('char-id', { type: 'items_viewed', itemIds: ['item-1'] })
    expect(result).toEqual([])
  })

  it('reveals secret when items_viewed condition is met', async () => {
    const character = makeCharacter({
      secretInfo: {
        secrets: [{
          id: 's1',
          title: 'Hidden Truth',
          isRevealed: false,
          autoRevealCondition: { type: 'items_viewed', itemIds: ['item-1'] },
        }],
      },
      viewedItems: [{ itemId: 'item-1' }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', { type: 'items_viewed', itemIds: ['item-1'] })

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('secret')
    expect(result[0].id).toBe('s1')
    expect(result[0].title).toBe('Hidden Truth')
  })

  it('does not reveal secret when condition items not all viewed (AND logic)', async () => {
    const character = makeCharacter({
      secretInfo: {
        secrets: [{
          id: 's1',
          title: 'Locked Secret',
          isRevealed: false,
          autoRevealCondition: {
            type: 'items_viewed',
            itemIds: ['item-1', 'item-2'],
            matchLogic: 'and',
          },
        }],
      },
      viewedItems: [{ itemId: 'item-1' }], // only item-1 viewed, not item-2
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const result = await executeAutoReveal('char-id', { type: 'items_viewed', itemIds: ['item-1'] })
    expect(result).toEqual([])
  })

  it('reveals secret when any item viewed (OR logic)', async () => {
    const character = makeCharacter({
      secretInfo: {
        secrets: [{
          id: 's1',
          title: 'Easy Secret',
          isRevealed: false,
          autoRevealCondition: {
            type: 'items_viewed',
            itemIds: ['item-1', 'item-2'],
            matchLogic: 'or',
          },
        }],
      },
      viewedItems: [{ itemId: 'item-1' }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', { type: 'items_viewed', itemIds: ['item-1'] })
    expect(result).toHaveLength(1)
  })

  it('does not reveal already-revealed secrets', async () => {
    const character = makeCharacter({
      secretInfo: {
        secrets: [{
          id: 's1',
          title: 'Already Known',
          isRevealed: true, // already revealed
          autoRevealCondition: { type: 'items_viewed', itemIds: ['item-1'] },
        }],
      },
      viewedItems: [{ itemId: 'item-1' }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const result = await executeAutoReveal('char-id', { type: 'items_viewed', itemIds: ['item-1'] })
    expect(result).toEqual([])
  })

  it('chain-reveals task when secret reveal condition is met', async () => {
    const character = makeCharacter({
      secretInfo: {
        secrets: [{
          id: 's1',
          title: 'Secret',
          isRevealed: false,
          autoRevealCondition: { type: 'items_viewed', itemIds: ['item-1'] },
        }],
      },
      tasks: [{
        id: 't1',
        title: 'Chain Task',
        isHidden: true,
        isRevealed: false,
        autoRevealCondition: {
          type: 'secrets_revealed',
          secretIds: ['s1'],
        },
      }],
      viewedItems: [{ itemId: 'item-1' }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', { type: 'items_viewed', itemIds: ['item-1'] })

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('secret')
    expect(result[1].type).toBe('task')
    expect(result[1].id).toBe('t1')
  })

  describe('skill/item visibility conditions', () => {
    // 1. 隱藏技能在 items_viewed 條件（AND）滿足時被揭露
    it('reveals hidden skill when items_viewed condition met (AND)', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Hidden Skill', isHidden: true,
          autoRevealCondition: {
            type: 'items_viewed', itemIds: ['item-x'], matchLogic: 'and',
          },
        }],
        viewedItems: [{ itemId: 'item-x' }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'items_viewed', itemIds: ['item-x'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'skill', action: 'reveal', id: 'sk1',
      })
    })

    // 2. AND 條件只部分滿足時不揭露
    it('does NOT reveal when AND condition partially met', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Locked Skill', isHidden: true,
          autoRevealCondition: {
            type: 'items_viewed', itemIds: ['item-x', 'item-y'], matchLogic: 'and',
          },
        }],
        viewedItems: [{ itemId: 'item-x' }], // 只看了 item-x，缺 item-y
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      const result = await executeAutoReveal('char-id', {
        type: 'items_viewed', itemIds: ['item-x'],
      })

      expect(result).toEqual([])
    })

    // 3. OR 條件只要一個 id 符合即揭露
    it('reveals via OR when any id matches', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Easy Skill', isHidden: true,
          autoRevealCondition: {
            type: 'items_viewed', itemIds: ['item-x', 'item-y'], matchLogic: 'or',
          },
        }],
        viewedItems: [{ itemId: 'item-y' }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'items_viewed', itemIds: ['item-y'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'skill', action: 'reveal', id: 'sk1' })
    })

    // 4. skill_used 觸發揭露隱藏技能
    it('reveals hidden skill on skill_used trigger', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Triggered Skill', isHidden: true,
          autoRevealCondition: {
            type: 'skill_used', skillIds: ['sk-trigger'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'skill', action: 'reveal', id: 'sk1' })
    })

    // 5. item_used 觸發揭露隱藏物品
    it('reveals hidden item on item_used trigger', async () => {
      const character = makeCharacter({
        items: [{
          id: 'it1', name: 'Triggered Item', isHidden: true,
          autoRevealCondition: {
            type: 'item_used', itemIds: ['it-trigger'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'item_used', itemIds: ['it-trigger'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'item', action: 'reveal', id: 'it1' })
    })

    // 6. skills_revealed 同層連鎖：A 被揭露後，B 的條件（depends on A）也在同次呼叫中滿足
    it('skills_revealed same-layer chain: reveals A then B in one call', async () => {
      const character = makeCharacter({
        skills: [
          {
            id: 'sk1', name: 'Skill A', isHidden: true,
            autoRevealCondition: {
              type: 'skill_used', skillIds: ['sk-trigger'],
            },
          },
          {
            id: 'sk2', name: 'Skill B', isHidden: true,
            autoRevealCondition: {
              type: 'skills_revealed', skillIds: ['sk1'],
            },
          },
        ],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id)).toEqual(['sk1', 'sk2'])
    })

    // 7. 同層連鎖限一輪：A→B 觸發，B→C 不在同次呼叫中觸發
    it('same-layer chain limited to one round: A and B revealed, C NOT revealed', async () => {
      const character = makeCharacter({
        skills: [
          {
            id: 'sk1', name: 'Skill A', isHidden: true,
            autoRevealCondition: {
              type: 'skill_used', skillIds: ['sk-trigger'],
            },
          },
          {
            id: 'sk2', name: 'Skill B', isHidden: true,
            autoRevealCondition: {
              type: 'skills_revealed', skillIds: ['sk1'],
            },
          },
          {
            id: 'sk3', name: 'Skill C', isHidden: true,
            autoRevealCondition: {
              type: 'skills_revealed', skillIds: ['sk2'],
            },
          },
        ],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      // sk1 和 sk2 揭露，sk3 不揭露（連鎖限一輪）
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id)).toEqual(['sk1', 'sk2'])
    })

    // 8. 已可見的技能（isHidden: false）即使條件滿足也不會出現在結果中
    it('does not reveal an already-visible skill', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Visible Skill', isHidden: false,
          autoRevealCondition: {
            type: 'skill_used', skillIds: ['sk-trigger'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      expect(result).toEqual([])
    })

    // 9. skill_targeted 觸發揭露隱藏技能（被動條件，目標方視角）
    it('reveals hidden skill on skill_targeted trigger', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Passive Skill', isHidden: true,
          autoRevealCondition: {
            type: 'skill_targeted', skillIds: ['sk-source'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_targeted', skillIds: ['sk-source'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'skill', action: 'reveal', id: 'sk1' })
    })

    // 10. item_targeted 觸發揭露隱藏物品（被動條件，目標方視角）
    it('reveals hidden item on item_targeted trigger', async () => {
      const character = makeCharacter({
        items: [{
          id: 'it1', name: 'Passive Item', isHidden: true,
          autoRevealCondition: {
            type: 'item_targeted', itemIds: ['it-source'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'item_targeted', itemIds: ['it-source'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'item', action: 'reveal', id: 'it1' })
    })

    // 11. 主動條件不被被動觸發滿足（active/passive 集合獨立）
    it('skill_used condition is NOT satisfied by skill_targeted trigger', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Active Only Skill', isHidden: true,
          autoRevealCondition: {
            type: 'skill_used', skillIds: ['sk-source'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      // 傳入被動觸發，不應滿足主動條件
      const result = await executeAutoReveal('char-id', {
        type: 'skill_targeted', skillIds: ['sk-source'],
      })

      expect(result).toEqual([])
    })

    // 12. 被動條件不被主動觸發滿足（active/passive 集合獨立）
    it('skill_targeted condition is NOT satisfied by skill_used trigger', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Passive Only Skill', isHidden: true,
          autoRevealCondition: {
            type: 'skill_targeted', skillIds: ['sk-source'],
          },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      // 傳入主動觸發，不應滿足被動條件
      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-source'],
      })

      expect(result).toEqual([])
    })

    // 13. items_acquired 觸發揭露隱藏物品
    it('reveals hidden item by items_acquired', async () => {
      const character = makeCharacter({
        items: [
          {
            id: 'it1', name: 'Reward Item', isHidden: true,
            autoRevealCondition: {
              type: 'items_acquired', itemIds: ['it1'], matchLogic: 'and',
            },
          },
        ],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      // items_acquired 觸發時，引擎從 character.items（ownedItemIds）讀取
      const result = await executeAutoReveal('char-id', { type: 'items_acquired' })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'item', action: 'reveal', id: 'it1' })
    })
  })

  // PERF_INCIDENT_2026-06 批 2：多 trigger 整併（單次呼叫 = 條件集合取聯集）
  describe('multi-trigger (批 2)', () => {
    // 1. [skill_used, skill_targeted] 單次呼叫應同時滿足主動與被動條件
    it('merged [skill_used, skill_targeted] satisfies both active and passive conditions', async () => {
      const character = makeCharacter({
        skills: [
          {
            id: 'sk-active', name: 'Active Only', isHidden: true,
            autoRevealCondition: { type: 'skill_used', skillIds: ['sk-src'] },
          },
          {
            id: 'sk-passive', name: 'Passive Only', isHidden: true,
            autoRevealCondition: { type: 'skill_targeted', skillIds: ['sk-src'] },
          },
        ],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', [
        { type: 'skill_used', skillIds: ['sk-src'] },
        { type: 'skill_targeted', skillIds: ['sk-src'] },
      ])

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id).sort()).toEqual(['sk-active', 'sk-passive'])
    })

    // 2. 合併呼叫只重讀一次角色資料（整併的目的）
    it('merged call reads character data only once', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Skill', isHidden: true,
          autoRevealCondition: { type: 'skill_used', skillIds: ['sk-src'] },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      await executeAutoReveal('char-id', [
        { type: 'skill_used', skillIds: ['sk-src'] },
        { type: 'skill_targeted', skillIds: ['sk-src'] },
      ])

      expect(vi.mocked(getCharacterData)).toHaveBeenCalledTimes(1)
    })

    // 3. 單元素陣列與單一 trigger 行為等價
    it('single-element array behaves identically to a single trigger', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Skill', isHidden: true,
          autoRevealCondition: { type: 'skill_used', skillIds: ['sk-src'] },
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', [
        { type: 'skill_used', skillIds: ['sk-src'] },
      ])

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'skill', action: 'reveal', id: 'sk1' })
    })

    // 4. 空陣列：不讀 DB、直接回空
    it('empty trigger array returns [] without reading character data', async () => {
      const result = await executeAutoReveal('char-id', [])

      expect(result).toEqual([])
      expect(vi.mocked(getCharacterData)).not.toHaveBeenCalled()
    })

    // 5. item 觸發的聯集（item_used + item_targeted）
    it('merged [item_used, item_targeted] satisfies both item conditions', async () => {
      const character = makeCharacter({
        items: [
          {
            id: 'it-active', name: 'Active Item', isHidden: true,
            autoRevealCondition: { type: 'item_used', itemIds: ['it-src'] },
          },
          {
            id: 'it-passive', name: 'Passive Item', isHidden: true,
            autoRevealCondition: { type: 'item_targeted', itemIds: ['it-src'] },
          },
        ],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', [
        { type: 'item_used', itemIds: ['it-src'] },
        { type: 'item_targeted', itemIds: ['it-src'] },
      ])

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id).sort()).toEqual(['it-active', 'it-passive'])
    })
  })
})
