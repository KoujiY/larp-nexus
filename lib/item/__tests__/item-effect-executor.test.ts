import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock all external dependencies ──────────────────────────────────────────

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/websocket/events', () => ({
  emitCharacterAffected: vi.fn().mockResolvedValue(undefined),
  emitRoleUpdated: vi.fn().mockResolvedValue(undefined),
  emitInventoryUpdated: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/game/get-character-data', () => ({
  getCharacterData: vi.fn(),
  getBaselineCharacterId: vi.fn(),
}))
vi.mock('@/lib/game/update-character-data', () => ({
  updateCharacterData: vi.fn(),
}))
vi.mock('@/lib/effects/create-temporary-effect', () => ({
  createTemporaryEffectRecord: vi.fn(),
}))
vi.mock('@/lib/logs/write-log', () => ({
  writeLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/character-cleanup', () => ({
  cleanItemData: vi.fn((items) => items),
}))

import { executeItemEffects } from '../item-effect-executor'
import { updateCharacterData, } from '@/lib/game/update-character-data'
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data'
import type { CharacterDocument } from '@/lib/db/models'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<CharacterDocument> = {}): CharacterDocument {
  return {
    _id: 'char-1',
    gameId: 'game-1',
    items: [],
    stats: [],
    ...overrides,
  } as unknown as CharacterDocument
}

function makeItem(overrides: object = {}) {
  return {
    id: 'item-1',
    name: 'Test Item',
    type: 'consumable' as const,
    quantity: 1,
    isTransferable: true,
    acquiredAt: new Date(),
    effects: [],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executeItemEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns character unchanged when item has no effects', async () => {
    const character = makeCharacter()
    vi.mocked(getBaselineCharacterId).mockReturnValue('char-1')
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const item = makeItem({ effects: [] })
    const result = await executeItemEffects(item as never, character)

    expect(result.effectsApplied).toEqual([])
    expect(result.updatedCharacter).toBe(character)
  })

  it('applies stat_change effect to self', async () => {
    const character = makeCharacter({
      stats: [{ id: 'stat-1', name: 'HP', value: 10, maxValue: 20 }] as never,
    })
    const updatedCharacter = makeCharacter({
      stats: [{ id: 'stat-1', name: 'HP', value: 15, maxValue: 20 }] as never,
    })
    vi.mocked(updateCharacterData).mockResolvedValue(updatedCharacter as never)

    const item = makeItem({
      effects: [{
        type: 'stat_change',
        targetType: 'self',
        targetStat: 'HP',
        value: 5,
      }],
    })

    const result = await executeItemEffects(item as never, character)
    expect(result.effectsApplied.length).toBeGreaterThan(0)
    expect(result.effectsApplied[0]).toContain('HP')
    expect(result.effectsApplied[0]).toContain('5')
    expect(updateCharacterData).toHaveBeenCalled()
  })
})
