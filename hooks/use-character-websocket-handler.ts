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
  /** Phase 10: 清除 Dialog 狀態的回調（確保對抗結算後 dialogState 不殘留） */
  onClearDialogState?: () => void;
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
  const { characterId, addNotification, onTabChange, onContestRequest, onContestResult, onItemShowcased, onClearDialogState } = options;
  const router = useRouter();

  // 追蹤最近的轉移/偷竊事件，用於過濾 inventoryUpdated 通知
  // key: itemId, value: { timestamp, transferType, fromCharacterId, toCharacterId }
  const recentTransferredItemsRef = useRef<
    Map<string, { timestamp: number; transferType: string; fromCharacterId?: string; toCharacterId?: string }>
  >(new Map());

  // Phase 11: 通用事件去重 — 追蹤已處理的 _eventId，防止 WebSocket 和 Pending Events 雙重處理
  // 所有帶 _eventId 的事件（包括 contest 和非 contest）都會經過此 Set 去重
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // Phase 10: 追蹤已處理的對抗檢定事件（向後相容：處理沒有 _eventId 的舊事件）
  // key: `${contestId}::${subType}::${角色身份}` (e.g., "abc::result::attacker")
  const processedContestEventsRef = useRef<Set<string>>(new Set());

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
    // Phase 10: 對抗結算後清除 dialogState，避免重新開啟技能/道具時殘留等待狀態
    onClearDialogState,
  });

  /**
   * 處理 WebSocket 事件
   */
  const handleWebSocketEvent = useCallback(
    (event: BaseEvent) => {
      // Phase 11: 通用 _eventId 去重 — 防止同一事件透過 WebSocket 和 Pending Events 雙重處理
      // _eventId 由伺服器端 emit 函數注入 payload，WebSocket 和 Pending Event 共用同一個 ID
      const eventId = (event.payload as Record<string, unknown>)?._eventId as string | undefined;
      if (eventId) {
        if (processedEventIdsRef.current.has(eventId)) {
          return; // 已處理過，跳過整個事件（包括通知和 handler）
        }
        processedEventIdsRef.current.add(eventId);

        // 自動清理：30 秒後移除 key，防止 Set 無限增長
        // 30 秒足夠覆蓋 WebSocket → router.refresh() → pending event 的完整週期
        setTimeout(() => {
          processedEventIdsRef.current.delete(eventId);
        }, 30_000);
      }

      // Phase 10: 對抗檢定事件去重（向後相容：處理沒有 _eventId 的舊事件）
      // 攔截所有 skill.contest subType（request / result / effect）
      if (!eventId && event.type === 'skill.contest') {
        const payload = event.payload as SkillContestEvent['payload'];
        if (payload.subType === 'request' || payload.subType === 'result' || payload.subType === 'effect') {
          const role = payload.attackerId === characterId ? 'attacker' : 'defender';
          const dedupKey = `${payload.contestId}::${payload.subType}::${role}`;

          if (processedContestEventsRef.current.has(dedupKey)) {
            return;
          }
          processedContestEventsRef.current.add(dedupKey);

          setTimeout(() => {
            processedContestEventsRef.current.delete(dedupKey);
          }, 60_000);
        }
      }

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

        case 'item.transferred': {
          // 道具轉移：顯示通知與 toast（優先顯示轉移訊息，而不是 inventoryUpdated）
          if (friendlyList.length > 0) {
            toast.success(friendlyList[friendlyList.length - 1].message);
          }
          // H-4: 負責清理 recentTransferredItemsRef 的過期記錄（映射器只負責寫入）
          const transferPayload = event.payload as { itemId?: string };
          if (transferPayload.itemId) {
            const itemId = transferPayload.itemId;
            setTimeout(() => {
              recentTransferredItemsRef.current.delete(itemId);
            }, 2000);
          }
          router.refresh();
          break;
        }

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

        case 'item.used': {
          // 道具使用通知 — 通知由 mapItemUsed 處理，此處僅刷新數據
          router.refresh();
          break;
        }

        case 'effect.expired': {
          // Phase 8: 時效性效果過期 — 僅刷新數據，通知由通知面板顯示
          router.refresh();
          break;
        }

        case 'game.started': {
          // Phase 10.7: 遊戲開始通知
          toast.info('遊戲已開始，正在重新載入...');
          router.refresh();
          break;
        }

        case 'game.ended': {
          // Phase 10.7: 遊戲結束通知
          toast.info('遊戲已結束');
          router.refresh();
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

