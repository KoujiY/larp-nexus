/**
 * 對抗檢定狀態恢復 Hook
 * 統一管理對抗檢定狀態的恢復和查詢邏輯
 * 
 * Phase 4: 提取對抗檢定狀態恢復邏輯
 */

'use client';

import { useEffect, useRef } from 'react';
import { CONTEST_TIMEOUT, CONTEST_QUERY_DELAY, STORAGE_KEYS } from '@/lib/constants/contest';
import type { Skill, Item } from '@/types/character';

interface ContestState {
  sourceId: string;
  sourceType: 'skill' | 'item';
  contestId: string;
  timestamp: number;
  dialogOpen?: boolean;
  selectedTargetId?: string;
}

export interface UseContestStateRestoreOptions {
  characterId: string;
  sourceType: 'skill' | 'item';
  pendingContests: Record<string, ContestState>;
  items: Skill[] | Item[];
  selectedItem: Skill | Item | null;
  hasPendingContest: (sourceId: string) => boolean;
  removePendingContest: (sourceId: string) => void;
  updateContestDialog: (sourceId: string, dialogOpen: boolean, selectedTargetId?: string) => void;
  onItemSelected: (item: Skill | Item | null) => void;
  onClearDialog: () => void;
  isDialogForSource: (sourceId: string, sourceType: 'skill' | 'item') => boolean;
  onClearTargetState: () => void;
  isClosingDialogRef: React.MutableRefObject<string | null>;
  dialogState?: { type: string; sourceId: string; sourceType: 'skill' | 'item' } | null;
}

/**
 * 對抗檢定狀態恢復 Hook
 */
