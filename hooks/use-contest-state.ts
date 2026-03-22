'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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

  const [pendingContests, setPendingContests] = useState<Record<string, ContestState>>({});
  // 修復：使用 ref 追蹤是否已經從 localStorage 載入過狀態，避免重複載入
  const hasLoadedFromStorageRef = useRef(false);

  // 從 localStorage 載入狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 修復：只在首次掛載時從 localStorage 載入狀態，避免在 removePendingContest 清除狀態後重新恢復
    if (hasLoadedFromStorageRef.current) {
      return;
    }

    const loadFromStorage = () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, ContestState>;
          // 清理過期的對抗檢定（超過 3 分鐘）
          const now = Date.now();
          const filtered: Record<string, ContestState> = {};
          for (const [key, contest] of Object.entries(parsed)) {
            if (now - contest.timestamp < CONTEST_TIMEOUT_MS) {
              filtered[key] = contest;
            }
          }
          // 使用函數式更新，確保不會覆蓋 removePendingContest 的狀態更新
          setPendingContests((currentState) => {
            // 在函數式更新內部重新讀取 localStorage，確保使用最新的數據
            // 這樣可以避免 removePendingContest 清除 localStorage 後，loadFromStorage 仍然使用舊的 filtered 數據
            try {
              const latestStored = localStorage.getItem(storageKey);
              if (!latestStored) {
                return {};
              }
              const latestParsed = JSON.parse(latestStored) as Record<string, ContestState>;
              const now = Date.now();
              const latestFiltered: Record<string, ContestState> = {};
              for (const [key, contest] of Object.entries(latestParsed)) {
                if (now - contest.timestamp < CONTEST_TIMEOUT_MS) {
                  latestFiltered[key] = contest;
                }
              }
              // 修復：只在首次掛載時從 localStorage 恢復狀態
              // 如果當前狀態是空的且 localStorage 中有記錄，則使用 localStorage 中的記錄
              // 如果 removePendingContest 已經清除了 localStorage，latestFiltered 應該是空的
              if (Object.keys(currentState).length === 0 && Object.keys(latestFiltered).length > 0) {
                return latestFiltered;
              }
              return currentState;
            } catch (error) {
              console.error('[use-contest-state] Failed to reload from localStorage in function update:', error);
              return currentState;
            }
          });
          if (Object.keys(filtered).length !== Object.keys(parsed).length) {
            localStorage.setItem(storageKey, JSON.stringify(filtered));
          }
        } else {
          setPendingContests({});
        }
        hasLoadedFromStorageRef.current = true;
      } catch (error) {
        console.error('Failed to load contest state:', error);
        hasLoadedFromStorageRef.current = true;
      }
    };

    loadFromStorage();

    // 修復：移除 storage 事件監聽器，避免在 removePendingContest 清除狀態後重新恢復
    // 只在首次掛載時載入狀態，之後不再監聽 storage 事件
  }, [storageKey]);

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
      return {
        ...prev,
        [sourceId]: {
          ...prev[sourceId],
          dialogOpen,
          selectedTargetId: selectedTargetId !== undefined ? selectedTargetId : prev[sourceId].selectedTargetId,
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

  const [defenderState, setDefenderState] = useState<DefenderContestState | null>(null);

  // 從 localStorage 載入狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as DefenderContestState;
        const now = Date.now();
        if (now - parsed.timestamp < CONTEST_TIMEOUT_MS) {
          // 使用 setTimeout 避免同步 setState
          const timeoutId = setTimeout(() => {
            setDefenderState(parsed);
          }, 0);
          return () => clearTimeout(timeoutId);
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('Failed to load defender contest state:', error);
    }
  }, [storageKey]);

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
