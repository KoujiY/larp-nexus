'use client';

import { useState, useCallback } from 'react';
import type { Item } from '@/types/character';
import { getTransferTargets, type TransferTargetCharacter } from '@/app/actions/public';

interface UseItemTransferOptions {
  characterId: string;
  gameId: string;
  /** 當前選中的道具 */
  selectedItem: Item | null;
  /** 共用目標下拉選單已選的目標 ID */
  selectedUseTargetId: string | undefined;
  /** 轉移 callback（由父元件提供） */
  onTransferItem?: (itemId: string, targetCharacterId: string) => Promise<void>;
  /** 轉移完成後的清理回調（關閉 detail dialog、清除目標狀態） */
  onTransferComplete: () => void;
}

/**
 * 道具轉移邏輯 Hook
 *
 * 封裝轉移對話框狀態（targets 載入、選擇、送出）與兩種轉移路徑：
 * 1. 快捷路徑：detail dialog 目標下拉已選 → 直接轉移
 * 2. Fallback 路徑：開啟 ItemSelectDialog 讓玩家選目標
 */
export function useItemTransfer({
  characterId,
  gameId,
  selectedItem,
  selectedUseTargetId,
  onTransferItem,
  onTransferComplete,
}: UseItemTransferOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [targets, setTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferItem, setTransferItem] = useState<Item | null>(null);

  /** 開啟轉移（若已選目標則直接轉移，否則開啟 ItemSelectDialog） */
  const handleOpen = useCallback(async () => {
    if (!selectedItem || !gameId || !characterId) return;
    if (!selectedItem.isTransferable) return;

    // 快捷路徑：共用下拉選單已選目標 → 直接轉移
    if (selectedUseTargetId && onTransferItem) {
      const itemRef = selectedItem;
      const targetId = selectedUseTargetId;
      setIsTransferring(true);
      try {
        await onTransferItem(itemRef.id, targetId);
        onTransferComplete();
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
  }, [selectedItem, gameId, characterId, selectedUseTargetId, onTransferItem, onTransferComplete]);

  /** 執行轉移（ItemSelectDialog 中選定目標後） */
  const handleTransfer = useCallback(async () => {
    if (!transferItem || !selectedTargetId || !onTransferItem) return;

    setIsTransferring(true);
    try {
      await onTransferItem(transferItem.id, selectedTargetId);
      setIsOpen(false);
      setTransferItem(null);
      setSelectedTargetId('');
      onTransferComplete();
    } catch (error) {
      console.error('轉移道具錯誤:', error);
      setIsOpen(false);
      setSelectedTargetId('');
    } finally {
      setIsTransferring(false);
    }
  }, [transferItem, selectedTargetId, onTransferItem, onTransferComplete]);

  /** 取消轉移 */
  const handleCancel = useCallback(() => {
    setIsOpen(false);
    setTransferItem(null);
    setSelectedTargetId('');
  }, []);

  return {
    isOpen,
    setIsOpen,
    targets,
    selectedTargetId,
    setSelectedTargetId,
    isLoadingTargets,
    isTransferring,
    transferItem,
    handleOpen,
    handleTransfer,
    handleCancel,
  };
}
