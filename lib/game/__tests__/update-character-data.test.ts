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

const characterFindByIdAndUpdate = vi.mocked(Character.findByIdAndUpdate);
const runtimeFindOneAndUpdate = vi.mocked(CharacterRuntime.findOneAndUpdate);

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
