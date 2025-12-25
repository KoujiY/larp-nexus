/**
 * 對抗檢定處理 Hook
 * 從 character-card-view.tsx 提取
 * 
 * 職責：
 * - 處理對抗檢定請求事件（防守方）
 * - 處理對抗檢定結果事件（攻擊方/防守方）
 * - 管理對抗檢定狀態持久化
 * - 處理跨分頁切換邏輯
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import type { SkillContestEvent } from '@/types/event';
import { useDefenderContestState, useContestState } from '@/hooks/use-contest-state';

export interface UseContestHandlerOptions {
  characterId: string;
  onTabChange?: (tab: string) => void;
  onDefenderContestRequest?: (event: SkillContestEvent['payload']) => void;
  onDefenderContestResult?: (event: SkillContestEvent['payload']) => void;
  onAttackerContestResult?: (event: SkillContestEvent['payload']) => void;
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
    onTabChange,
    onDefenderContestRequest,
    onDefenderContestResult,
    onAttackerContestResult,
  } = options;

  const { setDefenderContest, clearDefenderContest } = useDefenderContestState(characterId);
  const { pendingContests, removePendingContest } = useContestState(characterId);

  /**
   * 處理對抗檢定事件
   */
  const handleContestEvent = useCallback(
    (payload: SkillContestEvent['payload'], eventTimestamp: number) => {
      // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);

      // 檢查是否是針對當前角色的對抗檢定（防守方）
      if (defenderIdStr === characterIdStr) {
        // 防守方處理邏輯
        // 請求事件的 attackerValue 為 0（佔位符），結果事件會包含真實數值（不為 0）
        const isResultEvent = payload.attackerValue !== 0;

        if (isResultEvent) {
          // 這是結果事件，關閉 dialog 並清除持久化狀態
          // 通知會通過 character.affected 事件顯示（只有當有實際數值變化時）
          clearDefenderContest();
          onDefenderContestResult?.(payload);
        } else {
          // 這是請求事件，打開 dialog
          // 創建對抗請求 ID（格式：attackerId::skillId/itemId::timestamp）
          const sourceId = payload.itemId || payload.skillId || '';
          const contestId = `${payload.attackerId}::${sourceId}::${eventTimestamp}`;

          // 保存到持久化狀態
          setDefenderContest(contestId, payload);
          onDefenderContestRequest?.(payload);

          // 確保 dialog 打開後再顯示 toast
          // 防守方不應該看到技能或道具名稱（隱私保護）
          setTimeout(() => {
            toast.info(`${payload.attackerName} 對你使用了技能或道具`, {
              description: '請選擇道具/技能回應',
              duration: 5000,
            });
          }, 100);
        }
      } else if (attackerIdStr === characterIdStr) {
        // 攻擊方處理邏輯
        // 攻擊方應該忽略請求事件（attackerValue === 0），只處理結果事件
        if (payload.attackerValue !== 0) {
          // Phase 8: 當收到對抗檢定結果時，自動切換到對應的分頁並處理結果
          // 這樣無論用戶在哪個分頁，都能正確接收回應並開啟對應的面板
          if (payload.sourceType === 'item' && payload.itemId) {
            // 切換到道具分頁
            onTabChange?.('items');

            // Phase 8: 在全局監聽器中處理道具類型的對抗檢定結果
            const needsTargetItemSelection = payload.needsTargetItemSelection === true;
            const sourceId = payload.itemId;

            if (needsTargetItemSelection && payload.result === 'attacker_wins') {
              // 需要選擇目標道具，保持對抗檢定狀態，讓 item-list.tsx 處理
              // 狀態已經在 pendingContests 中，item-list.tsx 會通過 useEffect 檢測並打開 dialog

              // Phase 8: 將狀態保存到 localStorage，確保無論在哪個分頁都能正確處理
              // 使用與 item-list.tsx 相同的 key 格式
              if (typeof window !== 'undefined') {
                try {
                  const storageKey = `item-needs-target-selection-${characterId}`;
                  const stateToSave = {
                    contestId:
                      pendingContests[sourceId]?.contestId ||
                      `${String(characterId)}::${sourceId}::${Date.now()}`,
                    itemId: sourceId,
                    defenderId: String(payload.defenderId),
                    timestamp: Date.now(),
                  };
                  localStorage.setItem(storageKey, JSON.stringify(stateToSave));
                } catch (error) {
                  console.error('[use-contest-handler] 保存道具對抗檢定狀態失敗:', error);
                }
              }

              // 不顯示 toast，讓 item-list.tsx 處理
            } else {
              // 不需要選擇目標道具，清除對抗檢定狀態
              if (sourceId) {
                removePendingContest(sourceId);
              }

              // 顯示結果 toast
              const resultText =
                payload.result === 'attacker_wins'
                  ? '攻擊方獲勝'
                  : payload.result === 'defender_wins'
                    ? '防守方獲勝'
                    : '雙方平手';
              toast.success(`對抗檢定結果：${resultText}`, {
                description:
                  payload.effectsApplied && payload.effectsApplied.length > 0
                    ? `效果：${payload.effectsApplied.join('、')}`
                    : undefined,
              });
            }

            onAttackerContestResult?.(payload);
            return;
          }

          // Phase 8: 處理技能類型的對抗檢定
          if (payload.sourceType === 'skill' && payload.skillId) {
            // 切換到技能分頁
            onTabChange?.('skills');

            // Phase 8: 在全局監聽器中處理技能類型的對抗檢定結果
            const needsTargetItemSelection = payload.needsTargetItemSelection === true;
            const sourceId = payload.skillId;

            if (needsTargetItemSelection && payload.result === 'attacker_wins') {
              // 需要選擇目標道具，保持對抗檢定狀態，讓 skill-list.tsx 處理
              // 狀態已經在 pendingContests 中，skill-list.tsx 會通過 useEffect 檢測並打開 dialog

              // Phase 8: 將狀態保存到 localStorage，確保無論在哪個分頁都能正確處理
              // 使用與 skill-list.tsx 相同的 key 格式
              if (typeof window !== 'undefined') {
                try {
                  const storageKey = `skill-needs-target-selection-${characterId}`;
                  const stateToSave = {
                    contestId:
                      pendingContests[sourceId]?.contestId ||
                      `${String(characterId)}::${sourceId}::${Date.now()}`,
                    skillId: sourceId,
                    defenderId: String(payload.defenderId),
                    timestamp: Date.now(),
                  };
                  localStorage.setItem(storageKey, JSON.stringify(stateToSave));
                } catch (error) {
                  console.error('[use-contest-handler] 保存技能對抗檢定狀態失敗:', error);
                }
              }

              // 不顯示 toast，讓 skill-list.tsx 處理
            } else {
              // 不需要選擇目標道具，清除對抗檢定狀態
              if (sourceId) {
                removePendingContest(sourceId);
              }

              // 顯示結果 toast
              const resultText =
                payload.result === 'attacker_wins'
                  ? '攻擊方獲勝'
                  : payload.result === 'defender_wins'
                    ? '防守方獲勝'
                    : '雙方平手';
              toast.success(`對抗檢定結果：${resultText}`, {
                description:
                  payload.effectsApplied && payload.effectsApplied.length > 0
                    ? `效果：${payload.effectsApplied.join('、')}`
                    : undefined,
              });
            }

            onAttackerContestResult?.(payload);
          }
        }
      }
    },
    [
      characterId,
      onTabChange,
      onDefenderContestRequest,
      onDefenderContestResult,
      onAttackerContestResult,
      setDefenderContest,
      clearDefenderContest,
      pendingContests,
      removePendingContest,
    ]
  );

  return {
    handleContestEvent,
  };
}

