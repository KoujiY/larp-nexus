import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock external dependencies before importing the module ──────────────────

const triggerMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/websocket/pusher-server', () => ({
  getPusherServer: vi.fn(() => ({ trigger: triggerMock })),
  isPusherEnabled: vi.fn(() => true),
}))

vi.mock('@/lib/websocket/pending-events', () => ({
  writePendingEvent: vi.fn().mockResolvedValue(undefined),
  writePendingEvents: vi.fn().mockResolvedValue(undefined),
  writePendingGameEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/perf/perf-context', () => ({
  addPusherTime: vi.fn(),
  timePusher: vi.fn((promise: Promise<unknown>) => promise),
}))

import { emitRoleUpdatedBatch } from '../events'
import { writePendingEvents } from '@/lib/websocket/pending-events'
import type { BaseEvent } from '@/types/event'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('emitRoleUpdatedBatch（PERF_INCIDENT_2026-06 批 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('每個收件人各觸發一次 Pusher、pending events 合併為單次批次寫入', async () => {
    await emitRoleUpdatedBatch([
      { characterId: 'char-a', payload: { characterId: 'char-a', updates: { items: [] } } },
      { characterId: 'char-b', payload: { characterId: 'char-b', updates: { items: [] } } },
    ])

    expect(triggerMock).toHaveBeenCalledTimes(2)
    expect(triggerMock).toHaveBeenCalledWith(
      'private-character-char-a', 'role.updated', expect.anything()
    )
    expect(triggerMock).toHaveBeenCalledWith(
      'private-character-char-b', 'role.updated', expect.anything()
    )

    expect(vi.mocked(writePendingEvents)).toHaveBeenCalledTimes(1)
    const targets = vi.mocked(writePendingEvents).mock.calls[0][0]
    expect(targets).toHaveLength(2)
    expect(targets.map((t) => t.targetCharacterId)).toEqual(['char-a', 'char-b'])
    expect(targets.every((t) => t.eventType === 'role.updated')).toBe(true)
  })

  it('每個收件人注入獨立 _eventId，且 Pusher 與 pending 兩通道帶相同 payload', async () => {
    await emitRoleUpdatedBatch([
      { characterId: 'char-a', payload: { characterId: 'char-a', updates: {} } },
      { characterId: 'char-b', payload: { characterId: 'char-b', updates: {} } },
    ])

    const sentEvents = triggerMock.mock.calls.map((call) => call[2] as BaseEvent)
    const eventIds = sentEvents.map(
      (e) => (e.payload as Record<string, unknown>)._eventId as string
    )

    expect(eventIds[0]).toMatch(/^evt-/)
    expect(eventIds[1]).toMatch(/^evt-/)
    expect(eventIds[0]).not.toBe(eventIds[1])

    const pendingTargets = vi.mocked(writePendingEvents).mock.calls[0][0]
    expect(pendingTargets.map((t) => (t.eventPayload as { _eventId: string })._eventId))
      .toEqual(eventIds)
  })

  it('targets 為空陣列時不發送也不寫入', async () => {
    await emitRoleUpdatedBatch([])

    expect(triggerMock).not.toHaveBeenCalled()
    expect(vi.mocked(writePendingEvents)).not.toHaveBeenCalled()
  })
})
