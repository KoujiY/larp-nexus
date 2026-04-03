/**
 * 對抗檢定處理 Hook
 * 從 character-card-view.tsx 提取
 *
 * 職責：
 * - 處理對抗檢定請求事件（防守方）
 * - 處理對抗檢定結果事件（攻擊方/防守方）
 * - 管理對抗檢定狀態持久化
 */

import { useCallback } from 'react';
import type { SkillContestEvent } from '@/types/event';
import { useDefenderContestState, useContestState } from '@/hooks/use-contest-state';

export interface UseContestHandlerOptions {
  characterId: string;
  onDefenderContestRequest?: (event: SkillContestEvent['payload']) => void;
  onDefenderContestResult?: (event: SkillContestEvent['payload']) => void;
  onAttackerContestResult?: (event: SkillContestEvent['payload']) => void;
  /** 清除 Dialog 狀態的回調（確保對抗結算後 dialogState 不殘留） */
  onClearDialogState?: () => void;
}

export interface UseContestHandlerReturn {
  handleContestEvent: (event: SkillContestEvent['payload'], eventTimestamp: number) => void;
}

/**
 * 對抗檢定處理 Hook
 */
export function useContestHandler(options: UseContestHandlerOptions): UseContestHandlerReturn {
  const {
    characterId,
    onDefenderContestRequest,
    onDefenderContestResult,
    onAttackerContestResult,
    onClearDialogState,
  } = options;

  const { setDefenderContest, clearDefenderContest } = useDefenderContestState(characterId);
  const { removePendingContest } = useContestState(characterId);

  /**
   * 處理對抗檢定事件
   */
  const handleContestEvent = useCallback(
    (payload: SkillContestEvent['payload'], eventTimestamp: number) => {
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);

      // 優先使用 subType 判斷事件類型，向後兼容 attackerValue === 0 的邏輯
      const eventSubType = payload.subType;
      const isRequestEvent = eventSubType === 'request' || (!eventSubType && payload.attackerValue === 0);
      const isResultEvent = eventSubType === 'result' || (!eventSubType && payload.attackerValue !== 0);
      const isEffectEvent = eventSubType === 'effect';

      // ── 防守方 ─────────────────────────────────────────────
      if (defenderIdStr === characterIdStr) {
        if (isResultEvent) {
          clearDefenderContest();
          onDefenderContestResult?.(payload);
        } else if (isRequestEvent) {
          const contestId = payload.contestId || (() => {
            const sourceId = payload.itemId || payload.skillId || '';
            return `${payload.attackerId}::${sourceId}::${eventTimestamp}`;
          })();

          setDefenderContest(contestId, payload);
          onDefenderContestRequest?.(payload);
        }
        // 防守方忽略 effect 事件
        return;
      }

      // ── 攻擊方 ─────────────────────────────────────────────
      if (attackerIdStr !== characterIdStr) return;

      // 效果事件（選擇目標道具後 server 發送）
      if (isEffectEvent) {
        const effectSourceId = payload.itemId || payload.skillId;
        if (effectSourceId) {
          removePendingContest(effectSourceId);
        }
        onClearDialogState?.();

        onAttackerContestResult?.(payload);
        return;
      }

      // 結果事件（防守方回應後）
      if (isResultEvent) {
        const sourceId = payload.itemId || payload.skillId || '';
        const needsTargetItemSelection = payload.needsTargetItemSelection === true;

        if (needsTargetItemSelection && payload.result === 'attacker_wins') {
          // 需要選擇目標道具：保持 pendingContest，由 use-game-event-handler 設定 target_item_selection dialogState
        } else {
          // 不需要選擇目標道具：清除狀態
          if (sourceId) {
            removePendingContest(sourceId);
          }
          onClearDialogState?.();
        }

        onAttackerContestResult?.(payload);
      }
    },
    [
      characterId,
      onDefenderContestRequest,
      onDefenderContestResult,
      onAttackerContestResult,
      onClearDialogState,
      setDefenderContest,
      clearDefenderContest,
      removePendingContest,
    ]
  );

  return {
    handleContestEvent,
  };
}
