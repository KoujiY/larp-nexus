/**
 * 角色 WebSocket 事件處理 Hook
 * 從 character-card-view.tsx 提取
 * 
 * 職責：
 * - 處理角色專屬頻道的 WebSocket 事件
 * - 整合通知系統和事件映射
 * - 處理對抗檢定事件（委託給 use-contest-handler）
 * - 處理其他事件（role.updated, inventoryUpdated, etc.）
 */

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { BaseEvent, SkillContestEvent, CharacterAffectedEvent, ItemShowcasedEvent } from '@/types/event';
import { createEventMappers } from '@/lib/utils/event-mappers';
import type { Notification } from '@/lib/utils/event-mappers';
import { useContestHandler } from '@/hooks/use-contest-handler';

export interface UseCharacterWebSocketHandlerOptions {
  characterId: string;
  addNotification: (notifications: Notification[]) => void;
  onTabChange?: (tab: string) => void;
  onContestRequest?: (event: SkillContestEvent['payload']) => void;
  onContestResult?: (event: SkillContestEvent['payload']) => void;
  /** Phase 7.7: 被展示方收到道具展示事件時的回調（用於開啟唯讀 Dialog） */
  onItemShowcased?: (payload: ItemShowcasedEvent['payload']) => void;
}

export interface UseCharacterWebSocketHandlerReturn {
  handleWebSocketEvent: (event: BaseEvent) => void;
}

/**
 * 角色 WebSocket 事件處理 Hook
 */
export function useCharacterWebSocketHandler(
  options: UseCharacterWebSocketHandlerOptions
): UseCharacterWebSocketHandlerReturn {
  const { characterId, addNotification, onTabChange, onContestRequest, onContestResult, onItemShowcased } = options;
  const router = useRouter();

  // 追蹤最近的轉移/偷竊事件，用於過濾 inventoryUpdated 通知
  // key: itemId, value: { timestamp, transferType, fromCharacterId, toCharacterId }
  const recentTransferredItemsRef = useRef<
    Map<string, { timestamp: number; transferType: string; fromCharacterId?: string; toCharacterId?: string }>
  >(new Map());

  // 對抗檢定處理器
  const { handleContestEvent } = useContestHandler({
    characterId,
    onTabChange,
    onDefenderContestRequest: onContestRequest,
    onDefenderContestResult: (payload) => {
      // 防守方收到結果事件時刷新頁面
      router.refresh();
      onContestResult?.(payload);
    },
    onAttackerContestResult: (payload) => {
      // 攻擊方收到結果事件時刷新頁面
      router.refresh();
      onContestResult?.(payload);
    },
  });

  /**
   * 處理 WebSocket 事件
   */
  const handleWebSocketEvent = useCallback(
    (event: BaseEvent) => {
      // 創建事件映射器（在事件處理器內部創建，避免在 render 期間訪問 ref）
      const eventMappers = createEventMappers(characterId, {
        current: recentTransferredItemsRef.current,
      });

      // 將事件映射為通知
      const friendlyList = eventMappers.mapEventToNotifications(event);

      // 添加通知
      if (friendlyList.length > 0) {
        addNotification(friendlyList);
      }

      // 根據事件類型處理不同的邏輯
      switch (event.type) {
        case 'role.updated':
          // 角色更新：僅刷新，不顯示 toast
          router.refresh();
          break;

        case 'role.inventoryUpdated':
          // 道具更新：顯示通知與 toast
          if (friendlyList.length > 0) {
            toast.info(friendlyList[friendlyList.length - 1].message);
          }
          router.refresh();
          break;

        case 'item.transferred':
          // 道具轉移：顯示通知與 toast（優先顯示轉移訊息，而不是 inventoryUpdated）
          if (friendlyList.length > 0) {
            toast.success(friendlyList[friendlyList.length - 1].message);
          }
          router.refresh();
          break;

        case 'role.message': {
          const { title, message } = event.payload as { title?: string; message?: string };
          toast.info(title || '訊息', { description: message });
          break;
        }

        case 'skill.contest': {
          // 對抗檢定事件
          const payload = event.payload as SkillContestEvent['payload'];
          handleContestEvent(payload, event.timestamp);
          break;
        }

        case 'character.affected': {
          // Phase 7.6: 跨角色影響事件，根據隱匿標籤決定是否顯示攻擊方姓名
          const payload = event.payload as CharacterAffectedEvent['payload'];
          const stats = payload.changes?.stats;
          if (stats && stats.length > 0) {
            // Phase 7.6: 根據隱匿標籤決定是否顯示攻擊方姓名
            const hasStealthTag = payload.sourceHasStealthTag || false;
            const sourceName = payload.sourceCharacterName || '';
            const attackerPrefix = !hasStealthTag && sourceName ? `${sourceName} 對你使用了` : '你受到了';
            
            const statMessages = stats
              .map((s) => {
                const name = s.name || '數值';
                const deltaVal = s.deltaValue;
                const deltaMax = s.deltaMax;
                const newMax = s.newMax;

                // 如果同時有 deltaValue 和 deltaMax，且兩者都不為 0，合併成一個訊息（表示同步調整）
                if (deltaVal !== undefined && deltaVal !== 0 && deltaMax !== undefined && deltaMax !== 0) {
                  const maxText = newMax !== undefined ? `（上限：${newMax}）` : '';
                  return `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}，目前值同步調整${maxText}`;
                }

                // 只有 deltaValue 或只有 deltaMax，分別處理
                if (deltaVal !== undefined && deltaVal !== 0) {
                  return `${name} ${deltaVal > 0 ? '+' : ''}${deltaVal}`;
                }

                if (deltaMax !== undefined && deltaMax !== 0) {
                  const maxText = newMax !== undefined ? `（上限：${newMax}）` : '';
                  return `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}${maxText}`;
                }

                return null;
              })
              .filter(Boolean);

            if (statMessages.length > 0) {
              // Phase 7.6: 根據隱匿標籤決定 toast 訊息內容
              toast.info(hasStealthTag ? '你受到了影響' : `${sourceName} 對你使用了技能或道具`, {
                description: `${attackerPrefix}，效果：${statMessages.join('、')}`,
              });
            }
          }
          router.refresh();
          break;
        }

        case 'secret.revealed': {
          // Phase 7.7: 隱藏資訊揭露通知
          if (friendlyList.length > 0) {
            toast.info(friendlyList[friendlyList.length - 1].message);
          }
          router.refresh();
          break;
        }

        case 'task.revealed': {
          // Phase 7.7: 隱藏目標揭露通知
          if (friendlyList.length > 0) {
            toast.info(friendlyList[friendlyList.length - 1].message);
          }
          router.refresh();
          break;
        }

        case 'item.showcased': {
          // Phase 7.7: 道具展示事件
          const showcasePayload = event.payload as ItemShowcasedEvent['payload'];
          if (friendlyList.length > 0) {
            toast.info(friendlyList[friendlyList.length - 1].message);
          }
          // 被展示方：觸發回調以開啟唯讀 Dialog
          if (showcasePayload.toCharacterId === characterId) {
            onItemShowcased?.(showcasePayload);
          }
          break;
        }

        default:
          // 其他事件僅記錄於 console，避免干擾玩家
          console.debug('[ws][character]', event);
      }
    },
    [characterId, router, addNotification, handleContestEvent, onItemShowcased]
  );

  return {
    handleWebSocketEvent,
  };
}

