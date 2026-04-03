'use client';

import { useState, useEffect, useCallback } from 'react';

interface ContestState {
  sourceId: string; // skillId 或 itemId
  sourceType: 'skill' | 'item';
  contestId: string;
  timestamp: number;
  // Phase 8: 攻擊方 dialog 狀態持久化
  dialogOpen?: boolean;
  selectedTargetId?: string;
}

// Phase 8: 防守方 dialog 狀態
interface DefenderContestState {
  contestId: string;
  contestEvent: {
    attackerId: string;
    attackerName: string;
    defenderId: string;
    defenderName: string;
    skillId?: string;
    skillName?: string;
    itemId?: string;
    itemName?: string;
    sourceType?: 'skill' | 'item';
    attackerValue: number;
    defenderValue: number;
    attackerItems?: string[];
    attackerSkills?: string[];
    defenderItems?: string[];
    defenderSkills?: string[];
    result: 'attacker_wins' | 'defender_wins' | 'both_fail';
    effectsApplied?: string[];
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    targetItemId?: string;
    needsTargetItemSelection?: boolean;
  };
  timestamp: number;
}

const STORAGE_KEY_PREFIX = 'contest-pending-';
const DEFENDER_STORAGE_KEY_PREFIX = 'contest-defender-';

/** 對抗檢定過期時間（3 分鐘） */
const CONTEST_TIMEOUT_MS = 180_000;

/**
 * Hook 用於管理對抗檢定狀態
 * 狀態會存儲到 localStorage，即使重新整理也會保留
 */
