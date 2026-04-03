import { describe, it, expect, vi } from 'vitest'
import {
  calculateAttackerValue,
  calculateContestResult,
  calculateRandomContestResult,
} from '../contest-calculator'

describe('calculateAttackerValue', () => {
  it('returns the base value unchanged', () => {
    expect(calculateAttackerValue(10)).toBe(10)
    expect(calculateAttackerValue(0)).toBe(0)
    expect(calculateAttackerValue(100)).toBe(100)
  })
})

describe('calculateContestResult', () => {
  it('returns attacker_wins when attacker value is higher', () => {
    expect(calculateContestResult(10, 5)).toBe('attacker_wins')
  })

  it('returns defender_wins when defender value is higher', () => {
    expect(calculateContestResult(5, 10)).toBe('defender_wins')
  })

  it('defaults to attacker_wins on tie when no tieResolution provided', () => {
    expect(calculateContestResult(5, 5)).toBe('attacker_wins')
  })

  it('resolves tie as attacker_wins when tieResolution is attacker_wins', () => {
    expect(calculateContestResult(5, 5, 'attacker_wins')).toBe('attacker_wins')
  })

  it('resolves tie as defender_wins when tieResolution is defender_wins', () => {
    expect(calculateContestResult(5, 5, 'defender_wins')).toBe('defender_wins')
  })

  it('resolves tie as both_fail when tieResolution is both_fail', () => {
    expect(calculateContestResult(5, 5, 'both_fail')).toBe('both_fail')
  })

  it('tieResolution does not affect non-tie outcomes', () => {
    expect(calculateContestResult(10, 5, 'both_fail')).toBe('attacker_wins')
    expect(calculateContestResult(5, 10, 'attacker_wins')).toBe('defender_wins')
  })
})

describe('calculateRandomContestResult', () => {
  it('returns a valid result structure', () => {
    const result = calculateRandomContestResult(6)
    expect(result).toHaveProperty('attackerValue')
    expect(result).toHaveProperty('defenderValue')
    expect(result).toHaveProperty('result')
    expect(['attacker_wins', 'defender_wins', 'both_fail']).toContain(result.result)
  })

  it('attacker value is within [1, maxValue]', () => {
    const result = calculateRandomContestResult(6)
    expect(result.attackerValue).toBeGreaterThanOrEqual(1)
    expect(result.attackerValue).toBeLessThanOrEqual(6)
  })

  it('defender value is within [1, maxValue]', () => {
    const result = calculateRandomContestResult(6)
    expect(result.defenderValue).toBeGreaterThanOrEqual(1)
    expect(result.defenderValue).toBeLessThanOrEqual(6)
  })

  it('returns attacker_wins when attacker rolls higher (mocked)', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.1)
    const result = calculateRandomContestResult(6)
    expect(result.result).toBe('attacker_wins')
    expect(result.attackerValue).toBeGreaterThan(result.defenderValue)
    vi.restoreAllMocks()
  })

  it('returns defender_wins when defender rolls higher (mocked)', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)
    const result = calculateRandomContestResult(6)
    expect(result.result).toBe('defender_wins')
    vi.restoreAllMocks()
  })

  it('applies tieResolution on tie (mocked)', () => {
    // 明確 mock 兩次：attacker 和 defender 各取一次亂數
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5)
    const result = calculateRandomContestResult(6, 'both_fail')
    expect(result.result).toBe('both_fail')
    vi.restoreAllMocks()
  })

  it('defaults tie to attacker_wins when no tieResolution', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5)
    const result = calculateRandomContestResult(6)
    expect(result.result).toBe('attacker_wins')
    vi.restoreAllMocks()
  })
})
