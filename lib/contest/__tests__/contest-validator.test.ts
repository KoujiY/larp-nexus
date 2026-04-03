import { describe, it, expect } from 'vitest'
import {
  validateAttackerCombatTag,
  validateDefenderCombatTag,
  validateDefenderCheckType,
  validateDefenderRelatedStat,
  validateDefenderItems,
  validateDefenderSkills,
} from '../contest-validator'
import type { CharacterDocument } from '@/lib/db/models/Character'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDefender(overrides: Partial<{ items: unknown[]; skills: unknown[] }> = {}): CharacterDocument {
  return {
    items: [],
    skills: [],
    gameId: 'game-1',
    ...overrides,
  } as unknown as CharacterDocument
}

const contestConfig = {
  relatedStat: 'STR',
  opponentMaxItems: 2,
  opponentMaxSkills: 1,
}

// ─── validateAttackerCombatTag ────────────────────────────────────────────────

describe('validateAttackerCombatTag', () => {
  it('succeeds when source has combat tag', () => {
    const result = validateAttackerCombatTag({ tags: ['combat'] }, 'Sword', 'item')
    expect(result.success).toBe(true)
  })

  it('succeeds when source has combat tag among others', () => {
    const result = validateAttackerCombatTag({ tags: ['stealth', 'combat'] }, 'Blade', 'skill')
    expect(result.success).toBe(true)
  })

  it('fails when source has no combat tag', () => {
    const result = validateAttackerCombatTag({ tags: ['stealth'] }, 'Dagger', 'item')
    expect(result.success).toBe(false)
    expect(result.error).toBe('MISSING_COMBAT_TAG')
  })

  it('fails when tags array is empty', () => {
    const result = validateAttackerCombatTag({ tags: [] }, 'Shield', 'skill')
    expect(result.success).toBe(false)
  })

  it('fails when tags is undefined', () => {
    const result = validateAttackerCombatTag({}, 'Axe', 'item')
    expect(result.success).toBe(false)
  })

  it('includes item/skill name in error message', () => {
    const result = validateAttackerCombatTag({ tags: [] }, 'MyItem', 'item')
    expect(result.message).toContain('MyItem')
  })
})

// ─── validateDefenderCombatTag ────────────────────────────────────────────────

describe('validateDefenderCombatTag', () => {
  it('succeeds regardless when attacker has no combat tag', () => {
    const defender = makeDefender({
      items: [{ id: 'i1', tags: [] }],
    })
    expect(validateDefenderCombatTag(defender, ['i1'], [], false).success).toBe(true)
  })

  it('succeeds when attacker has combat tag and defender item has combat tag', () => {
    const defender = makeDefender({
      items: [{ id: 'i1', name: 'Shield', tags: ['combat'] }],
    })
    expect(validateDefenderCombatTag(defender, ['i1'], [], true).success).toBe(true)
  })

  it('fails when attacker has combat tag but defender item lacks it', () => {
    const defender = makeDefender({
      items: [{ id: 'i1', name: 'Magic Wand', tags: ['stealth'] }],
    })
    const result = validateDefenderCombatTag(defender, ['i1'], [], true)
    expect(result.success).toBe(false)
    expect(result.error).toBe('MISSING_COMBAT_TAG')
  })

  it('fails when attacker has combat tag but defender skill lacks it', () => {
    const defender = makeDefender({
      skills: [{ id: 's1', name: 'Dodge', tags: [] }],
    })
    const result = validateDefenderCombatTag(defender, [], ['s1'], true)
    expect(result.success).toBe(false)
    expect(result.error).toBe('MISSING_COMBAT_TAG')
  })
})

// ─── validateDefenderCheckType ────────────────────────────────────────────────

describe('validateDefenderCheckType', () => {
  it('succeeds when no items or skills provided', () => {
    const defender = makeDefender()
    expect(validateDefenderCheckType('contest', defender, [], []).success).toBe(true)
  })

  it('succeeds when item checkType matches attacker', () => {
    const defender = makeDefender({
      items: [{ id: 'i1', name: 'Sword', checkType: 'contest' }],
    })
    expect(validateDefenderCheckType('contest', defender, ['i1'], []).success).toBe(true)
  })

  it('fails when item checkType differs from attacker', () => {
    const defender = makeDefender({
      items: [{ id: 'i1', name: 'Magic Ring', checkType: 'random_contest' }],
    })
    const result = validateDefenderCheckType('contest', defender, ['i1'], [])
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_CHECK_TYPE')
  })

  it('succeeds when skill checkType matches attacker', () => {
    const defender = makeDefender({
      skills: [{ id: 's1', name: 'Block', checkType: 'random_contest' }],
    })
    expect(validateDefenderCheckType('random_contest', defender, [], ['s1']).success).toBe(true)
  })
})

