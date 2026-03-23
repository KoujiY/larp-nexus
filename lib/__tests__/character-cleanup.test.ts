import { describe, it, expect } from 'vitest'
import {
  cleanSkillData,
  cleanItemData,
  cleanStatData,
  cleanTaskData,
  cleanSecretData,
} from '../character-cleanup'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseSkill = () => ({
  id: 'skill-1',
  name: 'Slash',
  description: 'A basic attack',
  checkType: 'none' as const,
  effects: [],
})

const baseItem = () => ({
  id: 'item-1',
  name: 'Potion',
  description: 'Restores HP',
  type: 'consumable' as const,
  quantity: 1,
  isTransferable: true,
  acquiredAt: new Date('2026-01-01'),
})

const baseStat = () => ({
  id: 'stat-1',
  name: 'STR',
  value: 10,
})

const baseTask = () => ({
  id: 'task-1',
  title: 'Find the Key',
  description: 'Look for the key',
  isHidden: false,
  isRevealed: false,
  status: 'pending' as const,
  createdAt: new Date('2026-01-01'),
})

const baseSecret = () => ({
  id: 'secret-1',
  title: 'Hidden Truth',
  content: 'The butler did it.',
  isRevealed: false,
})

// ─── cleanStatData ────────────────────────────────────────────────────────────

describe('cleanStatData', () => {
  it('returns empty array for undefined input', () => {
    expect(cleanStatData(undefined)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(cleanStatData([])).toEqual([])
  })

  it('filters out stats without id', () => {
    const result = cleanStatData([{ id: '', name: 'X', value: 1 }])
    expect(result).toHaveLength(0)
  })

  it('maps stat fields correctly', () => {
    const stat = { ...baseStat(), maxValue: 20, _id: 'mongo-id' }
    const [result] = cleanStatData([stat])
    expect(result).toEqual({ id: 'stat-1', name: 'STR', value: 10, maxValue: 20 })
    expect(result).not.toHaveProperty('_id')
  })
})

// ─── cleanTaskData ────────────────────────────────────────────────────────────

describe('cleanTaskData', () => {
  it('returns empty array for undefined input', () => {
    expect(cleanTaskData(undefined)).toEqual([])
  })

  it('filters out tasks without id', () => {
    const result = cleanTaskData([{ ...baseTask(), id: '' }])
    expect(result).toHaveLength(0)
  })

  it('strips _id from output', () => {
    const task = { ...baseTask(), _id: 'mongo-id' }
    const [result] = cleanTaskData([task])
    expect(result).not.toHaveProperty('_id')
  })

  it('preserves all required task fields', () => {
    const [result] = cleanTaskData([baseTask()])
    expect(result.id).toBe('task-1')
    expect(result.isHidden).toBe(false)
    expect(result.status).toBe('pending')
  })

  it('preserves autoRevealCondition when present', () => {
    const task = {
      ...baseTask(),
      autoRevealCondition: { type: 'items_viewed' as const, itemIds: ['item-1'] },
    }
    const [result] = cleanTaskData([task])
    expect(result.autoRevealCondition).toEqual({ type: 'items_viewed', itemIds: ['item-1'] })
  })
})

// ─── cleanSecretData ──────────────────────────────────────────────────────────

describe('cleanSecretData', () => {
  it('returns empty array for undefined input', () => {
    expect(cleanSecretData(undefined)).toEqual([])
  })

  it('filters out secrets without id', () => {
    const result = cleanSecretData([{ ...baseSecret(), id: '' }])
    expect(result).toHaveLength(0)
  })

  it('strips _id from output', () => {
    const secret = { ...baseSecret(), _id: 'mongo-id' }
    const [result] = cleanSecretData([secret])
    expect(result).not.toHaveProperty('_id')
  })

  it('preserves isRevealed and revealedAt', () => {
    const revealedAt = new Date('2026-03-01')
    const secret = { ...baseSecret(), isRevealed: true, revealedAt }
    const [result] = cleanSecretData([secret])
    expect(result.isRevealed).toBe(true)
    expect(result.revealedAt).toEqual(revealedAt)
  })
})

// ─── cleanSkillData ───────────────────────────────────────────────────────────

describe('cleanSkillData', () => {
  it('returns empty array for undefined input', () => {
    expect(cleanSkillData(undefined)).toEqual([])
  })

  it('filters out skills without id', () => {
    const result = cleanSkillData([{ ...baseSkill(), id: '' }])
    expect(result).toHaveLength(0)
  })

  it('strips _id from output', () => {
    const skill = { ...baseSkill(), _id: 'mongo-id' }
    const [result] = cleanSkillData([skill])
    expect(result).not.toHaveProperty('_id')
  })

  it('filters out non-string tags, preserving valid strings as-is', () => {
    const skill = { ...baseSkill(), tags: ['combat', 'STEALTH', null as unknown as string] }
    const [result] = cleanSkillData([skill])
    expect(result.tags).toEqual(['combat', 'STEALTH'])
  })

  it('sets usageCount to 0 when undefined', () => {
    const [result] = cleanSkillData([baseSkill()])
    expect(result.usageCount).toBe(0)
  })

  it('filters out effects without type', () => {
    const skill = {
      ...baseSkill(),
      effects: [{ type: 'stat_change' as const, value: 5 }, null as unknown as { type: 'stat_change' & string }],
    }
    const [result] = cleanSkillData([skill])
    expect(result.effects).toHaveLength(1)
  })
})

// ─── cleanItemData ────────────────────────────────────────────────────────────

describe('cleanItemData', () => {
  it('returns empty array for undefined input', () => {
    expect(cleanItemData(undefined)).toEqual([])
  })

  it('filters out items without id', () => {
    const result = cleanItemData([{ ...baseItem(), id: '' }])
    expect(result).toHaveLength(0)
  })

  it('strips _id from output', () => {
    const item = { ...baseItem(), _id: 'mongo-id' }
    const [result] = cleanItemData([item])
    expect(result).not.toHaveProperty('_id')
  })

  it('filters out non-string tags, preserving valid strings as-is', () => {
    const item = { ...baseItem(), tags: ['combat', 'STEALTH', null as unknown as string] }
    const [result] = cleanItemData([item])
    expect(result.tags).toEqual(['combat', 'STEALTH'])
  })

  it('sets usageCount to 0 when undefined', () => {
    const [result] = cleanItemData([baseItem()])
    expect(result.usageCount).toBe(0)
  })

  it('preserves effects array when present', () => {
    const item = {
      ...baseItem(),
      effects: [{ type: 'stat_change' as const, value: 5, targetStat: 'hp' }],
    }
    const [result] = cleanItemData([item])
    expect(result.effects).toHaveLength(1)
    expect(result.effects![0].type).toBe('stat_change')
  })

  it('returns empty effects array when original effects is empty', () => {
    const item = { ...baseItem(), effects: [] }
    const [result] = cleanItemData([item])
    expect(result.effects).toEqual([])
  })

  it('returns undefined effects when no effects field set', () => {
    const [result] = cleanItemData([baseItem()])
    expect(result.effects).toBeUndefined()
  })
})
