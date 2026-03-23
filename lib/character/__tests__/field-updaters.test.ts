import { describe, it, expect } from 'vitest'
import {
  updateCharacterStats,
  updateCharacterTasks,
} from '../field-updaters'

// ─── updateCharacterStats ─────────────────────────────────────────────────────

describe('updateCharacterStats', () => {
  it('returns empty array for empty input', () => {
    expect(updateCharacterStats([])).toEqual([])
  })

  it('maps stat fields correctly', () => {
    const [result] = updateCharacterStats([{ id: 's1', name: 'STR', value: 10, maxValue: 20 }])
    expect(result).toEqual({ id: 's1', name: 'STR', value: 10, maxValue: 20 })
  })

  it('preserves undefined maxValue', () => {
    const [result] = updateCharacterStats([{ id: 's1', name: 'STR', value: 5 }])
    expect(result.maxValue).toBeUndefined()
  })
})

// ─── updateCharacterTasks ─────────────────────────────────────────────────────

describe('updateCharacterTasks', () => {
  const baseTask = () => ({
    id: 'task-1',
    title: 'Find the Key',
    description: 'Search the castle',
    isHidden: false,
    isRevealed: false,
    status: 'pending' as const,
    createdAt: new Date('2026-01-01'),
  })

  it('returns empty array for empty input', () => {
    expect(updateCharacterTasks([])).toEqual([])
  })

  it('maps basic task fields', () => {
    const [result] = updateCharacterTasks([baseTask()])
    expect(result.id).toBe('task-1')
    expect(result.title).toBe('Find the Key')
    expect(result.status).toBe('pending')
  })

  it('sets revealedAt when hidden task transitions to revealed', () => {
    const task = { ...baseTask(), isHidden: true, isRevealed: true }
    const [result] = updateCharacterTasks([task], [])
    expect(result.revealedAt).toBeInstanceOf(Date)
  })

  it('preserves existing revealedAt from old task data', () => {
    const existingRevealedAt = new Date('2026-02-01')
    const oldTask = { ...baseTask(), isHidden: true, isRevealed: true, revealedAt: existingRevealedAt, createdAt: new Date() }
    const newTask = { ...baseTask(), isHidden: true, isRevealed: true }
    const [result] = updateCharacterTasks([newTask], [oldTask])
    expect(result.revealedAt).toEqual(existingRevealedAt)
  })

  it('sets completedAt when task status transitions to completed', () => {
    const task = { ...baseTask(), status: 'completed' as const }
    const [result] = updateCharacterTasks([task], [])
    expect(result.completedAt).toBeInstanceOf(Date)
  })

  it('sets completedAt when task status transitions to failed', () => {
    const task = { ...baseTask(), status: 'failed' as const }
    const [result] = updateCharacterTasks([task], [])
    expect(result.completedAt).toBeInstanceOf(Date)
  })

  it('does not overwrite completedAt if task was already completed', () => {
    const existingCompletedAt = new Date('2026-01-15')
    const oldTask = { ...baseTask(), status: 'completed' as const, completedAt: existingCompletedAt, createdAt: new Date() }
    const newTask = { ...baseTask(), status: 'completed' as const }
    const [result] = updateCharacterTasks([newTask], [oldTask])
    expect(result.completedAt).toEqual(existingCompletedAt)
  })

  it('preserves autoRevealCondition from new task when set', () => {
    const condition = { type: 'items_viewed', itemIds: ['item-1'] }
    const task = { ...baseTask(), autoRevealCondition: condition }
    const [result] = updateCharacterTasks([task])
    expect(result.autoRevealCondition).toEqual(condition)
  })

  it('clears autoRevealCondition when type is none', () => {
    const task = { ...baseTask(), autoRevealCondition: { type: 'none' } }
    const [result] = updateCharacterTasks([task])
    expect(result.autoRevealCondition).toBeUndefined()
  })

  it('preserves old autoRevealCondition when new task has none', () => {
    const oldCondition = { type: 'items_viewed', itemIds: ['item-2'] }
    const oldTask = {
      ...baseTask(),
      autoRevealCondition: oldCondition as { type: 'items_viewed'; itemIds?: string[] },
      createdAt: new Date(),
    }
    const [result] = updateCharacterTasks([baseTask()], [oldTask])
    expect(result.autoRevealCondition).toEqual(oldCondition)
  })
})
