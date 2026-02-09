/**
 * 道具使用 Hook
 * 統一管理道具使用的核心邏輯
 * 
 * Phase 6: 提取技能/道具使用邏輯
 */

'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { canUseItem } from '@/lib/utils/item-validators';
import type { Item } from '@/types/character';

export interface UseItemUsageOptions {
  selectedItem: Item | null;
  selectedTargetId: string | undefined;
  selectedTargetItemId: string;
  isTargetConfirmed: boolean;
  requiresTarget: boolean;
  onUseItem: (itemId: string, targetCharacterId?: string, checkResult?: number, targetItemId?: string) => Promise<{
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
    };
    message?: string;
  }>;
  onSuccess?: (result: {
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
    };
    message?: string;
  }) => void;
  onError?: (error: Error) => void;
  onClearTargetState?: () => void;
  onRouterRefresh?: () => void;
  onCloseDialog?: () => void;
}

export interface UseItemUsageReturn {
  isUsing: boolean;
  checkResult: number | undefined;
  useResult: { success: boolean; message: string } | null;
  handleUseItem: () => Promise<void>;
  setUseResult: (result: { success: boolean; message: string } | null) => void;
  setCheckResult: (result: number | undefined) => void;
}

/**
 * 道具使用 Hook
 */
export function useItemUsage(options: UseItemUsageOptions): UseItemUsageReturn {
  const {
    selectedItem,
    selectedTargetId,
    selectedTargetItemId,
    isTargetConfirmed,
    requiresTarget,
    onUseItem,
    onSuccess,
    onError,
    onClearTargetState,
    onRouterRefresh,
    onCloseDialog,
  } = options;

  const [isUsing, setIsUsing] = useState(false);
  const [checkResult, setCheckResult] = useState<number | undefined>(undefined);
  const [useResult, setUseResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleUseItem = useCallback(async () => {
    if (!selectedItem || !onUseItem) return;
    
    const { canUse } = canUseItem(selectedItem);
    if (!canUse) {
      return;
    }

    // 檢查是否需要選擇目標角色
    if (requiresTarget && !selectedTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    // 檢查是否需要確認目標角色和選擇目標道具
    // 注意：對抗檢定時，不需要在初始使用時選擇目標道具
    const itemEffects = selectedItem?.effects || (selectedItem?.effect ? [selectedItem.effect] : []);
    const needsTargetItem = itemEffects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
    const isContest = selectedItem.checkType === 'contest';
    
    // 非對抗檢定時，才需要確認目標角色和選擇目標道具
    if (needsTargetItem && !isContest) {
      if (selectedTargetId && !isTargetConfirmed) {
        toast.error('請先確認目標角色');
        return;
      }
      
      if (!selectedTargetItemId) {
        toast.error('請選擇目標道具');
        return;
      }
    }

    // 如果是隨機檢定，自動骰骰子
    let finalCheckResult: number | undefined = undefined;
    if (selectedItem.checkType === 'random' && selectedItem.randomConfig) {
      finalCheckResult = Math.floor(Math.random() * selectedItem.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
      toast.info(`骰出結果：${finalCheckResult}`);
    }

    // 對抗檢定必須有目標角色
    if (selectedItem.checkType === 'contest') {
      if (!selectedTargetId) {
        toast.error('對抗檢定需要選擇目標角色');
        return;
      }
    }

    setIsUsing(true);
    try {
      // 對抗檢定時不傳遞 targetItemId，將在判定失敗後選擇
      const targetItemIdForUse = isContest ? undefined : selectedTargetItemId || undefined;
      const result = await onUseItem(selectedItem.id, selectedTargetId, finalCheckResult, targetItemIdForUse);
      
      // 處理結果
      if (result.success) {
        // 如果不是對抗檢定，處理成功結果
        if (!result.data?.contestId) {
          if (result.data?.checkPassed === false) {
            // 非對抗檢定的檢定失敗
            setUseResult({ success: false, message: '檢定失敗，道具未生效' });
            toast.warning('檢定失敗，道具未生效');
            // 檢定失敗時關閉 dialog
            if (onCloseDialog) {
              setTimeout(() => {
                onCloseDialog();
              }, 2000);
            }
          } else {
            // 檢定成功或無檢定
            setUseResult({ success: true, message: result.message || '道具使用成功' });
            toast.success(result.message || '道具使用成功');
            // 道具使用成功後，清除目標選擇狀態
            if (onClearTargetState) {
              onClearTargetState();
            }
            // 使用成功時關閉 dialog
            if (onCloseDialog) {
              setTimeout(() => {
                onCloseDialog();
              }, 1500);
            }
          }
        }
        
        // 調用成功回調（組件可以處理對抗檢定等特殊情況）
        if (onSuccess) {
          onSuccess(result);
        }
        
        // 重新載入頁面資料
        // Phase 8: 對抗檢定時不立即刷新，等待防守方回應後再刷新（避免 dialog 被關閉）
        if (onRouterRefresh && !result.data?.contestId) {
          onRouterRefresh();
        }
      } else {
        console.error('道具使用失敗:', result);
        setUseResult({ success: false, message: result.message || '道具使用失敗' });
        toast.error(result.message || '道具使用失敗');
        // 使用失敗時關閉 dialog
        if (onCloseDialog) {
          setTimeout(() => {
            onCloseDialog();
          }, 2000);
        }
        
        if (onError) {
          onError(new Error(result.message || '道具使用失敗'));
        }
      }
    } catch (error) {
      console.error('道具使用錯誤:', error);
      const errorMessage = error instanceof Error ? error.message : '道具使用失敗，請稍後再試';
      setUseResult({ success: false, message: errorMessage });
      toast.error(errorMessage);
      
      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage));
      }
    } finally {
      setIsUsing(false);
    }
  }, [
    selectedItem,
    selectedTargetId,
    selectedTargetItemId,
    isTargetConfirmed,
    requiresTarget,
    onUseItem,
    onSuccess,
    onError,
    onClearTargetState,
    onRouterRefresh,
    onCloseDialog,
  ]);

  return {
    isUsing,
    checkResult,
    useResult,
    handleUseItem,
    setUseResult,
    setCheckResult,
  };
}

