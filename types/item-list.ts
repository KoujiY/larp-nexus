/**
 * Item List 組件相關類型定義
 * 
 * Phase 9: 統一類型定義
 */

import type { Item } from './character';

/**
 * 道具使用結果
 */
export interface ItemUseResult {
  success: boolean;
  data?: {
    contestId?: string;
    checkPassed?: boolean;
    checkResult?: number;
  };
  message?: string;
}

/**
 * ItemList 組件 Props
 */
export interface ItemListProps {
  items?: Item[];
  characterId: string;
  gameId: string;
  characterName: string;
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
  onUseItem?: (
    itemId: string,
    targetCharacterId?: string,
    checkResult?: number,
    targetItemId?: string
  ) => Promise<ItemUseResult>;
  onTransferItem?: (itemId: string, targetCharacterId: string) => Promise<void>;
}

