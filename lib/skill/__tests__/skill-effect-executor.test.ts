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

import { executeSkillEffects } from '../skill-effect-executor'
import { updateCharacterData } from '@/lib/game/update-character-data'
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data'
import type { CharacterDocument } from '@/lib/db/models'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<CharacterDocument> = {}): CharacterDocument {
  return {
    _id: 'char-1',
    gameId: 'game-1',
    items: [],
    stats: [],
    tasks: [],
    ...overrides,
  } as unknown as CharacterDocument
}

function makeSkill(overrides: object = {}) {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    description: '',
    checkType: 'none' as const,
    effects: [],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executeSkillEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns character unchanged when skill has no effects', async () => {
    const character = makeCharacter()
    vi.mocked(getBaselineCharacterId).mockReturnValue('char-1')
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const skill = makeSkill({ effects: [] })
    const result = await executeSkillEffects(skill as never, character)

    expect(result.effectsApplied).toEqual([])
    expect(result.updatedCharacter).toBe(character)
  })

  it('applies stat_change effect targeting self', async () => {
    const character = makeCharacter({
      stats: [{ id: 'stat-1', name: 'MP', value: 5, maxValue: 10 }] as never,
    })
    const updatedCharacter = makeCharacter({
      stats: [{ id: 'stat-1', name: 'MP', value: 8, maxValue: 10 }] as never,
    })
    vi.mocked(updateCharacterData).mockResolvedValue(updatedCharacter as never)

    const skill = makeSkill({
      effects: [{
        type: 'stat_change',
        targetType: 'self',
        targetStat: 'MP',
        value: 3,
      }],
    })

    const result = await executeSkillEffects(skill as never, character)
    expect(result.effectsApplied.length).toBeGreaterThan(0)
    expect(result.effectsApplied[0]).toContain('MP')
    expect(result.effectsApplied[0]).toContain('3')
    expect(updateCharacterData).toHaveBeenCalled()
  })
})
