/**
 * Phase 9: Pending Events 處理 Hook
 *
 * 職責：
 * - 接收從 Server 拉取的 pending events
 * - 去重（基於 pending event ID，避免同一批事件被處理兩次）
 * - 按 createdAt 排序並逐一處理
 * - 復用現有的 handleWebSocketEvent 函數
 *
 * Phase 11: 跨通道去重改由 handleWebSocketEvent 的 _eventId 機制統一處理。
 * 本 Hook 僅負責「同一 pending event 不重複投遞」，不再使用 hasProcessedRef。
 *
 * 使用場景：
 * - 玩家重新上線後，頁面載入時自動處理離線期間的事件
 * - 逐一顯示通知、Toast、Dialog，避免一次性全部彈出
 */

import { useEffect, useRef } from 'react';
import type { PendingEvent } from '@/types/event';
import type { BaseEvent } from '@/types/event';

export interface UsePendingEventsOptions {
  /**
   * 從 Server 拉取的 pending events
   */
  pendingEvents: PendingEvent[] | undefined;

  /**
   * 處理 WebSocket 事件的函數（來自 useCharacterWebSocketHandler）
   */
  handleWebSocketEvent: (event: BaseEvent) => void;

  /**
   * 每個事件之間的延遲（毫秒），預設 500ms
   * 避免一次性全部彈出通知
   */
  delayBetweenEvents?: number;
}

/**
 * Phase 9: Pending Events 處理 Hook
 *
 * 逐一處理離線期間的事件，復用現有的 WebSocket 事件處理邏輯。
 * Phase 11: 跨通道去重（WebSocket vs Pending Events）由 handleWebSocketEvent 的
 * _eventId 機制統一處理，本 Hook 只需確保同一個 pending event 不會被投遞兩次。
 *
 * @param options - Hook 選項
 *
 * @example
 * ```tsx
 * const { handleWebSocketEvent } = useCharacterWebSocketHandler({ ... });
 *
 * usePendingEvents({
 *   pendingEvents: character.pendingEvents,
 *   handleWebSocketEvent,
 * });
 * ```
 */
export function usePendingEvents(options: UsePendingEventsOptions): void {
  const { pendingEvents, handleWebSocketEvent, delayBetweenEvents = 500 } = options;

  // 追蹤已投遞的 pending event IDs，避免同一個 pending event 被處理兩次
  const deliveredEventIdsRef = useRef<Set<string>>(new Set());

  // 使用 ref 持有最新的 handleWebSocketEvent，避免將其放入 useEffect 依賴陣列
  // 原因：handleWebSocketEvent 由 useCallback 產生，其依賴項變更會導致 reference 改變，
  // 進而觸發 useEffect cleanup（取消 setTimeout）→ 但事件已標記為已投遞 → 事件遺失
  const handleWebSocketEventRef = useRef(handleWebSocketEvent);
  useEffect(() => {
    handleWebSocketEventRef.current = handleWebSocketEvent;
  }, [handleWebSocketEvent]);

  // 追蹤所有活躍的 timeout IDs，僅在組件 unmount 時取消
  const activeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Unmount cleanup：組件卸載時取消所有尚未執行的 timeout
  useEffect(() => {
    const timeoutsRef = activeTimeoutsRef;
    return () => {
      for (const id of timeoutsRef.current) {
        clearTimeout(id);
      }
    };
  }, []);

  // 處理 pending events
  useEffect(() => {
    if (!pendingEvents || pendingEvents.length === 0) {
      return;
    }

    // 過濾出尚未投遞的 pending events
    const undeliveredEvents = pendingEvents.filter((pe) => {
      return !deliveredEventIdsRef.current.has(pe.id);
    });

    if (undeliveredEvents.length === 0) {
      return;
    }

    // 先標記為已投遞，防止 re-render 時重複處理
    for (const pe of undeliveredEvents) {
      deliveredEventIdsRef.current.add(pe.id);
    }

    // 按 createdAt 排序（最舊的先處理）
    const sortedEvents = [...undeliveredEvents].sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    console.info(`[pending-events] Processing ${sortedEvents.length} pending events`);

    // 逐一處理事件（使用 setTimeout 間隔處理）
    sortedEvents.forEach((pendingEvent, index) => {
      const timeoutId = setTimeout(() => {
        // 將 pending event 轉換為 BaseEvent 格式
        // _eventId 保留在 eventPayload 中，handleWebSocketEvent 會用它去重
        const baseEvent: BaseEvent = {
          type: pendingEvent.eventType,
          timestamp: pendingEvent.createdAt instanceof Date
            ? pendingEvent.createdAt.getTime()
            : new Date(pendingEvent.createdAt).getTime(),
          payload: pendingEvent.eventPayload,
        };

        try {
          // 使用 ref 取得最新的 handler，確保即使 handler reference 變更也能正確處理
          handleWebSocketEventRef.current(baseEvent);
          console.debug(`[pending-events] Processed event ${index + 1}/${sortedEvents.length}:`, pendingEvent.eventType);
        } catch (error) {
          console.error('[pending-events] Error processing event:', {
            eventType: pendingEvent.eventType,
            eventId: pendingEvent.id,
            error,
          });
        }
      }, index * delayBetweenEvents);

      activeTimeoutsRef.current.push(timeoutId);
    });

    // 不返回 cleanup 函數 — timeout 應該在 handler reference 變更時繼續執行
    // 組件 unmount 時由上方的獨立 useEffect 統一清理
  }, [pendingEvents, delayBetweenEvents]);
}
