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
  items: Array<{ id: string; name?: string; isHidden?: boolean; visibilityConditions?: unknown[] }>
  skills: Array<{ id: string; name?: string; isHidden?: boolean; visibilityConditions?: unknown[] }>
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
    it('reveals hidden skill when skill_used condition is met (AND)', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Hidden Skill', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skill_used',
            skillIds: ['sk-trigger'], matchLogic: 'and',
          }],
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'skill', action: 'reveal', id: 'sk1',
      })
    })

    it('hides visible item when item_used condition is met', async () => {
      const character = makeCharacter({
        items: [{
          id: 'it1', name: 'Visible Item', isHidden: false,
          visibilityConditions: [{
            action: 'hide', type: 'item_used',
            itemIds: ['it-trigger'], matchLogic: 'and',
          }],
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'item_used', itemIds: ['it-trigger'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'item', action: 'hide', id: 'it1',
      })
    })

    it('does not reveal already-visible skill (no-op)', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Visible Skill', isHidden: false,
          visibilityConditions: [{
            action: 'reveal', type: 'skill_used',
            skillIds: ['sk-trigger'], matchLogic: 'and',
          }],
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      expect(result).toEqual([])
    })

    it('does not hide already-hidden item (no-op)', async () => {
      const character = makeCharacter({
        items: [{
          id: 'it1', name: 'Hidden Item', isHidden: true,
          visibilityConditions: [{
            action: 'hide', type: 'item_used',
            itemIds: ['it-trigger'], matchLogic: 'and',
          }],
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      const result = await executeAutoReveal('char-id', {
        type: 'item_used', itemIds: ['it-trigger'],
      })

      expect(result).toEqual([])
    })

    it('supports skills_revealed chain (same-layer)', async () => {
      const character = makeCharacter({
        skills: [
          {
            id: 'sk1', name: 'Skill A', isHidden: true,
            visibilityConditions: [{
              action: 'reveal', type: 'skill_used',
              skillIds: ['sk-trigger'], matchLogic: 'and',
            }],
          },
          {
            id: 'sk2', name: 'Skill B', isHidden: true,
            visibilityConditions: [{
              action: 'reveal', type: 'skills_revealed',
              skillIds: ['sk1'], matchLogic: 'and',
            }],
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

    it('limits same-layer chain to one round', async () => {
      const character = makeCharacter({
        skills: [
          {
            id: 'sk1', name: 'Skill A', isHidden: true,
            visibilityConditions: [{
              action: 'reveal', type: 'skill_used',
              skillIds: ['sk-trigger'], matchLogic: 'and',
            }],
          },
          {
            id: 'sk2', name: 'Skill B', isHidden: true,
            visibilityConditions: [{
              action: 'reveal', type: 'skills_revealed',
              skillIds: ['sk1'], matchLogic: 'and',
            }],
          },
          {
            id: 'sk3', name: 'Skill C', isHidden: true,
            visibilityConditions: [{
              action: 'reveal', type: 'skills_revealed',
              skillIds: ['sk2'], matchLogic: 'and',
            }],
          },
        ],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-trigger'],
      })

      // sk1 and sk2 revealed, sk3 NOT revealed (chain limited to one round)
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id)).toEqual(['sk1', 'sk2'])
    })

    it('supports OR match logic for skill_used', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Hidden Skill', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skill_used',
            skillIds: ['sk-a', 'sk-b'], matchLogic: 'or',
          }],
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)
      vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-b'],
      })

      expect(result).toHaveLength(1)
    })

    it('does not trigger AND when only partial skillIds match', async () => {
      const character = makeCharacter({
        skills: [{
          id: 'sk1', name: 'Hidden Skill', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skill_used',
            skillIds: ['sk-a', 'sk-b'], matchLogic: 'and',
          }],
        }],
      })
      vi.mocked(getCharacterData).mockResolvedValue(character as never)

      const result = await executeAutoReveal('char-id', {
        type: 'skill_used', skillIds: ['sk-a'],
      })

      expect(result).toEqual([])
    })
  })
})
