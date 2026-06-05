import { describe, it, expect } from 'vitest'
import { mapRoleUpdated, mapRoleMessage, mapCharacterAffected } from '../event-mappers/role-events'
import type { BaseEvent } from '@/types/event'

const baseEvent = (type: string, payload: unknown): BaseEvent => ({
  type,
  timestamp: 1000,
  payload,
})

// ─── mapRoleUpdated ───────────────────────────────────────────────────────────

describe('mapRoleUpdated', () => {
  it('returns empty array when no stats', () => {
    const event = baseEvent('role.updated', { updates: {} })
    expect(mapRoleUpdated(event)).toEqual([])
  })

  it('returns empty array when stats array is empty', () => {
    const event = baseEvent('role.updated', { updates: { stats: [] } })
    expect(mapRoleUpdated(event)).toEqual([])
  })

  it('generates notification for value change', () => {
    const event = baseEvent('role.updated', {
      updates: { stats: [{ name: 'HP', deltaValue: -5, value: 15 }] },
    })
    const [notif] = mapRoleUpdated(event)
    expect(notif.title).toBe('數值變更')
    expect(notif.message).toContain('HP')
    expect(notif.message).toContain('-5')
  })

  it('generates notification for maxValue change', () => {
    const event = baseEvent('role.updated', {
      updates: { stats: [{ name: 'MP', deltaMax: 10, maxValue: 100 }] },
    })
    const [notif] = mapRoleUpdated(event)
    expect(notif.message).toContain('最大值')
    expect(notif.message).toContain('+10')
  })

  it('combines value and maxValue changes into single notification', () => {
    const event = baseEvent('role.updated', {
      updates: { stats: [{ name: 'HP', deltaValue: -5, deltaMax: -10, maxValue: 90 }] },
    })
    const notifications = mapRoleUpdated(event)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toContain('最大值')
    expect(notifications[0].message).toContain('目前值')
  })

  it('produces no notification when a stat has no delta (no absolute-value fallback)', () => {
    const event = baseEvent('role.updated', {
      updates: { stats: [{ name: 'HP', value: 20 }] },
    })
    // 通知一律表達變化量；無 delta = 無實質變化 = 不產生通知
    expect(mapRoleUpdated(event)).toEqual([])
  })

  it('does not mislabel an unrelated stat when the targeted stat is capped (delta 0)', () => {
    // 場景：全體事件讓 MP+1，但 MP 已滿 → MP delta=0；payload 帶完整 stats 陣列，
    // HP 未變動（無 delta）。修復前會誤報「HP → 當前值」，修復後應無任何通知。
    const event = baseEvent('role.updated', {
      updates: {
        stats: [
          { name: 'HP', value: 20, maxValue: 20 },
          { name: 'MP', value: 10, maxValue: 10, deltaValue: 0, deltaMax: 0 },
        ],
      },
    })
    const notifications = mapRoleUpdated(event)
    expect(notifications).toEqual([])
    expect(notifications.some((n) => n.message.includes('HP'))).toBe(false)
  })

  it('still notifies the changed stat normally when not capped', () => {
    // 對照組：MP+1 未撞上限 → MP 帶 deltaValue=1，HP 無 delta → 只報 MP
    const event = baseEvent('role.updated', {
      updates: {
        stats: [
          { name: 'HP', value: 20, maxValue: 20 },
          { name: 'MP', value: 6, maxValue: 10, deltaValue: 1 },
        ],
      },
    })
    const notifications = mapRoleUpdated(event)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toContain('MP')
    expect(notifications[0].message).toContain('+1')
  })
})

// ─── mapRoleMessage ───────────────────────────────────────────────────────────

describe('mapRoleMessage', () => {
  it('maps role message payload to notification', () => {
    const event = baseEvent('role.message', { title: '系統公告', message: '遊戲開始' })
    const [notif] = mapRoleMessage(event)
    expect(notif.title).toBe('系統公告')
    expect(notif.message).toBe('遊戲開始')
  })

  it('uses default title when payload title is missing', () => {
    const event = baseEvent('role.message', { message: '測試' })
    const [notif] = mapRoleMessage(event)
    expect(notif.title).toBe('訊息')
  })

  it('uses default message when payload message is missing', () => {
    const event = baseEvent('role.message', {})
    const [notif] = mapRoleMessage(event)
    expect(notif.message).toBe('收到新訊息')
  })
})

// ─── mapCharacterAffected ─────────────────────────────────────────────────────

describe('mapCharacterAffected', () => {
  it('returns empty array when no stats changes', () => {
    const event = baseEvent('character.affected', { changes: { stats: [] } })
    expect(mapCharacterAffected(event)).toEqual([])
  })

  it('generates notification with source name when no stealth tag', () => {
    const event = baseEvent('character.affected', {
      sourceCharacterName: '魔法師',
      sourceHasStealthTag: false,
      changes: { stats: [{ name: 'HP', deltaValue: -10 }] },
    })
    const [notif] = mapCharacterAffected(event)
    expect(notif.title).toBe('受到影響')
    expect(notif.message).toContain('魔法師')
    expect(notif.message).toContain('HP')
    expect(notif.message).toContain('-10')
  })

  it('hides source name when stealth tag is present', () => {
    const event = baseEvent('character.affected', {
      sourceCharacterName: '刺客',
      sourceHasStealthTag: true,
      changes: { stats: [{ name: 'HP', deltaValue: -5 }] },
    })
    const [notif] = mapCharacterAffected(event)
    expect(notif.message).not.toContain('刺客')
    expect(notif.message).toContain('你受到了影響')
  })

  it('generates separate notifications for deltaValue and deltaMax when not combined', () => {
    const event = baseEvent('character.affected', {
      sourceHasStealthTag: false,
      sourceCharacterName: 'Boss',
      changes: { stats: [{ name: 'HP', deltaValue: -5, deltaMax: 0 }] },
    })
    const notifications = mapCharacterAffected(event)
    expect(notifications).toHaveLength(1)
  })

  it('combines deltaValue and deltaMax into single notification', () => {
    const event = baseEvent('character.affected', {
      sourceHasStealthTag: false,
      sourceCharacterName: 'Boss',
      changes: { stats: [{ name: 'HP', deltaValue: -5, deltaMax: -10, newMax: 90 }] },
    })
    const notifications = mapCharacterAffected(event)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toContain('最大值')
    expect(notifications[0].message).toContain('目前值')
  })
})
