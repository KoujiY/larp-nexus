/**
 * 事件映射器 — Barrel export & Facade
 *
 * 將各 domain 的 sub-factory 組合為原有的 createEventMappers() API，
 * 讓消費者（use-character-websocket-handler.ts）維持原有的匯入路徑。
 */

import type { BaseEvent } from '@/types/event';
import { createItemEventMappers } from './item-events';
import { mapRoleUpdated, mapRoleMessage, mapCharacterAffected } from './role-events';
import { createSkillEventMappers } from './skill-events';
import { createMiscEventMappers } from './misc-events';

export type { Notification, RecentTransferTracker } from './types';

/**
 * 創建事件映射器
 * @param characterId 當前角色 ID
 * @param recentTransferredItemsRef 追蹤最近轉移/偷竊事件的 ref（用於過濾重複通知）
 */
export function createEventMappers(
  characterId: string,
  recentTransferredItemsRef: import('./types').RecentTransferTracker
) {
  const { mapItemTransferred, mapInventoryUpdated } = createItemEventMappers(characterId, recentTransferredItemsRef);
  const { mapSkillContest, mapSkillUsed, mapItemUsed } = createSkillEventMappers(characterId);
  const { mapSecretRevealed, mapTaskRevealed, mapItemShowcased, mapEffectExpired } = createMiscEventMappers(characterId);

  /**
   * 將事件映射為通知
   *
   * 若事件 payload 帶有 _eventId（伺服器端注入的唯一 ID），
   * 則將通知 ID 替換為基於 _eventId 的穩定 ID，確保同一事件
   * 無論透過 WebSocket 或 Pending Events 到達，都產生相同的通知 ID。
   */
  const mapEventToNotifications = (event: BaseEvent) => {
    let notifications: import('./types').Notification[];

    switch (event.type) {
      case 'role.updated':
        notifications = mapRoleUpdated(event);
        break;
      case 'role.inventoryUpdated':
        notifications = mapInventoryUpdated(event);
        break;
      case 'item.transferred':
        notifications = mapItemTransferred(event);
        break;
      case 'role.message':
        notifications = mapRoleMessage(event);
        break;
      case 'skill.contest':
        notifications = mapSkillContest(event);
        break;
      case 'skill.used':
        notifications = mapSkillUsed(event);
        break;
      case 'item.used':
        notifications = mapItemUsed(event);
        break;
      case 'character.affected':
        notifications = mapCharacterAffected(event);
        break;
      case 'secret.revealed':
        notifications = mapSecretRevealed(event);
        break;
      case 'task.revealed':
        notifications = mapTaskRevealed(event);
        break;
      case 'item.showcased':
        notifications = mapItemShowcased(event);
        break;
      case 'effect.expired':
        notifications = mapEffectExpired(event);
        break;
      // 其他技能相關：不顯示通知（需求指定）
      default:
        notifications = [];
    }

    // 若有 _eventId，替換通知 ID 為穩定的 server-generated ID
    const eventId = (event.payload as Record<string, unknown>)?._eventId as string | undefined;
    if (eventId && notifications.length > 0) {
      notifications = notifications.map((n, idx) => ({
        ...n,
        id: notifications.length === 1 ? `eid-${eventId}` : `eid-${eventId}-${idx}`,
      }));
    }

    return notifications;
  };

  return {
    mapRoleUpdated,
    mapInventoryUpdated,
    mapItemTransferred,
    mapSkillContest,
    mapSkillUsed,
    mapItemUsed,
    mapCharacterAffected,
    mapRoleMessage,
    mapSecretRevealed,
    mapTaskRevealed,
    mapItemShowcased,
    mapEffectExpired,
    mapEventToNotifications,
  };
}
