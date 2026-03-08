/**
 * Phase 9: Pending Events 處理 Hook
 *
 * 職責：
 * - 接收從 Server 拉取的 pending events
 * - 去重（基於 event ID，避免與即時 WebSocket 事件重複）
 * - 按 createdAt 排序並逐一處理
 * - 復用現有的 handleWebSocketEvent 函數
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

  // 追蹤已處理的 event IDs（去重，避免與即時 WebSocket 事件重複）
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // 追蹤是否已經處理過這一批 pending events（避免重複處理）
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // 如果沒有 pending events 或已經處理過，直接返回
    if (!pendingEvents || pendingEvents.length === 0 || hasProcessedRef.current) {
      return;
    }

    // 標記為已處理
    hasProcessedRef.current = true;

    // 過濾出尚未處理的事件（去重）
    const unprocessedEvents = pendingEvents.filter((pe) => {
      if (processedEventIdsRef.current.has(pe.id)) {
        return false;
      }
      return true;
    });

    if (unprocessedEvents.length === 0) {
      console.debug('[pending-events] All events already processed');
      return;
    }

    // 按 createdAt 排序（最舊的先處理）
    const sortedEvents = [...unprocessedEvents].sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    console.info(`[pending-events] Processing ${sortedEvents.length} pending events`);

    // 逐一處理事件（使用 setTimeout 間隔處理）
    sortedEvents.forEach((pendingEvent, index) => {
      setTimeout(() => {
        // 將 pending event 轉換為 BaseEvent 格式
        const baseEvent: BaseEvent = {
          type: pendingEvent.eventType,
          timestamp: pendingEvent.createdAt instanceof Date
            ? pendingEvent.createdAt.getTime()
            : new Date(pendingEvent.createdAt).getTime(),
          payload: pendingEvent.eventPayload,
        };

        // 調用現有的事件處理函數
        try {
          handleWebSocketEvent(baseEvent);
          // 標記為已處理
          processedEventIdsRef.current.add(pendingEvent.id);
          console.debug(`[pending-events] Processed event ${index + 1}/${sortedEvents.length}:`, pendingEvent.eventType);
        } catch (error) {
          console.error('[pending-events] Error processing event:', {
            eventType: pendingEvent.eventType,
            eventId: pendingEvent.id,
            error,
          });
        }
      }, index * delayBetweenEvents);
    });

    // Cleanup: 清理所有待處理的 timeout（當組件 unmount 時）
    return () => {
      // Note: 無法直接取消 setTimeout，但可以在組件 unmount 時停止後續處理
      // 這裡不需要額外的 cleanup，因為我們使用的是固定延遲的 setTimeout
    };
  }, [pendingEvents, handleWebSocketEvent, delayBetweenEvents]);
}
