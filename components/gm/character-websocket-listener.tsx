'use client';

import { useRouter } from 'next/navigation';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { RoleUpdatedEvent, ItemTransferredEvent } from '@/types/event';
import { toast } from 'sonner';

interface CharacterWebSocketListenerProps {
  characterId: string;
}

/**
 * 角色 WebSocket 事件監聽器
 * 在角色編輯頁面層級統一處理 WebSocket 事件，確保無論在哪個分頁都能收到更新
 * 
 * 這個組件解決了以下問題：
 * - GM 端在非道具管理分頁時，道具轉移事件無法觸發頁面刷新
 * - 統一處理角色更新事件，避免重複監聽
 */
export function CharacterWebSocketListener({ characterId }: CharacterWebSocketListenerProps) {
  const router = useRouter();

  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    console.log('[CharacterWebSocketListener] 收到 WebSocket 事件', {
      type: event.type,
      characterId,
      timestamp: event.timestamp,
    });

    switch (event.type) {
      case 'role.updated': {
        const payload = (event as RoleUpdatedEvent).payload;
        // 如果更新包含道具列表，刷新頁面
        if (payload.updates.items) {
          console.log('[CharacterWebSocketListener] 道具列表已更新，刷新頁面');
          router.refresh();
          toast.info('角色資料已更新', { description: '道具列表已同步' });
        }
        break;
      }

      case 'item.transferred': {
        const payload = (event as ItemTransferredEvent).payload;
        // 如果這個角色參與了道具轉移，刷新頁面
        if (payload.fromCharacterId === characterId || payload.toCharacterId === characterId) {
          console.log('[CharacterWebSocketListener] 角色參與了道具轉移，刷新頁面');
          router.refresh();
          toast.info('道具已轉移', {
            description:
              payload.fromCharacterId === characterId
                ? `已將 ${payload.quantity} 個「${payload.itemName}」轉移給 ${payload.toCharacterName}`
                : `從 ${payload.fromCharacterName} 收到 ${payload.quantity} 個「${payload.itemName}」`,
          });
        }
        break;
      }

      case 'role.inventoryUpdated': {
        // 道具更新事件，刷新頁面
        console.log('[CharacterWebSocketListener] 道具已更新，刷新頁面');
        router.refresh();
        break;
      }

      case 'effect.expired': {
        // Phase 8: 時效性效果過期，刷新頁面以顯示恢復後的數值
        console.log('[CharacterWebSocketListener] 時效性效果已過期，刷新頁面');
        router.refresh();
        break;
      }

      case 'character.affected':
      case 'skill.used': {
        // Phase 8: 角色受到技能/道具影響或技能被使用（含時效性效果），刷新頁面以顯示最新數值
        console.log('[CharacterWebSocketListener] 角色數值已變更，刷新頁面', { eventType: event.type });
        router.refresh();
        break;
      }

      default:
        // 其他事件不處理，由具體的編輯表單組件處理
        break;
    }
  });

  // 這個組件不渲染任何內容
  return null;
}

