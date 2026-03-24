import { describe, it, expect } from 'vitest'
import { updateCharacterItems } from '../field-updaters/items'
import { updateCharacterSkills } from '../field-updaters/skills'
import type { MongoItem, MongoSkill } from '@/lib/db/types/mongo-helpers'

// ─── updateCharacterItems ───────────────────────────────────────────────────

const baseItem = (): MongoItem => ({
  id: 'item-1',
  name: '魔法劍',
  description: '一把發光的劍',
  type: 'equipment',
  quantity: 1,
  usageCount: 0,
  isTransferable: true,
  acquiredAt: new Date('2026-01-01'),
})

describe('updateCharacterItems', () => {
  it('returns empty items and no diffs for empty input', () => {
    const result = updateCharacterItems([])
    expect(result.items).toEqual([])
    expect(result.inventoryDiffs).toEqual([])
  })

  it('maps basic item fields correctly', () => {
    const { items } = updateCharacterItems([baseItem()])
    const item = items[0] as unknown as Record<string, unknown>
    expect(item.id).toBe('item-1')
    expect(item.name).toBe('魔法劍')
    expect(item.type).toBe('equipment')
    expect(item.quantity).toBe(1)
    expect(item.isTransferable).toBe(true)
    expect(item.usageCount).toBe(0)
  })

  it('detects added items (not in currentItems)', () => {
    const { inventoryDiffs } = updateCharacterItems([baseItem()], [])
    expect(inventoryDiffs).toHaveLength(1)
    expect(inventoryDiffs[0].action).toBe('added')
    expect(inventoryDiffs[0].item.id).toBe('item-1')
  })

  it('detects deleted items (in currentItems but not in new items)', () => {
    const current: MongoItem[] = [baseItem()]
    const { inventoryDiffs } = updateCharacterItems([], current)
    expect(inventoryDiffs).toHaveLength(1)
    expect(inventoryDiffs[0].action).toBe('deleted')
  })

  it('detects updated items when name changes', () => {
    const current = [baseItem()]
    const updated = [{ ...baseItem(), name: '傳說之劍' }]
    const { inventoryDiffs } = updateCharacterItems(updated, current)
    expect(inventoryDiffs).toHaveLength(1)
    expect(inventoryDiffs[0].action).toBe('updated')
  })

  it('normalizes effects array, filtering invalid entries', () => {
    const item = {
      ...baseItem(),
      effects: [
        { type: 'stat_change', targetStat: 'HP', value: 10 },
        null as unknown as NonNullable<MongoItem['effects']>[0], // 無效效果
      ] as MongoItem['effects'],
    }
    const { items } = updateCharacterItems([item])
    const result = items[0] as unknown as Record<string, unknown>
    const effects = result.effects as Array<Record<string, unknown>>
    expect(effects).toHaveLength(1)
    expect(effects[0].type).toBe('stat_change')
  })

  it('injects contestConfig when checkType is contest', () => {
    const item: MongoItem = {
      ...baseItem(),
      checkType: 'contest',
      contestConfig: { relatedStat: 'ATK' },
    }
    const { items } = updateCharacterItems([item])
    const result = items[0] as unknown as Record<string, unknown>
    expect(result.contestConfig).toEqual({ relatedStat: 'ATK' })
    expect(result.randomConfig).toBeUndefined()
  })

  it('injects randomConfig when checkType is random', () => {
    const item: MongoItem = {
      ...baseItem(),
      checkType: 'random',
      randomConfig: { maxValue: 100, threshold: 60 },
    }
    const { items } = updateCharacterItems([item])
    const result = items[0] as unknown as Record<string, unknown>
    expect(result.randomConfig).toEqual({ maxValue: 100, threshold: 60 })
    expect(result.contestConfig).toBeUndefined()
  })

  it('does not inject any check config when checkType is none', () => {
    const item: MongoItem = { ...baseItem(), checkType: 'none' }
    const { items } = updateCharacterItems([item])
    const result = items[0] as unknown as Record<string, unknown>
    expect(result.contestConfig).toBeUndefined()
    expect(result.randomConfig).toBeUndefined()
  })
})

// ─── updateCharacterSkills ───────────────────────────────────────────────────

const baseSkill = (): MongoSkill => ({
  id: 'skill-1',
  name: '火球術',
  description: '發射火球',
  checkType: 'none',
  usageCount: 0,
  effects: [],
})

describe('updateCharacterSkills', () => {
  it('returns empty array for empty input', () => {
    expect(updateCharacterSkills([])).toEqual([])
  })

  it('maps basic skill fields correctly', () => {
    const [skill] = updateCharacterSkills([baseSkill()]) as unknown as Record<string, unknown>[]
    expect(skill.id).toBe('skill-1')
    expect(skill.name).toBe('火球術')
    expect(skill.checkType).toBe('none')
    expect(skill.usageCount).toBe(0)
  })

  it('filters out skills without id', () => {
    const invalid = { name: '無效技能', checkType: 'none' as const } as MongoSkill
    expect(updateCharacterSkills([invalid])).toHaveLength(0)
  })

  it('normalizes skill effects including targetTaskId', () => {
    const skill: MongoSkill = {
      ...baseSkill(),
      effects: [{
        type: 'task_reveal',
        targetTaskId: 'task-1',
        targetType: 'self',
      }],
    }
    const [skillResult] = updateCharacterSkills([skill]) as unknown as Record<string, unknown>[]
    const effects = skillResult.effects as Array<Record<string, unknown>>
    expect(effects[0].targetTaskId).toBe('task-1')
  })

  it('injects contestConfig when checkType is contest', () => {
    const skill: MongoSkill = {
      ...baseSkill(),
      checkType: 'contest',
      contestConfig: { relatedStat: 'INT' },
    }
    const [s] = updateCharacterSkills([skill]) as unknown as Record<string, unknown>[]
    expect(s.contestConfig).toEqual({ relatedStat: 'INT' })
    expect(s.randomConfig).toBeUndefined()
  })

  it('injects randomConfig with defaults when config is incomplete', () => {
    const skill: MongoSkill = {
      ...baseSkill(),
      checkType: 'random',
      // randomConfig 故意省略，觸發預設值邏輯
    }
    const [s] = updateCharacterSkills([skill]) as unknown as Record<string, unknown>[]
    const rc = s.randomConfig as { maxValue: number; threshold: number }
    expect(rc.maxValue).toBe(100)
    expect(rc.threshold).toBe(50)
  })
})
