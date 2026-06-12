/**
 * startGame flag-first 回歸測試
 *
 * CONTEST_CONSISTENCY_PLAN D3：isActive=true 提前到 Baseline 讀取/複製之前。
 * flag 之後新進的寫入 action 解析 isActive=true → 路由 Runtime：
 * - 複製完成前 → loud throw「找不到 Runtime Character」（既有路徑）
 * - 複製完成後 → 正常進 Runtime
 * 消除「Baseline 讀取後、isActive=true 前」落地的寫入被 runtime 複本
 * 默默跳過的視窗（殘留：已快取 isActive=false 的 in-flight action，見計畫文件）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/Game', () => ({
  default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('@/lib/db/models/Character', () => ({
  default: { find: vi.fn() },
}));
vi.mock('@/lib/db/models/GameRuntime', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock('@/lib/db/models/CharacterRuntime', () => ({
  default: { insertMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('@/lib/logs/write-log', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/websocket/events', () => ({ emitGameStarted: vi.fn().mockResolvedValue(undefined) }));

import { startGame } from '../start-game';
import Game from '@/lib/db/models/Game';
import Character from '@/lib/db/models/Character';
import GameRuntime from '@/lib/db/models/GameRuntime';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { writeLog } from '@/lib/logs/write-log';
import { emitGameStarted } from '@/lib/websocket/events';

const gameFindById = vi.mocked(Game.findById);
const gameUpdateOne = vi.mocked(Game.updateOne);
const characterFind = vi.mocked(Character.find);
const runtimeFindOne = vi.mocked(GameRuntime.findOne);
const runtimeUpsert = vi.mocked(GameRuntime.findOneAndUpdate);
const runtimeDeleteOne = vi.mocked(GameRuntime.deleteOne);
const charInsertMany = vi.mocked(CharacterRuntime.insertMany);
const charDeleteMany = vi.mocked(CharacterRuntime.deleteMany);
const writeLogMock = vi.mocked(writeLog);
const emitGameStartedMock = vi.mocked(emitGameStarted);

const gameDoc = {
  _id: 'game-1',
  gmUserId: 'gm-1',
  name: '測試遊戲',
  gameCode: 'ABCD',
  isActive: false,
  description: '',
  publicInfo: {},
  randomContestMaxValue: 100,
  presetEvents: [],
};

const baselineCharacters = [
  { _id: 'char-1', gameId: 'game-1', name: '角色一', stats: [], items: [], skills: [], tasks: [] },
  { _id: 'char-2', gameId: 'game-1', name: '角色二', stats: [], items: [], skills: [], tasks: [] },
];

describe('startGame flag-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameFindById.mockResolvedValue({ ...gameDoc });
    gameUpdateOne.mockResolvedValue({ modifiedCount: 1 } as never);
    characterFind.mockResolvedValue(baselineCharacters);
    runtimeFindOne.mockResolvedValue(null);
    runtimeUpsert.mockResolvedValue({ _id: 'grt-1' });
    charInsertMany.mockResolvedValue(
      baselineCharacters.map((c, i) => ({ _id: `rt-${i}` })) as never,
    );
    charDeleteMany.mockResolvedValue({ deletedCount: 0 } as never);
  });

  it('isActive=true 先於 Baseline 讀取與 runtime 建立', async () => {
    const callOrder: string[] = [];
    gameUpdateOne.mockImplementation(((async () => {
      callOrder.push('isActive=true');
      return { modifiedCount: 1 };
    }) as never));
    characterFind.mockImplementation(((async () => {
      callOrder.push('read:baselineCharacters');
      return baselineCharacters;
    }) as never));
    runtimeUpsert.mockImplementation(((async () => {
      callOrder.push('upsert:gameRuntime');
      return { _id: 'grt-1' };
    }) as never));
    charInsertMany.mockImplementation(((async () => {
      callOrder.push('insert:characterRuntimes');
      return [{ _id: 'rt-0' }, { _id: 'rt-1' }];
    }) as never));

    const result = await startGame('game-1', 'gm-1');

    expect(result.success).toBe(true);
    expect(callOrder[0]).toBe('isActive=true');
    expect(callOrder).toEqual([
      'isActive=true',
      'read:baselineCharacters',
      'upsert:gameRuntime',
      'insert:characterRuntimes',
    ]);
  });

  it('複製失敗時回滾：刪除已建 runtime 並重設 isActive=false', async () => {
    charInsertMany.mockRejectedValue(new Error('db down'));

    const result = await startGame('game-1', 'gm-1');

    expect(result).toMatchObject({ success: false, error: 'RUNTIME_CREATION_FAILED' });
    expect(runtimeDeleteOne).toHaveBeenCalledWith({ _id: 'grt-1' });
    // flag 已提前寫入，回滾必須重設
    expect(gameUpdateOne).toHaveBeenLastCalledWith(
      { _id: 'game-1' },
      { $set: { isActive: false } },
    );
  });

  it('成功路徑：upsert GameRuntime、清舊 runtime、批次建立角色 runtime、log 與事件', async () => {
    const result = await startGame('game-1', 'gm-1');

    expect(result.success).toBe(true);
    expect(runtimeUpsert).toHaveBeenCalledWith(
      { refId: 'game-1', type: 'runtime' },
      expect.objectContaining({ type: 'runtime', isActive: true }),
      expect.objectContaining({ upsert: true }),
    );
    expect(charDeleteMany).toHaveBeenCalledWith({ gameId: 'game-1', type: 'runtime' });
    expect(charInsertMany).toHaveBeenCalledTimes(1);
    const inserted = charInsertMany.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ refId: 'char-1', type: 'runtime' });
    expect(writeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'game_start',
        details: expect.objectContaining({ characterCount: 2 }),
      }),
    );
    expect(emitGameStartedMock).toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ gameCode: 'ABCD' }),
    );
  });

  it('遊戲不存在 → NOT_FOUND', async () => {
    gameFindById.mockResolvedValue(null);

    const result = await startGame('game-1', 'gm-1');

    expect(result).toMatchObject({ success: false, error: 'NOT_FOUND' });
    expect(gameUpdateOne).not.toHaveBeenCalled();
  });

  it('非 owner → FORBIDDEN（不寫 flag）', async () => {
    const result = await startGame('game-1', 'other-gm');

    expect(result).toMatchObject({ success: false, error: 'FORBIDDEN' });
    expect(gameUpdateOne).not.toHaveBeenCalled();
  });

  it('已 active 且 runtime 存在：照常覆蓋（前端負責確認對話框）', async () => {
    gameFindById.mockResolvedValue({ ...gameDoc, isActive: true });
    runtimeFindOne.mockResolvedValue({ _id: 'grt-existing', type: 'runtime' });

    const result = await startGame('game-1', 'gm-1');

    expect(result.success).toBe(true);
    expect(charDeleteMany).toHaveBeenCalled();
    expect(charInsertMany).toHaveBeenCalled();
  });
});