export function useContestState(characterId: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${characterId}`;

  // lazy initializer：掛載時同步讀取 localStorage，避免 useEffect 中呼叫 setState
  const [pendingContests, setPendingContests] = useState<Record<string, ContestState>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return {};
      const parsed = JSON.parse(stored) as Record<string, ContestState>;
      const now = Date.now();
      const filtered: Record<string, ContestState> = {};
      for (const [key, contest] of Object.entries(parsed)) {
        if (now - contest.timestamp < CONTEST_TIMEOUT_MS) {
          filtered[key] = contest;
        }
      }
      // 順便清除過期記錄
      if (Object.keys(filtered).length !== Object.keys(parsed).length) {
        localStorage.setItem(storageKey, JSON.stringify(filtered));
      }
      return filtered;
    } catch (error) {
      console.error('Failed to load contest state:', error);
      return {};
    }
  });

  // 保存狀態到 localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      if (Object.keys(pendingContests).length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(pendingContests));
      }
    } catch (error) {
      console.error('Failed to save contest state:', error);
    }
  }, [pendingContests, storageKey]);

  // 添加正在進行的對抗檢定
  const addPendingContest = useCallback((sourceId: string, sourceType: 'skill' | 'item', contestId: string) => {
    setPendingContests((prev) => {
      return {
        ...prev,
        [sourceId]: {
          sourceId,
          sourceType,
          contestId,
          timestamp: Date.now(),
        },
      };
    });
  }, []);

  // 移除正在進行的對抗檢定
  // 修復：在刪除記錄之前，先確保 dialogOpen 設置為 false，避免狀態更新時序問題
  // 修復：即使記錄在狀態中不存在，也要從 localStorage 中清除，避免重新整理後記錄恢復
  const removePendingContest = useCallback((sourceId: string) => {
    setPendingContests((prev) => {
      if (!(sourceId in prev)) {
        // 即使記錄在狀態中不存在，也要從 localStorage 中清除
        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
              const parsed = JSON.parse(stored) as Record<string, ContestState>;
              if (sourceId in parsed) {
                const next = { ...parsed };
                delete next[sourceId];
                if (Object.keys(next).length === 0) {
                  localStorage.removeItem(storageKey);
                } else {
                  localStorage.setItem(storageKey, JSON.stringify(next));
                }
                // 直接返回更新後的狀態，確保 React 狀態與 localStorage 同步
                return next;
              }
            }
          } catch (error) {
            console.error('[use-contest-state] Failed to remove from localStorage:', error);
          }
        }
        return prev;
      }
      const next = { ...prev };
      // 先設置 dialogOpen 為 false，確保 dialog 狀態正確更新
      next[sourceId] = {
        ...next[sourceId],
        dialogOpen: false,
      };
      // 然後刪除記錄
      delete next[sourceId];
      // 修復：同時清除 localStorage，確保狀態不會被重新載入
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored) as Record<string, ContestState>;
            if (sourceId in parsed) {
              const nextStorage = { ...parsed };
              delete nextStorage[sourceId];
              if (Object.keys(nextStorage).length === 0) {
                localStorage.removeItem(storageKey);
              } else {
                localStorage.setItem(storageKey, JSON.stringify(nextStorage));
              }
            }
          }
        } catch (error) {
          console.error('[use-contest-state] Failed to remove from localStorage in delete branch:', error);
        }
      }
      return next;
    });
  }, [storageKey]);

  // 檢查是否有正在進行的對抗檢定
  const hasPendingContest = useCallback((sourceId: string): boolean => {
    return sourceId in pendingContests;
  }, [pendingContests]);

  // 獲取所有正在進行的對抗檢定
  const getAllPendingContests = useCallback((): ContestState[] => {
    return Object.values(pendingContests);
  }, [pendingContests]);

  // 清除所有對抗檢定狀態（用於防守方結算後）
  const clearAllPendingContests = useCallback(() => {
    setPendingContests({});
  }, []);

  // Phase 8: 更新 dialog 狀態
  const updateContestDialog = useCallback((sourceId: string, dialogOpen: boolean, selectedTargetId?: string) => {
    setPendingContests((prev) => {
      if (!(sourceId in prev)) {
        return prev;
      }
      const existing = prev[sourceId];
      const newSelectedTargetId = selectedTargetId !== undefined ? selectedTargetId : existing.selectedTargetId;
      // 值相同時不建立新物件，避免不必要的 re-render
      if (existing.dialogOpen === dialogOpen && existing.selectedTargetId === newSelectedTargetId) {
        return prev;
      }
      return {
        ...prev,
        [sourceId]: {
          ...existing,
          dialogOpen,
          selectedTargetId: newSelectedTargetId,
        },
      };
    });
  }, []);

  return {
    addPendingContest,
    removePendingContest,
    hasPendingContest,
    getAllPendingContests,
    clearAllPendingContests,
    updateContestDialog,
    pendingContests, // 導出以便訪問 dialog 狀態
  };
}

/**
 * Hook 用於管理防守方的對抗檢定 dialog 狀態
 * 狀態會存儲到 localStorage，即使重新整理也會保留
 */
export function useDefenderContestState(characterId: string) {
  const storageKey = `${DEFENDER_STORAGE_KEY_PREFIX}${characterId}`;

  // lazy initializer：掛載時同步讀取 localStorage，取代 useEffect + setTimeout 的舊寫法
  const [defenderState, setDefenderState] = useState<DefenderContestState | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as DefenderContestState;
      if (Date.now() - parsed.timestamp < CONTEST_TIMEOUT_MS) {
        return parsed;
      }
      localStorage.removeItem(storageKey);
      return null;
    } catch (error) {
      console.error('Failed to load defender contest state:', error);
      return null;
    }
  });

  // 保存狀態到 localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      if (!defenderState) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(defenderState));
      }
    } catch (error) {
      console.error('Failed to save defender contest state:', error);
    }
  }, [defenderState, storageKey]);

  // 設置防守方對抗檢定狀態
  const setDefenderContest = useCallback((contestId: string, contestEvent: DefenderContestState['contestEvent']) => {
    setDefenderState({
      contestId,
      contestEvent,
      timestamp: Date.now(),
    });
  }, []);

  // 清除防守方對抗檢定狀態
  const clearDefenderContest = useCallback(() => {
    setDefenderState(null);
  }, []);

  return {
    defenderState,
    setDefenderContest,
    clearDefenderContest,
  };
}
