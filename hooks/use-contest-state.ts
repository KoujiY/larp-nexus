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

/**
 * Hook 用於管理對抗檢定狀態
 * 狀態會存儲到 localStorage，即使重新整理也會保留
 */
export function useContestState(characterId: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${characterId}`;

  const [pendingContests, setPendingContests] = useState<Record<string, ContestState>>({});

  // 從 localStorage 載入狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ContestState>;
        // 清理過期的對抗檢定（超過 1 小時）
        const now = Date.now();
        const filtered: Record<string, ContestState> = {};
        for (const [key, contest] of Object.entries(parsed)) {
          if (now - contest.timestamp < 3600000) { // 1 小時
            filtered[key] = contest;
          }
        }
        // 使用 setTimeout 避免同步 setState
        const timeoutId = setTimeout(() => {
          setPendingContests(filtered);
          if (Object.keys(filtered).length !== Object.keys(parsed).length) {
            localStorage.setItem(storageKey, JSON.stringify(filtered));
          }
        }, 0);
        return () => clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error('Failed to load contest state:', error);
    }
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
    setPendingContests((prev) => ({
      ...prev,
      [sourceId]: {
        sourceId,
        sourceType,
        contestId,
        timestamp: Date.now(),
      },
    }));
  }, []);

  // 移除正在進行的對抗檢定
  const removePendingContest = useCallback((sourceId: string) => {
    setPendingContests((prev) => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
  }, []);

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
      if (!(sourceId in prev)) return prev;
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
        // 清理過期的對抗檢定（超過 1 小時）
        const now = Date.now();
        if (now - parsed.timestamp < 3600000) { // 1 小時
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

