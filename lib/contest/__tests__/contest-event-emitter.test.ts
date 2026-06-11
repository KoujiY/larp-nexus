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
}))

import { emitContestEventsBatch } from '../contest-event-emitter'
import { writePendingEvents } from '@/lib/websocket/pending-events'
import { isPusherEnabled } from '@/lib/websocket/pusher-server'
import type { SkillContestEvent } from '@/types/event'

// ─── Helper ───────────────────────────────────────────────────────────────────

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    attackerId: 'atk-1',
    attackerName: '攻擊者',
    defenderId: 'def-1',
    defenderName: '防守者',
    attackerValue: 10,
    defenderValue: 5,
    result: 'attacker_wins',
    contestId: 'contest-1',
    ...overrides,
  } as unknown as Omit<SkillContestEvent['payload'], 'subType'>
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('emitContestEventsBatch（PERF_INCIDENT_2026-06 批 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isPusherEnabled).mockReturnValue(true)
  })

  it('每個收件人各觸發一次 Pusher、pending events 合併為單次批次寫入', async () => {
    await emitContestEventsBatch('result', [
      { characterId: 'atk-1', payload: makePayload() },
      { characterId: 'def-1', payload: makePayload({ result: 'defender_wins' }) },
    ])

    // Pusher：兩個頻道各一次
    expect(triggerMock).toHaveBeenCalledTimes(2)
    expect(triggerMock).toHaveBeenCalledWith(
      'private-character-atk-1', 'skill.contest', expect.anything()
    )
    expect(triggerMock).toHaveBeenCalledWith(
      'private-character-def-1', 'skill.contest', expect.anything()
    )

    // pending events：單次呼叫、含兩個目標
    expect(vi.mocked(writePendingEvents)).toHaveBeenCalledTimes(1)
    const targets = vi.mocked(writePendingEvents).mock.calls[0][0]
    expect(targets).toHaveLength(2)
    expect(targets.map((t) => t.targetCharacterId)).toEqual(['atk-1', 'def-1'])
    expect(targets.every((t) => t.eventType === 'skill.contest')).toBe(true)
  })

  it('每個收件人的 payload 注入獨立 _eventId 與正確 subType', async () => {
    await emitContestEventsBatch('effect', [
      { characterId: 'atk-1', payload: makePayload() },
      { characterId: 'def-1', payload: makePayload() },
    ])

    const sentEvents = triggerMock.mock.calls.map(
      (call) => call[2] as SkillContestEvent
    )
    const eventIds = sentEvents.map((e) => e.payload._eventId)

    expect(sentEvents.every((e) => e.payload.subType === 'effect')).toBe(true)
    expect(eventIds[0]).toMatch(/^evt-/)
    expect(eventIds[1]).toMatch(/^evt-/)
    expect(eventIds[0]).not.toBe(eventIds[1])

    // Pusher 與 pending 兩個通道帶相同 payload（含同一 _eventId，跨通道去重依據）
    const pendingTargets = vi.mocked(writePendingEvents).mock.calls[0][0]
    expect(pendingTargets.map((t) => (t.eventPayload as { _eventId: string })._eventId))
      .toEqual(eventIds)
  })

  it('targets 為空陣列時不發送也不寫入', async () => {
    await emitContestEventsBatch('result', [])

    expect(triggerMock).not.toHaveBeenCalled()
    expect(vi.mocked(writePendingEvents)).not.toHaveBeenCalled()
  })

  it('Pusher 未啟用時安全跳過', async () => {
    vi.mocked(isPusherEnabled).mockReturnValue(false)

    await emitContestEventsBatch('result', [
      { characterId: 'atk-1', payload: makePayload() },
    ])

    expect(triggerMock).not.toHaveBeenCalled()
    expect(vi.mocked(writePendingEvents)).not.toHaveBeenCalled()
  })

  it('Pusher trigger 失敗時拋出錯誤（由呼叫端決定如何處理）', async () => {
    triggerMock.mockRejectedValueOnce(new Error('pusher down'))

    await expect(
      emitContestEventsBatch('result', [
        { characterId: 'atk-1', payload: makePayload() },
      ])
    ).rejects.toThrow('pusher down')
  })
})
