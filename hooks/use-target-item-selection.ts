/**
 * 目標道具選擇 Hook
 * 統一管理對抗檢定後選擇目標道具的邏輯
 * 
 * Phase 5: 提取目標道具選擇邏輯
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';
import { selectTargetItemForContest } from '@/app/actions/contest-select-item';
import { TARGET_ITEM_SELECTION_TIMEOUT, STORAGE_KEYS } from '@/lib/constants/contest';
import type { Skill, Item } from '@/types/character';

export interface UseTargetItemSelectionOptions {
  characterId: string;
  sourceType: 'skill' | 'item';
  dialogState: {
    type: 'target_item_selection';
    contestId: string;
    sourceType: 'skill' | 'item';
    sourceId: string;
    targetCharacterId?: string;
  } | null;
  items: Skill[] | Item[];
  selectedItem: Skill | Item | null;
  hasPendingContest: (sourceId: string) => boolean;
  pendingContests: Record<string, { contestId: string; sourceType: 'skill' | 'item' }>; // 修復：添加 pendingContests 以便直接檢查
  addPendingContest: (sourceId: string, sourceType: 'skill' | 'item', contestId: string) => void;
  removePendingContest: (sourceId: string) => void;
  updateContestDialog: (sourceId: string, dialogOpen: boolean, selectedTargetId?: string) => void;
  setTargetItemSelectionDialog: (contestId: string, sourceType: 'skill' | 'item', sourceId: string, targetCharacterId: string) => void;
  clearDialogState: () => void;
  isDialogForSource: (sourceId: string, sourceType: 'skill' | 'item') => boolean;
  onItemSelected: (item: Skill | Item | null) => void;
  onUseResultSet: (result: { success: boolean; message: string } | null) => void;
  onClearTargetState: () => void;
  onDismissToast?: () => void;
  onRouterRefresh?: () => void;
  onClearWaitingContest?: (sourceId: string) => void;
}

export interface UseTargetItemSelectionReturn {
  needsTargetItemSelection: {
    contestId: string;
    sourceId: string;
    defenderId: string;
  } | null;
  targetItemsForSelection: TargetItemInfo[];
  selectedTargetItemForContest: string;
  setSelectedTargetItemForContest: (id: string) => void;
  isLoadingTargetItemsForContest: boolean;
  isSelectingTargetItem: boolean;
  handleSelectTargetItem: () => Promise<void>;
  handleCancelSelection: () => void;
}

/**
 * 目標道具選擇 Hook
 */
