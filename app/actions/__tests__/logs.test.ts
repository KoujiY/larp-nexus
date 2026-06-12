/**
 * getGameLogs 查詢形狀回歸測試（BACKLOG：GM log since-cursor 增量抓取）
 *
 * 重點：since 游標必須轉成 `timestamp: { $gte: Date }` 查詢條件
 * （吻合 {gameId, timestamp} 複合 index），無效字串退回全量。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentGMUserId: vi.fn().mockResolvedValue('gm-1'),
}));
vi.mock('@/lib/perf/perf-context', () => ({
  runWithPerf: vi.fn((_name: string, fn: () => unknown) => fn()),
}));
vi.mock('@/lib/db/models/Game', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('@/lib/db/models/Log', () => ({
  default: { find: vi.fn() },
}));

import { getGameLogs } from '../logs';
import Game from '@/lib/db/models/Game';
import Log from '@/lib/db/models/Log';

const gameFindById = vi.mocked(Game.findById);
const logFind = vi.mocked(Log.find);

beforeEach(() => {
  vi.clearAllMocks();
  gameFindById.mockResolvedValue({
    _id: 'game-1',
    gmUserId: { toString: () => 'gm-1' },
  });
  logFind.mockReturnValue({
    sort: () => ({ limit: () => ({ lean: async () => [] }) }),
  } as unknown as ReturnType<typeof Log.find>);
});

describe('getGameLogs 查詢形狀', () => {
  it('未提供 since：全量查詢，不帶 timestamp 條件', async () => {
    await getGameLogs('game-1', { limit: 100 });

    const query = logFind.mock.calls[0][0] as Record<string, unknown>;
    expect(query.timestamp).toBeUndefined();
  });

  it('提供 since：轉為 timestamp $gte Date 條件', async () => {
    await getGameLogs('game-1', { since: '2026-06-12T10:00:00.000Z' });

    const query = logFind.mock.calls[0][0] as Record<string, unknown>;
    expect(query.timestamp).toEqual({ $gte: new Date('2026-06-12T10:00:00.000Z') });
  });

  it('無效 since 字串：忽略游標退回全量', async () => {
    await getGameLogs('game-1', { since: 'not-a-date' });

    const query = logFind.mock.calls[0][0] as Record<string, unknown>;
    expect(query.timestamp).toBeUndefined();
  });

  it('since 與 characterId 可同時生效', async () => {
    await getGameLogs('game-1', {
      since: '2026-06-12T10:00:00.000Z',
      characterId: 'char-1',
    });

    const query = logFind.mock.calls[0][0] as Record<string, unknown>;
    expect(query.characterId).toBe('char-1');
    expect(query.timestamp).toEqual({ $gte: new Date('2026-06-12T10:00:00.000Z') });
  });
});
