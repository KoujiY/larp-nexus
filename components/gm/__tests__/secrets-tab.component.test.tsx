/**
 * @vitest-environment jsdom
 *
 * SecretsTab 資料來源測試（perf 去重：getGameItems 改由 page 層 props 下傳）
 *
 * 契約：SecretsTab 不再自行呼叫 getGameItems，改接受 gameItems prop，
 * 並把它用於自動揭露條件的物品名稱顯示。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SecretsTab } from '../secrets-tab';
import type { GameItemInfo } from '@/app/actions/games';
import type { CharacterData } from '@/types/character';

// ─── Mock：next/navigation、toast、server actions、重量級 Dialog ───────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getGameItemsMock } = vi.hoisted(() => ({ getGameItemsMock: vi.fn() }));
vi.mock('@/app/actions/games', () => ({
  getGameItems: getGameItemsMock,
}));

vi.mock('@/app/actions/character-update', () => ({
  updateCharacter: vi.fn(),
}));

// SecretEditDialog 是 Radix 重量級元件且預設關閉，攔截為空節點
vi.mock('@/components/gm/secret-edit-dialog', () => ({
  SecretEditDialog: () => null,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const gameItems: GameItemInfo[] = [
  { characterId: 'c1', characterName: '角色A', itemId: 'item-1', itemName: '寶劍', isHidden: false },
];

/** 一個帶 items_acquired 自動揭露條件、引用 item-1 的角色 */
const characterWithSecret = {
  id: 'char-1',
  name: '測試角色',
  secretInfo: {
    secrets: [
      {
        id: 's1',
        title: '秘密一',
        content: '內文',
        isRevealed: false,
        revealCondition: '',
        autoRevealCondition: { type: 'items_acquired', matchLogic: 'and', itemIds: ['item-1'] },
      },
    ],
  },
} as unknown as CharacterData;

beforeEach(() => {
  // 若元件仍走舊路徑（自行 fetch），讓它解析為空清單（不丟例外）
  getGameItemsMock.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('SecretsTab gameItems 來源', () => {
  it('以 gameItems prop 顯示自動揭露條件的物品名稱，且不呼叫 getGameItems', async () => {
    render(<SecretsTab character={characterWithSecret} gameItems={gameItems} />);

    // 詳情面板自動選中第一項，自動揭露條件顯示 `角色名：物品名`
    expect(await screen.findByText('角色A：寶劍')).toBeInTheDocument();

    // 去重契約：資料來自 prop，元件不應自行抓取
    expect(getGameItemsMock).not.toHaveBeenCalled();
  });
});
