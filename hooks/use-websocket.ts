'use client';

import { useEffect, useRef } from 'react';
import { getPusherClient } from '@/lib/websocket/pusher-client';
import type { BaseEvent, RoleUpdatedEvent } from '@/types/event';

type EventHandler = (event: BaseEvent) => void;
type RoleUpdatedHandler = (
  payload: RoleUpdatedEvent['payload'],
  event: RoleUpdatedEvent,
) => void;

/**
 * 判斷一個事件是否為「副作用同步」的 role.updated（payload.silentSync === true）。
 *
 * 內部用來做事件分流，亦可被外部訂閱端引用，避免硬編碼 `payload.silentSync` 字串。
 */
export function isSilentSyncRoleUpdate(event: BaseEvent): boolean {
  if (event.type !== 'role.updated') return false;
  const payload = event.payload as { silentSync?: boolean } | undefined;
  return payload?.silentSync === true;
}

const CHARACTER_EVENT_TYPES = [
  'role.updated',
  'role.secretUnlocked',
  'role.message',
  'role.taskUpdated',
  'role.inventoryUpdated',
  'skill.used',
  'item.used',
  'skill.cooldown',
  'skill.contest',
  'character.affected',
  'item.transferred',
  // Phase 7.7: 自動揭露 + 道具展示事件
  'secret.revealed',
  'task.revealed',
  'item.showcased',
  // Phase 8: 時效性效果過期
  'effect.expired',
  // 裝備切換（玩家端裝備/卸除 → GM 端需同步數值與道具卡）
  'equipment.toggled',
] as const;

const GAME_EVENT_TYPES = ['game.broadcast', 'game.started', 'game.reset', 'game.ended'] as const;

/**
 * 訂閱角色專屬 Pusher 頻道（`private-character-{id}`）
 *
 * 使用 ref 持有 handler 避免重新訂閱，cleanup 時只 unbind 不 unsubscribe（多元件共享頻道）。
 *
 * @param characterId - Baseline Character ID
 * @param onEvent - 收到事件時的回呼
 */
export function useCharacterWebSocket(characterId: string, onEvent?: EventHandler) {
  const handlerRef = useRef<EventHandler | undefined>(onEvent);

  // 更新處理器引用（不觸發重新訂閱）
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!characterId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `private-character-${characterId}`;
    const channel = pusher.subscribe(channelName);
    
    // 監聽訂閱錯誤事件
    channel.bind('pusher:subscription_error', (error: unknown) => {
      console.error('[useCharacterWebSocket] 頻道訂閱失敗', { 
        characterId, 
        channelName,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // 創建一個穩定的處理器函數，它會調用當前的 handlerRef.current
    // 這樣每個組件都有自己的處理器，不會互相覆蓋
    // 重要：使用閉包捕獲 handlerRef，這樣 handler 改變時不需要重新綁定
    const handle = (data: BaseEvent) => {
      const currentHandler = handlerRef.current;
      if (currentHandler) {
        try {
          currentHandler(data);
        } catch (error) {
          console.error('[useCharacterWebSocket] 處理器執行出錯', { 
            eventType: data.type, 
            characterId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };

    CHARACTER_EVENT_TYPES.forEach((eventType) => {
      channel.bind(eventType, handle);
    });

    return () => {
      CHARACTER_EVENT_TYPES.forEach((eventType) => {
        channel.unbind(eventType, handle);
      });
      // 注意：不要調用 pusher.unsubscribe，因為其他組件可能還在訂閱同一個頻道
      // 只有在所有組件都取消訂閱時，Pusher 才會自動取消訂閱
    };
  }, [characterId]);
}

/**
 * 訂閱遊戲層級 Pusher 頻道（`private-game-{id}`）
 *
 * 用於接收 game.broadcast / game.started / game.ended 等全域事件。
 *
 * @param gameId - Game ID
 * @param onEvent - 收到事件時的回呼
 */
export function useGameWebSocket(gameId: string, onEvent?: EventHandler) {
  const handlerRef = useRef<EventHandler | undefined>(onEvent);

  // 更新處理器引用（不觸發重新訂閱）
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!gameId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `private-game-${gameId}`;
    const channel = pusher.subscribe(channelName);

    // 創建一個穩定的處理器函數，它會調用當前的 handlerRef.current
    // 這樣每個組件都有自己的處理器，不會互相覆蓋
    // 重要：使用閉包捕獲 handlerRef，這樣 handler 改變時不需要重新綁定
    const handle = (data: BaseEvent) => {
      const currentHandler = handlerRef.current;
      if (currentHandler) {
        try {
          currentHandler(data);
        } catch (error) {
          console.error('[useGameWebSocket] 處理器執行出錯', { 
            eventType: data.type, 
            gameId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };

    GAME_EVENT_TYPES.forEach((eventType) => {
      channel.bind(eventType, handle);
    });

    return () => {
      GAME_EVENT_TYPES.forEach((eventType) => {
        channel.unbind(eventType, handle);
      });
      // 注意：不要調用 pusher.unsubscribe，因為其他組件可能還在訂閱同一個頻道
      // 只有在所有組件都取消訂閱時，Pusher 才會自動取消訂閱
    };
  }, [gameId]);
}

/**
 * 訂閱 `role.updated` 事件（GM 端專用）。
 *
 * 預設過濾 `payload.silentSync === true` 的事件，因為這類事件代表「server 端
 * 為了同步 GM Console 而額外推送的副作用事件」，不應在 GM 編輯頁觸發 sticky bar /
 * 重複 refresh / 假冒「外部變更」toast。
 *
 * 想接收 silentSync 事件的呼叫端必須顯式設定 `{ includeSilentSync: true }`。
 *
 * 與 `useCharacterWebSocket` 共用底層 Pusher channel（多個 hook 訂閱同一個 channel
 * 不會重複建立連線），因此可以與其他事件 listener 同時存在。
 *
 * @param characterId - Baseline Character ID
 * @param onRoleUpdated - 收到 role.updated 事件時的回呼（已型別收斂）
 * @param options - `includeSilentSync` 預設為 false
 *
 * @example
 * ```tsx
 * useRoleUpdated(characterId, (payload) => {
 *   if (payload.updates.items) router.refresh();
 * });
 * ```
 */
export function useRoleUpdated(
  characterId: string,
  onRoleUpdated: RoleUpdatedHandler,
  options?: { includeSilentSync?: boolean },
) {
  const handlerRef = useRef<RoleUpdatedHandler>(onRoleUpdated);
  const includeSilentSync = options?.includeSilentSync === true;

  useEffect(() => {
    handlerRef.current = onRoleUpdated;
  }, [onRoleUpdated]);

  useEffect(() => {
    if (!characterId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `private-character-${characterId}`;
    const channel = pusher.subscribe(channelName);

    const handle = (data: BaseEvent) => {
      if (data.type !== 'role.updated') return;
      const event = data as RoleUpdatedEvent;
      if (!includeSilentSync && event.payload?.silentSync === true) return;
      try {
        handlerRef.current(event.payload, event);
      } catch (error) {
        console.error('[useRoleUpdated] 處理器執行出錯', {
          characterId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    channel.bind('role.updated', handle);

    return () => {
      channel.unbind('role.updated', handle);
      // 不 unsubscribe — 其他 hook 可能還在使用同一個 channel
    };
  }, [characterId, includeSilentSync]);
}

