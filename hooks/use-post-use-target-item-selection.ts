/**
 * 非對抗偷竊/移除的後續目標道具選擇 Hook
 *
 * 當道具或技能使用成功後（非對抗檢定），server 回傳 needsTargetItemSelection 時，
 * 管理目標道具的載入、選擇、提交流程。
 *
 * 與 useTargetItemSelection（對抗用）分離，避免耦合對抗系統。
 */

'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';
import { selectTargetItemAfterUse } from '@/app/actions/select-target-item';

export interface PostUseSelectionState {
  sourceId: string;
  sourceType: 'skill' | 'item';
  effectType: 'item_steal' | 'item_take';
  targetCharacterId: string;
  characterId: string;
}

export interface UsePostUseTargetItemSelectionReturn {
  /** 當前的選擇狀態（null 表示不在選擇流程中） */
  selectionState: PostUseSelectionState | null;
  /** 目標角色的道具清單 */
  targetItems: TargetItemInfo[];
  /** 已選擇的目標道具 ID */
  selectedTargetItemId: string;
  /** 設定已選擇的目標道具 ID */
  setSelectedTargetItemId: (id: string) => void;
  /** 是否正在載入目標道具 */
  isLoadingTargetItems: boolean;
  /** 是否正在提交選擇 */
  isSubmitting: boolean;
  /** 啟動選擇流程（由 use hook 的回調觸發） */
  startSelection: (state: PostUseSelectionState) => Promise<void>;
  /** 確認選擇並執行效果 */
  confirmSelection: () => Promise<void>;
  /** 取消選擇（目標無道具時使用） */
  cancelSelection: () => void;
}

/**
 * 非對抗偷竊/移除的後續目標道具選擇 Hook
 */
export function usePostUseTargetItemSelection(options?: {
  onComplete?: () => void;
  onRouterRefresh?: () => void;
}): UsePostUseTargetItemSelectionReturn {
  const { onComplete, onRouterRefresh } = options || {};

  const [selectionState, setSelectionState] = useState<PostUseSelectionState | null>(null);
  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemId, setSelectedTargetItemId] = useState('');
  const [isLoadingTargetItems, setIsLoadingTargetItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 啟動選擇流程：載入目標道具清單
   */
  const startSelection = useCallback(async (state: PostUseSelectionState) => {
    setSelectionState(state);
    setSelectedTargetItemId('');
    setIsLoadingTargetItems(true);

    try {
      const result = await getTargetCharacterItems(state.targetCharacterId);
      if (result.success && result.data) {
        setTargetItems(result.data);
      } else {
        setTargetItems([]);
      }
    } catch (error) {
      console.error('Failed to load target items for post-use selection:', error);
      setTargetItems([]);
    } finally {
      setIsLoadingTargetItems(false);
    }
  }, []);

  /**
   * 確認選擇並執行偷竊/移除效果
   */
  const confirmSelection = useCallback(async () => {
    if (!selectionState) return;

    // 目標無道具時，直接結束流程
    if (targetItems.length === 0) {
      toast.info('目標角色沒有道具，流程結束');
      setSelectionState(null);
      setTargetItems([]);
      setSelectedTargetItemId('');
      if (onComplete) onComplete();
      if (onRouterRefresh) onRouterRefresh();
      return;
    }

    if (!selectedTargetItemId) {
      toast.error('請選擇目標道具');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await selectTargetItemAfterUse(
        selectionState.characterId,
        selectionState.sourceId,
        selectionState.sourceType,
        selectionState.effectType,
        selectionState.targetCharacterId,
        selectedTargetItemId
      );

      if (result.success) {
        toast.success(result.message || '操作成功');
      } else {
        toast.error(result.message || '操作失敗');
      }
    } catch (error) {
      console.error('Failed to select target item after use:', error);
      toast.error('操作失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
      setSelectionState(null);
      setTargetItems([]);
      setSelectedTargetItemId('');
      if (onComplete) onComplete();
      if (onRouterRefresh) onRouterRefresh();
    }
  }, [selectionState, targetItems.length, selectedTargetItemId, onComplete, onRouterRefresh]);

  /**
   * 取消選擇流程
   */
  const cancelSelection = useCallback(() => {
    setSelectionState(null);
    setTargetItems([]);
    setSelectedTargetItemId('');
    if (onComplete) onComplete();
    if (onRouterRefresh) onRouterRefresh();
  }, [onComplete, onRouterRefresh]);

  return {
    selectionState,
    targetItems,
    selectedTargetItemId,
    setSelectedTargetItemId,
    isLoadingTargetItems,
    isSubmitting,
    startSelection,
    confirmSelection,
    cancelSelection,
  };
}
