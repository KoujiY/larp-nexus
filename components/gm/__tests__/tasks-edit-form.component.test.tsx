/**
 * @vitest-environment jsdom
 *
 * TasksEditForm 資料來源測試（perf 去重：getGameItems 改由 page 層 props 下傳）
 *
 * 契約：TasksEditForm 不再自行呼叫 getGameItems，改接受 gameItems prop，
 * 並用於隱藏任務自動揭露條件的道具名稱顯示。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksEditForm } from '../tasks-edit-form';
import type { GameItemInfo } from '@/app/actions/games';
import type { Task } from '@/types/character';

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

vi.mock('@/components/gm/auto-reveal-condition-editor', () => ({
  AutoRevealConditionEditor: () => null,
}));

const gameItems: GameItemInfo[] = [
  { characterId: 'c1', characterName: '角色A', itemId: 'item-1', itemName: '寶劍', isHidden: false },
];

const hiddenTaskWithCondition = {
  id: 't1',
  title: '任務一',
  description: '',
  isHidden: true,
  isRevealed: false,
  revealCondition: '',
  autoRevealCondition: { type: 'items_acquired', matchLogic: 'and', itemIds: ['item-1'] },
} as unknown as Task;

beforeEach(() => {
  getGameItemsMock.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TasksEditForm gameItems 來源', () => {
  it('以 gameItems prop 顯示隱藏任務揭露條件的道具名稱，且不呼叫 getGameItems', async () => {
    const user = userEvent.setup();
    render(<TasksEditForm characterId="char-1" initialTasks={[hiddenTaskWithCondition]} secrets={[]} gameItems={gameItems} />);

    // 展開任務卡片以顯示揭露條件
    await user.click(screen.getByText('任務一'));

    expect(await screen.findByText('角色A：寶劍')).toBeInTheDocument();
    expect(getGameItemsMock).not.toHaveBeenCalled();
  });
});
