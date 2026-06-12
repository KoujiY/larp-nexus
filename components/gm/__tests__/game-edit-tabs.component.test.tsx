/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameEditTabs } from '../game-edit-tabs';
import type { GameData } from '@/types/game';
import type { CharacterData } from '@/types/character';

// ─── Mock 重量級子元件（測試對象是 Tabs 切換邏輯本身） ──────────────────────

vi.mock('@/components/gm/game-edit-form', () => ({
  GameEditForm: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => (
    <div data-testid="info-form">
      <button data-testid="make-dirty" onClick={() => onDirtyChange?.(true)}>
        dirty
      </button>
    </div>
  ),
}));

vi.mock('@/components/gm/preset-events-edit-form', () => ({
  PresetEventsEditForm: () => <div data-testid="events-form" />,
}));

vi.mock('@/components/gm/character-import-tab', () => ({
  CharacterImportTab: () => <div data-testid="import-tab" />,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseGame = {
  id: 'game-1',
  name: '測試劇本',
  isActive: false,
  presetEvents: [],
} as unknown as GameData;

const characters: CharacterData[] = [];

/** 組裝 GameEditTabs props；consoleTab 有無對應 Runtime / Baseline 模式 */
function tabsProps(options: { withConsole: boolean }) {
  return {
    game: { ...baseGame, isActive: options.withConsole } as GameData,
    characters,
    charactersTab: <div data-testid="characters-content" />,
    consoleTab: options.withConsole ? (
      <div data-testid="console-content" />
    ) : undefined,
    hasAiConfig: false,
  };
}

function getTab(name: string) {
  return screen.getByRole('tab', { name });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GameEditTabs 分頁切換', () => {
  it('Runtime 模式初始選中控制台', () => {
    render(<GameEditTabs {...tabsProps({ withConsole: true })} />);

    expect(getTab('控制台')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('console-content')).toBeInTheDocument();
  });

  it('Baseline 模式初始選中劇本資訊', () => {
    render(<GameEditTabs {...tabsProps({ withConsole: false })} />);

    expect(getTab('劇本資訊')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('info-form')).toBeInTheDocument();
  });

  it('結束遊戲後（consoleTab 消失）fallback 至劇本資訊', () => {
    const { rerender } = render(
      <GameEditTabs {...tabsProps({ withConsole: true })} />
    );

    // 模擬 router.refresh()：props 更新、client state 保留
    rerender(<GameEditTabs {...tabsProps({ withConsole: false })} />);

    expect(screen.queryByRole('tab', { name: '控制台' })).toBeNull();
    expect(getTab('劇本資訊')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('info-form')).toBeInTheDocument();
  });

  it('回歸：結束遊戲→重新開始後停留在劇本資訊，不跳回控制台', () => {
    const { rerender } = render(
      <GameEditTabs {...tabsProps({ withConsole: true })} />
    );

    // 結束遊戲：fallback 至劇本資訊（GM 可能正在這裡編輯）
    rerender(<GameEditTabs {...tabsProps({ withConsole: false })} />);
    expect(screen.getByTestId('info-form')).toBeInTheDocument();

    // 重新開始遊戲：activeTab 若殘留 'console' 會跳回控制台，
    // unmount 編輯中的 info form（髒頁無確認即丟失）
    rerender(<GameEditTabs {...tabsProps({ withConsole: true })} />);

    expect(getTab('劇本資訊')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('info-form')).toBeInTheDocument();
    expect(screen.queryByTestId('console-content')).toBeNull();
  });

  it('劇本資訊 dirty 時切換分頁需確認，取消則留在原分頁', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<GameEditTabs {...tabsProps({ withConsole: false })} />);
    await user.click(screen.getByTestId('make-dirty'));

    await user.click(getTab('預設事件'));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(getTab('劇本資訊')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('info-form')).toBeInTheDocument();
  });

  it('劇本資訊 dirty 時確認離開則切換成功', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<GameEditTabs {...tabsProps({ withConsole: false })} />);
    await user.click(screen.getByTestId('make-dirty'));

    await user.click(getTab('預設事件'));

    expect(getTab('預設事件')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('events-form')).toBeInTheDocument();
  });
});
