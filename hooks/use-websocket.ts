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
] as const;

const GAME_EVENT_TYPES = ['game.broadcast', 'game.started', 'game.reset', 'game.ended'] as const;

export function useCharacterWebSocket(characterId: string, onEvent?: EventHandler) {
  const handlerRef = useRef<EventHandler | undefined>(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!characterId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `private-character-${characterId}`;
    const channel = pusher.subscribe(channelName);

    const handle = (data: BaseEvent) => {
      handlerRef.current?.(data);
    };

    CHARACTER_EVENT_TYPES.forEach((eventType) => {
      channel.bind(eventType, handle);
    });

    return () => {
      CHARACTER_EVENT_TYPES.forEach((eventType) => {
        channel.unbind(eventType, handle);
      });
      pusher.unsubscribe(channelName);
      // 不在此處斷線，交給 Pusher 內部連線管理
    };
  }, [characterId]);
}

export function useGameWebSocket(gameId: string, onEvent?: EventHandler) {
  const handlerRef = useRef<EventHandler | undefined>(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!gameId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `private-game-${gameId}`;
    const channel = pusher.subscribe(channelName);

    const handle = (data: BaseEvent) => {
      handlerRef.current?.(data);
    };

    GAME_EVENT_TYPES.forEach((eventType) => {
      channel.bind(eventType, handle);
    });

    return () => {
      GAME_EVENT_TYPES.forEach((eventType) => {
        channel.unbind(eventType, handle);
      });
      pusher.unsubscribe(channelName);
    };
  }, [gameId]);
}

