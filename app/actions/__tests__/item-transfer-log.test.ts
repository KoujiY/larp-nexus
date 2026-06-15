/**
 * transferItem GM log 回歸測試
 *
 * BACKLOG「物品轉移/偷取無 GM log」縱向分析結論：偷取/移除三條路徑
 * （item / skill / contest executor）皆已寫 log；真正缺口僅「轉移（give）」
 * ——transferItem 從未呼叫 writeLog，GM 歷史看不到玩家間贈與。
 * 本測試鎖定：成功轉移後寫入 action='item_transfer' 的 log。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// wrapper 直通：保留業務邏輯為被測對象
vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/actions/action-wrapper', () => ({
  withAction: (_name: string, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/game/game-request-cache', () => ({
  runWithGameCache: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  validatePlayerAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/game/get-character-data', () => ({
  getCharacterData: vi.fn(),
  getBaselineCharacterId: (doc: { refId?: string; _id: string }) =>
    doc.refId ? String(doc.refId) : String(doc._id),
}));
vi.mock('@/lib/game/update-character-data', () => ({
  updateCharacterData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/websocket/events', () => ({
  emitItemTransferred: vi.fn().mockResolvedValue(undefined),
  emitItemUsed: vi.fn().mockResolvedValue(undefined),
  emitRoleUpdatedBatch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/reveal/auto-reveal-evaluator', () => ({
  executeAutoReveal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logs/write-log', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/item/apply-equipment-boosts', () => ({ buildEquipmentBoostUpdates: vi.fn(() => ({})) }));
// 以下為 item-use.ts 模組級 import（transferItem 不使用，僅需可解析）
vi.mock('@/lib/contest-tracker', () => ({ isCharacterInContest: vi.fn(() => ({ inContest: false })) }));
vi.mock('@/lib/contest/check-handler', () => ({ handleAbilityCheck: vi.fn() }));
vi.mock('@/lib/item/item-effect-executor', () => ({ executeItemEffects: vi.fn() }));
vi.mock('@/lib/item/get-item-effects', () => ({ getItemEffects: vi.fn(() => []) }));
vi.mock('@/lib/effects/check-expired-effects', () => ({ processExpiredEffectsSafe: vi.fn() }));
vi.mock('@/lib/character/usage-condition', () => ({
  checkUsageConditions: vi.fn(() => ({ satisfied: true })),
  buildConsumeUpdate: vi.fn(() => null),
}));

import { transferItem } from '@/app/actions/item-use';
import { getCharacterData } from '@/lib/game/get-character-data';
import { writeLog } from '@/lib/logs/write-log';

const getCharacterDataMock = vi.mocked(getCharacterData);
const writeLogMock = vi.mocked(writeLog);

const sourceChar = {
  _id: 'char-source',
  gameId: 'game-1',
  name: 'Bob',
  stats: [],
  items: [
    { id: 'item-1', name: '金幣', quantity: 5, isTransferable: true, type: 'consumable' },
  ],
};

const targetChar = {
  _id: 'char-target',
  gameId: 'game-1',
  name: 'Alice',
  stats: [],
  items: [],
};

describe('transferItem 寫入 GM log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCharacterDataMock.mockImplementation((async (id: string) =>
      id === 'char-source' ? { ...sourceChar } : { ...targetChar }) as never);
  });

  it('成功轉移後寫入 action=item_transfer 的 log（記在轉出方，details 帶物品與目標）', async () => {
    const result = await transferItem('char-source', 'item-1', 'char-target', 2);

    expect(result.success).toBe(true);
    expect(writeLogMock).toHaveBeenCalledTimes(1);
    expect(writeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-1',
        characterId: 'char-source',
        actorType: 'character',
        actorId: 'char-source',
        action: 'item_transfer',
        details: expect.objectContaining({
          itemId: 'item-1',
          itemName: '金幣',
          quantity: 2,
          targetCharacterId: 'char-target',
          targetCharacterName: 'Alice',
        }),
      }),
    );
  });

  it('轉移失敗（數量不足）不寫 log', async () => {
    const result = await transferItem('char-source', 'item-1', 'char-target', 99);

    expect(result.success).toBe(false);
    expect(writeLogMock).not.toHaveBeenCalled();
  });
});
