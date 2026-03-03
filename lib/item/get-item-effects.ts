import type { ItemEffect } from '@/types/character';

/**
 * 具有 effects/effect 欄位的道具（兼容 TypeScript Item 和 Mongoose Document）
 */
interface ItemWithEffects {
  effects?: ItemEffect[] | null;
  /** @deprecated 使用 effects 陣列代替 */
  effect?: ItemEffect | null;
}

/**
 * 取得道具的效果列表（統一讀取邏輯）
 *
 * 向後兼容：若道具只有已棄用的 `effect` 欄位（單一效果），
 * 會自動包裝成陣列回傳。優先使用 `effects` 陣列。
 *
 * @param item - 道具物件（支援 Item、Mongoose Document 或任何含 effects/effect 的物件）
 * @returns 效果陣列（若無效果則回傳空陣列）
 */
export function getItemEffects(item: ItemWithEffects): ItemEffect[] {
  if (item.effects && item.effects.length > 0) {
    return item.effects;
  }
  if (item.effect) {
    return [item.effect];
  }
  return [];
}

/**
 * 判斷道具是否有任何效果
 *
 * @param item - 道具物件
 * @returns 是否有效果
 */
export function hasItemEffects(item: ItemWithEffects): boolean {
  return (item.effects != null && item.effects.length > 0) || item.effect != null;
}
