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
import { toast } from 'sonner';
import type { BaseEvent, ItemShowcasedEvent, SkillContestEvent } from '@/types/event';
import type { CharacterData } from '@/types/character';
import type { ContestDialogState } from './use-contest-dialog-state';
import type { DefenderTargetDialogState } from './use-contest-dialog-management';
import type { ShowcasedItemInfo } from '@/components/player/item-showcase-dialog';
import { useCharacterWebSocket, useGameWebSocket } from './use-websocket';
import { useCharacterWebSocketHandler } from './use-character-websocket-handler';
import { usePendingEvents } from './use-pending-events';
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
  onTabChange: (tab: string) => void;
  contestDialog: ContestDialogActions;
  /** 被展示方收到道具展示事件時的回調 */
  onItemShowcased: (fromName: string, item: ShowcasedItemInfo) => void;
  /** 遊戲結束時的回調（顯示 GameEndedDialog） */
  onGameEnded: () => void;
};

/**
 * 處理角色卡的所有 WebSocket 事件（角色事件、離線補送、遊戲廣播）。
 */
export function useGameEventHandler({
  character,
  addNotification,
  onTabChange,
  contestDialog,
  onItemShowcased,
  onGameEnded,
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
    onTabChange,
    onClearDialogState: clearDialogState,
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

      // 攻擊方：關閉等待 dialog（除非需要選擇目標道具）
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

  /** 離線事件的統一處理器（補充 toast 顯示） */
  const handlePendingEvent = useCallback((event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      const { title, message } = event.payload as { title?: string; message?: string };
      toast.info(title || '系統廣播', { description: message });
      addNotification([{
        id: `evt-${event.timestamp}`,
        title: title || '系統廣播',
        message: message || '收到廣播',
        type: event.type,
      }]);
    } else if (event.type === 'role.updated') {
      // 離線補送時額外顯示數值變更 toast
      handleWebSocketEvent(event);
      const payload = event.payload as {
        updates?: { stats?: Array<{ name?: string; deltaValue?: number; deltaMax?: number }> };
      };
      const stats = payload?.updates?.stats;
      if (stats && stats.length > 0) {
        const changes = stats
          .map((s) => {
            const name = s.name ?? '數值';
            if (s.deltaValue && s.deltaValue !== 0) return `${name} ${s.deltaValue > 0 ? '+' : ''}${s.deltaValue}`;
            if (s.deltaMax && s.deltaMax !== 0) return `${name} 最大值 ${s.deltaMax > 0 ? '+' : ''}${s.deltaMax}`;
            return null;
          })
          .filter(Boolean);
        if (changes.length > 0) toast.info('離線期間數值變更', { description: changes.join('、') });
      }
    } else {
      handleWebSocketEvent(event);
    }
  }, [handleWebSocketEvent, addNotification]);

  usePendingEvents({
    pendingEvents: character.pendingEvents,
    handleWebSocketEvent: handlePendingEvent,
    delayBetweenEvents: 500,
  });

  useGameWebSocket(character.gameId, (event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      const { title, message } = event.payload as { title?: string; message?: string };
      toast.info(title || '系統廣播', { description: message });
      addNotification([{
        id: `evt-${event.timestamp}`,
        title: title || '系統廣播',
        message: message || '收到廣播',
        type: event.type,
      }]);
    } else if (event.type === 'game.started') {
      // 遊戲開始時靜默刷新（更新 isGameActive 和 baselineData）
      router.refresh();
    } else if (event.type === 'game.reset' || event.type === 'game.ended') {
      const titles: Record<string, string> = { 'game.reset': '遊戲重置', 'game.ended': '遊戲結束' };
      toast.info(titles[event.type] || '遊戲狀態變更');
      addNotification([{
        id: `evt-${event.timestamp}`,
        title: titles[event.type] || '遊戲狀態',
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
