'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Package, Zap, Clock, ArrowRightLeft, Sparkles, User, Eye } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import type { Item, Skill } from '@/types/character';
import { formatDate } from '@/lib/utils/date';
import { getTransferTargets, getTargetCharacterItems, type TransferTargetCharacter } from '@/app/actions/public';
import { useTargetSelection } from '@/hooks/use-target-selection';
import { EffectDisplay } from './effect-display';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import { useContestStateRestore } from '@/hooks/use-contest-state-restore';
import { useTargetItemSelection } from '@/hooks/use-target-item-selection';
import { useItemUsage } from '@/hooks/use-item-usage';
import { useContestableItemUsage } from '@/hooks/use-contestable-item-usage';
import { CONTEST_TIMEOUT, STORAGE_KEYS } from '@/lib/constants/contest';
import { canUseItem as canUseItemBase, getCooldownRemaining } from '@/lib/utils/item-validators';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import { UseResultDisplay } from './use-result-display';
import { CheckInfoDisplay } from './check-info-display';
import { TargetSelectionSection } from './target-selection-section';
import { TargetItemSelectionSection } from './target-item-selection-section';
import type { ItemListProps } from '@/types/item-list';
import { recordItemView, showcaseItem } from '@/app/actions/item-showcase';

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
  
  // Phase 3: 使用統一的 Dialog 狀態管理
  const { dialogState, setTargetItemSelectionDialog, clearDialogState, isDialogForSource } = useContestDialogState(characterId);
  
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
    effects.some((effect) => effect.requiresTarget)
  );
  const targetType = selectedItem?.checkType === 'contest' 
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
  }, [setSelectedUseTargetId, setIsTargetConfirmed, setSelectedTargetItemId]);

  // 顯示 toast 的回調
  const handleToastShow = useCallback((message: string, options?: { duration?: number }) => {
    return toast.info(message, {
      duration: options?.duration || 5000,
    });
  }, []);

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

  // Phase 5.3: 使用 useTargetItemSelection Hook 管理目標道具選擇
  const targetItemSelectionDialogState = dialogState?.type === 'target_item_selection' && dialogState.sourceType === 'item'
    ? {
        type: 'target_item_selection' as const,
        contestId: dialogState.contestId,
        sourceType: dialogState.sourceType,
        sourceId: dialogState.sourceId,
        targetCharacterId: dialogState.targetCharacterId,
      }
    : null;

  // Phase 6.4: 使用 useItemUsage Hook 管理道具使用（需要在 useTargetItemSelection 之前，因為需要 setUseResult）
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
    isTargetConfirmed,
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
  const handleCloseDialog = useCallback(() => {
    // Phase 8: 清除 dialog 狀態（如果有 pending contest）
    if (selectedItem) {
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
  }, [selectedItem, hasPendingContest, updateContestDialog, setSelectedUseTargetId, setIsTargetConfirmed, setSelectedTargetItemId, isDialogForSource, clearDialogState, setCheckResult, setUseResult, dialogState]);

  // Phase 6.4: 更新 handleCloseDialogRef
  useEffect(() => {
    handleCloseDialogRef.current = handleCloseDialog;
  }, [handleCloseDialog]);

  // Phase 6.4: 創建完整的 handleClearTargetState，包含清除 checkResult
  const handleClearTargetState = useCallback(() => {
    handleClearTargetStateBase();
    setCheckResult(undefined);
  }, [handleClearTargetStateBase, setCheckResult]);

  // Phase 5.3: 使用 useTargetItemSelection Hook 管理目標道具選擇
  const {
    needsTargetItemSelection,
    targetItemsForSelection,
    selectedTargetItemForContest,
    setSelectedTargetItemForContest,
    isLoadingTargetItemsForContest,
    isSelectingTargetItem,
    handleSelectTargetItem,
    handleCancelSelection,
  } = useTargetItemSelection({
    characterId,
    sourceType: 'item',
    dialogState: targetItemSelectionDialogState,
    items: items || [],
    selectedItem: selectedItem,
    hasPendingContest,
    pendingContests, // 修復：添加 pendingContests 以便直接檢查
    addPendingContest,
    removePendingContest,
    updateContestDialog,
    setTargetItemSelectionDialog,
    clearDialogState,
    isDialogForSource,
    onItemSelected: handleItemSelected,
    onUseResultSet: setUseResult, // Phase 6.4: 使用 useItemUsage Hook 的 setUseResult
    onClearTargetState: handleClearTargetState,
    onRouterRefresh: () => router.refresh(),
    onClearWaitingContest: (sourceId: string) => {
      waitingContestRef.current.delete(sourceId);
    },
  });

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
    
    // 如果需要選擇目標道具，且是對應的道具，保持 dialog 打開
    if (needsTargetItemSelection && needsTargetItemSelection.sourceId === selectedItem.id) {
      // 需要選擇目標道具，保持 dialog 打開
      // 只有在 pendingContests 實際變化時才更新追蹤的狀態
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
    
    // 方法1: 檢查對抗檢定是否被移除（從存在變成不存在）
    // 重要：只有在確認對抗檢定已完成時才關閉 dialog
    // 如果 waitingContestRef 有值或 dialogState 為 attacker_waiting，說明對抗檢定正在進行中，不應該關閉
    if (hadPendingContest && !hasPendingContest && !needsTargetItemSelection && !isWaitingInRef && !isAttackerWaiting) {
      // 對抗檢定已完成，關閉 dialog
      // 清除 ref 中的等待標記
      waitingContestRef.current.delete(selectedItem.id);
      handleCloseDialog();
      // Phase 3: 清除統一的 Dialog 狀態
      if (isDialogForSource(selectedItem.id, 'item')) {
        clearDialogState();
      }
    }
    
    // 方法2: 如果 prevPendingContestsRef 有記錄但 pendingContests 沒有，且 dialog 打開了，關閉 dialog
    // 這是為了處理重新整理後恢復的 dialog，當防守方回應時，pendingContests 被清空，但 prevPendingContestsRef 還保留之前的狀態
    // 重要：只有在確認對抗檢定已完成時才關閉 dialog
    // 如果 waitingContestRef 有值或 dialogState 為 attacker_waiting，說明對抗檢定正在進行中，不應該關閉
    if (!hadPendingContest && !hasPendingContest && Object.keys(prevPendingContestsRef.current).length > 0 && prevPendingContestsRef.current[selectedItem.id] !== undefined && !needsTargetItemSelection && !isWaitingInRef && !isAttackerWaiting) {
      // 對抗檢定已完成，關閉 dialog
      // 清除 ref 中的等待標記
      waitingContestRef.current.delete(selectedItem.id);
      handleCloseDialog();
      // Phase 3: 清除統一的 Dialog 狀態
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
  }, [pendingContests, selectedItem, needsTargetItemSelection, clearDialogState, isDialogForSource, handleCloseDialog, characterId, dialogState]);
  
  // Phase 8: 當選擇目標角色時，檢查是否需要載入目標道具清單
  // 注意：對抗檢定時，不需要載入目標道具清單
  useEffect(() => {
    const itemEffects = selectedItem ? getItemEffects(selectedItem) : [];
    const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
    const isContest = selectedItem?.checkType === 'contest';

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
    const isContest = selectedItem?.checkType === 'contest';

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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:588',message:'收到對抗結果事件',data:{itemId:payload.itemId,result:payload.result,needsTargetItemSelection:payload.needsTargetItemSelection,hasPendingContest:hasPendingContest(payload.itemId),pendingContestsKeys:Object.keys(pendingContests),needsTargetItemSelectionState:needsTargetItemSelection?.sourceId,hasPendingInContestsRef:payload.itemId ? payload.itemId in pendingContestsRef.current : false,pendingContestsKeysRef:Object.keys(pendingContestsRef.current)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // 修復：確保即使 needsTargetItemSelection 為 false，也要清除對抗狀態
        // 這包括 cancelContestItemSelection 發送的事件（needsTargetItemSelection: false）
        // Phase 8: 如果攻擊方獲勝且需要選擇目標道具
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection === true && payload.itemId) {
          const itemId = payload.itemId; // 確保 itemId 不是 undefined
          
          // Phase 5.3: 如果攻擊方獲勝且需要選擇目標道具，設置 dialog 狀態，讓 hook 處理後續邏輯
          import('@/lib/contest/contest-id').then(({ generateContestId }) => {
            // 修復：使用 ref 獲取最新的 pendingContests 值，而不是閉包中的舊值
            const currentPendingContests = pendingContestsRef.current;
            const pendingContest = currentPendingContests[itemId];
            const contestId = pendingContest?.contestId || generateContestId(attackerIdStr, itemId, event.timestamp);
            
            // Phase 5.3: 設置統一的 Dialog 狀態，hook 會自動處理後續邏輯（載入目標道具清單等）
            setTargetItemSelectionDialog(contestId, 'item', itemId, defenderIdStr);
            
            // 確保對抗檢定狀態已設置（如果沒有，則添加）
            // 修復：使用 ref 獲取最新的 pendingContests 值，而不是閉包中的舊值
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:625',message:'WebSocket 事件處理器檢查是否需要添加狀態',data:{itemId,hasPendingInCurrentContests:itemId in currentPendingContests,pendingContestsKeys:Object.keys(currentPendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            if (!(itemId in currentPendingContests)) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:626',message:'WebSocket 事件處理器調用 addPendingContest',data:{itemId,contestId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              addPendingContest(itemId, 'item', contestId);
            } else {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:628',message:'WebSocket 事件處理器跳過添加狀態，pendingContests 中已存在',data:{itemId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
            }
            // Phase 8: 關閉等待 dialog（設置 dialogOpen 為 false），因為現在要顯示道具選擇 dialog
            // 但保持對抗檢定狀態（不從 pendingContests 中移除），直到選擇完目標道具
            updateContestDialog(itemId, false);
            
            // 如果對應的道具還沒有打開，自動打開它
            if (items && !selectedItem) {
              const item = items.find((i) => i.id === itemId);
              if (item) {
                setSelectedItem(item);
              }
            } else if (selectedItem && selectedItem.id !== itemId) {
              // 如果當前選中的道具不是這個道具，切換到這個道具
              const item = items?.find((i) => i.id === itemId);
              if (item) {
                setSelectedItem(item);
              }
            }
          });
          
          // 不關閉 dialog，讓用戶選擇目標道具
          // 不清除對抗檢定狀態，保持鎖定狀態直到選擇完成
          return;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:628',message:'處理不需要選擇目標道具的對抗結果',data:{itemId:payload.itemId,result:payload.result,needsTargetItemSelection:payload.needsTargetItemSelection,hasPendingContestBefore:hasPendingContest(payload.itemId),pendingContestsKeysBefore:Object.keys(pendingContests),needsTargetItemSelectionState:needsTargetItemSelection?.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // 修復：不顯示 toast，因為 event-mappers.ts 已經會生成更詳細的「道具使用結果」通知
        // 這樣可以避免重複通知，只保留 event-mappers 生成的詳細通知
        
        // 清除對抗檢定狀態（無論 dialog 是否打開）
        // 這包括：攻擊方獲勝但不需要選擇目標道具、攻擊方失敗、防守方獲勝、雙方平手、以及選擇完目標道具後的情況
        // 修復：確保即使 needsTargetItemSelection 已經被清除，也要清除對抗狀態
        // 使用 itemId 的副本，避免閉包問題
        const itemIdToClear = payload.itemId;
        
        // 修復：直接檢查 pendingContests 對象，而不是依賴 hasPendingContest（可能存在閉包問題）
        // 使用 ref 獲取最新的 pendingContests 值，而不是閉包中的舊值
        const currentPendingContests = pendingContestsRef.current;
        const hasPendingInContests = itemIdToClear && itemIdToClear in currentPendingContests;
        
        // Phase 8: 在清除對抗檢定狀態之前，先確保 dialogOpen 狀態已更新為 false
              // 確保對抗檢定狀態已清除
        if (hasPendingInContests) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:640',message:'更新對抗檢定 dialog 狀態為 false',data:{itemId:itemIdToClear},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          updateContestDialog(itemIdToClear, false);
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:643',message:'準備清除對抗檢定狀態',data:{itemId:itemIdToClear,hasPendingInContests,hasPendingContestBefore:hasPendingInContests,pendingContestsKeysBefore:Object.keys(currentPendingContests)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // 修復：確保對抗狀態被清除，無論 hasPendingContest 在閉包中使用了什麼值
        // 只要 pendingContests 中有這個 itemId，就清除它
        if (hasPendingInContests) {
          removePendingContest(itemIdToClear);
        }
        
        // 修復：確保對抗狀態被清除，即使 hasPendingContest 在閉包中使用了舊值
        // 使用 setTimeout 確保狀態更新後再檢查
        setTimeout(() => {
          // 修復：使用 ref 獲取最新的 pendingContests 值，而不是閉包中的舊值
          const currentPendingContests = pendingContestsRef.current;
          const currentPendingContestsKeys = Object.keys(currentPendingContests);
          const hasPendingAfter = itemIdToClear && itemIdToClear in currentPendingContests;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:646',message:'對抗檢定狀態已清除（延遲檢查，使用 ref）',data:{itemId:itemIdToClear,hasPendingContestAfter:hasPendingAfter,hasPendingInContestsAfter:hasPendingAfter,pendingContestsKeysAfter:currentPendingContestsKeys},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        }, 100);
        
        // 清除 ref 中的等待標記
        if (payload.itemId) {
          waitingContestRef.current.delete(payload.itemId);
          clearTargetState();
        }
        
        // Phase 5.3: 清除 needsTargetItemSelection 狀態（如果有的話），使用 hook 的方法
        if (needsTargetItemSelection && needsTargetItemSelection.sourceId === payload.itemId) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:653',message:'清除 needsTargetItemSelection 狀態',data:{itemId:payload.itemId,needsTargetItemSelectionSourceId:needsTargetItemSelection.sourceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          handleCancelSelection();
        }
        
        // 如果 dialog 是打開的，立即關閉它（不使用 setTimeout，確保立即關閉）
        if (selectedItem && selectedItem.id === payload.itemId) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e2be6a65-9f5f-4db7-bf82-59842b3eed9f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'item-list.tsx:658',message:'關閉 dialog',data:{itemId:payload.itemId,selectedItemId:selectedItem.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          handleCloseDialog();
        }
        
        // 刷新頁面資料
        router.refresh();
      }
    }
  });

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
      <Dialog open={!!selectedItem} onOpenChange={(open) => {
        // Phase 8: 如果有正在進行的對抗檢定，不允許關閉 dialog
        if (!open && selectedItem) {
          const hasPending = hasPendingContest(selectedItem.id);
          const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
          const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                                    dialogState.sourceType === 'item' && 
                                    dialogState.sourceId === selectedItem.id;
          if (!hasPending && !isWaitingInRef && !isAttackerWaiting) {
            handleCloseDialog();
          }
        }
      }}>
        <DialogContent
          showCloseButton={(() => {
            if (selectedItem) {
              const hasPending = hasPendingContest(selectedItem.id);
              const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
              const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                                        dialogState.sourceType === 'item' && 
                                        dialogState.sourceId === selectedItem.id;
              return !hasPending && !isWaitingInRef && !isAttackerWaiting;
            }
            return true;
          })()}
          onInteractOutside={(e) => {
            // Phase 8: 如果有正在進行的對抗檢定，不允許點擊外圍關閉
            if (selectedItem && hasPendingContest(selectedItem.id)) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            // Phase 8: 如果有正在進行的對抗檢定，不允許按 ESC 關閉
            if (selectedItem && hasPendingContest(selectedItem.id)) {
              e.preventDefault();
            }
          }}
        >
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={selectedItem.type === 'consumable' ? 'secondary' : 'outline'}>
                    {selectedItem.type === 'consumable' ? '消耗品' : '裝備/道具'}
                  </Badge>
                  {hasItemEffects(selectedItem) && (
                    <Badge variant="default">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {selectedItem.effects && selectedItem.effects.length > 0 ? `${selectedItem.effects.length} 個效果` : '有效果'}
                    </Badge>
                  )}
                  {selectedItem.isTransferable && (
                    <Badge variant="outline">
                      <ArrowRightLeft className="h-3 w-3 mr-1" />
                      可轉移
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-xl">
                  {selectedItem.name}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-4 mt-4">
                    {/* 道具圖片 */}
                    {selectedItem.imageUrl && (
                      <div className="relative h-48 w-full rounded-lg overflow-hidden bg-muted">
                        <Image
                          src={selectedItem.imageUrl}
                          alt={selectedItem.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}

                    {/* 道具描述 */}
                    {selectedItem.description && (
                      <p className="text-foreground whitespace-pre-wrap">
                        {selectedItem.description}
                      </p>
                    )}

                    {/* 道具屬性 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground mb-1">數量</div>
                        <div className="font-semibold text-lg">{selectedItem.quantity}</div>
                      </div>
                      
                      {selectedItem.usageLimit != null && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-muted-foreground mb-1">使用次數</div>
                          <div className="font-semibold text-lg">
                            {Number(selectedItem.usageLimit) > 0 
                              ? `${Number(selectedItem.usageLimit) - (selectedItem.usageCount || 0)} / ${selectedItem.usageLimit}`
                              : '無限制'}
                          </div>
                        </div>
                      )}

                      {selectedItem.cooldown != null && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-muted-foreground mb-1">冷卻時間</div>
                          <div className="font-semibold text-lg flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {selectedItem.cooldown > 0 ? `${selectedItem.cooldown}s` : '無冷卻時間'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Phase 7.6: 標籤顯示 */}
                    {selectedItem.tags && selectedItem.tags.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">標籤</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedItem.tags.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phase 7.6: 檢定資訊 */}
                    {selectedItem.checkType && (
                      <CheckInfoDisplay
                        checkType={selectedItem.checkType}
                        contestConfig={selectedItem.contestConfig}
                        randomConfig={selectedItem.randomConfig}
                        checkResult={checkResult}
                        randomContestMaxValue={randomContestMaxValue}
                      />
                    )}

                    {/* 使用效果 */}
                    {hasItemEffects(selectedItem) && (
                      <div className="p-3 bg-purple-50 rounded-lg space-y-3">
                        <div className="text-sm font-medium text-purple-800 mb-1 flex items-center gap-1">
                          <Sparkles className="h-4 w-4" />
                          使用效果
                        </div>
                        <div className="space-y-3">
                          {getItemEffects(selectedItem).map((effect, index) => (
                            <div key={index} className="text-purple-700">
                              {selectedItem.effects && selectedItem.effects.length > 1 && (
                                <div className="text-xs font-medium mb-1 text-purple-600">
                                  效果 {index + 1}
                                </div>
                              )}
                              <EffectDisplay
                                effect={effect}
                                targetOptions={useTargets}
                                selectedTargetId={selectedUseTargetId}
                                onTargetChange={(targetId) => {
                                  // Phase 7: 當目標角色改變時，重置確認狀態
                                  setIsTargetConfirmed(false);
                                  setSelectedTargetItemId('');
                                  setSelectedUseTargetId(targetId);
                                  // Phase 3.3: targetItems 由 hook 管理，已經通過 setTargetItems 清除
                                }}
                                className="bg-transparent p-0 text-purple-700"
                                disabled={(() => {
                                  const isPendingContest = selectedItem && hasPendingContest(selectedItem.id);
                                  const isWaitingInRef = selectedItem && waitingContestRef.current.has(selectedItem.id);
                                  const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                                                            dialogState.sourceType === 'item' && 
                                                            dialogState.sourceId === selectedItem?.id;
                                  const isWaitingForContest = isPendingContest || isWaitingInRef || isAttackerWaiting;
                                  return isTargetConfirmed || isWaitingForContest;
                                })()}
                              />
                              
                              {/* Phase 7.9: 使用 TargetSelectionSection 組件處理目標確認和目標道具選擇 */}
                              {effect.requiresTarget && (() => {
                                const isPendingContest = selectedItem && hasPendingContest(selectedItem.id);
                                const isWaitingInRef = selectedItem && waitingContestRef.current.has(selectedItem.id);
                                const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                                                          dialogState.sourceType === 'item' && 
                                                          dialogState.sourceId === selectedItem?.id;
                                const isWaitingForContest = isPendingContest || isWaitingInRef || isAttackerWaiting;
                                
                                return (
                                  <TargetSelectionSection
                                    requiresTarget={true}
                                    checkType={selectedItem.checkType || 'none'}
                                    effect={effect}
                                    selectedTargetId={selectedUseTargetId}
                                    setSelectedTargetId={(targetId) => {
                                      setIsTargetConfirmed(false);
                                      setSelectedTargetItemId('');
                                      setSelectedUseTargetId(targetId);
                                    }}
                                    targetOptions={useTargets}
                                    isLoadingTargets={isLoadingUseTargets}
                                    isTargetConfirmed={isTargetConfirmed}
                                    setIsTargetConfirmed={setIsTargetConfirmed}
                                    targetItems={targetItems}
                                    selectedTargetItemId={selectedTargetItemId}
                                    setSelectedTargetItemId={setSelectedTargetItemId}
                                    isLoadingTargetItems={isLoadingTargetItems}
                                    onConfirmTarget={handleConfirmTarget}
                                    onCancelTarget={handleCancelTarget}
                                    disabled={isTargetConfirmed || isWaitingForContest}
                                  />
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phase 7.3: 使用結果訊息 */}
                    <UseResultDisplay result={useResult} />

                    {/* Phase 7.12: 對抗檢定獲勝後需要選擇目標道具 */}
                    <TargetItemSelectionSection
                      needsTargetItemSelection={needsTargetItemSelection && needsTargetItemSelection.sourceId === selectedItem?.id ? needsTargetItemSelection : null}
                      targetItemsForSelection={targetItemsForSelection}
                      selectedTargetItemForContest={selectedTargetItemForContest}
                      setSelectedTargetItemForContest={setSelectedTargetItemForContest}
                      isLoadingTargetItemsForContest={isLoadingTargetItemsForContest}
                      isSelectingTargetItem={isSelectingTargetItem}
                      onSelectTargetItem={handleSelectTargetItem}
                      onCancelSelection={handleCancelSelection}
                      onCloseDialog={handleCloseDialog}
                      showIcon={true}
                    />

                    {/* 獲得時間 */}
                    <div className="text-sm text-muted-foreground pt-2 border-t">
                      獲得於：{formatDate(selectedItem.acquiredAt)}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {/* 操作按鈕（Phase 10.5.4: 唯讀模式下隱藏） */}
              {!isReadOnly && (
              <DialogFooter className="flex-col sm:flex-row gap-2">
                        {/* 使用按鈕 */}
                {(hasItemEffects(selectedItem) || onUseItem) && (() => {
                  const { canUse, reason } = canUseItem(selectedItem);
                  const isPendingContest = hasPendingContest(selectedItem.id);
                  const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
                  const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                                            dialogState.sourceType === 'item' && 
                                            dialogState.sourceId === selectedItem.id;
                  const isWaitingForContest = isPendingContest || isWaitingInRef || isAttackerWaiting;
                  const hasItemTakeOrSteal = effects.some((e) => e.type === 'item_take' || e.type === 'item_steal');
                  const isContest = selectedItem.checkType === 'contest';
                  
                  // Phase 8: 對抗檢定時，不要求選擇目標道具
                  const needsTargetItemSelection = hasItemTakeOrSteal && !isContest;
                  
                  return (
                    <Button
                      onClick={handleUseItem}
                      disabled={
                        !canUse ||
                        isUsing ||
                        !onUseItem ||
                        (requiresTarget && !selectedUseTargetId) ||
                        (needsTargetItemSelection && (!isTargetConfirmed || !selectedTargetItemId)) ||
                        isWaitingForContest
                      }
                      className="w-full sm:w-auto"
                    >
                      {isUsing ? '使用中...' : 
                       isWaitingForContest ? '等待對抗檢定結果...' :
                       (() => {
                         if (selectedItem.checkType === 'contest' && !selectedUseTargetId) {
                           return '請選擇目標角色';
                         }
                         if (needsTargetItemSelection) {
                           if (!selectedUseTargetId) {
                             return '請選擇目標角色';
                           }
                           if (!isTargetConfirmed) {
                             return '請確認目標角色';
                           }
                           if (!selectedTargetItemId) {
                             return '請選擇目標道具';
                           }
                         }
                         if (!canUse && reason) {
                           return `使用道具 (${reason})`;
                         }
                         return '使用道具';
                       })()}
                    </Button>
                  );
                })()}
                
                {/* Phase 7.7: 展示按鈕 */}
                {gameId && characterId && (() => {
                  const isPendingContest = hasPendingContest(selectedItem.id);
                  const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
                  const isAttackerWaiting = dialogState?.type === 'attacker_waiting' &&
                                            dialogState.sourceType === 'item' &&
                                            dialogState.sourceId === selectedItem.id;
                  const isWaitingForContest = isPendingContest || isWaitingInRef || isAttackerWaiting;

                  return (
                    <Button
                      variant="outline"
                      onClick={handleOpenShowcase}
                      disabled={isWaitingForContest}
                      className="w-full sm:w-auto"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      展示
                    </Button>
                  );
                })()}

                {/* 轉移按鈕 */}
                {selectedItem.isTransferable && onTransferItem && gameId && characterId && (() => {
                  const isPendingContest = hasPendingContest(selectedItem.id);
                  const isWaitingInRef = waitingContestRef.current.has(selectedItem.id);
                  const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                                            dialogState.sourceType === 'item' && 
                                            dialogState.sourceId === selectedItem.id;
                  const isWaitingForContest = isPendingContest || isWaitingInRef || isAttackerWaiting;
                  
                  return (
                    <Button
                      variant="outline"
                      onClick={handleOpenTransfer}
                      disabled={isWaitingForContest}
                      className="w-full sm:w-auto"
                    >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    轉移道具
                  </Button>
                  );
                })()}
              </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 轉移選擇 Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={(open) => {
        setIsTransferDialogOpen(open);
        if (!open) {
          // 關閉時清除狀態
          setTransferItem(null);
          setSelectedTargetId('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選擇轉移對象</DialogTitle>
            <DialogDescription>
              將「{transferItem?.name}」轉移給其他角色
            </DialogDescription>
          </DialogHeader>

          {isLoadingTargets ? (
            <div className="py-8 text-center text-muted-foreground">
              載入中...
            </div>
          ) : transferTargets.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <User className="mx-auto h-12 w-12 mb-4" />
              <p>沒有其他角色可以轉移</p>
            </div>
          ) : (
            <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇角色..." />
              </SelectTrigger>
              <SelectContent>
                {transferTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferDialogOpen(false);
                setTransferItem(null);
                setSelectedTargetId('');
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!selectedTargetId || isTransferring}
            >
              {isTransferring ? '轉移中...' : '確認轉移'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7.7: 展示選擇 Dialog */}
      <Dialog open={isShowcaseSelectOpen} onOpenChange={(open) => {
        setIsShowcaseSelectOpen(open);
        if (!open) {
          setItemToShowcase(null);
          setSelectedShowcaseTargetId('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選擇展示對象</DialogTitle>
            <DialogDescription>
              將「{itemToShowcase?.name}」展示給其他角色
            </DialogDescription>
          </DialogHeader>

          {isLoadingShowcaseTargets ? (
            <div className="py-8 text-center text-muted-foreground">
              載入中...
            </div>
          ) : showcaseTargets.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <User className="mx-auto h-12 w-12 mb-4" />
              <p>沒有其他角色可以展示</p>
            </div>
          ) : (
            <Select value={selectedShowcaseTargetId} onValueChange={setSelectedShowcaseTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇角色..." />
              </SelectTrigger>
              <SelectContent>
                {showcaseTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsShowcaseSelectOpen(false);
                setItemToShowcase(null);
                setSelectedShowcaseTargetId('');
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleShowcase}
              disabled={!selectedShowcaseTargetId || isShowcasing}
            >
              {isShowcasing ? '展示中...' : '確認展示'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 道具卡片元件
interface ItemCardProps {
  item: Item;
  cooldownRemaining: number | null;
  onClick: () => void;
  disabled?: boolean;
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
}

function ItemCard({ item, cooldownRemaining, onClick, disabled = false, randomContestMaxValue = 100 }: ItemCardProps) {
  const isOnCooldown = cooldownRemaining !== null && cooldownRemaining > 0;

  return (
    <Card
      className={`overflow-hidden transition-all ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-lg'
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="aspect-square relative overflow-hidden bg-muted">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {item.type === 'consumable' ? (
              <Zap className="h-12 w-12 text-muted-foreground" />
            ) : (
              <Package className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}
        
        {/* 數量標籤 */}
        {item.quantity > 1 && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
            x{item.quantity}
          </div>
        )}

        {/* 冷卻中標籤 */}
        {isOnCooldown && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-white text-center">
              <Clock className="h-6 w-6 mx-auto mb-1" />
              <span className="text-sm font-mono">{cooldownRemaining}s</span>
            </div>
          </div>
        )}

        {/* 有效果標籤 */}
        {hasItemEffects(item) && !isOnCooldown && (
          <div className="absolute top-2 left-2">
            <Sparkles className="h-4 w-4 text-yellow-400 drop-shadow-lg" />
          </div>
        )}
        
        {/* Phase 8: 檢定類型標籤 */}
        {item.checkType && item.checkType !== 'none' && !isOnCooldown && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="text-xs">
              {item.checkType === 'contest' ? '對抗' : item.checkType === 'random_contest' ? '隨機對抗' : '隨機'}
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <h4 className="font-semibold text-sm line-clamp-1">{item.name}</h4>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
            {item.description}
          </p>
        )}
        {/* Phase 7.6: 標籤顯示 */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
              </Badge>
            ))}
          </div>
        )}
        {/* Phase 8: 檢定資訊（簡要顯示） */}
        {item.checkType === 'contest' && item.contestConfig && (
          <p className="text-xs text-muted-foreground mt-1">
            使用 {item.contestConfig.relatedStat} 對抗
          </p>
        )}
        {item.checkType === 'random_contest' && (
          <p className="text-xs text-muted-foreground mt-1">
            隨機擲骰，D{randomContestMaxValue} 對抗
          </p>
        )}
        {item.checkType === 'random' && item.randomConfig && (
          <p className="text-xs text-muted-foreground mt-1">
            {item.randomConfig.threshold} / {item.randomConfig.maxValue}
          </p>
        )}
        {/* 使用限制顯示 */}
        {(item.usageLimit != null || item.cooldown != null) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.usageLimit != null && (
              <Badge variant="outline" className="text-xs">
                {item.usageLimit > 0 
                  ? `使用次數：${(item.usageLimit || 0) - (item.usageCount || 0)} / ${item.usageLimit}`
                  : '使用次數：無限制'}
              </Badge>
            )}
            {item.cooldown != null && cooldownRemaining === null && (
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {item.cooldown > 0 ? `${item.cooldown}s` : '無冷卻時間'}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
