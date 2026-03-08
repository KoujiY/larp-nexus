/**
 * 對抗檢定 Dialog 狀態管理 Hook
 * 統一管理所有 Dialog 狀態，支持重新整理恢復
 * 
 * Phase 3: 統一 Dialog 狀態管理
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 對抗檢定 Dialog 狀態
 */
export interface ContestDialogState {
  /** Dialog 類型 */
  type: 'attacker_waiting' | 'defender_response' | 'target_item_selection';
  /** 對抗檢定 ID */
  contestId: string;
  /** 來源類型（技能或道具） */
  sourceType: 'skill' | 'item';
  /** 來源 ID（技能或道具 ID） */
  sourceId: string;
  /** 防守方 ID（用於選擇目標道具） */
  targetCharacterId?: string;
  /** 時間戳（用於過期檢查） */
  timestamp: number;
}

/**
 * 對抗檢定 Dialog 狀態管理 Hook
 * 
 * @param characterId 角色 ID
 * @returns Dialog 狀態管理對象
 */
export function useContestDialogState(characterId: string) {
  const storageKey = `contest-dialog-${characterId}`;
  const DIALOG_TIMEOUT = 180000; // 3 分鐘

  // 使用 useState 的初始化函數從 localStorage 恢復狀態，避免在 effect 中同步調用 setState
  const [dialogState, setDialogState] = useState<ContestDialogState | null>(() => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ContestDialogState;
        // 檢查是否過期（3 分鐘）
        if (Date.now() - parsed.timestamp < DIALOG_TIMEOUT) {
          return parsed;
        } else {
          // 過期，清除狀態
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('[use-contest-dialog-state] 恢復狀態失敗:', error);
    }
    return null;
  });

  // 監聽 storage 事件，當其他標籤頁或代碼修改 localStorage 時，重新載入狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey) {
        try {
          const stored = e.newValue;
          if (stored) {
            const parsed = JSON.parse(stored) as ContestDialogState;
            // 檢查是否過期（3 分鐘）
            if (Date.now() - parsed.timestamp < DIALOG_TIMEOUT) {
              setDialogState(parsed);
            } else {
              // 過期，清除狀態
              localStorage.removeItem(storageKey);
              setDialogState(null);
            }
          } else {
            setDialogState(null);
          }
        } catch (error) {
          console.error('[use-contest-dialog-state] 處理 storage 事件失敗:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]);

  // 保存狀態到 localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      if (dialogState) {
        localStorage.setItem(storageKey, JSON.stringify(dialogState));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error('[use-contest-dialog-state] 保存狀態失敗:', error);
    }
  }, [dialogState, storageKey]);

  /**
   * 設置攻擊方等待 Dialog 狀態
   * 注意：不再有全局等待 dialog，只會顯示技能或道具 dialog
   */
  const setAttackerWaitingDialog = useCallback((
    contestId: string,
    sourceType: 'skill' | 'item',
    sourceId: string
  ) => {
    setDialogState({
      type: 'attacker_waiting',
      contestId,
      sourceType,
      sourceId,
      timestamp: Date.now(),
    });
  }, []);

  /**
   * 設置防守方回應 Dialog 狀態
   */
  const setDefenderResponseDialog = useCallback((
    contestId: string,
    sourceType: 'skill' | 'item',
    sourceId: string
  ) => {
    setDialogState({
      type: 'defender_response',
      contestId,
      sourceType,
      sourceId,
      timestamp: Date.now(),
    });
  }, []);

  /**
   * 設置選擇目標道具 Dialog 狀態
   */
  const setTargetItemSelectionDialog = useCallback((
    contestId: string,
    sourceType: 'skill' | 'item',
    sourceId: string,
    targetCharacterId: string
  ) => {
    setDialogState({
      type: 'target_item_selection',
      contestId,
      sourceType,
      sourceId,
      targetCharacterId,
      timestamp: Date.now(),
    });
  }, []);

  /**
   * 清除 Dialog 狀態
   * Phase 10: 同步清除 localStorage，避免 useEffect 異步清除時 user 已 refresh 導致殘留
   */
  const clearDialogState = useCallback(() => {
    setDialogState(null);
    // 同步清除 localStorage，確保 refresh 前狀態已清除
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        console.error('[use-contest-dialog-state] 同步清除 localStorage 失敗:', error);
      }
    }
  }, [storageKey]);

  /**
   * 檢查是否有特定類型的 Dialog 狀態
   */
  const hasDialogType = useCallback((type: ContestDialogState['type']) => {
    return dialogState?.type === type;
  }, [dialogState]);

  /**
   * 檢查是否為特定來源的 Dialog
   */
  const isDialogForSource = useCallback((sourceId: string, sourceType?: 'skill' | 'item') => {
    if (!dialogState) return false;
    if (dialogState.sourceId !== sourceId) return false;
    if (sourceType && dialogState.sourceType !== sourceType) return false;
    return true;
  }, [dialogState]);

  return {
    /** 當前 Dialog 狀態 */
    dialogState,
    /** 設置 Dialog 狀態（直接設置） */
    setDialogState,
    /** 設置攻擊方等待 Dialog */
    setAttackerWaitingDialog,
    /** 設置防守方回應 Dialog */
    setDefenderResponseDialog,
    /** 設置選擇目標道具 Dialog */
    setTargetItemSelectionDialog,
    /** 清除 Dialog 狀態 */
    clearDialogState,
    /** 檢查是否有特定類型的 Dialog */
    hasDialogType,
    /** 檢查是否為特定來源的 Dialog */
    isDialogForSource,
  };
}