// ─── validateDefenderRelatedStat ─────────────────────────────────────────────

describe('validateDefenderRelatedStat', () => {
  it('succeeds when no items or skills provided', () => {
    const defender = makeDefender()
    expect(validateDefenderRelatedStat('STR', defender, [], []).success).toBe(true)
  })

  it('succeeds when defender item relatedStat matches', () => {
    const defender = makeDefender({
      items: [{
        id: 'i1', name: 'Sword', checkType: 'contest',
        contestConfig: { relatedStat: 'STR' },
      }],
    })
    expect(validateDefenderRelatedStat('STR', defender, ['i1'], []).success).toBe(true)
  })

  it('fails when defender item relatedStat mismatches', () => {
    const defender = makeDefender({
      items: [{
        id: 'i1', name: 'Bow', checkType: 'contest',
        contestConfig: { relatedStat: 'DEX' },
      }],
    })
    const result = validateDefenderRelatedStat('STR', defender, ['i1'], [])
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_RELATED_STAT')
  })
})

// ─── validateDefenderItems ────────────────────────────────────────────────────

describe('validateDefenderItems', () => {
  it('succeeds with empty itemIds', () => {
    const defender = makeDefender()
    expect(validateDefenderItems(defender, [], contestConfig).success).toBe(true)
  })

  it('fails when items not allowed (opponentMaxItems = 0)', () => {
    const defender = makeDefender()
    const result = validateDefenderItems(defender, ['i1'], { ...contestConfig, opponentMaxItems: 0 })
    expect(result.error).toBe('ITEMS_NOT_ALLOWED')
  })

  it('fails when too many items selected', () => {
    const defender = makeDefender({ items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }] })
    const result = validateDefenderItems(defender, ['i1', 'i2', 'i3'], { ...contestConfig, opponentMaxItems: 2 })
    expect(result.error).toBe('TOO_MANY_ITEMS')
  })

  it('fails when item not found on defender', () => {
    const defender = makeDefender({ items: [] })
    const result = validateDefenderItems(defender, ['nonexistent'], contestConfig)
    expect(result.error).toBe('NOT_FOUND')
  })

  it('fails when item is on cooldown', () => {
    const lastUsedAt = new Date(Date.now() - 5000) // 5 seconds ago
    const defender = makeDefender({
      items: [{
        id: 'i1', name: 'Potion',
        cooldown: 60, // 60 seconds
        lastUsedAt,
        effects: [],
      }],
    })
    const result = validateDefenderItems(defender, ['i1'], contestConfig)
    expect(result.error).toBe('ITEM_ON_COOLDOWN')
  })

  it('fails when item usage limit is reached', () => {
    const defender = makeDefender({
      items: [{
        id: 'i1', name: 'Rune', usageLimit: 3, usageCount: 3, effects: [],
      }],
    })
    const result = validateDefenderItems(defender, ['i1'], contestConfig)
    expect(result.error).toBe('ITEM_USAGE_LIMIT_REACHED')
  })

  it('succeeds and returns item list when valid', () => {
    const defender = makeDefender({
      items: [{ id: 'i1', name: 'Shield', effects: [] }],
    })
    const result = validateDefenderItems(defender, ['i1'], contestConfig)
    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items![0].id).toBe('i1')
  })
})

// ─── validateDefenderSkills ───────────────────────────────────────────────────

describe('validateDefenderSkills', () => {
  it('succeeds with empty skillIds', () => {
    const defender = makeDefender()
    expect(validateDefenderSkills(defender, [], contestConfig).success).toBe(true)
  })

  it('fails when skills not allowed (opponentMaxSkills = 0)', () => {
    const defender = makeDefender()
    const result = validateDefenderSkills(defender, ['s1'], { ...contestConfig, opponentMaxSkills: 0 })
    expect(result.error).toBe('SKILLS_NOT_ALLOWED')
  })

  it('fails when skill not found', () => {
    const defender = makeDefender({ skills: [] })
    const result = validateDefenderSkills(defender, ['nonexistent'], contestConfig)
    expect(result.error).toBe('NOT_FOUND')
  })

  it('fails when skill usage limit reached', () => {
    const defender = makeDefender({
      skills: [{ id: 's1', name: 'Parry', usageLimit: 1, usageCount: 1 }],
    })
    const result = validateDefenderSkills(defender, ['s1'], contestConfig)
    expect(result.error).toBe('SKILL_USAGE_LIMIT_REACHED')
  })

  it('succeeds and returns skill list when valid', () => {
    const defender = makeDefender({
      skills: [{ id: 's1', name: 'Parry' }],
    })
    const result = validateDefenderSkills(defender, ['s1'], { ...contestConfig, opponentMaxSkills: 2 })
    expect(result.success).toBe(true)
    expect(result.skills).toHaveLength(1)
  })
})
