'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Item, Skill } from '@/types/character';
import { getTransferTargets, type TransferTargetCharacter } from '@/app/actions/public';
import { useTargetSelection } from '@/hooks/use-target-selection';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { notify } from '@/lib/notify';
import { useRouter } from 'next/navigation';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import { useContestStateRestore } from '@/hooks/use-contest-state-restore';
import { useItemUsage } from '@/hooks/use-item-usage';
import { useContestableItemUsage } from '@/hooks/use-contestable-item-usage';
import { canUseItem as canUseItemBase, getCooldownRemaining } from '@/lib/utils/item-validators';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import type { ItemListProps } from '@/types/item-list';
import { recordItemView, showcaseItem } from '@/app/actions/item-showcase';
import { ItemCard } from './item-card';
import { ItemDetailDialog } from './item-detail-dialog';
import { ItemSelectDialog } from './item-select-dialog';
import { TargetItemSelectionDialog } from './target-item-selection-dialog';

export function ItemList({ items, characterId, gameId, characterName, randomContestMaxValue = 100, isReadOnly = false, onUseItem, onTransferItem }: ItemListProps) {
  // Phase 10.5.4: 唯讀模式下隱藏所有互動按鈕（使用、展示、轉移）

  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  // 用於實時更新冷卻倒數的時間戳
  const [, setTick] = useState(0);
  
  // Phase 8: 對抗檢定狀態管理
  const { removePendingContest, hasPendingContest, updateContestDialog, pendingContests } = useContestState(characterId);
  
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

  // 共用目標列表（供使用/展示/轉移的單一下拉選單）
  const [sharedTargets, setSharedTargets] = useState<TransferTargetCharacter[]>([]);
  const [isLoadingSharedTargets, setIsLoadingSharedTargets] = useState(false);

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
    selectedTargetItemId,
    setSelectedTargetItemId,
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

  // 非對抗偷竊/移除：使用成功後的目標道具選擇（由獨立 Dialog 顯示）
  const [postUseSelectionState, setPostUseSelectionState] = useState<{
    sourceId: string;
    sourceType: 'skill' | 'item';
    effectType: 'item_steal' | 'item_take';
    targetCharacterId: string;
    characterId: string;
  } | null>(null);

  // 包裝 setSelectedItem 以符合 hook 的類型要求
  const handleItemSelected = useCallback((item: Skill | Item | null) => {
    // 如果嘗試關閉 dialog（item 為 null），但正在進行對抗檢定，則不關閉
    if (!item && selectedItem) {
      const hasPending = hasPendingContest(selectedItem.id);
      const isAttackerWaiting = dialogState?.type === 'attacker_waiting' &&
                                dialogState.sourceType === 'item' &&
                                dialogState.sourceId === selectedItem.id;
      const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);

      if (hasPending || isAttackerWaiting || isWaitingInRef) {
        return; // 不關閉 dialog
      }
    }
    setSelectedItem(item as Item | null);
  }, [selectedItem, hasPendingContest, dialogState]);

  // Phase 8.3: 使用 ref 存儲 handleContestStarted，以便在 onSuccess 回調中使用
  const handleContestStartedRef = useRef<((contestId: string, displayData?: import('@/hooks/use-contest-dialog-state').AttackerWaitingDisplayData) => void) | null>(null);

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

  // Phase 6.4: 使用 useItemUsage Hook 管理道具使用
  const {
    isUsing,
    checkResult,
    handleUseItem,
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
        const targetName = useTargets.find((c) => c.id === selectedUseTargetId)?.name || '未知';
        handleContestStartedRef.current(result.data.contestId, {
          attackerValue: result.data.attackerValue ?? 0,
          defenderName: targetName,
          sourceName: selectedItem.name,
          checkType: (selectedItem.checkType as 'contest' | 'random_contest') || 'contest',
          relatedStat: selectedItem.contestConfig?.relatedStat,
          randomContestMaxValue,
        });
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
      // 非對抗偷竊/移除：使用成功後開啟目標道具選擇 Dialog
      setPostUseSelectionState({
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
    onContestStarted: () => {
      // 關閉 bottom sheet，等待 Dialog 由 character-card-view 層掛載
      setSelectedItem(null);
      setCheckResult(undefined);
    },
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
      }
      // Phase 3: 清除統一的 Dialog 狀態
      if (isDialogForSource(selectedItem.id, 'item')) {
        clearDialogState();
      }
    }
    setSelectedItem(null);
    setCheckResult(undefined);
    setSelectedUseTargetId(undefined);
    // Phase 7: 清除目標道具選擇狀態
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    // Phase 3.3: targetItems 由 hook 管理，不需要手動清除
    // Phase 5.3: 目標道具選擇狀態由 hook 管理，不需要手動清除
  }, [selectedItem, hasPendingContest, updateContestDialog, setSelectedUseTargetId, setIsTargetConfirmed, setSelectedTargetItemId, isDialogForSource, clearDialogState, setCheckResult, dialogState]);

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
    onClearDialog: clearDialogState,
    isDialogForSource,
    onClearTargetState: handleClearTargetStateBase,
    isClosingDialogRef,
    dialogState,
  });

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

  // 載入共用目標列表（道具選中時自動載入，供使用/展示/轉移共用）
  useEffect(() => {
    if (!selectedItem?.id || !gameId || !characterId) {
      setSharedTargets([]);
      return;
    }
    setIsLoadingSharedTargets(true);
    getTransferTargets(gameId, characterId)
      .then((result) => {
        if (result.success && result.data) setSharedTargets(result.data);
        else setSharedTargets([]);
      })
      .catch(() => setSharedTargets([]))
      .finally(() => setIsLoadingSharedTargets(false));
  }, [selectedItem?.id, gameId, characterId]);


  // 監聽對抗檢定結果事件：清除 item-list 本地狀態（pendingContest、waitingRef）
  // 注意：dialog 開關（等待 dialog、目標道具選擇 dialog）由 use-game-event-handler.ts 統一處理
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'skill.contest') {
      const payload = event.payload as SkillContestEvent['payload'];
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);

      // 只處理攻擊方收到的結果事件（道具類型）
      if (
        payload.attackerValue !== 0 &&
        attackerIdStr === characterIdStr &&
        defenderIdStr !== characterIdStr &&
        payload.sourceType === 'item' &&
        payload.itemId
      ) {
        const itemId = payload.itemId;

        // 清除本地等待標記
        waitingContestRef.current.delete(itemId);
        clearTargetState();

        // 需要選擇目標道具的分歧：保持 pendingContest（由 character-card-view 的 TargetItemSelectionDialog 結束後清除）
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection) {
          return;
        }

        // 其他結果：清除 pendingContest
        if (hasPendingContest(itemId)) {
          removePendingContest(itemId);
        }
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
  /** Dialog 是否被鎖定（不可關閉/不可操作） */
  const isDialogLocked = isContestInProgress;

  const isEmpty = !items || items.length === 0;
  if (isEmpty) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted/20 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">背包是空的</h3>
        <p className="text-sm text-muted-foreground mt-2">你還沒有獲得任何道具</p>
      </div>
    );
  }

  // 開啟轉移 Dialog（若已選目標則直接轉移，否則開啟 ItemSelectDialog）
  const handleOpenTransfer = async () => {
    if (!selectedItem || !gameId || !characterId) return;
    if (!selectedItem.isTransferable) return;

    // 若下拉選單已選目標，直接執行轉移
    if (selectedUseTargetId && onTransferItem) {
      const itemRef = selectedItem;
      const targetId = selectedUseTargetId;
      setIsTransferring(true);
      try {
        await onTransferItem(itemRef.id, targetId);
        setSelectedItem(null);
        setCheckResult(undefined);
  
        setSelectedUseTargetId(undefined);
        setIsTargetConfirmed(false);
        setSelectedTargetItemId('');
      } catch (error) {
        console.error('轉移道具錯誤:', error);
      } finally {
        setIsTransferring(false);
      }
      return;
    }

    // Fallback：開啟 ItemSelectDialog
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

    // 若已有選定目標，直接展示，無需開啟 ItemSelectDialog
    if (selectedUseTargetId) {
      const itemRef = selectedItem;
      const targetId = selectedUseTargetId;
      setIsShowcasing(true);
      try {
        const result = await showcaseItem(characterId, itemRef.id, targetId);
        if (!result.success) {
          notify.error(result.message || '展示失敗');
        }
        setSelectedItem(null);
        setCheckResult(undefined);
  
        setSelectedUseTargetId(undefined);
        setIsTargetConfirmed(false);
        setSelectedTargetItemId('');
      } catch (error) {
        console.error('展示道具錯誤:', error);
        notify.error('展示失敗');
      } finally {
        setIsShowcasing(false);
      }
      return;
    }

    // Fallback: 開啟 ItemSelectDialog
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
      if (!result.success) {
        notify.error(result.message || '展示失敗');
      }
      setIsShowcaseSelectOpen(false);
      setItemToShowcase(null);
      setSelectedShowcaseTargetId('');
    } catch (error) {
      console.error('展示道具錯誤:', error);
      notify.error('展示失敗');
    } finally {
      setIsShowcasing(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* 道具清單標題 */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">道具清單</h2>
          {items.length > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold">
              {items.length}
            </span>
          )}
        </div>

        {/* 道具格子（flat grid，不分類） */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((item) => {
            const isPendingContest = hasPendingContest(item.id);
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
                    recordItemView(characterId, item.id).catch(() => {});
                  }
                }}
                disabled={isCardDisabled}
              />
            );
          })}
        </div>
      </div>

      {/* 道具詳情 Dialog */}
      <ItemDetailDialog
        selectedItem={selectedItem}
        isDialogLocked={isDialogLocked}
        onClose={handleCloseDialog}
        checkResult={checkResult}
        randomContestMaxValue={randomContestMaxValue}

        isUsing={isUsing}
        useTargets={useTargets}
        selectedUseTargetId={selectedUseTargetId}
        setSelectedUseTargetId={setSelectedUseTargetId}
        isLoadingUseTargets={isLoadingUseTargets}
        isTargetConfirmed={isTargetConfirmed}
        requiresTarget={requiresTarget}
        isContestInProgress={isContestInProgress}
        handleUseItem={handleUseItem}
        handleOpenShowcase={handleOpenShowcase}
        handleOpenTransfer={handleOpenTransfer}
        isReadOnly={isReadOnly}
        canUseItem={canUseItem}
        showUseButton={selectedItem ? (hasItemEffects(selectedItem) || !!onUseItem) : false}
        showShowcaseButton={!!(gameId && characterId)}
        showTransferButton={!!(onTransferItem && gameId && characterId)}
        isShowcasing={isShowcasing}
        isTransferring={isTransferring}
        sharedTargets={sharedTargets}
        isLoadingSharedTargets={isLoadingSharedTargets}
      />

      {/* 非對抗偷竊/移除：使用成功後的目標道具選擇 Dialog */}
      {postUseSelectionState && (
        <TargetItemSelectionDialog
          mode="post-use"
          open={true}
          onOpenChange={(open) => {
            if (!open) setPostUseSelectionState(null);
          }}
          characterId={postUseSelectionState.characterId}
          targetCharacterId={postUseSelectionState.targetCharacterId}
          sourceType={postUseSelectionState.sourceType}
          sourceId={postUseSelectionState.sourceId}
          effectType={postUseSelectionState.effectType}
          onSelectionComplete={() => {
            setPostUseSelectionState(null);
            router.refresh();
          }}
        />
      )}

      {/* 轉移選擇 Dialog */}
      <ItemSelectDialog
        mode="transfer"
        open={isTransferDialogOpen}
        onOpenChange={setIsTransferDialogOpen}
        item={transferItem}
        isLoadingTargets={isLoadingTargets}
        targets={transferTargets}
        selectedTargetId={selectedTargetId}
        onTargetChange={setSelectedTargetId}
        isSubmitting={isTransferring}
        onSubmit={handleTransfer}
        onCancel={() => {
          setIsTransferDialogOpen(false);
          setTransferItem(null);
          setSelectedTargetId('');
        }}
      />

      {/* 展示選擇 Dialog */}
      <ItemSelectDialog
        mode="showcase"
        open={isShowcaseSelectOpen}
        onOpenChange={setIsShowcaseSelectOpen}
        item={itemToShowcase}
        isLoadingTargets={isLoadingShowcaseTargets}
        targets={showcaseTargets}
        selectedTargetId={selectedShowcaseTargetId}
        onTargetChange={setSelectedShowcaseTargetId}
        isSubmitting={isShowcasing}
        onSubmit={handleShowcase}
        onCancel={() => {
          setIsShowcaseSelectOpen(false);
          setItemToShowcase(null);
          setSelectedShowcaseTargetId('');
        }}
      />

    </>
  );
}

