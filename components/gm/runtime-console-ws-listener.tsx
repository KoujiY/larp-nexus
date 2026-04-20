'use client';

import { useEffect, useRef } from 'react';
import { getPusherClient } from '@/lib/websocket/pusher-client';
import { buildEquipmentBoostDeltas } from '@/lib/item/apply-equipment-boosts';
import type { Stat, StatBoost, Item } from '@/types/character';
import type {
  BaseEvent,
  RoleUpdatedEvent,
  CharacterAffectedEvent,
  EffectExpiredEvent,
  EquipmentToggledEvent,
} from '@/types/event';

/** Stat 變動的統一回呼格式 */
export type StatUpdateCallback = (characterId: string, stats: Stat[]) => void;
/** Item 變動的統一回呼格式 */
export type ItemsUpdateCallback = (characterId: string, items: Item[]) => void;

interface RuntimeConsoleWsListenerProps {
  /** 所有角色的 Baseline ID（用於訂閱頻道） */
  characterIds: string[];
  /** 當前各角色的 stats 快照（用於增量更新的基準） */
  currentStatsMap: Map<string, Stat[]>;
  /** 當前各角色的 items 快照（用於裝備切換的增量更新） */
  currentItemsMap: Map<string, Item[]>;
  /** stat 變動時的回呼 */
  onStatUpdate: StatUpdateCallback;
  /** items 變動時的回呼 */
  onItemsUpdate: ItemsUpdateCallback;
  /** 當有新事件需要刷新歷史紀錄時的回呼 */
  onLogRefresh?: () => void;
}

const STAT_EVENTS = [
  'role.updated', 'character.affected', 'effect.expired', 'equipment.toggled',
  'skill.used', 'item.used',
] as const;

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
  currentItemsMap,
  onStatUpdate,
  onItemsUpdate,
  onLogRefresh,
}: RuntimeConsoleWsListenerProps) {
  // 透過 ref 存取最新的 map 和 callback，避免放入 useEffect 依賴
  const statsMapRef = useRef(currentStatsMap);
  const itemsMapRef = useRef(currentItemsMap);
  const callbackRef = useRef(onStatUpdate);
  const itemsCallbackRef = useRef(onItemsUpdate);
  const logRefreshRef = useRef(onLogRefresh);

  useEffect(() => {
    statsMapRef.current = currentStatsMap;
  }, [currentStatsMap]);

  useEffect(() => {
    itemsMapRef.current = currentItemsMap;
  }, [currentItemsMap]);

  useEffect(() => {
    callbackRef.current = onStatUpdate;
  }, [onStatUpdate]);

  useEffect(() => {
    itemsCallbackRef.current = onItemsUpdate;
  }, [onItemsUpdate]);

  useEffect(() => {
    logRefreshRef.current = onLogRefresh;
  }, [onLogRefresh]);

  useEffect(() => {
    if (characterIds.length === 0) return;

    const handleEvent = (characterId: string) => (event: BaseEvent) => {
      const cb = callbackRef.current;

      switch (event.type) {
        case 'role.updated': {
          const payload = (event as RoleUpdatedEvent).payload;
          const rawStats = payload.updates.stats;
          // 數值卡片：僅在帶有 stats 資料時更新
          if (Array.isArray(rawStats) && rawStats.length > 0 && 'name' in rawStats[0]) {
            cb(characterId, rawStats as unknown as Stat[]);
          }
          // 歷史訊息：所有事件都刷新
          logRefreshRef.current?.();
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
          logRefreshRef.current?.();
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
          logRefreshRef.current?.();
          break;
        }

        case 'skill.used':
        case 'item.used': {
          // 技能/道具使用：僅刷新歷史紀錄（stats 更新由伴隨的 role.updated 事件處理）
          logRefreshRef.current?.();
          break;
        }

        case 'equipment.toggled': {
          const eqPayload = (event as EquipmentToggledEvent).payload;
          const existingItems = itemsMapRef.current.get(characterId) ?? [];
          const updatedItems = existingItems.map((item) =>
            item.id === eqPayload.itemId
              ? { ...item, equipped: eqPayload.equipped }
              : item,
          );
          itemsCallbackRef.current(characterId, updatedItems);

          // 同步 stats：依 statBoosts 與新的 equipped 旗標計算 delta，
          // 直接更新本地 statsOverride。不依賴平行的 role.updated 事件抵達順序，
          // 自洽（self-sufficient）地反映 v2 materialize 後的 base stats。
          const existingStats = statsMapRef.current.get(characterId) ?? [];
          if (existingStats.length > 0 && eqPayload.statBoosts && eqPayload.statBoosts.length > 0) {
            const deltas = buildEquipmentBoostDeltas(
              existingStats,
              eqPayload.statBoosts as StatBoost[],
              eqPayload.equipped ? 'apply' : 'revert',
            );
            if (deltas.length > 0) {
              const deltaById = new Map(deltas.map((d) => [d.statId, d]));
              const updatedStats = existingStats.map((s) => {
                const d = deltaById.get(s.id);
                if (!d) return s;
                return { ...s, value: d.expectedValue, maxValue: d.expectedMaxValue };
              });
              callbackRef.current(characterId, updatedStats);
            }
          }

          logRefreshRef.current?.();
          break;
        }
      }
    };

    let cancelled = false;
    let unbind: (() => void) | undefined;

    void getPusherClient().then((pusher) => {
      if (cancelled || !pusher) return;

      // 訂閱所有角色頻道，只聽 stat 相關事件
      const subscriptions = characterIds.map((id) => {
        const channel = pusher.subscribe(`private-character-${id}`);
        const handler = handleEvent(id);

        for (const eventType of STAT_EVENTS) {
          channel.bind(eventType, handler);
        }

        return { channel, handler };
      });

      unbind = () => {
        for (const { channel, handler } of subscriptions) {
          for (const eventType of STAT_EVENTS) {
            channel.unbind(eventType, handler);
          }
        }
      };
    });

    return () => {
      cancelled = true;
      unbind?.();
    };
  }, [characterIds]); // 只在角色 ID 變化時重新訂閱

  return null;
}
