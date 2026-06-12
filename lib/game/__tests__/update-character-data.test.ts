/**
 * updateCharacterData 快取路徑回歸測試
 *
 * 重點：cached fast-path 與完整路徑必須維持一致的「角色不存在 → throw」行為
 * （code review 2026-06-12 發現 cached Baseline 分支曾靜默 no-op）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/Character', () => ({
  default: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('@/lib/db/models/CharacterRuntime', () => ({
  default: { findOneAndUpdate: vi.fn() },
}));
vi.mock('@/lib/db/models/Game', () => ({
  default: { findById: vi.fn() },
}));

import { updateCharacterData } from '../update-character-data';
import {
  runWithGameCache,
  setCachedCharGameId,
  setCachedIsActive,
} from '../game-request-cache';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';

const characterFindById = vi.mocked(Character.findById);
const characterFindByIdAndUpdate = vi.mocked(Character.findByIdAndUpdate);
const runtimeFindOneAndUpdate = vi.mocked(CharacterRuntime.findOneAndUpdate);
const gameFindById = vi.mocked(Game.findById);

const baselineDoc = { _id: 'char-1', gameId: 'game-1' };

/** 在已填好快取（charId→gameId→isActive）的請求 context 內執行 fn */
function withPrimedCache<T>(isActive: boolean, fn: () => Promise<T>): Promise<T> {
  return runWithGameCache(async () => {
    setCachedCharGameId('char-1', 'game-1');
    setCachedIsActive('game-1', isActive);
    return fn();
  });
}

describe('updateCharacterData cached fast-path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Baseline 快取分支：角色不存在時 throw 找不到角色（不可靜默 no-op）', async () => {
    characterFindByIdAndUpdate.mockResolvedValue(null);

    await expect(
      withPrimedCache(false, () => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).rejects.toThrow('找不到角色：char-1');
    expect(characterFindByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('Baseline 快取分支：更新成功時正常返回', async () => {
    characterFindByIdAndUpdate.mockResolvedValue({ _id: 'char-1' });

    await expect(
      withPrimedCache(false, () => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).resolves.toBeUndefined();
  });

  it('Runtime 快取分支：Runtime 不存在時 throw（既有行為不變）', async () => {
    runtimeFindOneAndUpdate.mockResolvedValue(null);

    await expect(
      withPrimedCache(true, () => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).rejects.toThrow('找不到 Runtime Character：characterId=char-1');
  });
});

describe('updateCharacterData 完整路徑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Runtime 分支：查 Character+Game 後更新 Runtime；落空時 throw', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: true });
    runtimeFindOneAndUpdate.mockResolvedValue({ _id: 'rt-1' });

    await expect(
      runWithGameCache(() => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).resolves.toBeUndefined();
    expect(runtimeFindOneAndUpdate).toHaveBeenCalledTimes(1);

    runtimeFindOneAndUpdate.mockResolvedValue(null);
    await expect(
      runWithGameCache(() => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).rejects.toThrow('找不到 Runtime Character：characterId=char-1');
  });

  it('Baseline 分支：isActive=false 更新 Baseline', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: false });
    characterFindByIdAndUpdate.mockResolvedValue({ _id: 'char-1' });

    await expect(
      runWithGameCache(() => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).resolves.toBeUndefined();
    expect(characterFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(runtimeFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('Baseline 分支：更新落空（角色於查詢後消失）時 throw，與快取分支一致', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: false });
    characterFindByIdAndUpdate.mockResolvedValue(null);

    await expect(
      runWithGameCache(() => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).rejects.toThrow('找不到角色：char-1');
  });

  it('角色不存在：throw 找不到角色', async () => {
    characterFindById.mockResolvedValue(null);

    await expect(
      runWithGameCache(() => updateCharacterData('char-1', { $set: { name: 'x' } })),
    ).rejects.toThrow('找不到角色：char-1');
  });

  it('完整路徑寫入快取：同請求第二次呼叫不再查 Character/Game', async () => {
    characterFindById.mockResolvedValue(baselineDoc);
    gameFindById.mockResolvedValue({ _id: 'game-1', isActive: true });
    runtimeFindOneAndUpdate.mockResolvedValue({ _id: 'rt-1' });

    await runWithGameCache(async () => {
      await updateCharacterData('char-1', { $set: { name: 'x' } });
      await updateCharacterData('char-1', { $set: { name: 'y' } });
    });

    expect(characterFindById).toHaveBeenCalledTimes(1);
    expect(gameFindById).toHaveBeenCalledTimes(1);
    expect(runtimeFindOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});
