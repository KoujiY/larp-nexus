/**
 * Pending Events 重抓 Hook（歷史導航 / 前景恢復補送）
 *
 * 背景：離線補送原本只掛在 SSR（getPublicCharacter → fetchPendingEvents），而
 * fetchPendingEvents 預設為「破壞性讀取」（一抓即原子標記 isDelivered）。歷史導航返回
 * 不重跑 SSR，導致玩家離開期間累積的 PendingEvent（對抗請求、被偷取等）漏接 → 對抗孤兒化。
 *
 * 本 Hook 於三種返回路徑重抓，把回傳事件餵進與 usePendingEvents 相同的投遞管線：
 * - **mount**：SPA 客戶端導航（NavLink router.push，如角色頁底部「世界觀」連結）返回時
 *   角色頁 remount，但 server component 不重跑（Router Cache 舊 props）、且 pageshow /
 *   visibilitychange 皆不觸發——唯一可靠訊號是 remount 本身。
 * - **pageshow(persisted=true)**：bfcache 整頁導航還原。
 * - **visibilitychange(→visible)**：分頁 / App 切回前景。
 *
 * 核心設計（為何用非破壞性讀取 + ack）：
 * 破壞性讀取放 client 端會在投遞失敗時消費卻未投遞 → 連刷新都撈不回。最典型是 dev
 * StrictMode 的 mount→cleanup→mount：mount-1 的 in-flight fetch 被 cleanup 跨過、
 * isActive 守衛擋下投遞，但事件已被標記消費；mount-2 撈到空。
 * 解法：以 markDelivered=false 非破壞性讀取，**投遞到 UI 後**才以 acknowledgePendingEvents
 * 標記 delivered。被取消的投遞不消費事件（DB 仍 undelivered）→ remount / 刷新都能救回。
 * 去重在「投遞當下」進行（非排程當下），故重疊的重抓不會雙投或雙 ack。
 */

'use client';

import { useEffect, useRef } from 'react';
import { fetchPendingEvents, acknowledgePendingEvents } from '@/app/actions/pending-events';
import type { BaseEvent, PendingEvent } from '@/types/event';

export interface UsePendingEventsRefetchOptions {
  /** Baseline 角色 ID */
  characterId: string;
  /** 劇本 ID（用於查詢 game-level 事件） */
  gameId: string;
  /** 投遞單一事件的回調（通常即 usePendingEvents 使用的 handlePendingEvent） */
  deliver: (event: BaseEvent) => void;
  /** 每個事件之間的延遲（毫秒），預設 500ms（與 usePendingEvents 一致） */
  delayBetweenEvents?: number;
}

/** 將 PendingEvent 轉為 BaseEvent（與 usePendingEvents 的轉換一致） */
function toBaseEvent(pe: PendingEvent): BaseEvent {
  return {
    type: pe.eventType,
    timestamp:
      pe.createdAt instanceof Date ? pe.createdAt.getTime() : new Date(pe.createdAt).getTime(),
    payload: pe.eventPayload,
  };
}

export function usePendingEventsRefetch(options: UsePendingEventsRefetchOptions): void {
  const { characterId, gameId, deliver, delayBetweenEvents = 500 } = options;

  // 以 ref 持有最新的 deliver，避免其 reference 變更重綁 listener
  const deliverRef = useRef(deliver);
  useEffect(() => {
    deliverRef.current = deliver;
  }, [deliver]);

  // 投遞當下去重的最後防線（跨通道去重另由 handleWebSocketEvent 的 _eventId 機制負責）
  const deliveredIdsRef = useRef<Set<string>>(new Set());
  const activeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // 標記此 effect 是否仍掛載：fetch 為 async，解析時可能已 unmount（或 dev StrictMode
    // 的 mount→cleanup→mount 已 teardown）。非破壞性讀取下，被擋下的投遞不消費事件
    // （DB 仍 undelivered），remount 重抓可重讀重投，故此處安全 drop。
    let isActive = true;

    const runRefetch = async () => {
      let res;
      try {
        // 非破壞性讀取：不消費，事件留 DB 待投遞後 ack
        res = await fetchPendingEvents(characterId, gameId, { markDelivered: false });
      } catch (error) {
        console.error('[pending-events-refetch] fetch failed', error);
        return;
      }
      if (!isActive || !res.success || !res.data) return;

      // 排程當下先濾掉已投遞者（最佳化）；最終去重在投遞當下
      const fresh = res.data.events.filter((pe) => !deliveredIdsRef.current.has(pe.id));
      if (fresh.length === 0) return;

      // 按 createdAt 排序（最舊先處理），逐一以間隔投遞
      const sorted = [...fresh].sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return ta - tb;
      });

      sorted.forEach((pe, index) => {
        const timeoutId = setTimeout(() => {
          // cleanup 已清除未觸發的 timeout，正常不可達；保留 isActive 守衛作 defense-in-depth，
          // 避免任何重排序下投遞到已卸載元件
          if (!isActive) return;
          // 投遞當下去重：重疊的重抓可能各自排程同一事件，先到者投遞並標記，後到者跳過
          if (deliveredIdsRef.current.has(pe.id)) return;
          deliveredIdsRef.current.add(pe.id);
          deliverRef.current(toBaseEvent(pe));
          // 投遞成功後才 ack 標記 delivered（best-effort：失敗則事件留 DB 待下次重抓）
          void acknowledgePendingEvents([pe.id]).catch((error) =>
            console.error('[pending-events-refetch] ack failed', error),
          );
        }, index * delayBetweenEvents);
        activeTimeoutsRef.current.push(timeoutId);
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void runRefetch();
    };
    const handlePageshow = (evt: Event) => {
      // 僅 bfcache 還原（persisted=true）需要補送；一般載入由 SSR 涵蓋
      if ((evt as PageTransitionEvent).persisted) void runRefetch();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageshow);

    // mount 即重抓：涵蓋 SPA 客戶端導航返回的 remount（server component 不重跑，
    // 且 pageshow/visibilitychange 皆不觸發）。非破壞性讀取保證初次 SSR 載入時
    // 已被 SSR 破壞性消費的事件不會被重複撈出（僅補 SSR→hydration 間隙的新事件）。
    void runRefetch();

    return () => {
      isActive = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageshow);
      for (const id of activeTimeoutsRef.current) {
        clearTimeout(id);
      }
      activeTimeoutsRef.current = [];
    };
  }, [characterId, gameId, delayBetweenEvents]);
}