export function useTargetItemSelection(options: UseTargetItemSelectionOptions): UseTargetItemSelectionReturn {
  const {
    characterId,
    sourceType,
    dialogState,
    items,
    selectedItem,
    hasPendingContest,
    pendingContests, // 修復：添加 pendingContests 以便直接檢查
    addPendingContest,
    removePendingContest,
    updateContestDialog,
    clearDialogState,
    isDialogForSource,
    onItemSelected,
    onClearTargetState,
    onRouterRefresh,
    onClearWaitingContest,
  } = options;

  // 獲取 storage key
  const getNeedsTargetItemSelectionKey = useCallback(() => {
    return sourceType === 'skill'
      ? STORAGE_KEYS.SKILL_NEEDS_TARGET_SELECTION(characterId)
      : STORAGE_KEYS.ITEM_NEEDS_TARGET_SELECTION(characterId);
  }, [characterId, sourceType]);

  // 需要選擇目標道具的狀態
  const [needsTargetItemSelection, setNeedsTargetItemSelection] = useState<{
    contestId: string;
    sourceId: string;
    defenderId: string;
  } | null>(null);
  
  // 修復：使用 useRef 追蹤最新的 needsTargetItemSelection 值，避免閉包問題
  const needsTargetItemSelectionRef = useRef(needsTargetItemSelection);
  useEffect(() => {
    needsTargetItemSelectionRef.current = needsTargetItemSelection;
  }, [needsTargetItemSelection]);

  // 修復：使用 useRef 追蹤最新的 pendingContests 值，避免閉包問題
  const pendingContestsRef = useRef(pendingContests);
  useEffect(() => {
    pendingContestsRef.current = pendingContests;
  }, [pendingContests]);

  // 目標道具選擇相關狀態
  const [targetItemsForSelection, setTargetItemsForSelection] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemForContest, setSelectedTargetItemForContest] = useState<string>('');
  const [isLoadingTargetItemsForContest, setIsLoadingTargetItemsForContest] = useState(false);
  const [isSelectingTargetItem, setIsSelectingTargetItem] = useState(false);

  // Phase 3: 從統一 Dialog 狀態恢復 needsTargetItemSelection
  // 使用 useRef 追蹤已處理的 dialogState，避免重複設置
  const processedDialogStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (dialogState?.type === 'target_item_selection' && dialogState.sourceType === sourceType) {
      // 生成唯一標識符
      const dialogStateKey = `${dialogState.contestId}-${dialogState.sourceId}-${dialogState.targetCharacterId}`;
      // 如果已經處理過這個 dialogState，跳過
      if (processedDialogStateRef.current === dialogStateKey) {
        return;
      }
      processedDialogStateRef.current = dialogStateKey;
      setNeedsTargetItemSelection({
        contestId: dialogState.contestId,
        sourceId: dialogState.sourceId,
        defenderId: dialogState.targetCharacterId || '',
      });
    } else if (!dialogState || dialogState.type !== 'target_item_selection') {
      // 如果 dialogState 被清除或不是目標道具選擇類型，重置追蹤
      processedDialogStateRef.current = null;
    }
  }, [dialogState, sourceType]);

  // 從 localStorage 恢復需要選擇目標道具的狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getNeedsTargetItemSelectionKey();
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { contestId: string; sourceId: string; defenderId: string; timestamp: number };
        // 檢查是否過期（超過 1 小時）
        const now = Date.now();
        if (now - parsed.timestamp < TARGET_ITEM_SELECTION_TIMEOUT && parsed.defenderId) {
          setNeedsTargetItemSelection({
            contestId: parsed.contestId,
            sourceId: parsed.sourceId,
            defenderId: parsed.defenderId,
          });
          // Phase 3: 注意：不應該在這裡調用 setTargetItemSelectionDialog，因為這會觸發 dialogState 更新
          // 而 dialogState 已經從 localStorage 恢復了，再次設置會導致循環觸發
          // 只有在 dialogState 不存在時才設置（但這種情況不應該發生，因為 dialogState 會自動從 localStorage 恢復）
          
          // 載入防守方的道具清單
          if (parsed.defenderId) {
            setIsLoadingTargetItemsForContest(true);
            getTargetCharacterItems(parsed.defenderId)
              .then((result) => {
                if (result.success && result.data) {
                  // Step 9.1: 即使道具為空，也設置空列表（不取消）
                  // 用戶點擊確認後，server 端會處理所有效果（steal 生成「無道具」訊息，stat_change 正常執行）
                  setTargetItemsForSelection(result.data);
                } else {
                  localStorage.removeItem(storageKey);
                  setNeedsTargetItemSelection(null);
                }
              })
              .catch((error) => {
                console.error('恢復時載入目標道具清單錯誤:', error);
                localStorage.removeItem(storageKey);
                setNeedsTargetItemSelection(null);
              })
              .finally(() => {
                setIsLoadingTargetItemsForContest(false);
              });
          } else {
            localStorage.removeItem(storageKey);
            setNeedsTargetItemSelection(null);
          }
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error(`[${sourceType}-list] 恢復需要選擇目標道具狀態失敗:`, error);
    }
  }, [getNeedsTargetItemSelectionKey, characterId, sourceType, removePendingContest]);

  // 載入目標角色的道具清單（當 needsTargetItemSelection 被設置時）
  // 使用 useRef 追蹤已經載入過的 defenderId，避免重複載入
  const loadedDefenderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!needsTargetItemSelection || !needsTargetItemSelection.defenderId) {
      // 如果 needsTargetItemSelection 被清除，重置追蹤狀態
      if (!needsTargetItemSelection) {
        loadedDefenderIdRef.current = null;
        setTargetItemsForSelection([]);
      }
      return;
    }
    
    // 如果已經載入過這個 defenderId，跳過
    const currentKey = `${needsTargetItemSelection.defenderId}-${needsTargetItemSelection.contestId}`;
    if (loadedDefenderIdRef.current === currentKey) {
      return;
    }
    
    // 標記為正在載入
    loadedDefenderIdRef.current = currentKey;
    setIsLoadingTargetItemsForContest(true);
    getTargetCharacterItems(needsTargetItemSelection.defenderId)
      .then((result) => {
        if (result.success && result.data) {
          setTargetItemsForSelection(result.data);
        } else {
          setTargetItemsForSelection([]);
        }
      })
      .catch((error) => {
        console.error(`[${sourceType}-list] 載入目標道具清單錯誤:`, error);
        setTargetItemsForSelection([]);
        // 載入失敗時重置追蹤狀態，允許重試
        loadedDefenderIdRef.current = null;
      })
      .finally(() => {
        setIsLoadingTargetItemsForContest(false);
      });
  }, [needsTargetItemSelection, sourceType]);

  // 保存需要選擇目標道具的狀態到 localStorage
  // 使用 useRef 追蹤上次保存的值，避免重複保存相同的值
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getNeedsTargetItemSelectionKey();
    try {
      if (needsTargetItemSelection) {
        // 比較值時排除 timestamp，因為每次保存都會更新 timestamp
        const stateKeyWithoutTimestamp = JSON.stringify({
          contestId: needsTargetItemSelection.contestId,
          sourceId: needsTargetItemSelection.sourceId,
          defenderId: needsTargetItemSelection.defenderId,
        });
        // 如果值沒有變化，跳過保存
        if (lastSavedRef.current === stateKeyWithoutTimestamp) {
          return;
        }
        lastSavedRef.current = stateKeyWithoutTimestamp;
        const stateToSave = {
          ...needsTargetItemSelection,
          timestamp: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
      } else {
        // 如果值已經被清除，也清除追蹤
        if (lastSavedRef.current !== null) {
          lastSavedRef.current = null;
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error(`[${sourceType}-list] 保存需要選擇目標道具狀態失敗:`, error);
    }
  }, [needsTargetItemSelection, getNeedsTargetItemSelectionKey, sourceType]);

  // Phase 8: 當恢復 needsTargetItemSelection 狀態時，自動打開對應的 dialog
  useEffect(() => {
    // 修復：使用 ref 檢查最新的 needsTargetItemSelection 值，避免閉包問題
    const currentNeedsTargetItemSelection = needsTargetItemSelectionRef.current;
    if (!currentNeedsTargetItemSelection) return;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:289',message:'useEffect 觸發，needsTargetItemSelection 存在（使用 ref）',data:{sourceId:currentNeedsTargetItemSelection.sourceId,hasPendingContest:hasPendingContest(currentNeedsTargetItemSelection.sourceId),hasPendingInContests:currentNeedsTargetItemSelection.sourceId in pendingContestsRef.current,pendingContestsKeys:Object.keys(pendingContestsRef.current)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    // 修復：如果 pendingContests 中沒有這個 item 的記錄，且 needsTargetItemSelection 仍然存在，才添加狀態
    // 這是為了防止在 cancelContestItemSelection 成功後，useEffect 重新添加狀態
    const sourceId = currentNeedsTargetItemSelection.sourceId;
    // 修復：使用 ref 檢查最新的 pendingContests 值，而不是閉包中的舊值
    const currentPendingContests = pendingContestsRef.current;
    const hasPendingInContests = sourceId in currentPendingContests;
    
    // 修復：如果 pendingContests 中沒有這個 item 的記錄，且 needsTargetItemSelection 仍然存在，才添加狀態
    // 但是，如果 pendingContests 剛剛被清除（從有變為沒有），說明對抗檢定已經被取消，不應該重新添加狀態
    // 使用 ref 檢查最新的 needsTargetItemSelection 值，避免閉包問題
    if (!hasPendingInContests) {
      // 修復：先檢查 needsTargetItemSelectionRef.current 是否仍然存在且對應的 sourceId 匹配
      // 如果 needsTargetItemSelectionRef.current 為 null 或 sourceId 不匹配，說明狀態已被清除，不應該重新添加狀態
      const currentNeedsTargetItemSelection = needsTargetItemSelectionRef.current;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:310',message:'useEffect 檢查 needsTargetItemSelectionRef',data:{sourceId,hasPendingInContests,currentNeedsTargetItemSelectionSourceId:currentNeedsTargetItemSelection?.sourceId,currentNeedsTargetItemSelectionIsNull:!currentNeedsTargetItemSelection},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      if (!currentNeedsTargetItemSelection || currentNeedsTargetItemSelection.sourceId !== sourceId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:300',message:'useEffect 跳過添加狀態，needsTargetItemSelection 已被清除（同步檢查）',data:{sourceId,currentNeedsTargetItemSelectionSourceId:currentNeedsTargetItemSelection?.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        return;
      }
      // 修復：檢查 needsTargetItemSelection 是否仍然存在（防止在異步操作中狀態已被清除）
      // 如果 needsTargetItemSelection 已經被清除，不應該重新添加狀態
      // 使用 setTimeout 確保在狀態更新後再檢查
      setTimeout(() => {
        // 修復：使用 ref 檢查最新的 needsTargetItemSelection 值，避免閉包問題
        const currentNeedsTargetItemSelection = needsTargetItemSelectionRef.current;
        if (!currentNeedsTargetItemSelection || currentNeedsTargetItemSelection.sourceId !== sourceId) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:300',message:'useEffect 跳過添加狀態，needsTargetItemSelection 已被清除',data:{sourceId,currentNeedsTargetItemSelectionSourceId:currentNeedsTargetItemSelection?.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          return;
        }
        
        // 如果 items 還沒有載入，等待載入完成
        if (!items || items.length === 0) {
          return;
        }
        
        // 找到對應的 item
        const item = items.find((i) => i.id === sourceId);
        if (!item) {
          // 如果找不到對應的 item，清除狀態
          console.warn(`[${sourceType}-list] 找不到對應的${sourceType === 'skill' ? '技能' : '道具'}，清除 needsTargetItemSelection 狀態:`, sourceId);
          setNeedsTargetItemSelection(null);
          return;
        }
        
        // 如果 dialog 還沒有打開，或者打開的不是這個 item，則打開它
        if (!selectedItem || selectedItem.id !== sourceId) {
          // 修復：再次檢查 needsTargetItemSelectionRef.current 是否仍然存在，防止在異步操作中狀態已被清除
          const finalNeedsTargetItemSelection = needsTargetItemSelectionRef.current;
          if (!finalNeedsTargetItemSelection || finalNeedsTargetItemSelection.sourceId !== sourceId) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:357',message:'useEffect 跳過添加狀態，needsTargetItemSelection 已被清除（異步檢查）',data:{sourceId,finalNeedsTargetItemSelectionSourceId:finalNeedsTargetItemSelection?.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            return;
          }
          
          // 設置選中的 item，這會自動打開 dialog
          onItemSelected(item);
          
          // 確保對抗檢定狀態已設置（從 pendingContests 恢復）
          // 修復：使用 ref 檢查最新的 pendingContests 值，而不是閉包中的舊值
          const currentPendingContests = pendingContestsRef.current;
          const hasPendingInCurrentContests = sourceId in currentPendingContests;
          if (!hasPendingInCurrentContests) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:313',message:'useEffect 準備添加對抗檢定狀態',data:{sourceId,contestId:finalNeedsTargetItemSelection.contestId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            // Phase 1: 使用統一的 contestId 解析工具
            import('@/lib/contest/contest-id').then(({ parseContestId }) => {
              // 修復：再次檢查 needsTargetItemSelectionRef.current 是否仍然存在，防止在異步操作中狀態已被清除
              const asyncNeedsTargetItemSelection = needsTargetItemSelectionRef.current;
              if (!asyncNeedsTargetItemSelection || asyncNeedsTargetItemSelection.sourceId !== sourceId) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:368',message:'useEffect 跳過添加狀態，needsTargetItemSelection 已被清除（動態導入後檢查）',data:{sourceId,asyncNeedsTargetItemSelectionSourceId:asyncNeedsTargetItemSelection?.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                return;
              }
              const parsed = parseContestId(asyncNeedsTargetItemSelection.contestId);
              if (parsed) {
                // 修復：再次檢查 pendingContestsRef.current，確保狀態沒有被清除
                const finalPendingContests = pendingContestsRef.current;
                if (sourceId in finalPendingContests) {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:375',message:'useEffect 跳過添加狀態，pendingContests 中已存在',data:{sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                  // #endregion
                  updateContestDialog(sourceId, false);
                  return;
                }
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:318',message:'useEffect 調用 addPendingContest',data:{sourceId,contestId:asyncNeedsTargetItemSelection.contestId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                addPendingContest(sourceId, sourceType, asyncNeedsTargetItemSelection.contestId);
              }
              // Phase 8: 關閉等待 dialog（設置 dialogOpen 為 false），因為現在要顯示道具選擇 dialog
              updateContestDialog(sourceId, false);
            });
          } else {
            // 如果已經有對抗檢定狀態，關閉等待 dialog（因為現在要顯示道具選擇 dialog）
            updateContestDialog(sourceId, false);
          }
        }
      }, 0);
      return;
    }
    
    // 如果 items 還沒有載入，等待載入完成
    if (!items || items.length === 0) {
      return;
    }
    
    // 修復：再次檢查 needsTargetItemSelectionRef.current，確保狀態沒有被清除
    const finalNeedsTargetItemSelection = needsTargetItemSelectionRef.current;
    if (!finalNeedsTargetItemSelection || finalNeedsTargetItemSelection.sourceId !== sourceId) {
      return;
    }
    
    // 找到對應的 item
    const item = items.find((i) => i.id === finalNeedsTargetItemSelection.sourceId);
    if (!item) {
      // 如果找不到對應的 item，清除狀態
      console.warn(`[${sourceType}-list] 找不到對應的${sourceType === 'skill' ? '技能' : '道具'}，清除 needsTargetItemSelection 狀態:`, finalNeedsTargetItemSelection.sourceId);
      setNeedsTargetItemSelection(null);
      return;
    }
    
    // 如果 dialog 還沒有打開，或者打開的不是這個 item，則打開它
    if (!selectedItem || selectedItem.id !== finalNeedsTargetItemSelection.sourceId) {
      // 設置選中的 item，這會自動打開 dialog
      onItemSelected(item);
      
      // 如果已經有對抗檢定狀態，關閉等待 dialog（因為現在要顯示道具選擇 dialog）
      updateContestDialog(finalNeedsTargetItemSelection.sourceId, false);
    }
  }, [needsTargetItemSelection, items, selectedItem, hasPendingContest, addPendingContest, updateContestDialog, onItemSelected, sourceType]);

  // 處理選擇目標道具
  const handleSelectTargetItem = useCallback(async () => {
    if (!needsTargetItemSelection) return;
    
    // Step 9.1: 目標沒有道具時，仍呼叫 selectTargetItemForContest（傳空 targetItemId）
    // 執行所有效果（steal 產生「無道具」訊息，stat_change 正常執行），不再取消對抗
    if (!selectedTargetItemForContest && targetItemsForSelection.length === 0) {
      setIsSelectingTargetItem(true);
      try {
        const result = await selectTargetItemForContest(
          needsTargetItemSelection.contestId,
          characterId,
          '', // 空 targetItemId — 目標無道具
          needsTargetItemSelection.defenderId,
          needsTargetItemSelection.sourceId,
          sourceType
        );
        
        if (result.success) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:340',message:'cancelContestItemSelection 成功，準備清除狀態',data:{sourceIdToClear:needsTargetItemSelection.sourceId,hasPendingContestBefore:hasPendingContest(needsTargetItemSelection.sourceId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          toast.success(result.message || '效果已執行');
          // 清除狀態
          loadedDefenderIdRef.current = null;
          setNeedsTargetItemSelection(null);
          setSelectedTargetItemForContest('');
          setTargetItemsForSelection([]);
          // Phase 3: 清除統一的 Dialog 狀態
          if (isDialogForSource(needsTargetItemSelection.sourceId, sourceType)) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:349',message:'清除統一的 Dialog 狀態',data:{sourceId:needsTargetItemSelection.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            clearDialogState();
          }
          // 修復：先清除 needsTargetItemSelection 狀態，避免 useEffect 重新添加對抗狀態
          // 使用 sourceId 的副本，避免閉包問題
          const sourceIdToClear = needsTargetItemSelection.sourceId;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:352',message:'準備清除對抗檢定狀態',data:{sourceId:sourceIdToClear,hasPendingContestBefore:hasPendingContest(sourceIdToClear),needsTargetItemSelectionSourceId:needsTargetItemSelection.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // 修復：先清除 needsTargetItemSelection 狀態，避免 useEffect 重新添加對抗狀態
          setNeedsTargetItemSelection(null);
          // 修復：確保對抗狀態被清除，即使 hasPendingContest 在閉包中使用了舊值
          // 直接調用 removePendingContest，不依賴 WebSocket 事件
          // 修復：確保即使 pendingContests 中沒有這個 sourceId，也要嘗試清除（防止狀態不一致）
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:365',message:'調用 removePendingContest 前',data:{sourceId:sourceIdToClear,hasPendingInContestsBefore:sourceIdToClear in pendingContests,pendingContestsKeysBefore:Object.keys(pendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          removePendingContest(sourceIdToClear);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:368',message:'調用 removePendingContest 後',data:{sourceId:sourceIdToClear,hasPendingInContestsAfter:sourceIdToClear in pendingContests,pendingContestsKeysAfter:Object.keys(pendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // 修復：再次檢查並清除，確保狀態被清除（防止閉包問題）
          // 使用 setTimeout 確保狀態更新後再檢查
          setTimeout(() => {
            // 修復：使用 ref 獲取最新的 pendingContests 值，而不是閉包中的舊值
            const currentPendingContests = pendingContestsRef.current;
            const hasPendingInContests = sourceIdToClear in currentPendingContests;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:373',message:'setTimeout 0ms 檢查（使用 ref）',data:{sourceId:sourceIdToClear,hasPendingInContests,pendingContestsKeys:Object.keys(currentPendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            if (hasPendingInContests) {
              removePendingContest(sourceIdToClear);
            }
          }, 0);
          // 清除 waitingContestRef（如果提供了回調）
          if (onClearWaitingContest) {
            onClearWaitingContest(sourceIdToClear);
          }
          // 清除目標選擇狀態
          onClearTargetState();
          // 關閉 dialog
          setTimeout(() => {
            onItemSelected(null);
          }, 0);
          // 刷新頁面資料
          if (onRouterRefresh) {
            onRouterRefresh();
          }
          // 修復：確保對抗狀態被清除，即使 hasPendingContest 在閉包中使用了舊值
          // 使用 setTimeout 確保狀態更新後再檢查
          setTimeout(() => {
            // 修復：使用 ref 獲取最新的 pendingContests 值，而不是閉包中的舊值
            const currentPendingContests = pendingContestsRef.current;
            const hasPendingInContests = sourceIdToClear in currentPendingContests;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-target-item-selection.ts:353',message:'對抗檢定狀態已清除（延遲檢查，使用 ref）',data:{sourceId:sourceIdToClear,hasPendingContestAfter:hasPendingInContests,hasPendingInContestsAfter:hasPendingInContests,pendingContestsKeysAfter:Object.keys(currentPendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            // 修復：如果狀態仍然存在，再次清除
            if (hasPendingInContests) {
              removePendingContest(sourceIdToClear);
            }
          }, 100);
        } else {
          toast.error(result.message || '效果執行失敗');
        }
      } catch (error) {
        console.error(`[${sourceType}-list] 對抗效果執行錯誤:`, error);
        toast.error('效果執行時發生錯誤');
      } finally {
        setIsSelectingTargetItem(false);
      }
      return;
    }
    
    // 如果有選擇道具，執行選擇
    if (!selectedTargetItemForContest) {
      toast.warning('請選擇目標道具');
      return;
    }
    
    setIsSelectingTargetItem(true);
    try {
      const result = await selectTargetItemForContest(
        needsTargetItemSelection.contestId,
        characterId,
        selectedTargetItemForContest,
        needsTargetItemSelection.defenderId, // 傳遞 defenderId，以防服務器端記錄丟失
        needsTargetItemSelection.sourceId, // 傳入防守方的技能/道具 ID（當防守方選擇時）
        sourceType // 傳入防守方的技能/道具類型（當防守方選擇時）
      );
      
      if (result.success) {
        toast.success(result.message || '目標道具選擇成功');
        // 清除狀態
        setNeedsTargetItemSelection(null);
        setSelectedTargetItemForContest('');
        setTargetItemsForSelection([]);
        // Phase 3: 清除統一的 Dialog 狀態
        if (isDialogForSource(needsTargetItemSelection.sourceId, sourceType)) {
          clearDialogState();
        }
        // 清除對抗檢定狀態
        removePendingContest(needsTargetItemSelection.sourceId);
        // 清除 waitingContestRef（如果提供了回調）
        if (onClearWaitingContest) {
          onClearWaitingContest(needsTargetItemSelection.sourceId);
        }
        // 清除目標選擇狀態
        onClearTargetState();
        // 關閉 dialog
        setTimeout(() => {
          onItemSelected(null);
        }, 0);
        // 刷新頁面資料
        if (onRouterRefresh) {
          onRouterRefresh();
        }
      } else {
        toast.error(result.message || '選擇目標道具失敗');
      }
    } catch (error) {
      console.error(`[${sourceType}-list] 選擇目標道具錯誤:`, error);
      toast.error('選擇目標道具時發生錯誤');
    } finally {
      setIsSelectingTargetItem(false);
    }
  }, [characterId, clearDialogState, hasPendingContest, isDialogForSource, needsTargetItemSelection, onClearTargetState, onClearWaitingContest, onItemSelected, onRouterRefresh, pendingContests, removePendingContest, selectedTargetItemForContest, sourceType, targetItemsForSelection.length]);

  // 處理取消選擇
  const handleCancelSelection = useCallback(async () => {
    if (!needsTargetItemSelection) return;
    
    // 保存需要清除的信息（避免異步操作時狀態變化）
    const sourceIdToClear = needsTargetItemSelection.sourceId;
    const contestIdToClear = needsTargetItemSelection.contestId;
    
    // 清除客戶端狀態
    loadedDefenderIdRef.current = null;
    setNeedsTargetItemSelection(null);
    setSelectedTargetItemForContest('');
    setTargetItemsForSelection([]);
    
    // Phase 3: 清除統一的 Dialog 狀態
    if (isDialogForSource(sourceIdToClear, sourceType)) {
      clearDialogState();
    }
    
    // 清除服務器端對抗檢定狀態
    try {
      const { cancelContestItemSelection } = await import('@/app/actions/contest-cancel');
      await cancelContestItemSelection(contestIdToClear, characterId);
    } catch (error) {
      console.error('取消對抗檢定失敗:', error);
      // 即使服務器端清除失敗，也繼續清除客戶端狀態
    }
    
    // 清除客戶端對抗檢定狀態
    removePendingContest(sourceIdToClear);
    
    // 清除 waitingContestRef（如果提供了回調）
    if (onClearWaitingContest) {
      onClearWaitingContest(sourceIdToClear);
    }
    
    onClearTargetState();
  }, [needsTargetItemSelection, characterId, isDialogForSource, clearDialogState, removePendingContest, onClearTargetState, onClearWaitingContest, sourceType]);

  return {
    needsTargetItemSelection,
    targetItemsForSelection,
    selectedTargetItemForContest,
    setSelectedTargetItemForContest,
    isLoadingTargetItemsForContest,
    isSelectingTargetItem,
    handleSelectTargetItem,
    handleCancelSelection,
  };
}

