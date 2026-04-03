/**
 * 對抗檢定使用 Hook
 * 統一處理技能和道具的對抗檢定使用邏輯
 * 
 * Phase 8: 提取共用邏輯（skill-list 和 item-list）
 */

'use client';

import { useCallback } from 'react';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import type { AttackerWaitingDisplayData } from '@/hooks/use-contest-dialog-state';

export interface UseContestableItemUsageOptions {
  characterId: string;
  sourceType: 'skill' | 'item';
  sourceId: string;
  selectedTargetId: string | undefined;
  /** 對抗開始時的回呼（關閉 bottom sheet、開啟等待 dialog 等） */
  onContestStarted?: () => void;
}

export interface UseContestableItemUsageReturn {
  handleContestStarted: (contestId: string, displayData?: AttackerWaitingDisplayData) => void;
}

/**
 * 對抗檢定使用 Hook
 * 統一處理對抗檢定開始時的狀態設置
 */
export function useContestableItemUsage(
  options: UseContestableItemUsageOptions
): UseContestableItemUsageReturn {
  const {
    characterId,
    sourceType,
    sourceId,
    selectedTargetId,
    onContestStarted,
  } = options;

  const { addPendingContest, updateContestDialog } = useContestState(characterId);
  const { setAttackerWaitingDialog } = useContestDialogState(characterId);

  /**
   * 處理對抗檢定開始
   * 設置對抗檢定狀態、dialog 狀態，並通知呼叫方關閉 bottom sheet
   */
  const handleContestStarted = useCallback(
    (contestId: string, displayData?: AttackerWaitingDisplayData) => {
      // 記錄正在進行的對抗檢定狀態
      addPendingContest(sourceId, sourceType, contestId);

      // 更新 dialog 狀態
      updateContestDialog(sourceId, true, selectedTargetId);

      // 設置統一的 Dialog 狀態（含顯示資料），確保重新整理後能正確恢復
      setAttackerWaitingDialog(contestId, sourceType, sourceId, displayData);

      // 通知呼叫方（關閉 bottom sheet 等）
      onContestStarted?.();
    },
    [
      sourceId,
      sourceType,
      selectedTargetId,
      addPendingContest,
      updateContestDialog,
      setAttackerWaitingDialog,
      onContestStarted,
    ]
  );

  return {
    handleContestStarted,
  };
}
