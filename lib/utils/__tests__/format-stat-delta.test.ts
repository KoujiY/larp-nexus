import { describe, it, expect } from 'vitest'
import { formatStatDeltaText, resolveNotifyDelta } from '../format-stat-delta'

// ─── formatStatDeltaText ──────────────────────────────────────────────────────

describe('formatStatDeltaText', () => {
  it('formats value-only change', () => {
    expect(formatStatDeltaText({ name: 'HP', deltaValue: 3 })).toBe('HP +3')
  })

  it('formats negative value change', () => {
    expect(formatStatDeltaText({ name: 'HP', deltaValue: -5 })).toBe('HP -5')
  })

  it('formats maxValue-only change with newMax', () => {
    expect(formatStatDeltaText({ name: 'MP', deltaMax: -1, newMax: 9 })).toBe(
      'MP 最大值 -1（上限：9）',
    )
  })

  it('formats combined value and maxValue change', () => {
    const text = formatStatDeltaText({ name: 'HP', deltaValue: -1, deltaMax: -1, newMax: 9 })
    expect(text).toContain('最大值 -1')
    expect(text).toContain('目前值 -1')
  })

  it('returns null when nothing changed', () => {
    expect(formatStatDeltaText({ name: 'HP', deltaValue: 0, deltaMax: 0 })).toBeNull()
  })
})

// ─── resolveNotifyDelta ───────────────────────────────────────────────────────

describe('resolveNotifyDelta', () => {
  it('uses actual delta when value actually changed', () => {
    const r = resolveNotifyDelta({
      statChangeTarget: 'value',
      syncValue: false,
      configuredDelta: 5,
      actualDeltaValue: 2, // 部分 clamp（8→10）
      actualDeltaMax: 0,
    })
    expect(r).toEqual({ deltaValue: 2, deltaMax: 0 })
  })

  it('falls back to configured delta when value change was fully capped (MP+1 already full)', () => {
    const r = resolveNotifyDelta({
      statChangeTarget: 'value',
      syncValue: false,
      configuredDelta: 1,
      actualDeltaValue: 0, // 已達上限 → 實際無變動
      actualDeltaMax: 0,
    })
    // 仍應提示 +1（直接給變化量，不告知已達上限）
    expect(r).toEqual({ deltaValue: 1, deltaMax: 0 })
  })

  it('falls back to configured delta on maxValue target when capped', () => {
    const r = resolveNotifyDelta({
      statChangeTarget: 'maxValue',
      syncValue: false,
      configuredDelta: 3,
      actualDeltaValue: 0,
      actualDeltaMax: 0,
    })
    expect(r).toEqual({ deltaValue: 0, deltaMax: 3 })
  })

  it('splits configured delta to both axes when syncValue is true on maxValue target', () => {
    const r = resolveNotifyDelta({
      statChangeTarget: 'maxValue',
      syncValue: true,
      configuredDelta: 2,
      actualDeltaValue: 0,
      actualDeltaMax: 0,
    })
    expect(r).toEqual({ deltaValue: 2, deltaMax: 2 })
  })
})
