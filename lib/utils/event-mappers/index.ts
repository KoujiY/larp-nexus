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
   */
  const mapEventToNotifications = (event: BaseEvent) => {
    switch (event.type) {
      case 'role.updated':
        return mapRoleUpdated(event);
      case 'role.inventoryUpdated':
        return mapInventoryUpdated(event);
      case 'item.transferred':
        return mapItemTransferred(event);
      case 'role.message':
        return mapRoleMessage(event);
      case 'skill.contest':
        return mapSkillContest(event);
      case 'skill.used':
        return mapSkillUsed(event);
      case 'item.used':
        return mapItemUsed(event);
      case 'character.affected':
        return mapCharacterAffected(event);
      case 'secret.revealed':
        return mapSecretRevealed(event);
      case 'task.revealed':
        return mapTaskRevealed(event);
      case 'item.showcased':
        return mapItemShowcased(event);
      case 'effect.expired':
        return mapEffectExpired(event);
      // 其他技能相關：不顯示通知（需求指定）
      default:
        return [];
    }
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
