'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Zap } from 'lucide-react';
import type { Item, Skill } from '@/types/character';
import { getTransferTargets, getTargetCharacterItems, type TransferTargetCharacter } from '@/app/actions/public';
import { useTargetSelection } from '@/hooks/use-target-selection';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import { useContestStateRestore } from '@/hooks/use-contest-state-restore';
import { TargetItemSelectionDialog } from './target-item-selection-dialog';
import { useItemUsage } from '@/hooks/use-item-usage';
import { usePostUseTargetItemSelection } from '@/hooks/use-post-use-target-item-selection';
import { useContestableItemUsage } from '@/hooks/use-contestable-item-usage';
import { CONTEST_TIMEOUT, STORAGE_KEYS } from '@/lib/constants/contest';
import { canUseItem as canUseItemBase, getCooldownRemaining } from '@/lib/utils/item-validators';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import type { ItemListProps } from '@/types/item-list';
import { recordItemView, showcaseItem } from '@/app/actions/item-showcase';
import { ItemCard } from './item-card';
import { ItemDetailDialog } from './item-detail-dialog';
import { ItemTransferDialog } from './item-transfer-dialog';
import { ItemShowcaseSelectDialog } from './item-showcase-select-dialog';

export function ItemList({ items, characterId, gameId, characterName, randomContestMaxValue = 100, isReadOnly = false, onUseItem, onTransferItem }: ItemListProps) {
  // Phase 10.5.4: 唯讀模式下隱藏所有互動按鈕（使用、展示、轉移）

  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  // 用於實時更新冷卻倒數的時間戳
  const [, setTick] = useState(0);
  
  // Phase 8: 對抗檢定狀態管理
  const { addPendingContest, removePendingContest, hasPendingContest, updateContestDialog, pendingContests } = useContestState(characterId);
  
  // 修復：使用 useRef 追蹤最新的 pendingContests 值，避免閉包問題
  const pendingContestsRef = useRef(pendingContests);
  useEffect(() => {
    pendingContestsRef.current = pendingContests;
  }, [pendingContests]);

  // 修復：使用 useRef 追蹤最新的 selectedItem 值，避免 WebSocket handler 中的閉包問題
  const selectedItemRef = useRef<Item | null>(selectedItem);
  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);
  
  // Phase 3: 使用統一的 Dialog 狀態管理
  const { dialogState, clearDialogState, isDialogForSource } = useContestDialogState(characterId);
  
  // 轉移相關狀態
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferTargets, setTransferTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferItem, setTransferItem] = useState<Item | null>(null); // 用於轉移對話框的道具引用

  // Phase 7.7: 展示相關狀態
  const [isShowcaseSelectOpen, setIsShowcaseSelectOpen] = useState(false);
  const [showcaseTargets, setShowcaseTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedShowcaseTargetId, setSelectedShowcaseTargetId] = useState<string>('');
  const [isLoadingShowcaseTargets, setIsLoadingShowcaseTargets] = useState(false);
  const [isShowcasing, setIsShowcasing] = useState(false);
  const [itemToShowcase, setItemToShowcase] = useState<Item | null>(null);

  // Phase 3.3: 使用 useTargetSelection Hook 管理目標選擇
  // Phase 8: 使用道具時的目標選擇狀態（包含檢定類型）
  // 重構：支援多個效果
  const effects = selectedItem ? getItemEffects(selectedItem) : [];
  const requiresTarget = Boolean(
    selectedItem?.checkType === 'contest' ||
    selectedItem?.checkType === 'random_contest' ||
    effects.some((effect) => effect.requiresTarget)
  );
  const targetType = (selectedItem?.checkType === 'contest' || selectedItem?.checkType === 'random_contest')
    ? 'other' // 對抗檢定只能對其他角色使用
    : effects.find((e) => e.requiresTarget)?.targetType;

  const {
    selectedTargetId: selectedUseTargetId,
    setSelectedTargetId: setSelectedUseTargetId,
    targetOptions: useTargets,
    isLoading: isLoadingUseTargets,
    isTargetConfirmed,
    setIsTargetConfirmed,
    targetItems,
    setTargetItems,
    selectedTargetItemId,
    setSelectedTargetItemId,
    isLoadingTargetItems,
    setIsLoadingTargetItems,
    clearTargetState,
    saveTargetState,
    restoreTargetState,
  } = useTargetSelection({
    characterId,
    sourceId: selectedItem?.id || '',
    sourceType: 'item',
    gameId,
    characterName,
    requiresTarget,
    targetType,
    enabled: !!selectedItem,
    effects,
    selectedSource: selectedItem,
  });

  // 追蹤之前的 pendingContests 狀態，用於檢測對抗檢定是否被移除
  const prevPendingContestsRef = useRef<typeof pendingContests>({});

  // 追蹤是否正在關閉 dialog，避免重複處理導致無限循環
  const isClosingDialogRef = useRef<string | null>(null);
  
  // 追蹤正在等待回應的 contest（同步標記，用於 handleCloseDialog 檢查）
  const waitingContestRef = useRef<Set<string>>(new Set());
  
  // Phase 6.4: 使用 ref 存儲 handleCloseDialog，以便在 useItemUsage 中使用
  const handleCloseDialogRef = useRef<(() => void) | null>(null);
  
  // 當 selectedItem 變為 null 時，清除關閉標記
  useEffect(() => {
    if (!selectedItem && isClosingDialogRef.current) {
      isClosingDialogRef.current = null;
    }
  }, [selectedItem]);

  // Phase 4.3: 使用 useContestStateRestore Hook 管理對抗檢定狀態恢復
  // 清除目標狀態的回調（基礎版本，不包含 checkResult）
  const handleClearTargetStateBase = useCallback(() => {
    setSelectedUseTargetId(undefined);
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    // Phase 3.3: targetItems 由 hook 管理，不需要手動清除
    // 同時清除 localStorage，避免下次開啟 dialog 時恢復舊狀態
    clearTargetState();
  }, [setSelectedUseTargetId, setIsTargetConfirmed, setSelectedTargetItemId, clearTargetState]);

  // 顯示 toast 的回調
  const handleToastShow = useCallback((message: string, options?: { duration?: number }) => {
    return toast.info(message, {
      duration: options?.duration || 5000,
    });
  }, []);

  // 非對抗偷竊/移除：使用成功後的目標道具選擇
  const postUseSelection = usePostUseTargetItemSelection({
    onComplete: () => {
      // 直接關閉 dialog，不經過 handleCloseDialog（因為 React batched state 導致
      // postUseSelection.selectionState 尚未清除，handleCloseDialog 的 protection check 會擋住關閉）
      setSelectedItem(null);
      setCheckResult(undefined);
      setUseResult(null);
      setSelectedUseTargetId(undefined);
      setIsTargetConfirmed(false);
      setSelectedTargetItemId('');
    },
    onRouterRefresh: () => router.refresh(),
  });

  // 包裝 setSelectedItem 以符合 hook 的類型要求
  const handleItemSelected = useCallback((item: Skill | Item | null) => {
    // 如果嘗試關閉 dialog（item 為 null），但正在進行對抗檢定，則不關閉
    if (!item && selectedItem) {
      const hasPending = hasPendingContest(selectedItem.id);
      const isAttackerWaiting = dialogState?.type === 'attacker_waiting' &&
                                dialogState.sourceType === 'item' &&
                                dialogState.sourceId === selectedItem.id;
      const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
      const isPostUseSelecting = postUseSelection.selectionState?.sourceId === selectedItem.id;

      if (hasPending || isAttackerWaiting || isWaitingInRef || isPostUseSelecting) {
        return; // 不關閉 dialog
      }
    }
    setSelectedItem(item as Item | null);
  }, [selectedItem, hasPendingContest, dialogState, postUseSelection.selectionState?.sourceId]);

  // Phase 8.3: 使用 ref 存儲 handleContestStarted，以便在 onSuccess 回調中使用
  const handleContestStartedRef = useRef<((contestId: string, message?: string) => void) | null>(null);

  // 檢查是否有任何道具在冷卻中
  const hasAnyCooldown = items?.some((item) => {
    if (!item.cooldown || item.cooldown <= 0 || !item.lastUsedAt) return false;
    const lastUsed = new Date(item.lastUsedAt).getTime();
    const cooldownMs = item.cooldown * 1000;
    return Date.now() - lastUsed < cooldownMs;
  });

  // 每秒更新一次（僅當有道具在冷卻中時）
  useEffect(() => {
    if (!hasAnyCooldown) return;
    
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasAnyCooldown]);

  // 檢查道具是否可使用（包含對抗檢定檢查）
  const canUseItem = (item: Item): { canUse: boolean; reason?: string } => {
    // Phase 8: 檢查是否有正在進行的對抗檢定
    // 修復：直接檢查 pendingContests 對象，而不是依賴 hasPendingContest（可能存在閉包問題）
    const hasPendingInContests = item.id in pendingContests;
    // 修復：使用直接檢查的結果，而不是閉包中的舊值
    if (hasPendingInContests) {
      return { canUse: false, reason: '對抗檢定進行中' };
    }

    // 使用基礎驗證函數檢查其他條件
    return canUseItemBase(item);
  };

  // Phase 4.3: 狀態恢復邏輯已由 useContestStateRestore Hook 處理

  // Phase 9 重構：目標道具選擇 dialog 本地狀態（與 skill-list.tsx 統一架構）
  const [targetItemSelectionDialog, setTargetItemSelectionDialogLocalState] = useState<{
    open: boolean;
    contestId: string;
    defenderId: string;
    sourceId: string;
  } | null>(null);

  // Phase 6.4: 使用 useItemUsage Hook 管理道具使用
  const {
    isUsing,
    checkResult,
    useResult,
    handleUseItem,
    setUseResult,
    setCheckResult,
  } = useItemUsage({
    selectedItem,
    selectedTargetId: selectedUseTargetId,
    selectedTargetItemId,
    requiresTarget,
    onUseItem: onUseItem || (async () => ({ success: false, message: 'onUseItem 未定義' })),
    onSuccess: (result) => {
      // Phase 8.3: 使用統一的對抗檢定處理邏輯
      if (result.data?.contestId && selectedItem && handleContestStartedRef.current) {
        // 立即標記正在等待回應（同步標記，用於 handleCloseDialog 檢查）
        waitingContestRef.current.add(selectedItem.id);
        handleContestStartedRef.current(result.data.contestId, result.message);
        // 不關閉 dialog，讓用戶看到等待狀態
      }
    },
    onClearTargetState: () => {
      handleClearTargetStateBase();
      setCheckResult(undefined);
    },
    onRouterRefresh: () => router.refresh(),
    onCloseDialog: () => {
      if (handleCloseDialogRef.current) {
        handleCloseDialogRef.current();
      }
    },
    onNeedsTargetItemSelection: (info) => {
      // 非對抗偷竊/移除：使用成功後觸發目標道具選擇流程
      postUseSelection.startSelection({
        ...info,
        sourceType: 'item',
        characterId,
      });
    },
  });

  // Phase 8.3: 使用 useContestableItemUsage Hook（需要在 useItemUsage 之後，因為需要 setUseResult）
  const { handleContestStarted } = useContestableItemUsage({
    characterId,
    sourceType: 'item',
    sourceId: selectedItem?.id || '',
    selectedTargetId: selectedUseTargetId,
    setUseResult,
  });

  // Phase 8.3: 更新 ref，確保 handleContestStarted 可以在 onSuccess 回調中使用
  useEffect(() => {
    handleContestStartedRef.current = handleContestStarted;
  }, [handleContestStarted]);

  // Phase 6.4: 創建 handleCloseDialog（需要在 useItemUsage 之後，因為需要 setCheckResult 和 setUseResult）
  /**
   * 關閉道具 Dialog
   * @param options.force 強制關閉，跳過對抗檢定進行中的檢查。
   *   用於 WebSocket handler 已確認對抗檢定結束後呼叫，因為 React 批次更新導致
   *   dialogState / pendingContests 尚未同步到當前 render，guard 會誤判為仍在進行中。
   */
  const handleCloseDialog = useCallback((options?: { force?: boolean }) => {
    // Phase 8: 清除 dialog 狀態（如果有 pending contest）
    if (selectedItem) {
      if (!options?.force) {
        const hasPending = hasPendingContest(selectedItem.id);
        // Phase 8: 檢查 dialogState 是否為 attacker_waiting（因為 addPendingContest 的狀態更新是異步的）
        const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && dialogState.sourceType === 'item' && dialogState.sourceId === selectedItem.id;
        // Phase 8: 檢查 ref 中是否有正在等待的 contest（同步檢查）
        const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
        // Phase 8: 如果有正在進行的對抗檢定（通過 pendingContests、dialogState 或 ref 判斷），不應該關閉 dialog
        if (hasPending || isAttackerWaiting || isWaitingInRef) {
          if (hasPending) {
            updateContestDialog(selectedItem.id, false);
          }
          return; // 不關閉 dialog
        }
        // 非對抗偷竊/移除的後續目標道具選擇流程進行中，不關閉 dialog
        if (postUseSelection.selectionState?.sourceId === selectedItem.id) {
          return;
        }
      }
      // Phase 3: 清除統一的 Dialog 狀態
      if (isDialogForSource(selectedItem.id, 'item')) {
        clearDialogState();
      }
    }
    setSelectedItem(null);
    setCheckResult(undefined);
    setUseResult(null);
    setSelectedUseTargetId(undefined);
    // Phase 7: 清除目標道具選擇狀態
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    // Phase 3.3: targetItems 由 hook 管理，不需要手動清除
    // Phase 5.3: 目標道具選擇狀態由 hook 管理，不需要手動清除
  }, [selectedItem, hasPendingContest, updateContestDialog, setSelectedUseTargetId, setIsTargetConfirmed, setSelectedTargetItemId, isDialogForSource, clearDialogState, setCheckResult, setUseResult, dialogState, postUseSelection.selectionState?.sourceId]);

  // Phase 6.4: 更新 handleCloseDialogRef
  useEffect(() => {
    handleCloseDialogRef.current = handleCloseDialog;
  }, [handleCloseDialog]);

  // Phase 4.3: 使用 useContestStateRestore Hook 管理對抗檢定狀態恢復（需要在 useItemUsage 之後，因為需要 setUseResult）
  useContestStateRestore({
    characterId,
    sourceType: 'item',
    pendingContests,
    items: items || [],
    selectedItem: selectedItem,
    hasPendingContest,
    removePendingContest,
    updateContestDialog,
    onItemSelected: handleItemSelected,
    onUseResultSet: setUseResult, // Phase 6.4: 使用 useItemUsage Hook 的 setUseResult
    onToastShow: handleToastShow,
    onClearDialog: clearDialogState,
    isDialogForSource,
    onClearTargetState: handleClearTargetStateBase,
    isClosingDialogRef,
    dialogState,
  });

  // Phase 4: 監聽 pendingContests 變化，當對應的 contest 被移除時關閉 dialog
  useEffect(() => {
    
    // 如果 prevPendingContestsRef 是空的，嘗試從 localStorage 恢復（處理組件重新掛載的情況）
    if (Object.keys(prevPendingContestsRef.current).length === 0 && typeof window !== 'undefined' && selectedItem) {
      try {
        const storageKey = STORAGE_KEYS.CONTEST_PENDING(characterId);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, { timestamp: number; [key: string]: unknown }>;
          const now = Date.now();
          const filtered: typeof pendingContests = {};
          for (const [key, contest] of Object.entries(parsed)) {
            if (now - (contest.timestamp as number) < CONTEST_TIMEOUT) {
              filtered[key] = contest as unknown as typeof pendingContests[string];
            }
          }
          if (Object.keys(filtered).length > 0) {
            prevPendingContestsRef.current = filtered;
          }
        }
      } catch (error) {
        console.error('[item-list] Failed to restore prevPendingContestsRef from localStorage:', error);
      }
    }
    
    if (!selectedItem) {
      // 只有在 pendingContests 實際變化時才更新追蹤的狀態
      const prevKeys = Object.keys(prevPendingContestsRef.current).sort().join(',');
      const currentKeys = Object.keys(pendingContests).sort().join(',');
      if (prevKeys !== currentKeys) {
        prevPendingContestsRef.current = { ...pendingContests };
      }
      return;
    }
    
    // 如果目標道具選擇 dialog 正在開啟中，保持 item dialog 打開
    const isTargetItemSelectionOpen = targetItemSelectionDialog && targetItemSelectionDialog.sourceId === selectedItem.id;
    if (isTargetItemSelectionOpen) {
      const prevKeys = Object.keys(prevPendingContestsRef.current).sort().join(',');
      const currentKeys = Object.keys(pendingContests).sort().join(',');
      if (prevKeys !== currentKeys) {
        prevPendingContestsRef.current = { ...pendingContests };
      }
      return;
    }

    // 檢查對抗檢定是否被移除（從存在變成不存在）
    const hadPendingContest = prevPendingContestsRef.current[selectedItem.id] !== undefined;
    const hasPendingContest = pendingContests[selectedItem.id] !== undefined;

    // 檢查是否正在進行對抗檢定（通過 waitingContestRef 或 dialogState）
    const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
    const isAttackerWaiting = dialogState?.type === 'attacker_waiting' &&
                              dialogState.sourceType === 'item' &&
                              dialogState.sourceId === selectedItem.id;

    // 檢查對抗檢定是否被移除（從存在變成不存在），確認已完成才關閉
    if (hadPendingContest && !hasPendingContest && !isWaitingInRef && !isAttackerWaiting) {
      waitingContestRef.current.delete(selectedItem.id);
      handleCloseDialog();
      if (isDialogForSource(selectedItem.id, 'item')) {
        clearDialogState();
      }
    }

    // 處理重新整理後恢復的 dialog，當防守方回應時 pendingContests 被清空
    if (!hadPendingContest && !hasPendingContest && Object.keys(prevPendingContestsRef.current).length > 0 && prevPendingContestsRef.current[selectedItem.id] !== undefined && !isWaitingInRef && !isAttackerWaiting) {
      waitingContestRef.current.delete(selectedItem.id);
      handleCloseDialog();
      if (isDialogForSource(selectedItem.id, 'item')) {
        clearDialogState();
      }
    }

    // 只有在 pendingContests 實際變化時才更新追蹤的狀態
    const prevKeys = Object.keys(prevPendingContestsRef.current).sort().join(',');
    const currentKeys = Object.keys(pendingContests).sort().join(',');
    if (prevKeys !== currentKeys) {
      prevPendingContestsRef.current = { ...pendingContests };
    }
  }, [pendingContests, selectedItem, targetItemSelectionDialog, clearDialogState, isDialogForSource, handleCloseDialog, characterId, dialogState]);
  
  // Phase 8: 當選擇目標角色時，檢查是否需要載入目標道具清單
  // 注意：對抗檢定時，不需要載入目標道具清單
  useEffect(() => {
    const itemEffects = selectedItem ? getItemEffects(selectedItem) : [];
    const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
    const isContest = selectedItem?.checkType === 'contest' || selectedItem?.checkType === 'random_contest';

    // 如果效果需要目標道具，且已選擇目標角色，但尚未確認，則重置確認狀態
    // 對抗檢定時跳過此邏輯
    if (needsTargetItem && !isContest && selectedUseTargetId && !isTargetConfirmed) {
      setIsTargetConfirmed(false);
      setSelectedTargetItemId('');
      // Phase 3.3: targetItems 由 hook 管理，不需要手動清除
    }
  }, [selectedItem, selectedUseTargetId, isTargetConfirmed, setIsTargetConfirmed, setSelectedTargetItemId]);

  // Phase 3.3: 當選擇道具時，恢復目標選擇狀態
  // useTargetSelection hook 內部會處理恢復邏輯，這裡只需要在適當的時機調用
  useEffect(() => {
    if (selectedItem && !isLoadingUseTargets && useTargets.length > 0) {
      // 延遲恢復，確保 useTargetOptions 已經載入完成
      const timer = setTimeout(() => {
        restoreTargetState();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedItem?.id, isLoadingUseTargets, useTargets.length, restoreTargetState, selectedItem]); // 等待載入完成

  // Phase 3.3: 當目標選擇狀態變化時，儲存到 localStorage
  useEffect(() => {
    if (selectedItem && (selectedUseTargetId || isTargetConfirmed || selectedTargetItemId)) {
      saveTargetState();
    }
  }, [selectedItem?.id, selectedUseTargetId, isTargetConfirmed, selectedTargetItemId, selectedItem, saveTargetState]);
  
  // Phase 8: 確認目標角色並載入目標道具清單
  // 注意：對抗檢定時，不應該調用此函數
  const handleConfirmTarget = async () => {
    if (!selectedUseTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    const itemEffects = selectedItem ? getItemEffects(selectedItem) : [];
    const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
    const isContest = selectedItem?.checkType === 'contest' || selectedItem?.checkType === 'random_contest';

    // 對抗檢定時，不應該顯示此 UI，直接返回
    if (isContest) {
      return;
    }
    
    if (!needsTargetItem) {
      // 不需要目標道具，直接確認
      setIsTargetConfirmed(true);
      // 儲存狀態
      if (selectedItem) {
        saveTargetState();
      }
      return;
    }
    
    // 需要目標道具，載入目標角色的道具清單
    setIsLoadingTargetItems(true);
    try {
      const result = await getTargetCharacterItems(selectedUseTargetId);
      if (result.success && result.data) {
        setTargetItems(result.data);
        setIsTargetConfirmed(true);
        // 如果 localStorage 中有保存的 selectedTargetItemId，恢復它
        // 注意：這個邏輯已經在 useTargetSelection hook 的 restoreTargetState 中處理
        if (selectedItem) {
          saveTargetState();
        }
      } else {
        toast.error(result.message || '無法載入目標角色的道具清單');
      }
    } catch (error) {
      console.error('載入目標道具清單失敗:', error);
      toast.error('載入目標道具清單失敗');
    } finally {
      setIsLoadingTargetItems(false);
    }
  };
  
  // Phase 7: 取消目標確認
  const handleCancelTarget = () => {
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    setSelectedUseTargetId(undefined);
    // Phase 3.3: targetItems 由 hook 管理，不需要手動清除
  };

  // Phase 4: 從統一 Dialog 狀態恢復攻擊方等待 Dialog（重新整理後）
  useEffect(() => {
    if (!dialogState || !items) return;
    
    // 如果是攻擊方等待狀態，且來源類型是道具
    if (dialogState.type === 'attacker_waiting' && dialogState.sourceType === 'item') {
      const item = items.find((i) => i.id === dialogState.sourceId);
      if (item && !selectedItem) {
        // 設置選中的道具，這會自動打開 dialog
        setSelectedItem(item);
        
        // 設置等待狀態訊息，讓道具 dialog 顯示等待狀態
        const waitingMessage = '對抗檢定請求已發送，等待防守方回應...';
        setUseResult({
          success: true,
          message: waitingMessage,
        });
        
        // 恢復等待 toast，讓用戶知道正在等待防守方回應
        toast.info(waitingMessage, {
          duration: 5000,
        });
        
        // 確保 pendingContests 中有對應的記錄
        if (pendingContests[dialogState.sourceId]) {
          updateContestDialog(dialogState.sourceId, false);
        }
      }
    }
  }, [dialogState, items, selectedItem, pendingContests, updateContestDialog, setUseResult]);

  // Phase 8: 監聽對抗檢定結果事件，當收到結果時關閉 dialog 並清除狀態
  // 注意：必須在所有條件返回之前調用，符合 React Hooks 規則
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'skill.contest') {
      const payload = event.payload as SkillContestEvent['payload'];
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);
      
      // 處理道具的對抗檢定結果（sourceType === 'item'）
      // 注意：防守方的事件（defenderId === characterId）不應該在這裡處理
      if (
        payload.attackerValue !== 0 &&
        attackerIdStr === characterIdStr &&
        defenderIdStr !== characterIdStr &&
        payload.sourceType === 'item' &&
        payload.itemId
      ) {
        // 如果攻擊方獲勝且需要選擇目標道具，關閉原本的 dialog，開啟新的選擇道具 dialog
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection === true && payload.itemId) {
          const itemId = payload.itemId;

          import('@/lib/contest/contest-id').then(({ generateContestId }) => {
            const currentPendingContests = pendingContestsRef.current;
            const pendingContest = currentPendingContests[itemId];
            const contestId = pendingContest?.contestId || generateContestId(attackerIdStr, itemId, event.timestamp);

            // 關閉原本的道具 dialog
            if (selectedItemRef.current && selectedItemRef.current.id === itemId) {
              handleCloseDialog();
            }

            // 開啟新的目標道具選擇 dialog（與 skill-list.tsx 統一架構）
            setTargetItemSelectionDialogLocalState({
              open: true,
              contestId,
              defenderId: defenderIdStr,
              sourceId: itemId,
            });

            // 保持對抗檢定狀態，直到選擇完目標道具
            if (!(itemId in currentPendingContests)) {
              addPendingContest(itemId, 'item', contestId);
            }
          });

          return;
        }

        // 不需要選擇目標道具的對抗結果：清除狀態
        const itemIdToClear = payload.itemId;
        const currentPendingContests = pendingContestsRef.current;
        const hasPendingInContests = itemIdToClear && itemIdToClear in currentPendingContests;

        if (hasPendingInContests) {
          updateContestDialog(itemIdToClear, false);
          removePendingContest(itemIdToClear);
        }

        // 清除 ref 中的等待標記
        if (payload.itemId) {
          waitingContestRef.current.delete(payload.itemId);
          clearTargetState();
        }

        // 關閉目標道具選擇 dialog（如果有的話）
        if (targetItemSelectionDialog && targetItemSelectionDialog.sourceId === payload.itemId) {
          setTargetItemSelectionDialogLocalState(null);
        }

        // 修復：清除 dialogState（localStorage 中的 dialog 狀態），確保 dialog 不會因為 localStorage 中的狀態而重新打開
        if (payload.itemId && isDialogForSource(payload.itemId, 'item')) {
          clearDialogState();
        }

        // 關閉道具 dialog（force: 對抗檢定已結束，跳過 stale state guard）
        if (selectedItemRef.current && selectedItemRef.current.id === payload.itemId) {
          handleCloseDialog({ force: true });
        }

        router.refresh();
      }
    }
  });

  // 衍生狀態：當前選中道具的對抗檢定與操作鎖定狀態
  // 集中計算一次，取代 JSX 中 9+ 處重複的 inline IIFE
  const isContestInProgress = Boolean(
    selectedItem && (
      hasPendingContest(selectedItem.id) ||
      waitingContestRef.current.has(selectedItem.id) ||
      (dialogState?.type === 'attacker_waiting' &&
       dialogState.sourceType === 'item' &&
       dialogState.sourceId === selectedItem.id)
    )
  );
  const isPostUseSelecting = Boolean(
    selectedItem && postUseSelection.selectionState?.sourceId === selectedItem.id
  );
  /** Dialog 是否被鎖定（不可關閉/不可操作） */
  const isDialogLocked = isContestInProgress || isPostUseSelecting;

  const isEmpty = !items || items.length === 0;
  if (isEmpty) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-4">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">背包是空的</h3>
              <p className="text-sm text-muted-foreground mt-2">
                你還沒有獲得任何道具
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 開啟轉移 Dialog
  const handleOpenTransfer = async () => {
    if (!selectedItem || !gameId || !characterId) return;
    
    // 檢查道具是否可轉移
    if (!selectedItem.isTransferable) return;

    // 保存道具引用，避免關閉道具詳情 dialog 時丟失
    setTransferItem(selectedItem);
    setIsLoadingTargets(true);
    setIsTransferDialogOpen(true);
    
    try {
      const result = await getTransferTargets(gameId, characterId);
      if (result.success && result.data) {
        setTransferTargets(result.data);
      } else {
        setTransferTargets([]);
      }
    } finally {
      setIsLoadingTargets(false);
    }
  };

  // 執行轉移
  const handleTransfer = async () => {
    if (!transferItem || !selectedTargetId || !onTransferItem) return;

    setIsTransferring(true);
    try {
      // onTransferItem 內部會處理成功/失敗的 toast 和 router.refresh()
      await onTransferItem(transferItem.id, selectedTargetId);
      // 轉移完成後關閉轉移對話框
      setIsTransferDialogOpen(false);
      setTransferItem(null);
      setSelectedTargetId('');
      // 關閉道具詳情 dialog（因為道具可能已經被轉移，詳情 dialog 應該關閉）
      // 先清除 selectedItem，確保 dialog 關閉
      setSelectedItem(null);
      setCheckResult(undefined);
      setUseResult(null);
      setSelectedUseTargetId(undefined);
      setIsTargetConfirmed(false);
      setSelectedTargetItemId('');
      // Phase 3.3: targetItems 由 hook 管理，不需要手動清除
      // router.refresh() 會在 handleTransferItem 中執行，會重新載入頁面資料
    } catch (error) {
      console.error('轉移道具錯誤:', error);
      // 發生錯誤時關閉轉移對話框，但保留道具詳情 dialog
      setIsTransferDialogOpen(false);
      setSelectedTargetId('');
    } finally {
      setIsTransferring(false);
    }
  };

  // Phase 7.7: 開啟展示選擇 Dialog
  const handleOpenShowcase = async () => {
    if (!selectedItem || !gameId || !characterId) return;

    // 保存道具引用，避免關閉道具詳情 dialog 時丟失
    setItemToShowcase(selectedItem);
    setIsLoadingShowcaseTargets(true);
    setIsShowcaseSelectOpen(true);

    try {
      const result = await getTransferTargets(gameId, characterId);
      if (result.success && result.data) {
        setShowcaseTargets(result.data);
      } else {
        setShowcaseTargets([]);
      }
    } finally {
      setIsLoadingShowcaseTargets(false);
    }
  };

  // Phase 7.7: 執行展示
  const handleShowcase = async () => {
    if (!itemToShowcase || !selectedShowcaseTargetId) return;

    setIsShowcasing(true);
    try {
      const result = await showcaseItem(characterId, itemToShowcase.id, selectedShowcaseTargetId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message || '展示失敗');
      }
      setIsShowcaseSelectOpen(false);
      setItemToShowcase(null);
      setSelectedShowcaseTargetId('');
    } catch (error) {
      console.error('展示道具錯誤:', error);
      toast.error('展示失敗');
    } finally {
      setIsShowcasing(false);
    }
  };

  // 分類道具
  const consumables = items.filter((i) => i.type === 'consumable');
  const equipment = items.filter((i) => i.type === 'equipment');

  return (
    <>
      <div className="space-y-6">
        {/* 消耗品 */}
        {consumables.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              消耗品
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {consumables.map((item) => {
                const isPendingContest = hasPendingContest(item.id);
                // 卡片只在對抗檢定進行中時才完全 disabled（道具被鎖定）
                // 使用次數耗盡、冷卻中等情況下，卡片仍可點開（可轉移）
                const isCardDisabled = isPendingContest;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    cooldownRemaining={getCooldownRemaining(item)}
                    randomContestMaxValue={randomContestMaxValue}
                    onClick={() => {
                      if (!isCardDisabled) {
                        setSelectedItem(item);
                        // Phase 7.7: 記錄道具檢視（fire-and-forget）
                        recordItemView(characterId, item.id).catch(() => {});
                      }
                    }}
                    disabled={isCardDisabled}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 裝備/道具 */}
        {equipment.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              裝備/道具
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {equipment.map((item) => {
                const isPendingContest = hasPendingContest(item.id);
                // 卡片只在對抗檢定進行中時才完全 disabled（道具被鎖定）
                // 使用次數耗盡、冷卻中等情況下，卡片仍可點開（可轉移）
                const isCardDisabled = isPendingContest;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    cooldownRemaining={getCooldownRemaining(item)}
                    randomContestMaxValue={randomContestMaxValue}
                    onClick={() => {
                      if (!isCardDisabled) {
                        setSelectedItem(item);
                        // Phase 7.7: 記錄道具檢視（fire-and-forget）
                        recordItemView(characterId, item.id).catch(() => {});
                      }
                    }}
                    disabled={isCardDisabled}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 道具詳情 Dialog */}
      <ItemDetailDialog
        selectedItem={selectedItem}
        isDialogLocked={isDialogLocked}
        onClose={handleCloseDialog}
        checkResult={checkResult}
        randomContestMaxValue={randomContestMaxValue}
        useResult={useResult}
        isUsing={isUsing}
        useTargets={useTargets}
        selectedUseTargetId={selectedUseTargetId}
        setSelectedUseTargetId={setSelectedUseTargetId}
        isLoadingUseTargets={isLoadingUseTargets}
        isTargetConfirmed={isTargetConfirmed}
        setIsTargetConfirmed={setIsTargetConfirmed}
        targetItems={targetItems}
        selectedTargetItemId={selectedTargetItemId}
        setSelectedTargetItemId={setSelectedTargetItemId}
        isLoadingTargetItems={isLoadingTargetItems}
        requiresTarget={requiresTarget}
        isContestInProgress={isContestInProgress}
        isPostUseSelecting={isPostUseSelecting}
        handleUseItem={handleUseItem}
        handleConfirmTarget={handleConfirmTarget}
        handleCancelTarget={handleCancelTarget}
        handleOpenShowcase={handleOpenShowcase}
        handleOpenTransfer={handleOpenTransfer}
        postUseSelection={postUseSelection}
        isReadOnly={isReadOnly}
        canUseItem={canUseItem}
        showUseButton={selectedItem ? (hasItemEffects(selectedItem) || !!onUseItem) : false}
        showShowcaseButton={!!(gameId && characterId)}
        showTransferButton={!!(onTransferItem && gameId && characterId)}
      />

      {/* 轉移選擇 Dialog */}
      <ItemTransferDialog
        open={isTransferDialogOpen}
        onOpenChange={setIsTransferDialogOpen}
        transferItem={transferItem}
        isLoadingTargets={isLoadingTargets}
        transferTargets={transferTargets}
        selectedTargetId={selectedTargetId}
        onTargetChange={setSelectedTargetId}
        isTransferring={isTransferring}
        onTransfer={handleTransfer}
        onCancel={() => {
          setIsTransferDialogOpen(false);
          setTransferItem(null);
          setSelectedTargetId('');
        }}
      />

      {/* Phase 7.7: 展示選擇 Dialog */}
      <ItemShowcaseSelectDialog
        open={isShowcaseSelectOpen}
        onOpenChange={setIsShowcaseSelectOpen}
        itemToShowcase={itemToShowcase}
        isLoadingTargets={isLoadingShowcaseTargets}
        showcaseTargets={showcaseTargets}
        selectedTargetId={selectedShowcaseTargetId}
        onTargetChange={setSelectedShowcaseTargetId}
        isShowcasing={isShowcasing}
        onShowcase={handleShowcase}
        onCancel={() => {
          setIsShowcaseSelectOpen(false);
          setItemToShowcase(null);
          setSelectedShowcaseTargetId('');
        }}
      />

      {/* 對抗檢定獲勝後的目標道具選擇 Dialog（與 skill-list.tsx 統一架構） */}
      {targetItemSelectionDialog && (
        <TargetItemSelectionDialog
          open={targetItemSelectionDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setTargetItemSelectionDialogLocalState(null);
            }
          }}
          contestId={targetItemSelectionDialog.contestId}
          characterId={characterId}
          defenderId={targetItemSelectionDialog.defenderId}
          sourceType="item"
          sourceId={targetItemSelectionDialog.sourceId}
          onSelectionComplete={() => {
            // 清除對抗檢定狀態
            if (targetItemSelectionDialog.sourceId) {
              removePendingContest(targetItemSelectionDialog.sourceId);
              waitingContestRef.current.delete(targetItemSelectionDialog.sourceId);
            }
            // 刷新頁面資料
            router.refresh();
          }}
        />
      )}
    </>
  );
}

