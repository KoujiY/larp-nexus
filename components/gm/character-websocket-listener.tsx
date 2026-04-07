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
    switch (event.type) {
      case 'role.updated': {
        const payload = (event as RoleUpdatedEvent).payload;
        // _statsSync：純同步事件（裝備切換、技能/道具效果套用等），由 character-edit-tabs
        // 內的 STAT_REFRESH_EVENTS 路徑統一處理 router.refresh，這裡不要再重複 refresh，
        // 也不要跳「外部變更」toast — 否則 GM 會誤以為是別人改的或觸發了背景儲存。
        if (payload._statsSync) break;
        if (payload.updates.items) {
          router.refresh();
          toast.info('角色資料已更新', { description: '物品列表已同步' });
        }
        break;
      }

      case 'item.transferred': {
        const payload = (event as ItemTransferredEvent).payload;
        if (payload.fromCharacterId === characterId || payload.toCharacterId === characterId) {
          router.refresh();
          toast.info('物品已轉移', {
            description:
              payload.fromCharacterId === characterId
                ? `已將 ${payload.quantity} 個「${payload.itemName}」轉移給 ${payload.toCharacterName}`
                : `從 ${payload.fromCharacterName} 收到 ${payload.quantity} 個「${payload.itemName}」`,
          });
        }
        break;
      }

      case 'role.inventoryUpdated':
        router.refresh();
        break;

      case 'effect.expired':
        router.refresh();
        break;

      case 'character.affected':
      case 'skill.used':
        router.refresh();
        break;

      default:
        break;
    }
  });

  // 這個組件不渲染任何內容
  return null;
}

