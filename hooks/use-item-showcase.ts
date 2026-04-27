'use client';

import { useState, useCallback } from 'react';
import type { Item } from '@/types/character';
import { getTransferTargets, type TransferTargetCharacter } from '@/app/actions/public';
import { showcaseItem } from '@/app/actions/item-showcase';
import { notify } from '@/lib/notify';

interface UseItemShowcaseOptions {
  characterId: string;
  gameId: string;
  /** 當前選中的道具 */
  selectedItem: Item | null;
  /** 共用目標下拉選單已選的目標 ID */
  selectedUseTargetId: string | undefined;
  /** 展示完成後的清理回調（關閉 detail dialog、清除目標狀態） */
  onShowcaseComplete: () => void;
}

/**
 * 道具展示邏輯 Hook
 *
 * 封裝展示對話框狀態與兩種展示路徑：
 * 1. 快捷路徑：detail dialog 目標下拉已選 → 直接展示
 * 2. Fallback 路徑：開啟 ItemSelectDialog 讓玩家選目標
 */
export function useItemShowcase({
  characterId,
  gameId,
  selectedItem,
  selectedUseTargetId,
  onShowcaseComplete,
}: UseItemShowcaseOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [targets, setTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isShowcasing, setIsShowcasing] = useState(false);
  const [itemToShowcase, setItemToShowcase] = useState<Item | null>(null);

  /** 開啟展示（若已選目標則直接展示，否則開啟 ItemSelectDialog） */
  const handleOpen = useCallback(async () => {
    if (!selectedItem || !gameId || !characterId) return;

    // 快捷路徑：共用下拉選單已選目標 → 直接展示
    if (selectedUseTargetId) {
      const itemRef = selectedItem;
      const targetId = selectedUseTargetId;
      setIsShowcasing(true);
      try {
        const result = await showcaseItem(characterId, itemRef.id, targetId);
        if (!result.success) {
          notify.error(result.message || '展示失敗');
        }
        onShowcaseComplete();
      } catch (error) {
        console.error('展示道具錯誤:', error);
        notify.error('展示失敗');
      } finally {
        setIsShowcasing(false);
      }
      return;
    }

    // Fallback：開啟 ItemSelectDialog
    setItemToShowcase(selectedItem);
    setIsLoadingTargets(true);
    setIsOpen(true);
    try {
      const result = await getTransferTargets(gameId, characterId);
      if (result.success && result.data) {
        setTargets(result.data);
      } else {
        setTargets([]);
      }
    } finally {
      setIsLoadingTargets(false);
    }
  }, [selectedItem, gameId, characterId, selectedUseTargetId, onShowcaseComplete]);

  /** 執行展示（ItemSelectDialog 中選定目標後） */
  const handleShowcase = useCallback(async () => {
    if (!itemToShowcase || !selectedTargetId) return;

    setIsShowcasing(true);
    try {
      const result = await showcaseItem(characterId, itemToShowcase.id, selectedTargetId);
      if (!result.success) {
        notify.error(result.message || '展示失敗');
      }
      setIsOpen(false);
      setItemToShowcase(null);
      setSelectedTargetId('');
    } catch (error) {
      console.error('展示道具錯誤:', error);
      notify.error('展示失敗');
    } finally {
      setIsShowcasing(false);
    }
  }, [characterId, itemToShowcase, selectedTargetId]);

  /** 取消展示 */
  const handleCancel = useCallback(() => {
    setIsOpen(false);
    setItemToShowcase(null);
    setSelectedTargetId('');
  }, []);

  return {
    isOpen,
    setIsOpen,
    targets,
    selectedTargetId,
    setSelectedTargetId,
    isLoadingTargets,
    isShowcasing,
    itemToShowcase,
    handleOpen,
    handleShowcase,
    handleCancel,
  };
}
