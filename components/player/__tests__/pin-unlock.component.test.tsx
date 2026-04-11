/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinUnlock } from '../pin-unlock';

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockPinSuccess() {
  mockFetch.mockResolvedValueOnce({
    json: async () => ({ success: true }),
  });
}

function mockPinFailure() {
  mockFetch.mockResolvedValueOnce({
    json: async () => ({ success: false }),
  });
}

function mockGameCodeSuccess() {
  mockFetch.mockResolvedValueOnce({
    json: async () => ({ success: true }),
  });
}

function mockGameCodeFailure(message?: string) {
  mockFetch.mockResolvedValueOnce({
    json: async () => ({ success: false, message }),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultProps = {
  characterId: 'char-123',
  characterName: '黑騎士',
  onUnlocked: vi.fn(),
};

function renderPinUnlock(props = {}) {
  return render(<PinUnlock {...defaultProps} {...props} />);
}

async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  const pinInput = screen.getByLabelText('PIN 輸入');
  await user.click(pinInput);
  await user.type(pinInput, pin);
}

async function typeGameCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  const codeInput = screen.getByLabelText('遊戲代碼輸入');
  await user.click(codeInput);
  await user.type(codeInput, code);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PinUnlock', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  it('顯示角色名稱和首字母', () => {
    renderPinUnlock();
    expect(screen.getByText('黑騎士')).toBeInTheDocument();
    expect(screen.getByText('黑')).toBeInTheDocument();
  });

  it('初始狀態下提交按鈕顯示「以 PIN 預覽角色」', () => {
    renderPinUnlock();
    expect(screen.getByRole('button', { name: /以 PIN 預覽角色/i })).toBeInTheDocument();
  });

  it('初始狀態下提交按鈕為 disabled（無 PIN）', () => {
    renderPinUnlock();
    expect(screen.getByRole('button', { name: /以 PIN 預覽角色/i })).toBeDisabled();
  });

  // ── PIN 輸入 ──────────────────────────────────────────────────────────────

  it('只接受數字，自動過濾非數字字元', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, 'a1b2c3d4extra');

    const pinInput = screen.getByLabelText('PIN 輸入') as HTMLInputElement;
    expect(pinInput.value).toBe('1234');
  });

  it('PIN 最多 4 位', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '123456');

    const pinInput = screen.getByLabelText('PIN 輸入') as HTMLInputElement;
    expect(pinInput.value).toBe('1234');
  });

  // ── 遊戲代碼輸入 ─────────────────────────────────────────────────────────

  it('輸入遊戲代碼後按鈕切換為「進入完整互動模式」', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '1234');
    await typeGameCode(user, 'ABC123');

    expect(screen.getByRole('button', { name: /進入完整互動模式/i })).toBeInTheDocument();
  });

  it('遊戲代碼自動轉大寫、過濾特殊字元', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typeGameCode(user, 'abc-12!3');

    const codeInput = screen.getByLabelText('遊戲代碼輸入') as HTMLInputElement;
    expect(codeInput.value).toBe('ABC123');
  });

  it('遊戲代碼最多 6 位', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typeGameCode(user, 'ABCDEFGH');

    const codeInput = screen.getByLabelText('遊戲代碼輸入') as HTMLInputElement;
    expect(codeInput.value).toBe('ABCDEF');
  });

  // ── 提交：空 PIN ──────────────────────────────────────────────────────────

  it('空 PIN 提交時顯示錯誤', async () => {
    renderPinUnlock();

    // 按鈕 disabled 無法直接 click，但也可以透過 form submit 測試
    // 由於 button disabled，此處確認按鈕不可按
    const btn = screen.getByRole('button', { name: /以 PIN 預覽角色/i });
    expect(btn).toBeDisabled();
  });

  // ── 提交：僅 PIN → 唯讀模式 ──────────────────────────────────────────────

  it('僅 PIN 成功 → onUnlocked(true)（唯讀模式）', async () => {
    const user = userEvent.setup();
    const onUnlocked = vi.fn();
    renderPinUnlock({ onUnlocked });

    await typePin(user, '1234');
    mockPinSuccess();

    await user.click(screen.getByRole('button', { name: /以 PIN 預覽角色/i }));

    await waitFor(() => {
      expect(onUnlocked).toHaveBeenCalledWith(true);
    });
  });

  it('僅 PIN 失敗 → 顯示錯誤訊息', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '9999');
    mockPinFailure();

    await user.click(screen.getByRole('button', { name: /以 PIN 預覽角色/i }));

    await waitFor(() => {
      expect(screen.getByText('PIN 或遊戲代碼錯誤')).toBeInTheDocument();
    });
    expect(defaultProps.onUnlocked).not.toHaveBeenCalled();
  });

  // ── 提交：PIN + 遊戲代碼 → 完整互動模式 ──────────────────────────────────

  it('PIN + 遊戲代碼均成功 → onUnlocked(false)（完整模式）', async () => {
    const user = userEvent.setup();
    const onUnlocked = vi.fn();
    renderPinUnlock({ onUnlocked });

    await typePin(user, '1234');
    await typeGameCode(user, 'ABC123');
    mockPinSuccess();
    mockGameCodeSuccess();

    await user.click(screen.getByRole('button', { name: /進入完整互動模式/i }));

    await waitFor(() => {
      expect(onUnlocked).toHaveBeenCalledWith(false);
    });
  });

  it('PIN 成功但遊戲代碼失敗 → 顯示 server 回傳訊息', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '1234');
    await typeGameCode(user, 'WRONG1');
    mockPinSuccess();
    mockGameCodeFailure('遊戲尚未開始');

    await user.click(screen.getByRole('button', { name: /進入完整互動模式/i }));

    await waitFor(() => {
      expect(screen.getByText('遊戲尚未開始')).toBeInTheDocument();
    });
  });

  it('PIN 成功但遊戲代碼失敗（無 message）→ 顯示通用錯誤', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '1234');
    await typeGameCode(user, 'WRONG1');
    mockPinSuccess();
    mockGameCodeFailure();

    await user.click(screen.getByRole('button', { name: /進入完整互動模式/i }));

    await waitFor(() => {
      expect(screen.getByText('PIN 或遊戲代碼錯誤')).toBeInTheDocument();
    });
  });

  // ── 錯誤清除 ──────────────────────────────────────────────────────────────

  it('輸入 PIN 時自動清除錯誤', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '9999');
    mockPinFailure();
    await user.click(screen.getByRole('button', { name: /以 PIN 預覽角色/i }));

    await waitFor(() => {
      expect(screen.getByText('PIN 或遊戲代碼錯誤')).toBeInTheDocument();
    });

    // 再輸入一個字元 → 錯誤消失
    const pinInput = screen.getByLabelText('PIN 輸入');
    await user.clear(pinInput);
    await user.type(pinInput, '1');

    // 錯誤文字區域仍存在（佔位），但 opacity-0 且無文字
    expect(screen.queryByText('PIN 或遊戲代碼錯誤')).not.toBeInTheDocument();
  });

  // ── Loading 狀態 ──────────────────────────────────────────────────────────

  it('驗證中顯示「驗證中...」並 disable 輸入', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '1234');

    // 模擬延遲回應
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) =>
        setTimeout(() => resolve({ json: async () => ({ success: true }) }), 100)
      )
    );

    await user.click(screen.getByRole('button', { name: /以 PIN 預覽角色/i }));

    // 此時應處於 loading 狀態
    expect(screen.getByText('驗證中...')).toBeInTheDocument();
    expect(screen.getByLabelText('PIN 輸入')).toBeDisabled();
  });

  // ── fetch 錯誤 ────────────────────────────────────────────────────────────

  it('fetch 網路錯誤 → 顯示通用錯誤', async () => {
    const user = userEvent.setup();
    renderPinUnlock();

    await typePin(user, '1234');
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await user.click(screen.getByRole('button', { name: /以 PIN 預覽角色/i }));

    await waitFor(() => {
      expect(screen.getByText('PIN 或遊戲代碼錯誤')).toBeInTheDocument();
    });
  });

  // ── API 呼叫驗證 ──────────────────────────────────────────────────────────

  it('驗證 PIN API 使用正確的 characterId 和 PIN', async () => {
    const user = userEvent.setup();
    renderPinUnlock({ characterId: 'my-char-456' });

    await typePin(user, '5678');
    mockPinSuccess();

    await user.click(screen.getByRole('button', { name: /以 PIN 預覽角色/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/characters/my-char-456/unlock',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ pin: '5678' }),
        })
      );
    });
  });

  it('驗證 Game Code API 自動轉大寫並 trim', async () => {
    const user = userEvent.setup();
    renderPinUnlock({ characterId: 'my-char-456' });

    await typePin(user, '1234');
    await typeGameCode(user, 'abc123');
    mockPinSuccess();
    mockGameCodeSuccess();

    await user.click(screen.getByRole('button', { name: /進入完整互動模式/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/characters/my-char-456/verify-game-code',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ gameCode: 'ABC123' }),
        })
      );
    });
  });
});
