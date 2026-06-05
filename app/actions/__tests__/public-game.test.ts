import { describe, it, expect, vi, beforeEach } from 'vitest';

// 只 mock DB 相依，讓 getPublicGame 的查詢邏輯成為被測對象。
vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models', () => ({
  Game: { findById: vi.fn() },
  Character: { find: vi.fn() },
}));

import { getPublicGame } from '@/app/actions/public';
import { Game, Character } from '@/lib/db/models';

const mockGame = {
  _id: 'game1',
  name: '測試劇本',
  description: '劇本描述',
  coverUrl: undefined,
  publicInfo: { blocks: [] },
};

/** 建立 Character.find(...).select(...).sort(...).lean() 的鏈式 mock */
function mockCharacterFind(result: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
  vi.mocked(Character.find).mockReturnValue(chain as never);
  return chain;
}

describe('getPublicGame — 世界觀角色列表過濾', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Game.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockGame),
    } as never);
  });

  it('以 hiddenFromWorld: { $ne: true } 條件查詢角色（排除被標記的角色）', async () => {
    mockCharacterFind([]);

    await getPublicGame('game1');

    // 過濾發生在 DB 查詢層：被標記 hiddenFromWorld=true 的角色不會被撈出。
    // 用 $ne: true 而非 false，舊資料（欄位為 undefined）仍會被納入。
    expect(Character.find).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'game1', hiddenFromWorld: { $ne: true } }),
    );
  });

  it('回傳查詢結果中的角色（DB 已過濾後的清單）', async () => {
    mockCharacterFind([
      { _id: 'c1', name: '愛麗絲', description: '主角', imageUrl: undefined },
    ]);

    const result = await getPublicGame('game1');

    expect(result.success).toBe(true);
    expect(result.data?.characters).toHaveLength(1);
    expect(result.data?.characters[0]).toMatchObject({ id: 'c1', name: '愛麗絲' });
  });

  it('找不到劇本時回傳 NOT_FOUND', async () => {
    vi.mocked(Game.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    mockCharacterFind([]);

    const result = await getPublicGame('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('NOT_FOUND');
  });
});
