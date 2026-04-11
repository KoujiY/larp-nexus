/**
 * 物品相關事件映射器
 * mapItemTransferred, mapInventoryUpdated
 */

import type { BaseEvent } from '@/types/event';
import type { Notification, RecentTransferTracker } from './types';

export function createItemEventMappers(
  characterId: string,
  recentTransferredItemsRef: RecentTransferTracker
) {
  /**
   * 映射物品轉移事件
   */
  const mapItemTransferred = (event: BaseEvent): Notification[] => {
    const payload = event.payload as {
      toCharacterId?: string;
      fromCharacterId?: string;
      fromCharacterName?: string;
      toCharacterName?: string;
      itemId?: string;
      itemName?: string;
      quantity?: number;
      transferType?: 'give' | 'take' | 'steal';
    };
    const qty = payload.quantity ?? 1;
    const name = payload.itemName ?? '物品';
    const transferType = payload.transferType || 'give';

    // 記錄轉移事件，用於過濾 inventoryUpdated 通知
    // 清理職責由呼叫方（use-character-websocket-handler.ts）負責
    if (payload.itemId) {
      recentTransferredItemsRef.current.set(payload.itemId, {
        timestamp: event.timestamp,
        transferType,
        fromCharacterId: payload.fromCharacterId,
        toCharacterId: payload.toCharacterId,
      });
    }

    // 偷竊時：雙方都不顯示 item.transferred 通知
    if (transferType === 'steal') {
      return [];
    }

    // 轉移時：轉入方顯示獲得通知
    if (payload.toCharacterId === characterId && transferType === 'give') {
      const fromName = payload.fromCharacterName || '其他角色';
      return [{
        id: `evt-${event.timestamp}`,
        title: '物品獲得',
        message: `從 ${fromName} 收到 ${name} x${qty}`,
        type: event.type,
      }];
    }

    // 轉移時：轉出方顯示轉移通知
    if (payload.fromCharacterId === characterId && transferType === 'give') {
      const toName = payload.toCharacterName || '其他角色';
      return [{
        id: `evt-${event.timestamp}`,
        title: '物品轉移',
        message: `已將 ${name} x${qty} 轉移給 ${toName}`,
        type: event.type,
      }];
    }

    return [];
  };

  /**
   * 映射物品更新事件
   */
  const mapInventoryUpdated = (event: BaseEvent): Notification[] => {
    const payload = event.payload as {
      item?: { name?: string; id?: string };
      action?: 'added' | 'updated' | 'deleted';
      characterId?: string;
    };

    // 檢查這個物品是否在最近的轉移/偷竊事件中（2秒內）
    const itemId = payload.item?.id;
    const eventCharacterId = payload.characterId || characterId;

    if (itemId) {
      const recentTransfer = recentTransferredItemsRef.current.get(itemId);
      if (recentTransfer) {
        // 檢查時間差（允許更大的時間窗口，因為事件可能不同步到達）
        const timeDiff = Math.abs(event.timestamp - recentTransfer.timestamp);
        if (timeDiff < 3000) { // 擴展到 3 秒，確保能捕獲到
          // 轉移時（give）：雙方都不顯示 inventoryUpdated 通知
          if (recentTransfer.transferType === 'give') {
            return [];
          }

          // 偷竊時：
          // - 偷竊者（eventCharacterId === toCharacterId）：不顯示 inventoryUpdated 通知
          // - 被偷竊方（eventCharacterId === fromCharacterId）：顯示 inventoryUpdated 通知
          if (recentTransfer.transferType === 'steal') {
            // 檢查是否是偷竊者（收到物品的角色）
            const isThief = recentTransfer.toCharacterId &&
              (String(eventCharacterId) === String(recentTransfer.toCharacterId) ||
               eventCharacterId === recentTransfer.toCharacterId);

            if (isThief) {
              // 偷竊者：不顯示 inventoryUpdated 通知
              return [];
            }
            // 被偷竊方：顯示 inventoryUpdated 通知（繼續執行下面的邏輯）
          }
        }
      }
    }

    const name = payload.item?.name || '物品';
    const actionText =
      payload.action === 'added' ? '新增'
      : payload.action === 'deleted' ? '移除'
      : '更新';
    return [{
      id: `evt-${event.timestamp}`,
      title: '物品更新',
      message: `${name} 已${actionText}`,
      type: event.type,
    }];
  };

  return { mapItemTransferred, mapInventoryUpdated };
}
