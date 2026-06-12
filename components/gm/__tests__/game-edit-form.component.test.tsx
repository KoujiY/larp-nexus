/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app/actions/games', () => ({
  updateGame: vi.fn().mockResolvedValue({ success: true }),
  uploadGameCover: vi.fn(),
}));
// BackgroundBlockEditor 走 next/dynamic（內含 dnd-kit），測試以空元件替身
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/shared/image-upload-dialog', () => ({
  ImageUploadDialog: () => null,
}));

import { GameEditForm } from '../game-edit-form';
import { updateGame } from '@/app/actions/games';
import type { GameData } from '@/types/game';

const updateGameMock = vi.mocked(updateGame);

/** 每次呼叫產生新 reference，模擬 router.refresh() 後的 RSC props */
function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    id: 'game-1',
    name: '原始劇本名',
    isActive: false,
    coverUrl: '',
    publicInfo: { blocks: [] },
    randomContestMaxValue: 100,
    ...overrides,
  } as unknown as GameData;
}

function nameInput(): HTMLInputElement {
  return screen.getByPlaceholderText('請輸入劇本名稱');
}

beforeEach(() => {
  vi.clearAllMocks();
  updateGameMock.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof updateGame>>);
});

afterEach(() => {
  cleanup();
});

describe('GameEditForm 髒頁保護（reset-on-refresh 守衛）', () => {
  it('使用者編輯中：props refresh（新 reference）不得洗掉輸入', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GameEditForm game={makeGame()} />);

    await user.clear(nameInput());
    await user.type(nameInput(), '我改過的名字');

    // 模擬任何來源的 router.refresh()：game prop 內容相同但 reference 全新
    rerender(<GameEditForm game={makeGame()} />);

    expect(nameInput().value).toBe('我改過的名字');
  });

  it('未編輯：props 更新時照常同步 server 新資料', () => {
    const { rerender } = render(<GameEditForm game={makeGame()} />);

    rerender(<GameEditForm game={makeGame({ name: '別處更新的新名' })} />);

    expect(nameInput().value).toBe('別處更新的新名');
  });

  it('編輯被保留後仍為 dirty，儲存送出的是使用者的值', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GameEditForm game={makeGame()} />);

    await user.clear(nameInput());
    await user.type(nameInput(), '我改過的名字');
    rerender(<GameEditForm game={makeGame()} />);

    const saveButton = screen.getByRole('button', { name: '儲存變更' });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => expect(updateGameMock).toHaveBeenCalledOnce());
    const payload = updateGameMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.name).toBe('我改過的名字');
  });
});

describe('GameEditForm 儲存 payload', () => {
  it('不得包含 isActive（lifecycle 由專屬 action 管理，防止舊快照回寫）', async () => {
    const user = userEvent.setup();
    render(<GameEditForm game={makeGame()} />);

    await user.clear(nameInput());
    await user.type(nameInput(), '新名稱');
    await user.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => expect(updateGameMock).toHaveBeenCalledOnce());
    const payload = updateGameMock.mock.calls[0][1] as Record<string, unknown>;
    expect('isActive' in payload).toBe(false);
  });
});
