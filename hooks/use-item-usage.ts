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
  requiresTarget: boolean;
  onUseItem: (itemId: string, targetCharacterId?: string, checkResult?: number, targetItemId?: string) => Promise<{
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
      needsTargetItemSelection?: boolean;
      targetCharacterId?: string;
    };
    message?: string;
  }>;
  onSuccess?: (result: {
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
      needsTargetItemSelection?: boolean;
      targetCharacterId?: string;
    };
    message?: string;
  }) => void;
  onError?: (error: Error) => void;
  onClearTargetState?: () => void;
  onRouterRefresh?: () => void;
  onCloseDialog?: () => void;
  /** 非對抗偷竊/移除：使用成功後需要選擇目標道具 */
  onNeedsTargetItemSelection?: (info: {
    sourceId: string;
    effectType: 'item_steal' | 'item_take';
    targetCharacterId: string;
  }) => void;
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
    requiresTarget,
    onUseItem,
    onSuccess,
    onError,
    onClearTargetState,
    onRouterRefresh,
    onCloseDialog,
    onNeedsTargetItemSelection,
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

    // 偷竊/移除道具：不再需要前置確認目標和選擇目標道具
    // 對抗檢定：targetItemId 在對抗結束後選擇
    // 非對抗檢定：targetItemId 在使用成功後選擇（server 回傳 needsTargetItemSelection）
    const isContest = selectedItem.checkType === 'contest' || selectedItem.checkType === 'random_contest';

    // 如果是隨機檢定，自動骰骰子
    // 注意：random_contest 的隨機值由 server-side 的 handleContestCheck 處理，不需要前端生成
    let finalCheckResult: number | undefined = undefined;
    if (selectedItem.checkType === 'random' && selectedItem.randomConfig) {
      finalCheckResult = Math.floor(Math.random() * selectedItem.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
      toast.info(`骰出結果：${finalCheckResult}`);
    }

    // 對抗檢定必須有目標角色
    if (selectedItem.checkType === 'contest' || selectedItem.checkType === 'random_contest') {
      if (!selectedTargetId) {
        toast.error('對抗檢定需要選擇目標角色');
        return;
      }
    }

    setIsUsing(true);
    try {
      // 對抗檢定和偷竊/移除不傳遞 targetItemId（延遲選擇）
      // 只有非偷竊效果且已選擇目標道具時才傳遞
      const targetItemIdForUse = isContest ? undefined : selectedTargetItemId || undefined;
      const result = await onUseItem(selectedItem.id, selectedTargetId, finalCheckResult, targetItemIdForUse);

      // 處理結果
      if (result.success) {
        // 非對抗偷竊/移除：使用成功後需要選擇目標道具
        if (result.data?.needsTargetItemSelection && result.data?.targetCharacterId) {
          setUseResult({ success: true, message: result.message || '使用成功，請選擇目標道具' });
          // 清除目標選擇狀態（target character 已確定，不需要保留）
          if (onClearTargetState) {
            onClearTargetState();
          }
          // 觸發目標道具選擇流程
          if (onNeedsTargetItemSelection) {
            const effects = selectedItem.effects || [];
            const effectType = effects.some((e) => e.type === 'item_steal') ? 'item_steal' : 'item_take';
            onNeedsTargetItemSelection({
              sourceId: selectedItem.id,
              effectType: effectType as 'item_steal' | 'item_take',
              targetCharacterId: result.data.targetCharacterId,
            });
          }
          // 不關閉 dialog，等待目標道具選擇完成
          // 不刷新頁面，避免 dialog 被關閉
          if (onSuccess) {
            onSuccess(result);
          }
          return;
        }

        // 如果不是對抗檢定，處理成功結果
        if (!result.data?.contestId) {
          if (result.data?.checkPassed === false) {
            // 非對抗檢定的檢定失敗
            setUseResult({ success: false, message: '檢定失敗，道具未生效' });
            toast.warning('檢定失敗，道具未生效');
            // 檢定失敗也清除目標選擇狀態，避免下次開啟時被鎖死
            if (onClearTargetState) {
              onClearTargetState();
            }
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
        // 使用失敗也清除目標選擇狀態
        if (onClearTargetState) {
          onClearTargetState();
        }
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
      // 異常也清除目標選擇狀態
      if (onClearTargetState) {
        onClearTargetState();
      }

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
    requiresTarget,
    onUseItem,
    onSuccess,
    onError,
    onClearTargetState,
    onRouterRefresh,
    onCloseDialog,
    onNeedsTargetItemSelection,
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
