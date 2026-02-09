/**
 * 目標選擇 Hook
 * 統一管理目標角色選擇、目標道具選擇和狀態持久化
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTargetOptions } from './use-target-options';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';
import { STORAGE_KEYS } from '@/lib/constants/contest';
import type { SkillEffect, ItemEffect } from '@/types/character';

export interface UseTargetSelectionOptions {
  characterId: string;
  sourceId: string;
  sourceType: 'skill' | 'item';
  gameId: string;
  characterName: string;
  requiresTarget: boolean;
  targetType?: 'self' | 'other' | 'any';
  enabled: boolean;
  // 用於檢查是否需要目標道具的效果
  effects?: Array<SkillEffect | ItemEffect>;
  // 當前選中的源（用於恢復狀態時檢查）
  selectedSource?: { id: string; effects?: Array<SkillEffect | ItemEffect> } | null;
}

export interface UseTargetSelectionReturn {
  // 目標角色選擇
  selectedTargetId: string | undefined;
  setSelectedTargetId: (id: string | undefined) => void;
  targetOptions: Array<{ id: string; name: string }>;
  isLoading: boolean;
  
  // 目標確認和目標道具選擇
  isTargetConfirmed: boolean;
  setIsTargetConfirmed: (confirmed: boolean) => void;
  targetItems: TargetItemInfo[];
  setTargetItems: (items: TargetItemInfo[]) => void;
  selectedTargetItemId: string;
  setSelectedTargetItemId: (id: string) => void;
  isLoadingTargetItems: boolean;
  setIsLoadingTargetItems: (loading: boolean) => void;
  
  // 狀態管理
  clearTargetState: () => void;
  saveTargetState: () => void;
  restoreTargetState: () => Promise<void>;
}

/**
 * 目標選擇 Hook
 */
export function useTargetSelection(options: UseTargetSelectionOptions): UseTargetSelectionReturn {
  const {
    characterId,
    sourceId,
    sourceType,
    gameId,
    characterName,
    requiresTarget,
    targetType,
    enabled,
    effects = [],
    selectedSource,
  } = options;

  // 使用 useTargetOptions 獲取目標角色選項
  const {
    targetOptions: hookTargetOptions,
    selectedTargetId: hookSelectedTargetId,
    setSelectedTargetId: setHookSelectedTargetId,
    isLoading: isLoadingTargets,
  } = useTargetOptions({
    gameId,
    characterId,
    characterName,
    requiresTarget,
    targetType,
    enabled,
  });

  // 本地狀態管理（避免被 hook 重置）
  const [localSelectedTargetId, setLocalSelectedTargetId] = useState<string | undefined>(hookSelectedTargetId);
  
  // 目標確認和目標道具選擇狀態
  const [isTargetConfirmed, setIsTargetConfirmed] = useState(false);
  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemId, setSelectedTargetItemId] = useState<string>('');
  const [isLoadingTargetItems, setIsLoadingTargetItems] = useState(false);

  // 防止重複恢復狀態的 ref
  const restoredStateRef = useRef<Set<string>>(new Set());

  // 同步 hook 的 selectedTargetId 到本地狀態
  useEffect(() => {
    // 只有在 hook 的值變化且本地狀態為 undefined 時才同步（避免覆蓋恢復的值）
    if (hookSelectedTargetId !== undefined && localSelectedTargetId === undefined) {
      setLocalSelectedTargetId(hookSelectedTargetId);
    }
  }, [hookSelectedTargetId, localSelectedTargetId]);

  // 使用本地狀態作為 selectedTargetId
  const selectedTargetId = localSelectedTargetId;

  // 獲取 storage key
  const getTargetStorageKey = useCallback(() => {
    return sourceType === 'skill'
      ? STORAGE_KEYS.SKILL_TARGET(characterId, sourceId)
      : STORAGE_KEYS.ITEM_TARGET(characterId, sourceId);
  }, [characterId, sourceId, sourceType]);

  // 清除目標選擇狀態
  const clearTargetState = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getTargetStorageKey();
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('清除目標選擇狀態失敗:', error);
    }
  }, [getTargetStorageKey]);

  // 儲存目標選擇狀態到 localStorage
  const saveTargetState = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getTargetStorageKey();
      const state = {
        selectedTargetId: selectedTargetId || undefined,
        isTargetConfirmed,
        selectedTargetItemId: selectedTargetItemId || undefined,
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('儲存目標選擇狀態失敗:', error);
    }
  }, [getTargetStorageKey, selectedTargetId, isTargetConfirmed, selectedTargetItemId]);

  // 包裝 setSelectedTargetId 以同時更新本地狀態和 hook
  const setSelectedTargetId = useCallback((id: string | undefined) => {
    setLocalSelectedTargetId(id);
    setHookSelectedTargetId(id);
  }, [setHookSelectedTargetId]);

  // 從 localStorage 恢復目標選擇狀態
  const restoreTargetState = useCallback(async () => {
    if (typeof window === 'undefined') return;
    
    // 防止重複調用：如果已經恢復過這個源的狀態，則跳過
    if (restoredStateRef.current.has(sourceId)) {
      return;
    }
    
    try {
      const storageKey = getTargetStorageKey();
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.selectedTargetId) {
          // 標記為已恢復
          restoredStateRef.current.add(sourceId);
          
          // 先設置本地狀態
          setLocalSelectedTargetId(state.selectedTargetId);
          // 然後更新 hook 的狀態（使用包裝函數確保兩者同步）
          setSelectedTargetId(state.selectedTargetId);
          setIsTargetConfirmed(state.isTargetConfirmed || false);
          setSelectedTargetItemId(state.selectedTargetItemId || '');
          
          // 如果已確認目標且需要目標道具，自動載入目標的道具清單
          if (state.isTargetConfirmed && state.selectedTargetId) {
            const needsTargetItem = effects.some((effect) => effect.type === 'item_take' || effect.type === 'item_steal');
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
  }, [sourceId, getTargetStorageKey, setSelectedTargetId, effects, targetItems.length]);

  // 當源改變時，清除恢復狀態記錄
  useEffect(() => {
    if (selectedSource) {
      const currentSourceId = selectedSource.id;
      restoredStateRef.current.forEach((id) => {
        if (id !== currentSourceId) {
          restoredStateRef.current.delete(id);
        }
      });
    } else {
      restoredStateRef.current.clear();
    }
  }, [selectedSource?.id, selectedSource]);

  return {
    selectedTargetId,
    setSelectedTargetId,
    targetOptions: hookTargetOptions,
    isLoading: isLoadingTargets,
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
  };
}

