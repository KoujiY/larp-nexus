/**
 * @vitest-environment jsdom
 */
/**
 * usePendingEventsRefetch 回歸測試（非破壞性讀取 + 投遞後 ack）
 *
 * BACKLOG「瀏覽器歷史導航返回角色頁不觸發 pending 補送」：
 * 補送原本只掛在 SSR（getPublicCharacter → fetchPendingEvents 破壞性讀取）。
 *
 * 觸發三路徑：
 * - **mount**：SPA 客戶端導航（NavLink router.push，如「世界觀」連結）返回時角色頁 remount，
 *   server component 不重跑（Router Cache 舊 props）、pageshow/visibilitychange 皆不觸發
 *   ——唯一可靠訊號是 remount。
 * - **pageshow(persisted)**：bfcache 整頁還原。
 * - **visibilitychange(→visible)**：分頁 / App 切回前景。
 *
 * 核心安全性質：以 markDelivered=false 非破壞性讀取，**投遞到 UI 後**才 ack 標記 delivered。
 * 投遞前若被 cleanup 取消（dev StrictMode mount→cleanup→mount 把 in-flight 跨過），
 * 事件未 ack（DB 未消費）→ remount 重抓可重讀重投，徹底消除「消費卻未投遞」遺失。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

vi.mock('@/app/actions/pending-events', () => ({
  fetchPendingEvents: vi.fn(),
  acknowledgePendingEvents: vi.fn(),
}));

import { usePendingEventsRefetch } from '../use-pending-events-refetch';
import { fetchPendingEvents, acknowledgePendingEvents } from '@/app/actions/pending-events';
import type { PendingEvent } from '@/types/event';

const fetchMock = vi.mocked(fetchPendingEvents);
const ackMock = vi.mocked(acknowledgePendingEvents);

function pendingEvent(id: string, createdAt: string): PendingEvent {
  return {
    id,
    targetCharacterId: 'char-1',
    eventType: 'skill.contest',
    eventPayload: { _eventId: id },
    createdAt,
    isDelivered: false,
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function fireVisible() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function firePageshow(persisted: boolean) {
  const evt = new Event('pageshow');
  Object.defineProperty(evt, 'persisted', { value: persisted, configurable: true });
  window.dispatchEvent(evt);
}

describe('usePendingEventsRefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ success: true, data: { events: [] } });
    ackMock.mockResolvedValue({ success: true, data: { acknowledged: 0 } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('mount：非破壞性重抓（markDelivered=false）→ 投遞 → ack（SPA 返回 remount）', async () => {
    fetchMock.mockResolvedValue({
      success: true,
      data: { events: [pendingEvent('e1', '2026-06-14T10:00:00.000Z')] },
    });
    const deliver = vi.fn();
    renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver, delayBetweenEvents: 10 }),
    );

    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledWith('char-1', 'game-1', { markDelivered: false });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0]).toMatchObject({ type: 'skill.contest', payload: { _eventId: 'e1' } });
    // 投遞後才 ack
    expect(ackMock).toHaveBeenCalledWith(['e1']);
  });

  it('安全性質：fetch in-flight 時 unmount（模擬 StrictMode teardown 跨過）→ 不投遞、不 ack（事件留 DB 待重抓）', async () => {
    // 受控 deferred：fetch 在 unmount 後才解析，模擬 in-flight 被 teardown 跨過
    let resolveFetch!: (v: Awaited<ReturnType<typeof fetchPendingEvents>>) => void;
    fetchMock.mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      }),
    );
    const deliver = vi.fn();
    const { unmount } = renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver, delayBetweenEvents: 10 }),
    );

    // fetch 尚未解析 → 先 unmount（isActive=false）
    unmount();
    // 之後 fetch 才解析：isActive 守衛應 drop，事件未投遞、未消費（DB 仍 undelivered）
    resolveFetch({
      success: true,
      data: { events: [pendingEvent('e1', '2026-06-14T10:00:00.000Z')] },
    });
    await vi.runAllTimersAsync();

    expect(deliver).not.toHaveBeenCalled();
    expect(ackMock).not.toHaveBeenCalled(); // 關鍵：未投遞 → 未消費 → remount 可救回
  });

  it('visibilitychange→visible 觸發非破壞性重抓並投遞', async () => {
    const deliver = vi.fn();
    renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver, delayBetweenEvents: 10 }),
    );
    await vi.runAllTimersAsync(); // 沖掉 mount 重抓（空）
    fetchMock.mockClear();
    deliver.mockClear();
    ackMock.mockClear();

    fetchMock.mockResolvedValue({
      success: true,
      data: { events: [pendingEvent('e1', '2026-06-14T10:00:00.000Z')] },
    });
    fireVisible();
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledWith('char-1', 'game-1', { markDelivered: false });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(ackMock).toHaveBeenCalledWith(['e1']);
  });

  it('pageshow persisted 觸發；非 persisted 不觸發', async () => {
    const deliver = vi.fn();
    renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver }),
    );
    await vi.runAllTimersAsync(); // 沖掉 mount 重抓
    fetchMock.mockClear();

    firePageshow(false);
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();

    firePageshow(true);
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange→hidden 不觸發', async () => {
    const deliver = vi.fn();
    renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver }),
    );
    await vi.runAllTimersAsync(); // 沖掉 mount 重抓
    fetchMock.mockClear();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('投遞當下去重：同一事件跨多次重抓只投遞一次、只 ack 一次', async () => {
    fetchMock.mockResolvedValue({
      success: true,
      data: { events: [pendingEvent('dup', '2026-06-14T10:00:00.000Z')] },
    });
    const deliver = vi.fn();
    renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver, delayBetweenEvents: 10 }),
    );

    await vi.runAllTimersAsync(); // mount 重抓投遞 dup
    fireVisible();
    await vi.runAllTimersAsync(); // 二次重抓，dup 已投遞 → 去重

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(ackMock).toHaveBeenCalledTimes(1);
  });

  it('unmount 後不再觸發抓取', async () => {
    const deliver = vi.fn();
    const { unmount } = renderHook(() =>
      usePendingEventsRefetch({ characterId: 'char-1', gameId: 'game-1', deliver }),
    );
    await vi.runAllTimersAsync(); // 沖掉 mount 重抓
    fetchMock.mockClear();

    unmount();
    fireVisible();
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
