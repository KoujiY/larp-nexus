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
import { Package, Zap, Clock, ArrowRightLeft, Sparkles, User, CheckCircle2, XCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import type { Item } from '@/types/character';
import { formatDate } from '@/lib/utils/date';
import { getTransferTargets, getTargetCharacterItems, type TransferTargetCharacter, type TargetItemInfo } from '@/app/actions/public';
import { useTargetOptions } from '@/hooks/use-target-options';
import { EffectDisplay } from './effect-display';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useContestState } from '@/hooks/use-contest-state';
import { selectTargetItemForContest } from '@/app/actions/contest-select-item';

interface ItemListProps {
  items?: Item[];
  characterId: string;
  gameId: string;
  characterName: string;
  // Phase 8: 添加檢定結果參數，返回結果以便處理對抗檢定
  // Phase 7: 添加目標道具 ID 參數（用於 item_take 和 item_steal 效果）
  onUseItem?: (itemId: string, targetCharacterId?: string, checkResult?: number, targetItemId?: string) => Promise<{
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
    };
    message?: string;
  }>;
  onTransferItem?: (itemId: string, targetCharacterId: string) => Promise<void>;
}

export function ItemList({ items, characterId, gameId, characterName, onUseItem, onTransferItem }: ItemListProps) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isUsing, setIsUsing] = useState(false);
  // Phase 8: 檢定相關狀態
  const [checkResult, setCheckResult] = useState<number | undefined>(undefined);
  const [useResult, setUseResult] = useState<{ success: boolean; message: string } | null>(null);
  // 用於實時更新冷卻倒數的時間戳
  const [, setTick] = useState(0);
  
  // Phase 8: 對抗檢定狀態管理
  const { addPendingContest, removePendingContest, hasPendingContest, updateContestDialog, pendingContests } = useContestState(characterId);
  
  // 轉移相關狀態
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferTargets, setTransferTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferItem, setTransferItem] = useState<Item | null>(null); // 用於轉移對話框的道具引用
  
  // Phase 7: 目標道具選擇相關狀態（用於 item_take 和 item_steal）
  const [isTargetConfirmed, setIsTargetConfirmed] = useState(false); // 目標角色是否已確認
  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]); // 目標角色的道具清單
  const [selectedTargetItemId, setSelectedTargetItemId] = useState<string>(''); // 選中的目標道具 ID
  const [isLoadingTargetItems, setIsLoadingTargetItems] = useState(false); // 載入目標道具清單中

  // 防止重複 API 調用的 ref
  const restoredStateRef = useRef<Set<string>>(new Set()); // 記錄已經恢復過的道具 ID

  // 目標選擇狀態持久化的 key
  const getTargetStorageKey = useCallback((itemId: string) => `item-${characterId}-${itemId}-target`, [characterId]);

  // 清除目標選擇狀態
  const clearTargetState = (itemId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getTargetStorageKey(itemId);
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('清除目標選擇狀態失敗:', error);
    }
  };
  
  // Phase 8: 使用道具時的目標選擇狀態（包含檢定類型）
  // 重構：支援多個效果
  const effects = selectedItem?.effects || (selectedItem?.effect ? [selectedItem.effect] : []);
  const requiresTarget = Boolean(
    selectedItem?.checkType === 'contest' || 
    effects.some((effect) => effect.requiresTarget)
  );
  const targetType = selectedItem?.checkType === 'contest' 
    ? 'other' // 對抗檢定只能對其他角色使用
    : effects.find((e) => e.requiresTarget)?.targetType;

  const {
    targetOptions: useTargets,
    selectedTargetId: hookSelectedUseTargetId,
    setSelectedTargetId: setSelectedUseTargetIdHook,
    isLoading: isLoadingUseTargets,
  } = useTargetOptions({
    gameId,
    characterId,
    characterName,
    requiresTarget,
    targetType,
    enabled: !!selectedItem,
  });

  // 使用本地狀態來管理 selectedUseTargetId，避免被 hook 重置
  const [localSelectedUseTargetId, setLocalSelectedUseTargetId] = useState<string | undefined>(hookSelectedUseTargetId);
  
  // 同步 hook 的 selectedTargetId 到本地狀態
  useEffect(() => {
    // 只有在 hook 的值變化且本地狀態為 undefined 時才同步（避免覆蓋恢復的值）
    if (hookSelectedUseTargetId !== undefined && localSelectedUseTargetId === undefined) {
      setLocalSelectedUseTargetId(hookSelectedUseTargetId);
    }
  }, [hookSelectedUseTargetId, localSelectedUseTargetId]);

  // 使用本地狀態作為 selectedUseTargetId
  const selectedUseTargetId = localSelectedUseTargetId;

  // 儲存目標選擇狀態到 localStorage（必須在 selectedUseTargetId 聲明之後）
  const saveTargetState = useCallback((itemId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getTargetStorageKey(itemId);
      const state = {
        selectedTargetId: selectedUseTargetId || undefined,
        isTargetConfirmed,
        selectedTargetItemId: selectedTargetItemId || undefined,
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('儲存目標選擇狀態失敗:', error);
    }
  }, [getTargetStorageKey, selectedUseTargetId, isTargetConfirmed, selectedTargetItemId]);
  
  // 包裝 setSelectedUseTargetId 以同時更新本地狀態和 hook
  const setSelectedUseTargetId = useCallback((id: string | undefined) => {
    setLocalSelectedUseTargetId(id);
    setSelectedUseTargetIdHook(id);
  }, [setSelectedUseTargetIdHook]);

  // 從 localStorage 恢復目標選擇狀態
  const restoreTargetState = useCallback(async (itemId: string) => {
    if (typeof window === 'undefined') return;
    
    // 防止重複調用：如果已經恢復過這個道具的狀態，則跳過
    if (restoredStateRef.current.has(itemId)) {
      return;
    }
    
    try {
      const storageKey = getTargetStorageKey(itemId);
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.selectedTargetId) {
          // 標記為已恢復
          restoredStateRef.current.add(itemId);
          
          setLocalSelectedUseTargetId(state.selectedTargetId);
          setSelectedUseTargetIdHook(state.selectedTargetId);
          setIsTargetConfirmed(state.isTargetConfirmed || false);
          setSelectedTargetItemId(state.selectedTargetItemId || '');
          
          // 如果已確認目標且需要目標道具，自動載入目標的道具清單
          if (state.isTargetConfirmed && state.selectedTargetId) {
            const itemEffects = selectedItem?.effects || (selectedItem?.effect ? [selectedItem.effect] : []);
            const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
            if (needsTargetItem) {
              // 檢查是否已經有道具清單，避免重複載入
              if (targetItems.length === 0) {
                setIsLoadingTargetItems(true);
                try {
                  const result = await getTargetCharacterItems(state.selectedTargetId);
                  if (result.success && result.data) {
                    setTargetItems(result.data);
                    // 如果 localStorage 中有保存的 selectedTargetItemId，恢復它
                    if (state.selectedTargetItemId) {
                      const itemExists = result.data.some(item => item.id === state.selectedTargetItemId);
                      if (itemExists) {
                        setSelectedTargetItemId(state.selectedTargetItemId);
                      }
                    }
                  }
                } catch (error) {
                  console.error('載入目標道具清單失敗:', error);
                } finally {
                  setIsLoadingTargetItems(false);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('恢復目標選擇狀態失敗:', error);
    }
  }, [selectedItem, setSelectedUseTargetIdHook, targetItems.length, getTargetStorageKey]);

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

  // 檢查道具是否可使用
  const canUseItem = (item: Item): { canUse: boolean; reason?: string } => {
    // Phase 8: 檢查是否有正在進行的對抗檢定
    if (hasPendingContest(item.id)) {
      return { canUse: false, reason: '對抗檢定進行中' };
    }

    // 消耗品數量檢查
    if (item.type === 'consumable' && item.quantity <= 0) {
      return { canUse: false, reason: '數量不足' };
    }

    // 使用次數檢查
    if (item.usageLimit && item.usageLimit > 0) {
      if ((item.usageCount || 0) >= item.usageLimit) {
        return { canUse: false, reason: '已達使用次數上限' };
      }
    }

    // 冷卻時間檢查
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      const now = Date.now();
      const cooldownMs = item.cooldown * 1000;
      if (now - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
        return { canUse: false, reason: `冷卻中 (${remainingSeconds}s)` };
      }
    }

    return { canUse: true };
  };

  // 計算冷卻剩餘時間
  const getCooldownRemaining = (item: Item): number | null => {
    if (!item.cooldown || item.cooldown <= 0 || !item.lastUsedAt) return null;
    
    const lastUsed = new Date(item.lastUsedAt).getTime();
    const now = Date.now();
    const cooldownMs = item.cooldown * 1000;
    const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
    
    return remaining > 0 ? remaining : null;
  };

  // Phase 8: 從持久化狀態恢復 dialog，並檢查對抗檢定是否已完成
  useEffect(() => {
    if (!items || Object.keys(pendingContests).length === 0) return;

    // 檢查每個 pending contest 是否已完成
    const now = Date.now();
    const queryPromises: Promise<void>[] = [];
    
    for (const [itemId, contest] of Object.entries(pendingContests)) {
      if (contest.sourceType === 'item') {
        const item = items.find((i) => i.id === itemId);
        if (item) {
          // Phase 8: 如果 dialogOpen 為 true，自動打開道具 dialog（顯示等待狀態）
          // 這樣攻擊方重新整理後，會看到道具 dialog 而不是全局等待 modal
          if (contest.dialogOpen && !selectedItem) {
            
            // Phase 8: 先關閉全局等待 dialog（設置 dialogOpen 為 false）
            // 因為道具 dialog 會顯示等待狀態，不需要全局等待 modal
            // 這必須在設置 selectedItem 之前執行，確保全局等待 modal 不會顯示
            updateContestDialog(itemId, false);
            
            // 設置選中的道具，這會自動打開 dialog
            setSelectedItem(item);
            
            // Phase 8: 設置等待狀態訊息，讓道具 dialog 顯示等待狀態
            setUseResult({
              success: true,
              message: '對抗檢定請求已發送，等待防守方回應...',
            });
            
          }
          
          const contestAge = now - contest.timestamp;
          
          // Phase 8: 如果對抗檢定超過 10 秒，查詢服務器狀態確認是否已完成
          // 這是為了處理攻擊方重新整理後無法收到 WebSocket 事件的情況
          // 10 秒是一個合理的等待時間，足夠防守方回應，同時不會讓用戶等待太久
          if (contestAge > 10000) { // 10 秒
            
            // 查詢服務器狀態
            const queryPromise = import('@/app/actions/contest-query').then(({ queryContestStatus }) => {
              return queryContestStatus(contest.contestId, characterId)
                .then((result) => {
                  if (result.success && result.data) {
                    if (!result.data.isActive) {
                      // 對抗檢定已完成，清除本地狀態
                      removePendingContest(itemId);
                    } else {
                      // 對抗檢定仍在進行中，保持狀態
                    }
                  } else {
                    // 查詢失敗，清除本地狀態（避免狀態一直保留）
                    removePendingContest(itemId);
                  }
                })
                .catch((error) => {
                  console.error('[item-list] 查詢對抗檢定狀態錯誤', { itemId, error });
                  // 查詢錯誤時，不清除本地狀態（可能是網絡問題），但記錄錯誤
                });
            });
            
            queryPromises.push(queryPromise);
          }
        }
      }
    }
    
    // 等待所有查詢完成（但不阻塞 UI）
    Promise.all(queryPromises).catch((error) => {
      console.error('[item-list] 查詢對抗檢定狀態時發生錯誤', error);
    });
  }, [items, pendingContests, selectedItem, setSelectedUseTargetId, removePendingContest, characterId, updateContestDialog]);

  // Phase 8: 關閉 dialog 的統一處理
  const handleCloseDialog = () => {
    // Phase 8: 清除 dialog 狀態（如果有 pending contest）
    if (selectedItem && hasPendingContest(selectedItem.id)) {
      updateContestDialog(selectedItem.id, false);
    }
    setSelectedItem(null);
    setCheckResult(undefined);
    setUseResult(null);
    setLocalSelectedUseTargetId(undefined);
    setSelectedUseTargetIdHook(undefined);
    // Phase 7: 清除目標道具選擇狀態
    setIsTargetConfirmed(false);
    setTargetItems([]);
    setSelectedTargetItemId('');
    // Phase 8: 清除對抗檢定後的目標道具選擇狀態
    setNeedsTargetItemSelection(null);
    setTargetItemsForSelection([]);
    setSelectedTargetItemForContest('');
  };
  
  // Phase 8: 當選擇目標角色時，檢查是否需要載入目標道具清單
  // 注意：對抗檢定時，不需要載入目標道具清單
  useEffect(() => {
    const itemEffects = selectedItem?.effects || (selectedItem?.effect ? [selectedItem.effect] : []);
    const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
    const isContest = selectedItem?.checkType === 'contest';
    
    // 如果效果需要目標道具，且已選擇目標角色，但尚未確認，則重置確認狀態
    // 對抗檢定時跳過此邏輯
    if (needsTargetItem && !isContest && selectedUseTargetId && !isTargetConfirmed) {
      setIsTargetConfirmed(false);
      setTargetItems([]);
      setSelectedTargetItemId('');
    }
  }, [selectedItem, selectedUseTargetId, isTargetConfirmed]);

  // 當選擇道具時，恢復目標選擇狀態
  // 需要在 useTargetOptions 載入完成後再恢復，避免被重置
  useEffect(() => {
    if (selectedItem && !isLoadingUseTargets && useTargets.length > 0) {
      // 延遲恢復，確保 useTargetOptions 已經載入完成
      const timer = setTimeout(() => {
        restoreTargetState(selectedItem.id);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedItem?.id, isLoadingUseTargets, useTargets.length, restoreTargetState, selectedItem]); // 等待載入完成

  // 當目標選擇狀態變化時，儲存到 localStorage
  useEffect(() => {
    if (selectedItem && (selectedUseTargetId || isTargetConfirmed || selectedTargetItemId)) {
      saveTargetState(selectedItem.id);
    }
  }, [selectedItem?.id, selectedUseTargetId, isTargetConfirmed, selectedTargetItemId, selectedItem, saveTargetState]);
  
  // Phase 8: 確認目標角色並載入目標道具清單
  // 注意：對抗檢定時，不應該調用此函數
  const handleConfirmTarget = async () => {
    if (!selectedUseTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    const itemEffects = selectedItem?.effects || (selectedItem?.effect ? [selectedItem.effect] : []);
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
        saveTargetState(selectedItem.id);
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
        if (selectedItem) {
          const storageKey = getTargetStorageKey(selectedItem.id);
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            try {
              const state = JSON.parse(stored);
              if (state.selectedTargetItemId) {
                // 檢查該道具是否仍在目標角色的道具清單中
                const itemExists = result.data.some(item => item.id === state.selectedTargetItemId);
                if (itemExists) {
                  setSelectedTargetItemId(state.selectedTargetItemId);
                }
              }
            } catch {
              // 忽略解析錯誤
            }
          }
          saveTargetState(selectedItem.id);
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
    setTargetItems([]);
    setSelectedTargetItemId('');
    setLocalSelectedUseTargetId(undefined);
    setSelectedUseTargetIdHook(undefined);
  };

  // Phase 8: 需要選擇目標道具的狀態（持久化到 localStorage）
  const getNeedsTargetItemSelectionKey = useCallback(() => `item-needs-target-selection-${characterId}`, [characterId]);
  
  const [needsTargetItemSelection, setNeedsTargetItemSelection] = useState<{
    contestId: string;
    itemId: string;
    defenderId: string;
  } | null>(null);
  const [targetItemsForSelection, setTargetItemsForSelection] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemForContest, setSelectedTargetItemForContest] = useState<string>('');
  const [isLoadingTargetItemsForContest, setIsLoadingTargetItemsForContest] = useState(false);
  const [isSelectingTargetItem, setIsSelectingTargetItem] = useState(false);

  // 從 localStorage 恢復需要選擇目標道具的狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getNeedsTargetItemSelectionKey();
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { contestId: string; itemId: string; defenderId: string; timestamp: number };
        // 檢查是否過期（超過 1 小時）
        const now = Date.now();
        if (now - parsed.timestamp < 3600000 && parsed.defenderId) {
          setNeedsTargetItemSelection({
            contestId: parsed.contestId,
            itemId: parsed.itemId,
            defenderId: parsed.defenderId,
          });
          
          // 載入防守方的道具清單
          if (parsed.defenderId) {
            setIsLoadingTargetItemsForContest(true);
            getTargetCharacterItems(parsed.defenderId)
              .then((result) => {
                if (result.success && result.data) {
                  // 如果道具清單為空，清除狀態並顯示通知
                  if (result.data.length === 0) {
                    // 清除 useResult 狀態（清除「等待回應」的 toast）
                    setUseResult(null);
                    
                    // 調用 API 清除服務器端的對抗檢定追蹤並發送通知
                    import('@/app/actions/contest-cancel').then(({ cancelContestItemSelection }) => {
                      cancelContestItemSelection(parsed.contestId, characterId).catch((error) => {
                        console.error('取消對抗檢定失敗:', error);
                      });
                    });
                    
                    localStorage.removeItem(storageKey);
                    setNeedsTargetItemSelection(null);
                    if (parsed.itemId) {
                      removePendingContest(parsed.itemId);
                    }
                    // 關閉對話框
                    setTimeout(() => {
                      handleCloseDialog();
                    }, 0);
                    return;
                  }
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
      console.error('[item-list] 恢復需要選擇目標道具狀態失敗:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getNeedsTargetItemSelectionKey, characterId]);

  // 保存需要選擇目標道具的狀態到 localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getNeedsTargetItemSelectionKey();
    try {
      if (needsTargetItemSelection) {
        const stateToSave = {
          ...needsTargetItemSelection,
          timestamp: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error('[item-list] 保存需要選擇目標道具狀態失敗:', error);
    }
  }, [needsTargetItemSelection, getNeedsTargetItemSelectionKey]);

  // Phase 8: 當恢復 needsTargetItemSelection 狀態時，自動打開對應的道具 dialog
  useEffect(() => {
    if (!needsTargetItemSelection) return;
    
    // 如果 items 還沒有載入，等待載入完成
    if (!items || items.length === 0) {
      return;
    }
    
    // 找到對應的道具
    const item = items.find((i) => i.id === needsTargetItemSelection.itemId);
    if (!item) {
      // 如果找不到對應的道具，清除狀態
      console.warn('[item-list] 找不到對應的道具，清除 needsTargetItemSelection 狀態:', needsTargetItemSelection.itemId);
      setNeedsTargetItemSelection(null);
      return;
    }
    
    // 如果 dialog 還沒有打開，或者打開的不是這個道具，則打開它
    if (!selectedItem || selectedItem.id !== needsTargetItemSelection.itemId) {
      // 設置選中的道具，這會自動打開 dialog
      setSelectedItem(item);
      
      // 確保對抗檢定狀態已設置（從 pendingContests 恢復）
      // 如果 pendingContests 中沒有這個道具的記錄，需要添加
      if (!hasPendingContest(needsTargetItemSelection.itemId)) {
        // 從 contestId 解析（格式：attackerId::itemId::timestamp）
        const parts = needsTargetItemSelection.contestId.split('::');
        if (parts.length === 3) {
          addPendingContest(needsTargetItemSelection.itemId, 'item', needsTargetItemSelection.contestId);
          // Phase 8: 關閉等待 dialog（設置 dialogOpen 為 false），因為現在要顯示道具選擇 dialog
          updateContestDialog(needsTargetItemSelection.itemId, false);
          console.log('[item-list] 已恢復對抗檢定狀態並關閉等待 dialog:', {
            itemId: needsTargetItemSelection.itemId,
            contestId: needsTargetItemSelection.contestId,
          });
        }
      } else {
        // 如果已經有對抗檢定狀態，關閉等待 dialog（因為現在要顯示道具選擇 dialog）
        updateContestDialog(needsTargetItemSelection.itemId, false);
      }
    }
  }, [needsTargetItemSelection, items, selectedItem, hasPendingContest, addPendingContest, updateContestDialog]);

  // Phase 8: 監聽對抗檢定結果事件，當收到結果時關閉 dialog 並清除狀態
  // 注意：必須在所有條件返回之前調用，符合 React Hooks 規則
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'skill.contest') {
      const payload = event.payload as SkillContestEvent['payload'];
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);
      
      console.log('[item-list] WebSocket 收到 skill.contest 事件:', {
        eventType: event.type,
        timestamp: event.timestamp,
        payload: {
          attackerId: payload.attackerId,
          defenderId: payload.defenderId,
          sourceType: payload.sourceType,
          itemId: payload.itemId,
          skillId: payload.skillId,
          attackerValue: payload.attackerValue,
          result: payload.result,
          needsTargetItemSelection: payload.needsTargetItemSelection,
        },
        characterIdStr,
        attackerIdStr,
        defenderIdStr,
        selectedItemId: selectedItem?.id,
        isAttacker: attackerIdStr === characterIdStr,
        isDefender: defenderIdStr === characterIdStr,
        isResultEvent: payload.attackerValue !== 0,
        isItemContest: payload.sourceType === 'item',
        itemIdMatches: payload.itemId === selectedItem?.id,
      });
      
      // 處理道具的對抗檢定結果（sourceType === 'item'）
      // 注意：防守方的事件（defenderId === characterId）不應該在這裡處理
      if (
        payload.attackerValue !== 0 && 
        attackerIdStr === characterIdStr && 
        defenderIdStr !== characterIdStr &&
        payload.sourceType === 'item' &&
        payload.itemId
      ) {
        // Phase 8: 如果攻擊方獲勝且需要選擇目標道具
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection) {
          
          // 從 pendingContests 中獲取 contestId
          const pendingContest = pendingContests[payload.itemId];
          const contestId = pendingContest?.contestId || `${attackerIdStr}::${payload.itemId}::${event.timestamp}`;
          
          // 設置需要選擇目標道具的狀態（會自動保存到 localStorage）
          setNeedsTargetItemSelection({
            contestId,
            itemId: payload.itemId,
            defenderId: defenderIdStr,
          });
          
          // 保持對抗檢定狀態，不應該清除 pendingContests
          // 這樣即使重新整理頁面，也能保持狀態
          
          // 確保對抗檢定狀態已設置（如果沒有，則添加）
          if (!hasPendingContest(payload.itemId)) {
            addPendingContest(payload.itemId, 'item', contestId);
          }
          // Phase 8: 關閉等待 dialog（設置 dialogOpen 為 false），因為現在要顯示道具選擇 dialog
          // 但保持對抗檢定狀態（不從 pendingContests 中移除），直到選擇完目標道具
          updateContestDialog(payload.itemId, false);
          
          // 如果對應的道具還沒有打開，自動打開它
          if (items && !selectedItem) {
            const item = items.find((i) => i.id === payload.itemId);
            if (item) {
              setSelectedItem(item);
            }
          } else if (selectedItem && selectedItem.id !== payload.itemId) {
            // 如果當前選中的道具不是這個道具，切換到這個道具
            const item = items?.find((i) => i.id === payload.itemId);
            if (item) {
              setSelectedItem(item);
            }
          } else if (selectedItem && selectedItem.id === payload.itemId) {
            // 如果道具 dialog 已經打開，確保它保持打開狀態
          }
          
          // 載入防守方的道具清單
          setIsLoadingTargetItemsForContest(true);
          getTargetCharacterItems(defenderIdStr)
            .then((result) => {
              if (result.success && result.data) {
                // 如果道具清單為空，立即關閉對話框並顯示通知
                if (result.data.length === 0) {
                  // 從 pendingContests 中獲取 contestId
                  const pendingContest = payload.itemId ? pendingContests[payload.itemId] : null;
                  const contestId = pendingContest?.contestId || (payload.itemId ? `${characterIdStr}::${payload.itemId}::${Date.now()}` : '');
                  
                  // 清除 useResult 狀態（清除「等待回應」的 toast）
                  setUseResult(null);
                  
                  // 調用 API 清除服務器端的對抗檢定追蹤並發送通知
                  if (contestId && payload.itemId) {
                    import('@/app/actions/contest-cancel').then(({ cancelContestItemSelection }) => {
                      cancelContestItemSelection(contestId, characterIdStr).catch((error) => {
                        console.error('取消對抗檢定失敗:', error);
                      });
                    });
                  }
                  
                  setNeedsTargetItemSelection(null);
                  if (payload.itemId) {
                    removePendingContest(payload.itemId);
                  }
                  // 關閉對話框
                  setTimeout(() => {
                    handleCloseDialog();
                  }, 0);
                  return;
                }
                setTargetItemsForSelection(result.data);
              } else {
                toast.error(result.message || '無法載入目標角色的道具清單');
                setNeedsTargetItemSelection(null);
                // 如果載入失敗，清除對抗檢定狀態
                if (payload.itemId) {
                  removePendingContest(payload.itemId);
                }
              }
            })
            .catch((error) => {
              console.error('載入目標道具清單失敗:', error);
              toast.error('載入目標道具清單失敗');
              setNeedsTargetItemSelection(null);
              // 如果載入失敗，清除對抗檢定狀態
              if (payload.itemId) {
                removePendingContest(payload.itemId);
              }
            })
            .finally(() => {
              setIsLoadingTargetItemsForContest(false);
            });
          
          // 不關閉 dialog，讓用戶選擇目標道具
          // 不清除對抗檢定狀態，保持鎖定狀態直到選擇完成
          return;
        }
        
        
        // Phase 8: 顯示對抗檢定結果通知（道具類型由 item-list.tsx 處理）
        // 注意：如果 needsTargetItemSelection 為 false 或 undefined，表示對抗檢定已完成（可能是選擇完目標道具後的結果通知）
        // 在這種情況下，應該清除對抗檢定狀態
        const resultText = payload.result === 'attacker_wins' 
          ? '攻擊方獲勝' 
          : payload.result === 'defender_wins' 
          ? '防守方獲勝' 
          : '雙方平手';
        toast.success(`對抗檢定結果：${resultText}`, {
          description: payload.effectsApplied && payload.effectsApplied.length > 0 
            ? `效果：${payload.effectsApplied.join('、')}` 
            : undefined,
        });
        
        // 清除對抗檢定狀態（無論 dialog 是否打開）
        // 這包括：攻擊方獲勝但不需要選擇目標道具、攻擊方失敗、防守方獲勝、雙方平手、以及選擇完目標道具後的情況
        removePendingContest(payload.itemId);
        
        // 清除目標選擇狀態（如果有的話）
        if (payload.itemId) {
          clearTargetState(payload.itemId);
        }
        
        // 清除 needsTargetItemSelection 狀態（如果有的話）
        if (needsTargetItemSelection && needsTargetItemSelection.itemId === payload.itemId) {
          setNeedsTargetItemSelection(null);
          setTargetItemsForSelection([]);
          setSelectedTargetItemForContest('');
        }
        
        // 如果 dialog 是打開的，關閉它
        if (selectedItem && selectedItem.id === payload.itemId) {
          setTimeout(() => {
            handleCloseDialog();
          }, 0);
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

  // Phase 8: 使用道具（添加檢定處理）
  const handleUseItem = async () => {
    if (!selectedItem || !onUseItem) return;
    
    const { canUse } = canUseItem(selectedItem);
    if (!canUse) {
      return;
    }

    // Phase 8: 檢查是否需要選擇目標角色
    if (requiresTarget && !selectedUseTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    // Phase 8: 檢查是否需要確認目標角色和選擇目標道具
    // 注意：對抗檢定時，不需要在初始使用時選擇目標道具
    const itemEffects = selectedItem?.effects || (selectedItem?.effect ? [selectedItem.effect] : []);
    const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
    const isContest = selectedItem.checkType === 'contest';
    
    // 非對抗檢定時，才需要確認目標角色和選擇目標道具
    if (needsTargetItem && !isContest) {
      if (selectedUseTargetId && !isTargetConfirmed) {
        toast.error('請先確認目標角色');
        return;
      }
      
      if (!selectedTargetItemId) {
        toast.error('請選擇目標道具');
        return;
      }
    }

    // Phase 8: 如果是隨機檢定，自動骰骰子
    let finalCheckResult: number | undefined = undefined;
    if (selectedItem.checkType === 'random' && selectedItem.randomConfig) {
      finalCheckResult = Math.floor(Math.random() * selectedItem.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
      toast.info(`骰出結果：${finalCheckResult}`);
    }

    // Phase 8: 對抗檢定必須有目標角色
    if (selectedItem.checkType === 'contest') {
      if (!selectedUseTargetId) {
        toast.error('對抗檢定需要選擇目標角色');
        return;
      }
    }

    setIsUsing(true);
    try {
      // Phase 8: 對抗檢定時不傳遞 targetItemId，將在判定失敗後選擇
      const targetItemIdForUse = isContest ? undefined : selectedTargetItemId || undefined;
      const result = await onUseItem(selectedItem.id, selectedUseTargetId, finalCheckResult, targetItemIdForUse);
      
      // Phase 8: 處理使用結果
      if (result.success) {
        // 更新本地道具狀態（反映冷卻時間和使用次數）
        // 注意：這裡我們不更新 items 陣列，因為 router.refresh() 會重新載入
        
        // Phase 8: 處理對抗檢定結果
        // 注意：必須先檢查 contestId，因為對抗檢定時 checkPassed 也是 false
        if (result.data?.contestId) {
          console.log('[item-list] 對抗檢定分支: 等待防守方回應', {
            contestId: result.data.contestId,
            message: result.message,
          });
          // 對抗檢定：等待防守方回應
          // 記錄正在進行的對抗檢定狀態，並保存 dialog 狀態
          addPendingContest(selectedItem.id, 'item', result.data.contestId);
          updateContestDialog(selectedItem.id, true, selectedUseTargetId);
          setUseResult({ 
            success: true, 
            message: result.message || '對抗檢定請求已發送，等待防守方回應...' 
          });
          toast.info(result.message || '對抗檢定請求已發送，等待防守方回應...', {
            duration: 5000,
          });
          // 不關閉 dialog，讓用戶看到等待狀態
          // 注意：dialog 將在收到對抗檢定結果事件時通過 WebSocket 監聽關閉
        } else if (result.data?.checkPassed === false) {
          // 非對抗檢定的檢定失敗
          setUseResult({ success: false, message: '檢定失敗，道具未生效' });
          toast.warning('檢定失敗，道具未生效');
          // 檢定失敗時關閉 dialog
          setTimeout(() => {
            handleCloseDialog();
          }, 2000);
        } else {
          console.log('[item-list] 檢定成功或無檢定分支', {
            checkPassed: result.data?.checkPassed,
            message: result.message,
          });
          // 檢定成功或無檢定
          setUseResult({ success: true, message: result.message || '道具使用成功' });
          toast.success(result.message || '道具使用成功');
          // 道具使用成功後，清除目標選擇狀態
          if (selectedItem) {
            clearTargetState(selectedItem.id);
          }
          // 使用成功時關閉 dialog
          setTimeout(() => {
            handleCloseDialog();
          }, 1500);
        }
        // 重新載入頁面資料（不重新整理整個頁面）
        router.refresh();
      } else {
        setUseResult({ success: false, message: result.message || '道具使用失敗' });
        toast.error(result.message || '道具使用失敗');
        // 使用失敗時關閉 dialog
        setTimeout(() => {
          handleCloseDialog();
        }, 2000);
      }
    } catch (error) {
      console.error('道具使用錯誤:', error);
      setUseResult({ success: false, message: '道具使用失敗，請稍後再試' });
      toast.error('道具使用失敗，請稍後再試');
      setTimeout(() => {
        handleCloseDialog();
      }, 2000);
    } finally {
      setIsUsing(false);
    }
  };

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
      setLocalSelectedUseTargetId(undefined);
      setSelectedUseTargetIdHook(undefined);
      setIsTargetConfirmed(false);
      setTargetItems([]);
      setSelectedTargetItemId('');
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
                const { canUse } = canUseItem(item);
                const isDisabled = !canUse || isPendingContest;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    cooldownRemaining={getCooldownRemaining(item)}
                    onClick={() => {
                      if (!isDisabled) {
                        setSelectedItem(item);
                      }
                    }}
                    disabled={isDisabled}
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
                const { canUse } = canUseItem(item);
                const isDisabled = !canUse || isPendingContest;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    cooldownRemaining={getCooldownRemaining(item)}
                    onClick={() => {
                      if (!isDisabled) {
                        setSelectedItem(item);
                      }
                    }}
                    disabled={isDisabled}
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
        if (!open && selectedItem && !hasPendingContest(selectedItem.id)) {
          handleCloseDialog();
        }
      }}>
        <DialogContent
          showCloseButton={!selectedItem || !hasPendingContest(selectedItem.id)}
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
                    {selectedItem.type === 'consumable' ? '消耗品' : '裝備'}
                  </Badge>
                  {((selectedItem.effects && selectedItem.effects.length > 0) || selectedItem.effect) && (
                    <Badge variant="default">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {(selectedItem.effects && selectedItem.effects.length > 0) ? `${selectedItem.effects.length} 個效果` : '有效果'}
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
                      
                      {selectedItem.usageLimit != null && Number(selectedItem.usageLimit) > 0 && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-muted-foreground mb-1">剩餘使用次數</div>
                          <div className="font-semibold text-lg">
                            {Number(selectedItem.usageLimit) - (selectedItem.usageCount || 0)} / {selectedItem.usageLimit}
                          </div>
                        </div>
                      )}

                      {selectedItem.cooldown && selectedItem.cooldown > 0 && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-muted-foreground mb-1">冷卻時間</div>
                          <div className="font-semibold text-lg flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {selectedItem.cooldown}s
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Phase 8: 檢定資訊 */}
                    {selectedItem.checkType && selectedItem.checkType !== 'none' && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">檢定資訊</h4>
                        {selectedItem.checkType === 'contest' && selectedItem.contestConfig && (
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-sm">
                              檢定類型：對抗檢定
                            </p>
                            <p className="text-sm mt-1">
                              使用數值：<strong>{selectedItem.contestConfig.relatedStat}</strong>
                            </p>
                            {(() => {
                              const maxItems = selectedItem.contestConfig.opponentMaxItems ?? 0;
                              const maxSkills = selectedItem.contestConfig.opponentMaxSkills ?? 0;
                              const itemsText = maxItems > 0 ? `${maxItems} 個道具` : null;
                              const skillsText = maxSkills > 0 ? `${maxSkills} 個技能` : null;
                              const parts = [itemsText, skillsText].filter(Boolean);
                              return parts.length > 0 && (
                                <p className="text-sm mt-1">
                                  對方可使用：最多 {parts.join('、')}
                                </p>
                              );
                            })()}
                            <p className="text-sm mt-1">
                              平手裁決：{
                                selectedItem.contestConfig.tieResolution === 'attacker_wins' ? '攻擊方獲勝' :
                                selectedItem.contestConfig.tieResolution === 'defender_wins' ? '防守方獲勝' :
                                '雙方失敗'
                              }
                            </p>
                            <p className="text-sm mt-2 text-muted-foreground">
                              使用道具後，對方會收到通知並可選擇使用道具或技能進行對抗
                            </p>
                          </div>
                        )}
                        {selectedItem.checkType === 'random' && selectedItem.randomConfig && (
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-sm">
                              檢定類型：隨機檢定
                            </p>
                            <p className="text-sm mt-1">
                              隨機範圍：1 - {selectedItem.randomConfig.maxValue}
                            </p>
                            <p className="text-sm mt-1">
                              檢定門檻：<strong>{selectedItem.randomConfig.threshold}</strong>
                              （&ge; {selectedItem.randomConfig.threshold} 即成功）
                            </p>
                            {checkResult !== undefined && (
                              <div className="mt-2 flex items-center gap-2">
                                <p className="text-sm">骰出結果：<strong>{checkResult}</strong></p>
                                {checkResult >= selectedItem.randomConfig.threshold ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <span className="text-sm text-green-600">檢定成功</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4 text-red-500" />
                                    <span className="text-sm text-red-600">檢定失敗</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 使用效果 */}
                    {((selectedItem.effects && selectedItem.effects.length > 0) || selectedItem.effect) && (
                      <div className="p-3 bg-purple-50 rounded-lg space-y-3">
                        <div className="text-sm font-medium text-purple-800 mb-1 flex items-center gap-1">
                          <Sparkles className="h-4 w-4" />
                          使用效果
                        </div>
                        <div className="space-y-3">
                          {(selectedItem.effects || (selectedItem.effect ? [selectedItem.effect] : [])).map((effect, index) => (
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
                                  setTargetItems([]);
                                  setSelectedTargetItemId('');
                                  setLocalSelectedUseTargetId(targetId);
                                  setSelectedUseTargetIdHook(targetId);
                                }}
                                className="bg-transparent p-0 text-purple-700"
                                disabled={isTargetConfirmed}
                              />
                            </div>
                          ))}
                        </div>
                        
                        {/* Phase 8: 目標角色確認和目標道具選擇 */}
                        {/* 注意：對抗檢定時，不顯示目標道具選擇 UI，將在判定失敗後顯示 */}
                        {effects.some((e) => e.type === 'item_take' || e.type === 'item_steal') && selectedItem.checkType !== 'contest' ? (
                          <div className="mt-4 space-y-3">
                            {selectedUseTargetId && !isTargetConfirmed && (
                              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <p className="text-sm font-medium text-blue-800 mb-2">
                                  已選擇目標角色：{useTargets.find(t => t.id === selectedUseTargetId)?.name || '未知'}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={handleConfirmTarget}
                                    disabled={isLoadingTargetItems}
                                    className="flex-1"
                                  >
                                    {isLoadingTargetItems ? '載入中...' : '確認目標'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelTarget}
                                    disabled={isLoadingTargetItems}
                                  >
                                    取消
                                  </Button>
                                </div>
                              </div>
                            )}
                            
                            {isTargetConfirmed && targetItems.length > 0 && (() => {
                              const targetItemEffect = effects.find((e) => e.type === 'item_take' || e.type === 'item_steal');
                              const isSteal = targetItemEffect?.type === 'item_steal';
                              return (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-purple-800">
                                    選擇目標道具：
                                  </p>
                                  <Select value={selectedTargetItemId} onValueChange={setSelectedTargetItemId}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder={`選擇要${isSteal ? '偷竊' : '移除'}的道具...`} />
                                    </SelectTrigger>
                                  <SelectContent>
                                    {targetItems.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              );
                            })()}
                            
                            {isTargetConfirmed && targetItems.length === 0 && (
                              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <p className="text-sm text-yellow-800">
                                  目標角色沒有道具
                                </p>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Phase 8: 使用結果訊息 */}
                    {useResult && (
                      <div className={`p-4 rounded-lg border-2 ${
                        useResult.success 
                          ? 'bg-green-50 border-green-200 text-green-800' 
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div className="flex items-center gap-2">
                          {useResult.success ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                          )}
                          <p className="font-medium">{useResult.message}</p>
                        </div>
                      </div>
                    )}

                    {/* Phase 8: 對抗檢定獲勝後需要選擇目標道具 */}
                    {needsTargetItemSelection && needsTargetItemSelection.itemId === selectedItem?.id && (
                      <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                            <p className="font-medium text-blue-800">對抗檢定成功！請選擇目標道具</p>
                          </div>
                          {isLoadingTargetItemsForContest ? (
                            <p className="text-sm text-blue-700">載入目標道具清單中...</p>
                          ) : targetItemsForSelection.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-blue-800">選擇目標道具：</p>
                              <Select value={selectedTargetItemForContest} onValueChange={setSelectedTargetItemForContest}>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="選擇要偷竊或移除的道具..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {targetItemsForSelection.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                onClick={async () => {
                                  if (!selectedTargetItemForContest || !needsTargetItemSelection) return;
                                  
                                  setIsSelectingTargetItem(true);
                                  try {
                                    
                                    const result = await selectTargetItemForContest(
                                      needsTargetItemSelection.contestId,
                                      characterId,
                                      selectedTargetItemForContest,
                                      needsTargetItemSelection.defenderId // 傳遞 defenderId，以防服務器端記錄丟失
                                    );
                                    
                                    
                                    if (result.success) {
                                      // Phase 8: 不顯示 toast，因為對抗檢定結果已經顯示了通知
                                      // 避免重複顯示「道具使用成功」的通知
                                      // toast.success(result.message || '道具選擇成功');
                                      
                                      // 清除狀態
                                      const itemIdToRemove = needsTargetItemSelection.itemId;
                                      setNeedsTargetItemSelection(null);
                                      setTargetItemsForSelection([]);
                                      setSelectedTargetItemForContest('');
                                      // 清除對抗檢定狀態（現在可以安全清除，因為已經選擇完成）
                                      removePendingContest(itemIdToRemove);
                                      // 先刷新頁面資料，確保效果已執行
                                      router.refresh();
                                      // 然後關閉 dialog（使用 setTimeout 確保刷新完成）
                                      setTimeout(() => {
                                        handleCloseDialog();
                                      }, 100);
                                    } else {
                                      console.error('[item-list] 選擇目標道具失敗:', result);
                                      toast.error(result.message || '道具選擇失敗');
                                    }
                                  } catch (error) {
                                    console.error('[item-list] 選擇目標道具錯誤:', error);
                                    toast.error('選擇目標道具失敗，請稍後再試');
                                  } finally {
                                    setIsSelectingTargetItem(false);
                                  }
                                }}
                                disabled={!selectedTargetItemForContest || isSelectingTargetItem}
                                className="w-full"
                              >
                                {isSelectingTargetItem ? '處理中...' : '確認選擇'}
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-blue-700">目標角色沒有道具</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 獲得時間 */}
                    <div className="text-sm text-muted-foreground pt-2 border-t">
                      獲得於：{formatDate(selectedItem.acquiredAt)}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {/* 操作按鈕 */}
              <DialogFooter className="flex-col sm:flex-row gap-2">
                        {/* 使用按鈕 */}
                {((selectedItem.effects && selectedItem.effects.length > 0) || selectedItem.effect || onUseItem) && (() => {
                  const { canUse, reason } = canUseItem(selectedItem);
                  const isPendingContest = hasPendingContest(selectedItem.id);
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
                        isPendingContest
                      }
                      className="w-full sm:w-auto"
                    >
                      {isUsing ? '使用中...' : 
                       isPendingContest ? '等待對抗檢定結果...' :
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
                
                {/* 轉移按鈕 */}
                {selectedItem.isTransferable && onTransferItem && gameId && characterId && (
                  <Button
                    variant="outline"
                    onClick={handleOpenTransfer}
                    className="w-full sm:w-auto"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    轉移道具
                  </Button>
                )}
              </DialogFooter>
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
    </>
  );
}

// 道具卡片元件
interface ItemCardProps {
  item: Item;
  cooldownRemaining: number | null;
  onClick: () => void;
  disabled?: boolean;
}

function ItemCard({ item, cooldownRemaining, onClick, disabled = false }: ItemCardProps) {
  const isOnCooldown = cooldownRemaining !== null && cooldownRemaining > 0;

  return (
    <Card 
      className={`overflow-hidden transition-all ${
        disabled || isOnCooldown
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
        {((item.effects && item.effects.length > 0) || item.effect) && !isOnCooldown && (
          <div className="absolute top-2 left-2">
            <Sparkles className="h-4 w-4 text-yellow-400 drop-shadow-lg" />
          </div>
        )}
        
        {/* Phase 8: 檢定類型標籤 */}
        {item.checkType && item.checkType !== 'none' && !isOnCooldown && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="text-xs">
              {item.checkType === 'contest' ? '對抗' : '隨機'}
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
        {/* Phase 8: 檢定資訊（簡要顯示） */}
        {item.checkType === 'contest' && item.contestConfig && (
          <p className="text-xs text-muted-foreground mt-1">
            使用 {item.contestConfig.relatedStat} 對抗
          </p>
        )}
        {item.checkType === 'random' && item.randomConfig && (
          <p className="text-xs text-muted-foreground mt-1">
            {item.randomConfig.threshold} / {item.randomConfig.maxValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
