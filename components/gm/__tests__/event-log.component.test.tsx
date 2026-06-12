/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/logs', async () => {
  const actual = await vi.importActual<typeof import('@/app/actions/logs')>('@/app/actions/logs');
  return { ...actual, getGameLogs: vi.fn() };
});
vi.mock('@/app/actions/clear-notifications', () => ({
  clearPlayerNotifications: vi.fn().mockResolvedValue({ success: true }),
}));

import { EventLog } from '../event-log';
import { getGameLogs, type LogData } from '@/app/actions/logs';

const getGameLogsMock = vi.mocked(getGameLogs);

function broadcastLog(id: string, ts: string, title: string): LogData {
  return {
    id,
    timestamp: new Date(ts),
    gameId: 'game-1',
    actorType: 'gm',
    actorId: 'gm-1',
    action: 'broadcast',
    details: { title },
  };
}

const initialLogs = [
  broadcastLog('log-2', '2026-06-12T10:00:01.000Z', '第二則'),
  broadcastLog('log-1', '2026-06-12T10:00:00.000Z', '第一則'),
];

beforeEach(() => {
  vi.clearAllMocks();
  getGameLogsMock.mockResolvedValue({ success: true, data: initialLogs, message: 'ok' });
});

afterEach(() => {
  cleanup();
});

describe('EventLog since-cursor 增量抓取', () => {
  it('mount 時全量載入（不帶 since）', async () => {
    render(<EventLog gameId="game-1" characters={[]} refreshKey={0} />);

    await screen.findByText('第二則');
    expect(getGameLogsMock).toHaveBeenCalledTimes(1);
    const options = getGameLogsMock.mock.calls[0][1];
    expect(options?.since).toBeUndefined();
  });

  it('refreshKey 變更時帶最新游標增量抓取，新紀錄 prepend 且去重', async () => {
    const { rerender } = render(
      <EventLog gameId="game-1" characters={[]} refreshKey={0} />
    );
    await screen.findByText('第二則');

    // 增量回應：一筆新紀錄 + 一筆邊界重複（同 id）
    getGameLogsMock.mockResolvedValue({
      success: true,
      data: [
        broadcastLog('log-3', '2026-06-12T10:00:02.000Z', '第三則'),
        broadcastLog('log-2', '2026-06-12T10:00:01.000Z', '第二則'),
      ],
      message: 'ok',
    });

    rerender(<EventLog gameId="game-1" characters={[]} refreshKey={1} />);

    await screen.findByText('第三則');
    expect(getGameLogsMock).toHaveBeenCalledTimes(2);
    const options = getGameLogsMock.mock.calls[1][1];
    // 游標 = 全量載入後最新一筆（log-2）的時間戳
    expect(options?.since).toBe('2026-06-12T10:00:01.000Z');
    // 去重：log-2 不重複渲染
    expect(screen.getAllByText('第二則')).toHaveLength(1);
    expect(screen.getByText('第一則')).toBeInTheDocument();
  });

  it('清單為空時的外部觸發退回全量抓取', async () => {
    getGameLogsMock.mockResolvedValue({ success: true, data: [], message: 'ok' });
    const { rerender } = render(
      <EventLog gameId="game-1" characters={[]} refreshKey={0} />
    );
    await waitFor(() => expect(getGameLogsMock).toHaveBeenCalledTimes(1));

    rerender(<EventLog gameId="game-1" characters={[]} refreshKey={1} />);

    await waitFor(() => expect(getGameLogsMock).toHaveBeenCalledTimes(2));
    const options = getGameLogsMock.mock.calls[1][1];
    expect(options?.since).toBeUndefined();
  });

  it('點「重新讀取」走全量（重置游標）', async () => {
    const user = userEvent.setup();
    render(<EventLog gameId="game-1" characters={[]} refreshKey={0} />);
    await screen.findByText('第二則');

    await user.click(screen.getByRole('button', { name: /重新讀取/ }));

    await waitFor(() => expect(getGameLogsMock).toHaveBeenCalledTimes(2));
    const options = getGameLogsMock.mock.calls[1][1];
    expect(options?.since).toBeUndefined();
  });
});
