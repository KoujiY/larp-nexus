'use client';

import { useEffect, useRef } from 'react';
import { getPusherClient } from '@/lib/websocket/pusher-client';
import type { Stat } from '@/types/character';
import type {
  BaseEvent,
  RoleUpdatedEvent,
  CharacterAffectedEvent,
  EffectExpiredEvent,
} from '@/types/event';

/** Stat 變動的統一回呼格式 */
export type StatUpdateCallback = (characterId: string, stats: Stat[]) => void;

interface RuntimeConsoleWsListenerProps {
  /** 所有角色的 Baseline ID（用於訂閱頻道） */
  characterIds: string[];
  /** 當前各角色的 stats 快照（用於增量更新的基準） */
  currentStatsMap: Map<string, Stat[]>;
  /** stat 變動時的回呼 */
  onStatUpdate: StatUpdateCallback;
}

const STAT_EVENTS = ['role.updated', 'character.affected', 'effect.expired'] as const;

/**
 * Runtime 控制台 WebSocket 監聯器（輕量版）
 *
 * 只監聽影響 stats 的三種事件：
 * - role.updated（GM 從編輯頁儲存 stats）
 * - character.affected（技能/道具效果改變 stats）
 * - effect.expired（時效性效果過期，stats 恢復）
 *
 * 直接從 event payload 解析 stats 變動，透過 callback 更新 client state。
 * 不呼叫 router.refresh()，不觸發 DB 查詢。
 *
 * 頻道訂閱只依賴 characterIds，currentStatsMap 和 onStatUpdate 透過 ref 存取，
 * 避免 stat 更新時觸發頻道重新訂閱。
 */
export function RuntimeConsoleWsListener({
  characterIds,
  currentStatsMap,
  onStatUpdate,
}: RuntimeConsoleWsListenerProps) {
  // 透過 ref 存取最新的 statsMap 和 callback，避免放入 useEffect 依賴
  const statsMapRef = useRef(currentStatsMap);
  const callbackRef = useRef(onStatUpdate);

  useEffect(() => {
    statsMapRef.current = currentStatsMap;
  }, [currentStatsMap]);

  useEffect(() => {
    callbackRef.current = onStatUpdate;
  }, [onStatUpdate]);

  useEffect(() => {
    if (characterIds.length === 0) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const handleEvent = (characterId: string) => (event: BaseEvent) => {
      const cb = callbackRef.current;

      switch (event.type) {
        case 'role.updated': {
          const payload = (event as RoleUpdatedEvent).payload;
          if (payload.updates.stats) {
            cb(characterId, payload.updates.stats as unknown as Stat[]);
          }
          break;
        }

        case 'character.affected': {
          const payload = (event as CharacterAffectedEvent).payload;
          if (!payload.changes.stats?.length) break;

          const existing = statsMapRef.current.get(characterId) ?? [];
          const updated = existing.map((stat) => {
            const change = payload.changes.stats?.find((c) => c.name === stat.name);
            if (!change) return stat;
            return {
              ...stat,
              value: change.newValue,
              maxValue: change.newMax ?? stat.maxValue,
            };
          });
          cb(characterId, updated);
          break;
        }

        case 'effect.expired': {
          const payload = (event as EffectExpiredEvent).payload;
          const existing = statsMapRef.current.get(characterId) ?? [];
          const updated = existing.map((stat) => {
            if (stat.name !== payload.targetStat) return stat;
            return {
              ...stat,
              value: payload.restoredValue,
              maxValue: payload.restoredMax ?? stat.maxValue,
            };
          });
          cb(characterId, updated);
          break;
        }
      }
    };

    // 訂閱所有角色頻道，只聽 stat 相關事件
    const subscriptions = characterIds.map((id) => {
      const channel = pusher.subscribe(`private-character-${id}`);
      const handler = handleEvent(id);

      for (const eventType of STAT_EVENTS) {
        channel.bind(eventType, handler);
      }

      return { channel, handler };
    });

    return () => {
      for (const { channel, handler } of subscriptions) {
        for (const eventType of STAT_EVENTS) {
          channel.unbind(eventType, handler);
        }
      }
    };
  }, [characterIds]); // 只在角色 ID 變化時重新訂閱

  return null;
}
