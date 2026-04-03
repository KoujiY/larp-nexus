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
}))

import { executeAutoReveal } from '../auto-reveal-evaluator'
import { getCharacterData } from '@/lib/game/get-character-data'
import Character from '@/lib/db/models/Character'

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<{
  secretInfo: { secrets: unknown[] }
  tasks: unknown[]
  viewedItems: Array<{ itemId: string }>
  items: Array<{ id: string }>
}> = {}) {
  return {
    _id: 'char-id',
    secretInfo: { secrets: [] },
    tasks: [],
    viewedItems: [],
    items: [],
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
})
