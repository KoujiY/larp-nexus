'use client';

import { useEffect, useRef } from 'react';
import { getPusherClient } from '@/lib/websocket/pusher-client';
import type { BaseEvent } from '@/types/event';

type EventHandler = (event: BaseEvent) => void;

const CHARACTER_EVENT_TYPES = [
  'role.updated',
  'role.secretUnlocked',
  'role.message',
  'role.taskUpdated',
  'role.inventoryUpdated',
  'skill.used',
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
] as const;

const GAME_EVENT_TYPES = ['game.broadcast', 'game.started', 'game.reset', 'game.ended'] as const;

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

