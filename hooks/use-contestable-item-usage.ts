/**
 * 對抗檢定使用 Hook
 * 統一處理技能和道具的對抗檢定使用邏輯
 * 
 * Phase 8: 提取共用邏輯（skill-list 和 item-list）
 */

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';

export interface UseContestableItemUsageOptions {
  characterId: string;
  sourceType: 'skill' | 'item';
  sourceId: string;
  selectedTargetId: string | undefined;
  setUseResult: (result: { success: boolean; message: string } | null) => void;
  setLastToastId?: (id: string | number | undefined) => void;
}

export interface UseContestableItemUsageReturn {
  handleContestStarted: (contestId: string, message?: string) => void;
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
    setUseResult,
    setLastToastId,
  } = options;

  const { addPendingContest, updateContestDialog } = useContestState(characterId);
  const { setAttackerWaitingDialog } = useContestDialogState(characterId);

  /**
   * 處理對抗檢定開始
   * 統一設置對抗檢定狀態、dialog 狀態和使用結果
   */
  const handleContestStarted = useCallback(
    (contestId: string, message?: string) => {
      // 記錄正在進行的對抗檢定狀態
      addPendingContest(sourceId, sourceType, contestId);
      
      // 更新 dialog 狀態
      updateContestDialog(sourceId, true, selectedTargetId);
      
      // 設置統一的 Dialog 狀態，確保重新整理後能正確恢復
      setAttackerWaitingDialog(contestId, sourceType, sourceId);
      
      // 設置使用結果訊息
      const resultMessage = message || '對抗檢定請求已發送，等待防守方回應...';
      setUseResult({
        success: true,
        message: resultMessage,
      });
      
      // 顯示 toast 通知
      const toastId = toast.info(resultMessage, {
        duration: 5000,
      });
      
      // 如果有設置 toast ID 的回調，保存 toast ID
      if (setLastToastId) {
        setLastToastId(toastId);
      }
    },
    [
      sourceId,
      sourceType,
      selectedTargetId,
      addPendingContest,
      updateContestDialog,
      setAttackerWaitingDialog,
      setUseResult,
      setLastToastId,
    ]
  );

  return {
    handleContestStarted,
  };
}