export function useContestStateRestore(options: UseContestStateRestoreOptions) {
  const {
    characterId,
    sourceType,
    pendingContests,
    items,
    selectedItem,
    hasPendingContest,
    removePendingContest,
    updateContestDialog,
    onItemSelected,

    onClearDialog,
    isDialogForSource,
    onClearTargetState,
    isClosingDialogRef,
    dialogState,
  } = options;

  // 追蹤之前的 pendingContests 狀態，用於檢測對抗檢定是否被移除
  const prevPendingContestsRef = useRef<typeof pendingContests>({});
  
  // 初始化標記，確保只初始化一次
  const initializedRef = useRef(false);
  
  // 追蹤 selectedItem 是否有對應的 pendingContest，用於檢測對抗檢定是否完成
  const prevSelectedItemPendingContestRef = useRef<boolean>(false);

  // 從持久化狀態恢復 dialog，並檢查對抗檢定是否已完成
  useEffect(() => {
    // 初始化 prevPendingContestsRef（用於追蹤狀態變化）
    // 直接從 localStorage 讀取，避免依賴 pendingContests 的當前值（可能被清空）
    if (!initializedRef.current && typeof window !== 'undefined') {
      try {
        const storageKey = STORAGE_KEYS.CONTEST_PENDING(characterId);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, { timestamp: number; [key: string]: unknown }>;
          // 清理過期的對抗檢定（超過 3 分鐘）
          const now = Date.now();
          const filtered: typeof pendingContests = {};
          for (const [key, contest] of Object.entries(parsed)) {
            if (now - (contest.timestamp as number) < CONTEST_TIMEOUT) {
              filtered[key] = contest as unknown as typeof pendingContests[string];
            }
          }
          if (Object.keys(filtered).length > 0) {
            prevPendingContestsRef.current = filtered;
            initializedRef.current = true;
          }
        }
      } catch (error) {
        console.error(`[${sourceType}-list] Failed to initialize prevPendingContestsRef from localStorage:`, error);
      }
    }
    
    // 修復：只在對抗檢定實際完成時（從有 pendingContest 變為沒有 pendingContest）才關閉 dialog
    // 如果用戶手動打開 dialog（沒有對應的 pendingContest），不應該關閉
    if (selectedItem) {
      const hasPending = hasPendingContest(selectedItem.id);
      const hadPending = prevSelectedItemPendingContestRef.current;
      
      // 更新追蹤狀態
      prevSelectedItemPendingContestRef.current = hasPending;
      
      // 只在對抗檢定實際完成時（從有 pendingContest 變為沒有 pendingContest）才關閉 dialog
      if (hadPending && !hasPending) {
        // Phase 10: 移除 isAttackerWaiting 守衛
        // 當 hadPending && !hasPending 時，代表 pendingContest 已被 removePendingContest 清除，
        // 即對抗檢定已結束。此時應無條件清除 dialogState 並關閉 dialog。
        // 之前的守衛誤將 dialogState === 'attacker_waiting' 視為「仍在進行中」而跳過清理，
        // 導致結算後重新開啟技能/道具仍顯示等待狀態。

        // 如果已經在關閉這個 dialog，跳過
        if (isClosingDialogRef.current === selectedItem.id) {
          return;
        }
        // 標記正在關閉這個 dialog
        isClosingDialogRef.current = selectedItem.id;
        // 修復：清除 dialogState（localStorage 中的 dialog 狀態），確保 dialog 不會因為 localStorage 中的狀態而重新打開
        if (isDialogForSource(selectedItem.id, sourceType)) {
          onClearDialog();
        }
        onItemSelected(null); // 設置為 null 來關閉 dialog

        onClearTargetState(); // 清除目標選擇狀態
        // 標記會在 selectedItem 變為 null 時通過 useEffect 清除
        return; // 提前返回，不執行後續邏輯
      } else if (!hasPending) {
        // 如果沒有 pendingContest，更新追蹤狀態（用戶手動打開 dialog 的情況）
        prevSelectedItemPendingContestRef.current = false;
      }
    } else {
      // 如果 selectedItem 為 null，重置追蹤狀態
      prevSelectedItemPendingContestRef.current = false;
    }
    
    if (!items || Object.keys(pendingContests).length === 0) return;

    // 檢查每個 pending contest 是否已完成
    const now = Date.now();
    const queryPromises: Promise<void>[] = [];

    for (const [sourceId, contest] of Object.entries(pendingContests)) {
      if (contest.sourceType === sourceType) {
        const item = items.find((i) => i.id === sourceId);
        if (item) {
          // 新架構：attacker_waiting 由 character-card-view 層級的 ContestWaitingDialog 處理，
          // 不再透過 bottom sheet 恢復。此處只執行 server query 偵測對抗是否已完成。
          const isHandledByWaitingDialog =
            dialogState?.type === 'attacker_waiting' &&
            dialogState.sourceType === sourceType &&
            dialogState.sourceId === sourceId;

          if (isHandledByWaitingDialog) {
            // 標記 dialogOpen 為 false（防止 useContestDialogManagement 重複設定），
            // 但僅在尚未標記時執行，避免重複觸發 pendingContests 變更
            if (contest.dialogOpen) {
              updateContestDialog(sourceId, false);
            }

            // Server query：偵測對抗是否已完成（處理重新整理後 WebSocket 事件遺失的情況）
            const contestAge = now - contest.timestamp;
            if (contestAge > CONTEST_QUERY_DELAY) {
              const queryPromise = import('@/app/actions/contest-query').then(({ queryContestStatus }) => {
                return queryContestStatus(contest.contestId, characterId)
                  .then((result) => {
                    if (result.success && result.data) {
                      if (!result.data.isActive) {
                        removePendingContest(sourceId);
                        onClearDialog();
                      }
                    } else {
                      removePendingContest(sourceId);
                      onClearDialog();
                    }
                  })
                  .catch((error) => {
                    console.error(`[${sourceType}-list] 查詢對抗檢定狀態錯誤`, { sourceId, error });
                  });
              });
              queryPromises.push(queryPromise);
            }
            continue; // 跳過 bottom sheet 恢復邏輯
          }

          // 修復：如果 dialogOpen 為 false，且 selectedItem 存在，關閉 dialog
          // 這處理了 updateContestDialog 在 removePendingContest 之後被調用的情況
          if (!contest.dialogOpen && selectedItem && selectedItem.id === sourceId) {
            // 如果已經在關閉這個 dialog，跳過
            if (isClosingDialogRef.current === sourceId) {
              continue;
            }
            // 標記正在關閉這個 dialog
            isClosingDialogRef.current = sourceId;
            // 修復：清除 dialogState（localStorage 中的 dialog 狀態），確保 dialog 不會因為 localStorage 中的狀態而重新打開
            if (isDialogForSource(sourceId, sourceType)) {
              onClearDialog();
            }
            onItemSelected(null); // 設置為 null 來關閉 dialog
    
            onClearTargetState(); // 清除目標選擇狀態
            // 標記會在 selectedItem 變為 null 時通過 useEffect 清除
            continue; // 跳過這個 contest，繼續處理下一個
          }

          const contestAge = now - contest.timestamp;

          // Phase 8: 如果對抗檢定超過 10 秒，查詢服務器狀態確認是否已完成
          // 這是為了處理攻擊方重新整理後無法收到 WebSocket 事件的情況
          // 10 秒是一個合理的等待時間，足夠防守方回應，同時不會讓用戶等待太久
          if (contestAge > CONTEST_QUERY_DELAY) {

            // 查詢服務器狀態
            const queryPromise = import('@/app/actions/contest-query').then(({ queryContestStatus }) => {
              return queryContestStatus(contest.contestId, characterId)
                .then((result) => {
                  if (result.success && result.data) {
                    if (!result.data.isActive) {
                      // 對抗檢定已完成，清除本地狀態
                      removePendingContest(sourceId);
                    } else {
                      // 對抗檢定仍在進行中，保持狀態
                    }
                  } else {
                    // 查詢失敗，清除本地狀態（避免狀態一直保留）
                    removePendingContest(sourceId);
                  }
                })
                .catch((error) => {
                  console.error(`[${sourceType}-list] 查詢對抗檢定狀態錯誤`, { sourceId, error });
                  // 查詢錯誤時，不清除本地狀態（可能是網絡問題），但記錄錯誤
                });
            });

            queryPromises.push(queryPromise);
          }
        }
      }
    }
    
    // 等待所有查詢完成（但不阻塞 UI）
    if (queryPromises.length > 0) {
      Promise.all(queryPromises).catch((error) => {
        console.error(`[${sourceType}-list] 查詢對抗檢定狀態時發生錯誤`, error);
      });
    }
  }, [
    items,
    pendingContests,
    selectedItem,
    hasPendingContest,
    removePendingContest,
    characterId,
    updateContestDialog,
    onItemSelected,

    onClearDialog,
    isDialogForSource,
    onClearTargetState,
    isClosingDialogRef,
    dialogState,
    sourceType,
  ]);

}

