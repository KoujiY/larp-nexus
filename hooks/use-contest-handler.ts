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
  /** Phase 10: 清除 Dialog 狀態的回調（確保對抗結算後 dialogState 不殘留） */
  onClearDialogState?: () => void;
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
    onClearDialogState,
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

      // Phase 2: 優先使用 subType 判斷事件類型，向後兼容 attackerValue === 0 的邏輯
      const eventSubType = payload.subType;
      const isRequestEvent = eventSubType === 'request' || (!eventSubType && payload.attackerValue === 0);
      const isResultEvent = eventSubType === 'result' || (!eventSubType && payload.attackerValue !== 0);
      const isEffectEvent = eventSubType === 'effect';

      // 檢查是否是針對當前角色的對抗檢定（防守方）
      if (defenderIdStr === characterIdStr) {
        // 防守方處理邏輯
        if (isResultEvent) {
          // 這是結果事件，關閉 dialog 並清除持久化狀態
          // 通知會通過 character.affected 事件顯示（只有當有實際數值變化時）
          clearDefenderContest();
          onDefenderContestResult?.(payload);
        } else if (isRequestEvent) {
          // 這是請求事件，打開 dialog
          // Phase 7.6: 使用事件中的 contestId（如果有的話），否則重新生成
          // 優先使用事件中的 contestId，確保與攻擊方生成的一致
          const contestId = payload.contestId || (() => {
            // 如果事件中沒有 contestId，則重新生成（向後兼容）
            const sourceId = payload.itemId || payload.skillId || '';
            return `${payload.attackerId}::${sourceId}::${eventTimestamp}`;
          })();

          // 保存到持久化狀態
          setDefenderContest(contestId, payload);
          onDefenderContestRequest?.(payload);

          // 確保 dialog 打開後再顯示 toast
          // 防守方不應該看到技能或道具名稱（隱私保護）
          // Phase 7.6: 如果攻擊方有隱匿標籤，隱藏攻擊方名稱
          const attackerDisplayName = payload.sourceHasStealthTag ? '某人' : payload.attackerName;
          setTimeout(() => {
            toast.info(`${attackerDisplayName} 對你使用了技能或道具`, {
              description: '請選擇道具/技能回應',
              duration: 5000,
            });
          }, 100);
        }
        // 防守方忽略 effect 事件（這是給攻擊方的）
      } else if (attackerIdStr === characterIdStr) {
        // 攻擊方處理邏輯
        // 攻擊方應該忽略請求事件，只處理結果事件和效果事件
        
        // Phase 2: 處理效果事件（選擇目標道具後）
        if (isEffectEvent) {
          // 效果事件：顯示效果已執行的訊息
          const effectSourceId = payload.itemId || payload.skillId;
          // Phase 8: 在清除對抗檢定狀態之前，先確保 dialogOpen 狀態已更新為 false
          // 修復：直接調用 removePendingContest，它內部會先設置 dialogOpen 為 false 再刪除記錄
          // 這樣可以確保狀態更新的一致性，避免 React 狀態更新的異步性導致的問題
          if (effectSourceId) {
            removePendingContest(effectSourceId);
          }
          // Phase 10: 清除 dialogState（localStorage），避免重新開啟技能時仍顯示等待狀態
          onClearDialogState?.();

          toast.success('對抗檢定效果已執行', {
            description:
              payload.effectsApplied && payload.effectsApplied.length > 0
                ? `效果：${payload.effectsApplied.join('、')}`
                : undefined,
          });
          
          onAttackerContestResult?.(payload);
          return;
        }
        
        // Phase 2: 處理結果事件（防守方回應後）
        if (isResultEvent) {
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
              // Phase 8: 在清除對抗檢定狀態之前，先確保 dialogOpen 狀態已更新為 false
              // 修復：直接調用 removePendingContest，它內部會先設置 dialogOpen 為 false 再刪除記錄
              // 這樣可以確保狀態更新的一致性，避免 React 狀態更新的異步性導致的問題
              if (sourceId) {
                removePendingContest(sourceId);
              }
              // Phase 10: 清除 dialogState（localStorage），避免重新開啟道具時仍顯示等待狀態
              onClearDialogState?.();

              // 修復：不顯示 toast，因為 event-mappers.ts 已經會生成更詳細的「道具使用結果」通知
              // 這樣可以避免重複通知，只保留 event-mappers 生成的詳細通知
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
              // Phase 8: 在清除對抗檢定狀態之前，先確保 dialogOpen 狀態已更新為 false
              // 修復：直接調用 removePendingContest，它內部會先設置 dialogOpen 為 false 再刪除記錄
              // 這樣可以確保狀態更新的一致性，避免 React 狀態更新的異步性導致的問題
              if (sourceId) {
                removePendingContest(sourceId);
              }
              // Phase 10: 清除 dialogState（localStorage），避免重新開啟技能時仍顯示等待狀態
              onClearDialogState?.();

              // 修復：不顯示 toast，因為 event-mappers.ts 已經會生成更詳細的「技能使用結果」通知
              // 這樣可以避免重複通知，只保留 event-mappers 生成的詳細通知
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
      onClearDialogState,
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

