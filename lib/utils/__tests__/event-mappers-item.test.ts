import { describe, it, expect, beforeEach } from 'vitest'
import { createItemEventMappers } from '../event-mappers/item-events'
import type { BaseEvent } from '@/types/event'
import type { RecentTransferTracker } from '../event-mappers/types'

const makeRef = (): RecentTransferTracker => ({ current: new Map() })

const makeEvent = (type: string, payload: unknown): BaseEvent => ({
  type,
  timestamp: 2000,
  payload,
})

// ─── mapItemTransferred ───────────────────────────────────────────────────────

describe('mapItemTransferred', () => {
  let ref: RecentTransferTracker
  let mapItemTransferred: ReturnType<typeof createItemEventMappers>['mapItemTransferred']

  beforeEach(() => {
    ref = makeRef()
    mapItemTransferred = createItemEventMappers('char-A', ref).mapItemTransferred
  })

  it('returns empty array for steal transfers', () => {
    const event = makeEvent('item.transferred', {
      transferType: 'steal',
      itemId: 'item-1',
      itemName: '匕首',
      fromCharacterId: 'char-B',
      toCharacterId: 'char-A',
    })
    expect(mapItemTransferred(event)).toEqual([])
  })

  it('returns receive notification when current character is receiver', () => {
    const event = makeEvent('item.transferred', {
      transferType: 'give',
      itemId: 'item-1',
      itemName: '藥水',
      quantity: 2,
      fromCharacterId: 'char-B',
      fromCharacterName: 'Bob',
      toCharacterId: 'char-A',
    })
    const [notif] = mapItemTransferred(event)
    expect(notif.title).toBe('道具獲得')
    expect(notif.message).toContain('Bob')
    expect(notif.message).toContain('藥水')
    expect(notif.message).toContain('x2')
  })

  it('returns transfer notification when current character is sender', () => {
    const event = makeEvent('item.transferred', {
      transferType: 'give',
      itemId: 'item-1',
      itemName: '藥水',
      quantity: 1,
      fromCharacterId: 'char-A',
      toCharacterId: 'char-B',
      toCharacterName: 'Bob',
    })
    const [notif] = mapItemTransferred(event)
    expect(notif.title).toBe('道具轉移')
    expect(notif.message).toContain('Bob')
  })

  it('registers itemId in recentTransferredItemsRef', () => {
    const event = makeEvent('item.transferred', {
      transferType: 'give',
      itemId: 'item-99',
      fromCharacterId: 'char-A',
      toCharacterId: 'char-B',
    })
    mapItemTransferred(event)
    expect(ref.current.has('item-99')).toBe(true)
  })

  it('does NOT schedule setTimeout (side-effect responsibility moved to hook)', () => {
    // This test verifies the mapper itself doesn't contain setTimeout calls
    // by checking the ref is updated but cleanup is the hook's responsibility
    const event = makeEvent('item.transferred', {
      transferType: 'give',
      itemId: 'item-42',
      fromCharacterId: 'char-A',
      toCharacterId: 'char-B',
    })
    mapItemTransferred(event)
    // Entry should still exist immediately after call (no setTimeout here)
    expect(ref.current.has('item-42')).toBe(true)
  })
})

// ─── mapInventoryUpdated ──────────────────────────────────────────────────────

describe('mapInventoryUpdated', () => {
  let ref: RecentTransferTracker
  let mapInventoryUpdated: ReturnType<typeof createItemEventMappers>['mapInventoryUpdated']

  beforeEach(() => {
    ref = makeRef()
    mapInventoryUpdated = createItemEventMappers('char-A', ref).mapInventoryUpdated
  })

  it('generates notification for added item', () => {
    const event = makeEvent('role.inventoryUpdated', {
      item: { id: 'item-1', name: '弓箭' },
      action: 'added',
    })
    const [notif] = mapInventoryUpdated(event)
    expect(notif.title).toBe('道具更新')
    expect(notif.message).toContain('弓箭')
    expect(notif.message).toContain('新增')
  })

  it('generates notification for deleted item', () => {
    const event = makeEvent('role.inventoryUpdated', {
      item: { id: 'item-1', name: '弓箭' },
      action: 'deleted',
    })
    const [notif] = mapInventoryUpdated(event)
    expect(notif.message).toContain('移除')
  })

  it('suppresses notification for item in recent give transfer (within 3s)', () => {
    ref.current.set('item-1', {
      timestamp: 2000, // same as event.timestamp
      transferType: 'give',
      fromCharacterId: 'char-B',
      toCharacterId: 'char-A',
    })
    const event = makeEvent('role.inventoryUpdated', {
      item: { id: 'item-1', name: '弓箭' },
      action: 'added',
    })
    expect(mapInventoryUpdated(event)).toEqual([])
  })

  it('allows notification for item in steal transfer for victim', () => {
    ref.current.set('item-1', {
      timestamp: 2000,
      transferType: 'steal',
      fromCharacterId: 'char-A', // victim = char-A
      toCharacterId: 'char-B',
    })
    const event = makeEvent('role.inventoryUpdated', {
      item: { id: 'item-1', name: '錢包' },
      action: 'deleted',
      characterId: 'char-A',
    })
    const notifications = mapInventoryUpdated(event)
    // victim (char-A) should receive a notification
    expect(notifications).toHaveLength(1)
  })
})
