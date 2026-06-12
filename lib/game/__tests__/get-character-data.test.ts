/**
 * getCharacterData 四路徑回歸測試（快取/完整 × Runtime/Baseline）
 *
 * resolveIsActive 共用化重構的安全網：重構前後行為必須一致——
 * 路由決策、快取寫入、Runtime 遺失降級、找不到角色/遊戲的 throw。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/Character', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('@/lib/db/models/CharacterRuntime', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/lib/db/models/Game', () => ({
  default: { findById: vi.fn() },
}));

import { getCharacterData } from '../get-character-data';
import {
  runWithGameCache,
  setCachedCharGameId,
  setCachedIsActive,
} from '../game-request-cache';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';

const characterFindById = vi.mocked(Character.findById);
const runtimeFindOne = vi.mocked(CharacterRuntime.findOne);
const gameFindById = vi.mocked(Game.findById);

const baselineDoc = { _id: 'char-1', gameId: 'game-1' };
const runtimeDoc = { _id: 'rt-1', refId: 'char-1', type: 'runtime' };

/** 在已填好快取（charId→gameId→isActive）的請求 context 內執行 fn */
function withPrimedCache<T>(isActive: boolean, fn: () => Promise<T>): Promise<T> {
  return runWithGameCache(async () => {
    setCachedCharGameId('char-1', 'game-1');
    setCachedIsActive('game-1', isActive);
    return fn();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getCharacterData 快取路徑', () => {
  it('Runtime 分支：回傳 Runtime，且不查 Character/Game', async () => {
    runtimeFindOne.mockResolvedValue(runtimeDoc);

    const result = await withPrimedCache(true, () => getCharacterData('char-1'));

    expect(result).toBe(runtimeDoc);
    expect(characterFindById).not.toHaveBeenCalled();
    expect(gameFindById).not.toHaveBeenCalled();
  });

  it('Runtime 遺失：console.warn 並降級回 Baseline', async () => {
    runtimeFindOne.mockResolvedValue(null);
    characterFindById.mockResolvedValue(baselineDoc);

    const result = await withPrimedCache(true, () => getCharacterData('char-1'));

    expect(result).toBe(baselineDoc);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('Runtime 遺失且 Baseline 也不存在：throw 找不到角色', async () => {
    runtimeFindOne.mockResolvedValue(null);
    characterFindById.mockResolvedValue(null);

    await expect(
      withPrimedCache(true, () => getCharacterData('char-1')),
    ).rejects.toThrow('找不到角色：char-1');
  });

  it('Baseline 分支：回傳 Baseline，不存在時 throw', async () => {
    characterFindById.mockResolvedValue(baselineDoc);

    const result = await withPrimedCache(false, () => getCharacterData('char-1'));
    expect(result).toBe(baselineDoc);
    expect(gameFindById).not.toHaveBeenCalled();

    characterFindById.mockResolvedValue(null);
    await expect(
      withPrimedCache(false, () => getCharacterData('char-1')),
    ).rejects.toThrow('找不到角色：char-1');
  });
});

describe('getCharacterData 完整路徑', () => {
  it('Runtime 分支：查 Character+Game 後回傳 Runtime', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: true });
    runtimeFindOne.mockResolvedValue(runtimeDoc);

    const result = await runWithGameCache(() => getCharacterData('char-1'));

    expect(result).toBe(runtimeDoc);
    expect(characterFindById).toHaveBeenCalledTimes(1);
    expect(gameFindById).toHaveBeenCalledTimes(1);
  });

  it('Runtime 遺失：console.warn 並降級回 Baseline（不需額外查詢）', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: true });
    runtimeFindOne.mockResolvedValue(null);

    const result = await runWithGameCache(() => getCharacterData('char-1'));

    expect(result).toBe(baselineDoc);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(characterFindById).toHaveBeenCalledTimes(1);
  });

  it('Baseline 分支：isActive=false 回傳 Baseline，不查 Runtime', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: false });

    const result = await runWithGameCache(() => getCharacterData('char-1'));

    expect(result).toBe(baselineDoc);
    expect(runtimeFindOne).not.toHaveBeenCalled();
  });

  it('角色不存在：throw 找不到角色', async () => {
    characterFindById.mockResolvedValue(null);

    await expect(
      runWithGameCache(() => getCharacterData('char-1')),
    ).rejects.toThrow('找不到角色：char-1');
  });

  it('遊戲不存在：throw 找不到遊戲', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue(null);

    await expect(
      runWithGameCache(() => getCharacterData('char-1')),
    ).rejects.toThrow('找不到遊戲：game-1');
  });

  it('完整路徑寫入快取：同請求第二次呼叫不再查 Character/Game', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: true });
    runtimeFindOne.mockResolvedValue(runtimeDoc);

    await runWithGameCache(async () => {
      await getCharacterData('char-1');
      await getCharacterData('char-1');
    });

    expect(characterFindById).toHaveBeenCalledTimes(1);
    expect(gameFindById).toHaveBeenCalledTimes(1);
    expect(runtimeFindOne).toHaveBeenCalledTimes(2);
  });
});
