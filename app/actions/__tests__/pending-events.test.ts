/**
 * pending-events server action 回歸測試
 *
 * 非破壞性讀取 + 投遞後確認（修正 bfcache/SPA 補送的破壞性讀取脆弱性）：
 * - fetchPendingEvents 預設 markDelivered=true（SSR 路徑不變，一抓即標記 delivered）
 * - markDelivered=false：讀取但不消費（client 重抓用），事件留在 DB 待 ack
 * - acknowledgePendingEvents：client 確實投遞到 UI 後才標記 delivered
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/actions/action-wrapper', () => ({
  withAction: (_name: string, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/db/models', () => ({
  PendingEvent: { find: vi.fn(), updateMany: vi.fn() },
}));

import { fetchPendingEvents, acknowledgePendingEvents } from '@/app/actions/pending-events';
import { PendingEvent } from '@/lib/db/models';

const findMock = vi.mocked(PendingEvent.find);
const updateManyMock = vi.mocked(PendingEvent.updateMany);

function mockFind(events: unknown[]) {
  findMock.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(events),
    }),
  } as never);
}

const sampleEvent = {
  id: 'pevt-1',
  targetCharacterId: 'char-1',
  eventType: 'skill.contest',
  eventPayload: { _eventId: 'pevt-1' },
  createdAt: new Date('2026-06-14T10:00:00.000Z'),
  isDelivered: false,
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
};

describe('fetchPendingEvents markDelivered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateManyMock.mockResolvedValue({ modifiedCount: 1 } as never);
  });

  it('預設（SSR 路徑）：抓取後標記 isDelivered（破壞性）', async () => {
    mockFind([sampleEvent]);

    const res = await fetchPendingEvents('char-1', 'game-1');

    expect(res.success).toBe(true);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith(
      { id: { $in: ['pevt-1'] } },
      expect.objectContaining({ $set: expect.objectContaining({ isDelivered: true }) }),
    );
    expect(res.data?.events[0]).toMatchObject({ id: 'pevt-1', isDelivered: true });
  });

  it('markDelivered=false（client 重抓）：不標記、回傳事件 isDelivered=false', async () => {
    mockFind([sampleEvent]);

    const res = await fetchPendingEvents('char-1', 'game-1', { markDelivered: false });

    expect(res.success).toBe(true);
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(res.data?.events).toHaveLength(1);
    expect(res.data?.events[0]).toMatchObject({ id: 'pevt-1', isDelivered: false });
  });

  it('無事件時：不論 markDelivered 都不呼叫 updateMany', async () => {
    mockFind([]);

    await fetchPendingEvents('char-1', 'game-1', { markDelivered: false });
    await fetchPendingEvents('char-1', 'game-1');

    expect(updateManyMock).not.toHaveBeenCalled();
  });
});

describe('acknowledgePendingEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateManyMock.mockResolvedValue({ modifiedCount: 2 } as never);
  });

  it('標記指定 ids 為 isDelivered', async () => {
    const res = await acknowledgePendingEvents(['pevt-1', 'pevt-2']);

    expect(res.success).toBe(true);
    expect(updateManyMock).toHaveBeenCalledWith(
      { id: { $in: ['pevt-1', 'pevt-2'] } },
      expect.objectContaining({ $set: expect.objectContaining({ isDelivered: true }) }),
    );
    expect(res.data?.acknowledged).toBe(2);
  });

  it('空陣列：no-op，不呼叫 updateMany', async () => {
    const res = await acknowledgePendingEvents([]);

    expect(res.success).toBe(true);
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(res.data?.acknowledged).toBe(0);
  });
});
