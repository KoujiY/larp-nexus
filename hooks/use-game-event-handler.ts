/**
 * 遊戲事件處理 Hook
 *
 * 集中處理 character-card-view 中所有 WebSocket 事件訂閱：
 * - 角色頻道事件（透過 useCharacterWebSocketHandler）
 * - 離線補送事件（透過 usePendingEvents）
 * - 遊戲頻道廣播（透過 useGameWebSocket）
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import type { BaseEvent, ItemShowcasedEvent, SkillContestEvent } from '@/types/event';
import type { CharacterData } from '@/types/character';
import type { ContestDialogState } from './use-contest-dialog-state';
import type { DefenderTargetDialogState } from './use-contest-dialog-management';
import type { ShowcasedItemInfo } from '@/components/player/item-showcase-dialog';
import { useCharacterWebSocket, useGameWebSocket } from './use-websocket';
import { useCharacterWebSocketHandler } from './use-character-websocket-handler';
import { usePendingEvents } from './use-pending-events';
import { usePendingEventsRefetch } from './use-pending-events-refetch';
import type { Notification } from '@/lib/utils/event-mappers';

/** useContestDialogManagement 回傳值的操作函數子集（最小化依賴介面） */
type ContestDialogActions = {
  dialogState: ContestDialogState | null;
  setDefenderContest: (contestId: string, event: SkillContestEvent['payload']) => void;
  setDefenderResponseDialog: (contestId: string, sourceType: 'skill' | 'item', sourceId: string) => void;
  setTargetItemSelectionDialog: (contestId: string, sourceType: 'skill' | 'item', sourceId: string, defenderId: string) => void;
  clearDialogState: () => void;
  clearDefenderContest: () => void;
  setDefenderTargetDialog: (state: DefenderTargetDialogState | null) => void;
};

type Params = {
  character: CharacterData;
  addNotification: (notifications: Notification[]) => void;
  contestDialog: ContestDialogActions;
  /** 被展示方收到物品展示事件時的回調 */
  onItemShowcased: (fromName: string, item: ShowcasedItemInfo) => void;
  /** 遊戲結束時的回調（顯示 GameEndedDialog） */
  onGameEnded: () => void;
  /** GM 一鍵清除通知時的回調（清空本地通知面板） */
  onClearNotifications: () => void;
};

/**
 * 處理角色卡的所有 WebSocket 事件（角色事件、離線補送、遊戲廣播）。
 */
export function useGameEventHandler({
  character,
  addNotification,
  contestDialog,
  onItemShowcased,
  onGameEnded,
  onClearNotifications,
}: Params) {
  const router = useRouter();

  const {
    dialogState,
    setDefenderContest,
    setDefenderResponseDialog,
    setTargetItemSelectionDialog,
    clearDialogState,
    clearDefenderContest,
    setDefenderTargetDialog,
  } = contestDialog;

  const { handleWebSocketEvent } = useCharacterWebSocketHandler({
    characterId: character.id,
    addNotification,
    onClearDialogState: clearDialogState,
    onContestAborted: () => {
      clearDefenderContest();
      clearDialogState();
      notify.warning('對方已中斷對抗檢定');
      // Feature 3: 中斷後刷新，讓攻擊方發起時已扣除的成本（MP/物品）即時反映
      router.refresh();
    },
    onContestRequest: async (payload) => {
      const sourceId = payload.itemId || payload.skillId || '';
      const { generateContestId } = await import('@/lib/contest/contest-id');
      const contestId = payload.contestId || generateContestId(payload.attackerId, sourceId);
      setDefenderContest(contestId, payload);
      const sourceType = payload.sourceType || (payload.itemId ? 'item' : 'skill');
      setDefenderResponseDialog(contestId, sourceType, sourceId);
    },
    onItemShowcased: (payload: ItemShowcasedEvent['payload']) => {
      onItemShowcased(payload.fromCharacterName, payload.item);
    },
    onContestResult: (payload) => {
      const characterIdStr = String(character.id);

      // 防守方：處理對抗結果
      if (String(payload.defenderId) === characterIdStr) {
        if (payload.result === 'defender_wins' && payload.needsTargetItemSelection) {
          const sourceId = payload.itemId || payload.skillId || '';
          const sourceType = payload.sourceType || (payload.itemId ? 'item' : 'skill');
          if (sourceId && payload.attackerId && payload.contestId) {
            clearDefenderContest();
            clearDialogState();
            setDefenderTargetDialog({
              open: true,
              contestId: payload.contestId,
              attackerId: String(payload.attackerId),
              sourceType,
              sourceId,
            });
            return;
          }
        }
        clearDefenderContest();
        clearDialogState();
      }

      // 攻擊方：關閉等待 dialog（除非需要選擇目標物品）
      if (String(payload.attackerId) === characterIdStr) {
        const sourceId = payload.itemId || payload.skillId || '';
        if (payload.needsTargetItemSelection && sourceId && payload.defenderId) {
          const sourceType = payload.sourceType || (payload.itemId ? 'item' : 'skill');
          setTargetItemSelectionDialog(payload.contestId || '', sourceType, sourceId, String(payload.defenderId));
        } else {
          if (dialogState?.type === 'attacker_waiting' && dialogState.sourceId === sourceId) {
            clearDialogState();
          }
        }
      }
    },
  });

  useCharacterWebSocket(character.id, handleWebSocketEvent);

  /** 離線事件的統一處理器 */
  const handlePendingEvent = useCallback((event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      // 離線廣播：加入通知面板
      const { title, message } = event.payload as { title?: string; message?: string };
      addNotification([{
        id: `evt-${event.timestamp}`,
        title: title || '系統廣播',
        message: message || '收到廣播',
        type: event.type,
      }]);
    } else {
      handleWebSocketEvent(event);
    }
  }, [handleWebSocketEvent, addNotification]);

  usePendingEvents({
    pendingEvents: character.pendingEvents,
    handleWebSocketEvent: handlePendingEvent,
    delayBetweenEvents: 500,
  });

  // bfcache 還原 / 分頁切回前景時重抓補送：SSR 的 fetchPendingEvents 為
  // 破壞性讀取且不在歷史導航時重跑，靠此 hook 補回離開期間累積的事件
  usePendingEventsRefetch({
    characterId: character.id,
    gameId: character.gameId,
    deliver: handlePendingEvent,
    delayBetweenEvents: 500,
  });

  useGameWebSocket(character.gameId, (event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      const { title, message } = event.payload as { title?: string; message?: string };
      addNotification([{
        id: `evt-${event.timestamp}`,
        title: title || '系統廣播',
        message: message || '收到廣播',
        type: event.type,
      }]);
    } else if (event.type === 'game.started') {
      // 遊戲開始時靜默刷新（更新 isGameActive 和 baselineData）
      router.refresh();
    } else if (event.type === 'notifications.cleared') {
      // GM 一鍵清除：清空本地通知面板（純前端，不影響任何 DB 資料）
      onClearNotifications();
    } else if (event.type === 'game.reset' || event.type === 'game.ended') {
      addNotification([{
        id: `evt-${event.timestamp}`,
        title: event.type === 'game.ended' ? '遊戲結束' : '遊戲重置',
        message: event.type === 'game.ended' ? '感謝您的參與！' : '請刷新以取得最新狀態',
        type: event.type,
      }]);
      if (event.type === 'game.ended') {
        onGameEnded();
      } else {
        router.refresh();
      }
    }
  });
}
