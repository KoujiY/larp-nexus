/**
 * endGame convert-in-place 回歸測試
 *
 * CONTEST_CONSISTENCY_PLAN D2=方案 3：
 * 1. isActive=false 提前到第一步（flag-first）——新進 action 立即路由 Baseline
 * 2. runtime 文件「原地轉型」為 snapshot（updateOne/updateMany $set type），
 *    取代舊的「複製＋刪除」——消除「已拍快照但 runtime 仍可寫」的
 *    silent data loss 視窗（per-doc 原子轉換，寫入要嘛進入成為快照的文件、
 *    要嘛撞上 type 變更後的 loud throw）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/Game', () => ({
  default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('@/lib/db/models/GameRuntime', () => ({
  default: { findOne: vi.fn(), updateOne: vi.fn(), create: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock('@/lib/db/models/CharacterRuntime', () => ({
  default: { find: vi.fn(), updateMany: vi.fn(), insertMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('@/lib/logs/write-log', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/websocket/events', () => ({ emitGameEnded: vi.fn().mockResolvedValue(undefined) }));

import { endGame } from '../end-game';
import Game from '@/lib/db/models/Game';
import GameRuntime from '@/lib/db/models/GameRuntime';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { writeLog } from '@/lib/logs/write-log';
import { emitGameEnded } from '@/lib/websocket/events';

const gameFindById = vi.mocked(Game.findById);
const gameUpdateOne = vi.mocked(Game.updateOne);
const runtimeFindOne = vi.mocked(GameRuntime.findOne);
const runtimeUpdateOne = vi.mocked(GameRuntime.updateOne);
const runtimeCreate = vi.mocked(GameRuntime.create);
const runtimeDeleteOne = vi.mocked(GameRuntime.deleteOne);
const charUpdateMany = vi.mocked(CharacterRuntime.updateMany);
const charInsertMany = vi.mocked(CharacterRuntime.insertMany);
const charDeleteMany = vi.mocked(CharacterRuntime.deleteMany);
const writeLogMock = vi.mocked(writeLog);
const emitGameEndedMock = vi.mocked(emitGameEnded);

const gameDoc = {
  _id: 'game-1',
  gmUserId: 'gm-1',
  name: '測試遊戲',
  gameCode: 'ABCD',
  isActive: true,
};

const gameRuntimeDoc = {
  _id: 'grt-1',
  refId: 'game-1',
  type: 'runtime',
};

describe('endGame convert-in-place', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameFindById.mockResolvedValue(gameDoc);
    gameUpdateOne.mockResolvedValue({ modifiedCount: 1 } as never);
    runtimeFindOne.mockResolvedValue(gameRuntimeDoc);
    runtimeUpdateOne.mockResolvedValue({ modifiedCount: 1 } as never);
    charUpdateMany.mockResolvedValue({ modifiedCount: 3 } as never);
  });

  it('runtime 原地轉型為 snapshot：不複製（create/insertMany）、不刪除（deleteOne/deleteMany）', async () => {
    const result = await endGame('game-1', 'gm-1', '我的快照');

    expect(result.success).toBe(true);

    // GameRuntime 原地轉型
    expect(runtimeUpdateOne).toHaveBeenCalledTimes(1);
    const [grtQuery, grtUpdate] = runtimeUpdateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(grtQuery).toMatchObject({ _id: 'grt-1' });
    expect(grtUpdate.$set).toMatchObject({
      type: 'snapshot',
      isActive: false,
      snapshotName: '我的快照',
    });

    // CharacterRuntime 原地轉型
    expect(charUpdateMany).toHaveBeenCalledTimes(1);
    const [charQuery, charUpdate] = charUpdateMany.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(charQuery).toMatchObject({ gameId: 'game-1', type: 'runtime' });
    expect(charUpdate.$set).toMatchObject({
      type: 'snapshot',
      snapshotGameRuntimeId: 'grt-1',
    });

    // 不再有複製與刪除
    expect(runtimeCreate).not.toHaveBeenCalled();
    expect(runtimeDeleteOne).not.toHaveBeenCalled();
    expect(charInsertMany).not.toHaveBeenCalled();
    expect(charDeleteMany).not.toHaveBeenCalled();
  });

  it('flag-first：isActive=false 先於任何 runtime 轉換', async () => {
    const callOrder: string[] = [];
    gameUpdateOne.mockImplementation((async () => {
      callOrder.push('isActive=false');
      return { modifiedCount: 1 };
    }) as never);
    runtimeUpdateOne.mockImplementation((async () => {
      callOrder.push('convert:gameRuntime');
      return { modifiedCount: 1 };
    }) as never);
    charUpdateMany.mockImplementation((async () => {
      callOrder.push('convert:characterRuntimes');
      return { modifiedCount: 3 };
    }) as never);

    await endGame('game-1', 'gm-1');

    expect(callOrder).toEqual([
      'isActive=false',
      'convert:gameRuntime',
      'convert:characterRuntimes',
    ]);
  });

  it('snapshotId 沿用原 runtime _id；log 與事件帶正確資料', async () => {
    const result = await endGame('game-1', 'gm-1', '我的快照');

    expect(result.data?.snapshotId).toBe('grt-1');
    expect(writeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-1',
        action: 'game_end',
        details: expect.objectContaining({ characterCount: 3, snapshotId: 'grt-1' }),
      }),
    );
    expect(emitGameEndedMock).toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ snapshotId: 'grt-1' }),
    );
  });

  it('轉換失敗：回傳錯誤（isActive 已先落地，重按結束可重試）', async () => {
    runtimeUpdateOne.mockRejectedValue(new Error('db down'));

    const result = await endGame('game-1', 'gm-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('SNAPSHOT_CONVERSION_FAILED');
    // flag 已先寫入
    expect(gameUpdateOne).toHaveBeenCalledWith(
      { _id: 'game-1' },
      { $set: { isActive: false } },
    );
  });

  it('遊戲不存在 → NOT_FOUND', async () => {
    gameFindById.mockResolvedValue(null);

    const result = await endGame('game-1', 'gm-1');

    expect(result).toMatchObject({ success: false, error: 'NOT_FOUND' });
  });

  it('非 owner → FORBIDDEN', async () => {
    const result = await endGame('game-1', 'other-gm');

    expect(result).toMatchObject({ success: false, error: 'FORBIDDEN' });
    expect(gameUpdateOne).not.toHaveBeenCalled();
  });

  it('Runtime 不存在 + isActive=true → 僅重設 isActive（既有降級路徑）', async () => {
    runtimeFindOne.mockResolvedValue(null);

    const result = await endGame('game-1', 'gm-1');

    expect(result.success).toBe(true);
    expect(gameUpdateOne).toHaveBeenCalledWith(
      { _id: 'game-1' },
      { $set: { isActive: false } },
    );
    expect(runtimeUpdateOne).not.toHaveBeenCalled();
    expect(charUpdateMany).not.toHaveBeenCalled();
  });

  it('Runtime 不存在 + isActive=false → RUNTIME_NOT_FOUND', async () => {
    gameFindById.mockResolvedValue({ ...gameDoc, isActive: false });
    runtimeFindOne.mockResolvedValue(null);

    const result = await endGame('game-1', 'gm-1');

    expect(result).toMatchObject({ success: false, error: 'RUNTIME_NOT_FOUND' });
  });
});
