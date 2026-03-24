/**
 * 對抗 Dialog 狀態管理 Hook
 *
 * 集中管理 character-card-view 中所有與對抗檢定 Dialog 相關的狀態，
 * 包含防守方 dialog、攻擊方等待 dialog 及頁面重整後的狀態恢復邏輯。
 */

'use client';

import { useState, useEffect } from 'react';
import { useContestDialogState } from './use-contest-dialog-state';
import { useDefenderContestState, useContestState } from './use-contest-state';

/** 防守方獲勝後目標道具選擇 dialog 的狀態 */
export type DefenderTargetDialogState = {
  open: boolean;
  contestId: string;
  attackerId: string;
  sourceType: 'skill' | 'item';
  sourceId: string;
};

type Params = {
  characterId: string;
  /** 切換主畫面 Tab（恢復攻擊方等待狀態時使用） */
  onTabChange: (tab: string) => void;
};

/**
 * 管理角色卡對抗 Dialog 的開關狀態與頁面重整後的狀態恢復。
 */
export function useContestDialogManagement({ characterId, onTabChange }: Params) {
  const {
    dialogState,
    setAttackerWaitingDialog: setAttackerWaitingDialogState,
    setDefenderResponseDialog,
    setTargetItemSelectionDialog,
    clearDialogState,
  } = useContestDialogState(characterId);

  const [defenderTargetDialog, setDefenderTargetDialog] = useState<DefenderTargetDialogState | null>(null);

  const { defenderState, setDefenderContest, clearDefenderContest } = useDefenderContestState(characterId);

  // 從 defenderState 衍生的派生值（不需要獨立 state）
  const contestDialogOpen = defenderState !== null;
  const currentContestEvent = defenderState?.contestEvent ?? null;
  const currentContestId = defenderState?.contestId ?? '';

  const { pendingContests } = useContestState(characterId);

  // 頁面重整兼容：若有 defenderState 但 dialogState 尚未恢復，補寫統一 Dialog 狀態
  // 注意：此處呼叫的是外部 setter（非本地 setState），不觸發 set-state-in-effect 規則
  useEffect(() => {
    if (!defenderState) return;
    if (!dialogState || dialogState.type !== 'defender_response' || dialogState.contestId !== defenderState.contestId) {
      const sourceId = defenderState.contestEvent.itemId || defenderState.contestEvent.skillId || '';
      const sourceType = defenderState.contestEvent.sourceType || (defenderState.contestEvent.itemId ? 'item' : 'skill');
      setDefenderResponseDialog(defenderState.contestId, sourceType, sourceId);
    }
  }, [defenderState, dialogState, setDefenderResponseDialog]);

  // 從統一 Dialog 狀態恢復攻擊方等待 dialog（切換到對應分頁，讓子元件處理）
  useEffect(() => {
    if (!dialogState) return;
    switch (dialogState.type) {
      case 'attacker_waiting':
      case 'target_item_selection':
        onTabChange(dialogState.sourceType === 'skill' ? 'skills' : 'items');
        break;
    }
  }, [dialogState, onTabChange]);

  // 從持久化狀態恢復攻擊方等待 dialog
  useEffect(() => {
    if (Object.keys(pendingContests).length > 0) {
      for (const [sourceId, contest] of Object.entries(pendingContests)) {
        if (contest.dialogOpen) {
          setAttackerWaitingDialogState(contest.contestId, contest.sourceType, sourceId);
          break;
        }
      }
    }
  }, [pendingContests, setAttackerWaitingDialogState]);

  return {
    dialogState,
    setAttackerWaitingDialog: setAttackerWaitingDialogState,
    setDefenderResponseDialog,
    setTargetItemSelectionDialog,
    clearDialogState,
    defenderTargetDialog,
    setDefenderTargetDialog,
    defenderState,
    setDefenderContest,
    clearDefenderContest,
    contestDialogOpen,
    currentContestEvent,
    currentContestId,
    pendingContests,
  };
}
