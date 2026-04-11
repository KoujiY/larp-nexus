import { describe, it, expect } from 'vitest'
import { createMiscEventMappers } from '../event-mappers/misc-events'
import type { BaseEvent } from '@/types/event'

const makeEvent = (type: string, payload: unknown): BaseEvent => ({
  type,
  timestamp: 4000,
  payload,
})

const { mapSecretRevealed, mapTaskRevealed, mapItemShowcased, mapEffectExpired } =
  createMiscEventMappers('char-A')

// ─── mapSecretRevealed ────────────────────────────────────────────────────────

describe('mapSecretRevealed', () => {
  it('generates secret reveal notification', () => {
    const event = makeEvent('secret.revealed', { secretTitle: '真實身份' })
    const [notif] = mapSecretRevealed(event)
    expect(notif.title).toBe('隱藏資訊揭露')
    expect(notif.message).toContain('真實身份')
  })
})

// ─── mapTaskRevealed ──────────────────────────────────────────────────────────

describe('mapTaskRevealed', () => {
  it('generates task reveal notification', () => {
    const event = makeEvent('task.revealed', { taskTitle: '尋找失落的神器' })
    const [notif] = mapTaskRevealed(event)
    expect(notif.title).toBe('隱藏目標揭露')
    expect(notif.message).toContain('尋找失落的神器')
  })
})

// ─── mapItemShowcased ─────────────────────────────────────────────────────────

describe('mapItemShowcased', () => {
  it('generates showcase notification for the sender', () => {
    const event = makeEvent('item.showcased', {
      fromCharacterId: 'char-A',
      toCharacterName: 'Bob',
      item: { name: '魔法戒指' },
    })
    const [notif] = mapItemShowcased(event)
    expect(notif.title).toBe('物品展示')
    expect(notif.message).toContain('Bob')
    expect(notif.message).toContain('魔法戒指')
  })

  it('generates showcase notification for the receiver', () => {
    const { mapItemShowcased: showcaseReceiver } = createMiscEventMappers('char-B')
    const event = makeEvent('item.showcased', {
      fromCharacterId: 'char-A',
      fromCharacterName: 'Alice',
      toCharacterId: 'char-B',
      item: { name: '魔法戒指' },
    })
    const [notif] = showcaseReceiver(event)
    expect(notif.message).toContain('Alice')
    expect(notif.message).toContain('魔法戒指')
  })

  it('returns empty for unrelated character', () => {
    const event = makeEvent('item.showcased', {
      fromCharacterId: 'char-X',
      toCharacterId: 'char-Y',
      item: { name: '道具' },
    })
    expect(mapItemShowcased(event)).toEqual([])
  })
})

// ─── mapEffectExpired ─────────────────────────────────────────────────────────

describe('mapEffectExpired', () => {
  it('generates effect expired notification for value change', () => {
    const event = makeEvent('effect.expired', {
      sourceName: '火球術',
      sourceType: 'skill',
      targetStat: 'HP',
      statChangeTarget: 'value',
      restoredValue: 50,
    })
    const [notif] = mapEffectExpired(event)
    expect(notif.title).toBe('效果結束')
    expect(notif.message).toContain('火球術')
    expect(notif.message).toContain('HP')
    expect(notif.message).toContain('50')
  })

  it('generates effect expired notification for maxValue change', () => {
    const event = makeEvent('effect.expired', {
      sourceName: '增幅藥水',
      sourceType: 'item',
      targetStat: 'MP',
      statChangeTarget: 'maxValue',
      restoredMax: 100,
    })
    const [notif] = mapEffectExpired(event)
    expect(notif.message).toContain('最大值')
    expect(notif.message).toContain('100')
  })

  it('uses source type as fallback when sourceName is missing', () => {
    const event = makeEvent('effect.expired', {
      sourceType: 'skill',
      targetStat: 'ATK',
      statChangeTarget: 'value',
      restoredValue: 20,
    })
    const [notif] = mapEffectExpired(event)
    expect(notif.message).toContain('技能')
  })
})
