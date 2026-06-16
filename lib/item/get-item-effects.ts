import type { ItemEffect } from '@/types/character';

/**
 * 具有 effects 欄位的物品（兼容 TypeScript Item 和 Mongoose Document）
 */
interface ItemWithEffects {
  effects?: ItemEffect[] | null;
}

/**
 * 取得物品的效果列表（統一讀取邏輯）
 *
 * @param item - 物品物件（支援 Item、Mongoose Document 或任何含 effects 的物件）
 * @returns 效果陣列（若無效果則回傳空陣列）
 */
export function getItemEffects(item: ItemWithEffects): ItemEffect[] {
  if (item.effects && item.effects.length > 0) {
    return item.effects;
  }
  return [];
}

/**
 * 判斷物品是否有任何效果
 *
 * @param item - 物品物件
 * @returns 是否有效果
 */
export function hasItemEffects(item: ItemWithEffects): boolean {
  return item.effects != null && item.effects.length > 0;
}
