import { describe, it, expect } from 'vitest'
import { createSkillEventMappers } from '../event-mappers/skill-events'
import type { BaseEvent } from '@/types/event'

const makeEvent = (type: string, payload: unknown): BaseEvent => ({
  type,
  timestamp: 3000,
  payload,
})

const { mapSkillContest, mapSkillUsed, mapItemUsed } = createSkillEventMappers('char-A')

// ─── mapSkillContest ──────────────────────────────────────────────────────────

describe('mapSkillContest', () => {
  it('returns empty for request events (attackerValue === 0)', () => {
    const event = makeEvent('skill.contest', {
      attackerValue: 0,
      attackerId: 'char-A',
      defenderId: 'char-B',
      result: 'attacker_wins',
      skillName: '火球術',
      sourceType: 'skill',
    })
    expect(mapSkillContest(event)).toEqual([])
  })

  it('returns empty for unrelated characters', () => {
    const event = makeEvent('skill.contest', {
      attackerValue: 10,
      attackerId: 'char-X',
      defenderId: 'char-Y',
      result: 'attacker_wins',
      skillName: '火球術',
      sourceType: 'skill',
      effectsApplied: ['HP -10'],
    })
    expect(mapSkillContest(event)).toEqual([])
  })

  it('generates attacker win notification with effects', () => {
    const event = makeEvent('skill.contest', {
      attackerValue: 15,
      attackerId: 'char-A',
      defenderId: 'char-B',
      defenderName: 'Bob',
      result: 'attacker_wins',
      skillName: '火球術',
      sourceType: 'skill',
      effectsApplied: ['HP -10', 'MP -5'],
    })
    const notifications = mapSkillContest(event)
    expect(notifications).toHaveLength(2)
    expect(notifications[0].title).toBe('技能使用結果')
    expect(notifications[0].message).toContain('Bob')
    expect(notifications[0].message).toContain('火球術')
    expect(notifications[0].message).toContain('HP -10')
  })

  it('generates attacker fail notification', () => {
    const event = makeEvent('skill.contest', {
      attackerValue: 5,
      attackerId: 'char-A',
      defenderId: 'char-B',
      defenderName: 'Bob',
      result: 'defender_wins',
      skillName: '火球術',
      sourceType: 'skill',
      effectsApplied: [],
    })
    const notifications = mapSkillContest(event)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toContain('失敗')
  })

  it('generates defender win notification with effects', () => {
    const { mapSkillContest: contestDefender } = createSkillEventMappers('char-B')
    const event = makeEvent('skill.contest', {
      attackerValue: 5,
      attackerId: 'char-A',
      attackerName: 'Alice',
      defenderId: 'char-B',
      result: 'defender_wins',
      skillName: '反擊術',
      sourceType: 'skill',
      defenderSkills: ['skill-1'],
      effectsApplied: ['HP -8'],
      sourceHasStealthTag: false,
    })
    const notifications = contestDefender(event)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toContain('Alice')
    expect(notifications[0].message).toContain('反擊術')
    expect(notifications[0].message).toContain('HP -8')
  })

  it('hides attacker name for defender when attacker has stealth tag', () => {
    const { mapSkillContest: contestDefender } = createSkillEventMappers('char-B')
    const event = makeEvent('skill.contest', {
      attackerValue: 5,
      attackerId: 'char-A',
      attackerName: 'Alice',
      defenderId: 'char-B',
      result: 'defender_wins',
      skillName: '反擊術',
      sourceType: 'skill',
      defenderSkills: ['skill-1'],
      effectsApplied: ['HP -5'],
      sourceHasStealthTag: true,
    })
    const [notif] = contestDefender(event)
    expect(notif.message).not.toContain('Alice')
    expect(notif.message).toContain('某人')
  })
})

// ─── mapSkillUsed ─────────────────────────────────────────────────────────────

describe('mapSkillUsed', () => {
  it('returns empty for different character', () => {
    const event = makeEvent('skill.used', {
      characterId: 'char-X',
      skillName: '火球術',
      checkPassed: true,
      effectsApplied: ['HP -5'],
    })
    expect(mapSkillUsed(event)).toEqual([])
  })

  it('generates success notification with effects', () => {
    const event = makeEvent('skill.used', {
      characterId: 'char-A',
      skillName: '治療術',
      checkPassed: true,
      effectsApplied: ['HP +20'],
      targetCharacterName: 'Bob',
    })
    const [notif] = mapSkillUsed(event)
    expect(notif.message).toContain('治療術')
    expect(notif.message).toContain('成功')
    expect(notif.message).toContain('HP +20')
  })

  it('generates fail notification with check result', () => {
    const event = makeEvent('skill.used', {
      characterId: 'char-A',
      skillName: '火球術',
      checkPassed: false,
      checkResult: 30,
    })
    const [notif] = mapSkillUsed(event)
    expect(notif.message).toContain('失敗')
    expect(notif.message).toContain('30')
  })

  it('skips contest request events (effectsApplied undefined)', () => {
    const event = makeEvent('skill.used', {
      characterId: 'char-A',
      skillName: '對抗技',
      checkPassed: false,
      checkType: 'contest',
      effectsApplied: undefined,
    })
    expect(mapSkillUsed(event)).toEqual([])
  })

  it('shows defender fail notification when effectsApplied is empty array', () => {
    const event = makeEvent('skill.used', {
      characterId: 'char-A',
      skillName: '防禦術',
      checkPassed: false,
      checkType: 'contest',
      effectsApplied: [],
      targetCharacterName: 'Alice',
    })
    const [notif] = mapSkillUsed(event)
    expect(notif.message).toContain('失敗')
  })
})

// ─── mapItemUsed ──────────────────────────────────────────────────────────────

describe('mapItemUsed', () => {
  it('returns empty for different character', () => {
    const event = makeEvent('item.used', {
      characterId: 'char-X',
      itemName: '藥水',
      checkPassed: true,
    })
    expect(mapItemUsed(event)).toEqual([])
  })

  it('generates success notification', () => {
    const event = makeEvent('item.used', {
      characterId: 'char-A',
      itemName: '回復藥水',
      checkPassed: true,
      effectsApplied: ['HP +30'],
    })
    const [notif] = mapItemUsed(event)
    expect(notif.title).toBe('道具使用結果')
    expect(notif.message).toContain('回復藥水')
    expect(notif.message).toContain('成功')
    expect(notif.message).toContain('HP +30')
  })

  it('generates fail notification', () => {
    const event = makeEvent('item.used', {
      characterId: 'char-A',
      itemName: '煙霧彈',
      checkPassed: false,
      checkResult: 20,
    })
    const [notif] = mapItemUsed(event)
    expect(notif.message).toContain('失敗')
    expect(notif.message).toContain('20')
  })
})
