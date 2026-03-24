'use client';

import { useState, useCallback } from 'react';
import { useTargetOptions } from './use-target-options';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';
import { toast } from 'sonner';

interface UseEffectTargetOptions {
  gameId: string;
  characterId: string;
  characterName: string;
  effects: Array<{ type: string; requiresTarget?: boolean; targetType?: 'self' | 'other' | 'any' }>;
  checkType?: 'none' | 'contest' | 'random';
  enabled?: boolean;
}

/**
 * 共用的效果目標選擇邏輯
 * 用於道具和技能的效果目標選擇
 */
export function useEffectTarget({
  gameId,
  characterId,
  characterName,
  effects,
  checkType,
  enabled = true,
}: UseEffectTargetOptions) {
  // 判斷是否需要目標角色
  const requiresTarget = Boolean(
    checkType === 'contest' || 
    effects.some((effect) => effect.requiresTarget)
  );
  
  // 判斷目標類型
  const targetType = checkType === 'contest' 
    ? 'other' as const // 對抗檢定只能對其他角色使用
    : effects.find((e) => e.requiresTarget)?.targetType;

  const {
    targetOptions: useTargets,
    selectedTargetId: hookSelectedTargetId,
    setSelectedTargetId: setSelectedTargetIdHook,
    isLoading: isLoadingUseTargets,
  } = useTargetOptions({
    gameId,
    characterId,
    characterName,
    requiresTarget,
    targetType,
    enabled: enabled && requiresTarget,
  });

  // 使用本地狀態管理使用者明確選擇的目標，避免被 hook 重置
  // 未明確選擇時（undefined）回退到 hook 提供的預設值，不需 useEffect 同步
  const [localSelectedTargetId, setLocalSelectedTargetId] = useState<string | undefined>(undefined);

  const selectedTargetId = localSelectedTargetId ?? hookSelectedTargetId;
  
  const setSelectedTargetId = useCallback((id: string | undefined) => {
    setLocalSelectedTargetId(id);
    setSelectedTargetIdHook(id);
  }, [setSelectedTargetIdHook]);

  // 目標道具選擇相關狀態（用於 item_take 和 item_steal）
  const [isTargetConfirmed, setIsTargetConfirmed] = useState(false);
  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemId, setSelectedTargetItemId] = useState<string>('');
  const [isLoadingTargetItems, setIsLoadingTargetItems] = useState(false);

  // 確認目標角色並載入目標道具清單
  const handleConfirmTarget = useCallback(async () => {
    if (!selectedTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    const needsTargetItem = effects.some(
      (e) => e.type === 'item_take' || e.type === 'item_steal'
    );
    
    if (!needsTargetItem) {
      setIsTargetConfirmed(true);
      return;
    }
    
    setIsLoadingTargetItems(true);
    try {
      const result = await getTargetCharacterItems(selectedTargetId);
      if (result.success && result.data) {
        setTargetItems(result.data);
        setIsTargetConfirmed(true);
      } else {
        toast.error(result.message || '無法載入目標角色的道具清單');
      }
    } catch (error) {
      console.error('載入目標道具清單失敗:', error);
      toast.error('載入目標道具清單失敗');
    } finally {
      setIsLoadingTargetItems(false);
    }
  }, [selectedTargetId, effects]);

  // 取消目標確認
  const handleCancelTarget = useCallback(() => {
    setIsTargetConfirmed(false);
    setTargetItems([]);
    setSelectedTargetItemId('');
    setSelectedTargetId(undefined);
  }, [setSelectedTargetId]);

  return {
    // 目標角色選擇
    targetOptions: useTargets,
    selectedTargetId,
    setSelectedTargetId,
    isLoadingTargets: isLoadingUseTargets,
    
    // 目標道具選擇
    isTargetConfirmed,
    targetItems,
    selectedTargetItemId,
    setSelectedTargetItemId,
    isLoadingTargetItems,
    handleConfirmTarget,
    handleCancelTarget,
    
    // 工具函數
    requiresTarget,
    targetType,
  };
}

