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
import type { BaseEvent, SkillContestEvent, ItemShowcasedEvent } from '@/types/event';
import { createEventMappers } from '@/lib/utils/event-mappers';
import type { Notification } from '@/lib/utils/event-mappers';
import { useContestHandler } from '@/hooks/use-contest-handler';

export interface UseCharacterWebSocketHandlerOptions {
  characterId: string;
  addNotification: (notifications: Notification[]) => void;
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
  const { characterId, addNotification, onContestRequest, onContestResult, onItemShowcased, onClearDialogState } = options;
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

      // 添加通知（所有回饋統一由通知面板呈現）
      if (friendlyList.length > 0) {
        addNotification(friendlyList);
      }

      // 根據事件類型處理不同的邏輯
      switch (event.type) {
        case 'role.updated':
          // 角色更新：僅刷新
          router.refresh();
          break;

        case 'role.inventoryUpdated':
          // 道具更新：刷新數據（通知由 addNotification 處理）
          router.refresh();
          break;

        case 'item.transferred': {
          // 道具轉移：刷新數據（通知由 addNotification 處理）
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

        case 'role.message':
          // 角色訊息：通知由 addNotification 處理
          break;

        case 'skill.contest': {
          // 對抗檢定事件
          const payload = event.payload as SkillContestEvent['payload'];
          handleContestEvent(payload, event.timestamp);
          break;
        }

        case 'character.affected': {
          // Phase 7.6: 跨角色影響事件（通知由 addNotification 處理）
          router.refresh();
          break;
        }

        case 'secret.revealed': {
          // Phase 7.7: 隱藏資訊揭露（通知由 addNotification 處理）
          router.refresh();
          break;
        }

        case 'task.revealed': {
          // Phase 7.7: 隱藏目標揭露（通知由 addNotification 處理）
          router.refresh();
          break;
        }

        case 'item.showcased': {
          // Phase 7.7: 道具展示事件（通知由 addNotification 處理）
          const showcasePayload = event.payload as ItemShowcasedEvent['payload'];
          // 被展示方：觸發回調以開啟唯讀 Dialog
          if (showcasePayload.toCharacterId === characterId) {
            onItemShowcased?.(showcasePayload);
          }
          break;
        }

        case 'item.used': {
          // 道具使用通知 — 僅刷新數據
          router.refresh();
          break;
        }

        case 'effect.expired': {
          // Phase 8: 時效性效果過期 — 僅刷新數據
          router.refresh();
          break;
        }

        case 'game.started': {
          // Phase 10.7: 遊戲開始 — 刷新數據
          router.refresh();
          break;
        }

        case 'game.ended': {
          // Phase 10.7: 遊戲結束 — 刷新數據
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
