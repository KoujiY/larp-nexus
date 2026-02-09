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
          const CONTEST_TIMEOUT = 180000; // 3 分鐘（180000 ms）
          const now = Date.now();
          const filtered: Record<string, ContestState> = {};
          for (const [key, contest] of Object.entries(parsed)) {
            if (now - contest.timestamp < CONTEST_TIMEOUT) {
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
                // 如果 localStorage 中沒有記錄，確保狀態也是空的
                return {};
              }
              const latestParsed = JSON.parse(latestStored) as Record<string, ContestState>;
              // 清理過期的對抗檢定（超過 3 分鐘）
              const CONTEST_TIMEOUT = 180000; // 3 分鐘（180000 ms）
              const now = Date.now();
              const latestFiltered: Record<string, ContestState> = {};
              for (const [key, contest] of Object.entries(latestParsed)) {
                if (now - contest.timestamp < CONTEST_TIMEOUT) {
                  latestFiltered[key] = contest;
                }
              }
              // 修復：只在首次掛載時從 localStorage 恢復狀態
              // 如果當前狀態是空的（可能是 removePendingContest 剛剛清除的），
              // 且 localStorage 中還有記錄，則使用 localStorage 中的記錄
              // 但是，如果 removePendingContest 已經清除了 localStorage，latestFiltered 應該是空的
              // 所以這個邏輯應該不會導致問題
              if (Object.keys(currentState).length === 0 && Object.keys(latestFiltered).length > 0) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-contest-state.ts:96',message:'loadFromStorage 從 localStorage 恢復狀態（首次載入）',data:{currentStateKeys:Object.keys(currentState),latestFilteredKeys:Object.keys(latestFiltered)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                // #endregion
                return latestFiltered;
              }
              // 如果當前狀態不為空，保持當前狀態（可能是 removePendingContest 剛剛更新的）
              // 如果當前狀態是空的且 localStorage 也是空的，返回空對象（正常情況）
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
          // 如果 localStorage 中沒有記錄，確保狀態也是空的
          setPendingContests({});
        }
        // 標記為已載入
        hasLoadedFromStorageRef.current = true;
      } catch (error) {
        console.error('Failed to load contest state:', error);
        hasLoadedFromStorageRef.current = true;
      }
    };
    
    loadFromStorage();
    
    // 修復：移除 storage 事件監聽器，避免在 removePendingContest 清除狀態後重新恢復
    // 監聽 storage 事件，當其他標籤頁或代碼修改 localStorage 時，重新載入狀態
    // 但是，這可能導致在 removePendingContest 清除狀態後重新恢復狀態
    // 所以我們只在首次掛載時載入狀態，之後不再監聽 storage 事件
    // const handleStorageChange = (e: StorageEvent) => {
    //   if (e.key === storageKey) {
    //     loadFromStorage();
    //   }
    // };
    // 
    // window.addEventListener('storage', handleStorageChange);
    // return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]); // 當 storageKey 變化時重新載入

  // 保存狀態到 localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      if (Object.keys(pendingContests).length === 0) {
        // 修復：確保 localStorage 被清除，避免 loadFromStorage 重新恢復狀態
        localStorage.removeItem(storageKey);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-contest-state.ts:138',message:'清除 localStorage（pendingContests 為空）',data:{storageKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
      } else {
        localStorage.setItem(storageKey, JSON.stringify(pendingContests));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-contest-state.ts:142',message:'保存 pendingContests 到 localStorage',data:{storageKey,pendingContestsKeys:Object.keys(pendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-contest-state.ts:165',message:'removePendingContest 開始（使用 prev）',data:{sourceId,pendingContestsKeysBefore:Object.keys(prev),hasPendingInContestsBefore:sourceId in prev},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-contest-state.ts:167',message:'removePendingContest setState 回調',data:{sourceId,hasPendingInPrev:sourceId in prev,pendingContestsKeysPrev:Object.keys(prev)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      if (!(sourceId in prev)) {
        // 即使記錄在狀態中不存在，也要從 localStorage 中清除，避免重新整理後記錄恢復
        // 同時直接更新 React 狀態，確保立即同步
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
                // 直接更新 React 狀態，確保立即同步（不依賴 reloadTrigger）
                // 重要：返回更新後的狀態，確保 React 狀態與 localStorage 同步
                // 這樣可以避免 loadFromStorage 重新載入已刪除的記錄
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-contest-state.ts:202',message:'removePendingContest 刪除記錄後',data:{sourceId,hasPendingInNext:sourceId in next,pendingContestsKeysNext:Object.keys(next)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
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
        // 清理過期的對抗檢定（超過 3 分鐘）
        const CONTEST_TIMEOUT = 180000; // 3 分鐘（180000 ms）
        const now = Date.now();
        if (now - parsed.timestamp < CONTEST_TIMEOUT) {
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

