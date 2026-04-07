/**
 * 角色道具（Items）欄位更新器
 */

import { normalizeTags } from '@/lib/utils/tags';
import type { MongoItem } from '@/lib/db/types/mongo-helpers';
import { normalizeEffectData, normalizeCheckConfig } from './shared';

/** 道具庫存差異項目型別 */
export type InventoryDiff = {
  action: 'added' | 'updated' | 'deleted';
  item: {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    acquiredAt?: string;
  };
};

/**
 * 計算道具新增 / 更新 / 刪除的差異列表
 */
function calculateInventoryDiffs(
  newItems: Array<Record<string, unknown>>,
  inputItems: Array<{ id: string }>,
  currentItems: MongoItem[]
): InventoryDiff[] {
  const diffs: InventoryDiff[] = [];

  newItems.forEach((newItem) => {
    const oldItem = currentItems.find((i) => i.id === (newItem.id as string));
    const base = {
      id: newItem.id as string,
      name: newItem.name as string,
      description: (newItem.description as string) || '',
      imageUrl: newItem.imageUrl as string | undefined,
      acquiredAt: newItem.acquiredAt
        ? new Date(newItem.acquiredAt as Date).toISOString()
        : undefined,
    };
    if (!oldItem) {
      diffs.push({ action: 'added', item: base });
    } else if (
      oldItem.name !== newItem.name ||
      oldItem.description !== newItem.description ||
      oldItem.imageUrl !== newItem.imageUrl ||
      oldItem.quantity !== newItem.quantity
    ) {
      diffs.push({ action: 'updated', item: base });
    }
  });

  currentItems.forEach((oldItem) => {
    if (!inputItems.some((i) => i.id === oldItem.id)) {
      diffs.push({
        action: 'deleted',
        item: {
          id: oldItem.id,
          name: oldItem.name,
          description: oldItem.description || '',
          imageUrl: oldItem.imageUrl,
          acquiredAt: oldItem.acquiredAt
            ? new Date(oldItem.acquiredAt).toISOString()
            : undefined,
        },
      });
    }
  });

  return diffs;
}

/**
 * 更新角色 Items
 *
 * @param items Items 陣列
 * @param currentItems 當前 Items 陣列（用於判斷是否為新道具）
 * @returns 更新後的 Items 資料和差異列表
 */
export function updateCharacterItems(
  items: MongoItem[],
  currentItems: MongoItem[] = []
): { items: MongoItem[]; inventoryDiffs: InventoryDiff[] } {
  const itemsData = items.map((item) => {
    const itemData: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      quantity: item.quantity,
      usageCount: item.usageCount || 0,
      isTransferable: item.isTransferable,
      acquiredAt: item.acquiredAt || new Date(),
      tags: normalizeTags(item.tags),
    };
    if (item.imageUrl !== undefined) itemData.imageUrl = item.imageUrl;
    if (item.usageLimit !== undefined) itemData.usageLimit = item.usageLimit;
    if (item.cooldown !== undefined) itemData.cooldown = item.cooldown;
    if (item.lastUsedAt !== undefined) itemData.lastUsedAt = item.lastUsedAt;
    if (item.checkType !== undefined) itemData.checkType = item.checkType;

    // 裝備系統欄位
    if (item.equipped !== undefined) itemData.equipped = item.equipped;
    if (item.statBoosts !== undefined) {
      itemData.statBoosts = item.statBoosts;
    }

    // Phase 6.5 / Phase 7: 處理道具效果（優先 effects 陣列，向後兼容 effect）
    if (item.effects != null) {
      itemData.effects = (item.effects as unknown as Array<Record<string, unknown>>)
        .filter((e) => e && e.type)
        .map((e) => normalizeEffectData(e));
    } else {
      const original = currentItems.find((i) => i.id === item.id);
      if (original?.effects !== undefined) itemData.effects = original.effects;
    }

    const configPatch = normalizeCheckConfig(item.name, item.checkType, item.contestConfig, item.randomConfig);
    return { ...itemData, ...configPatch };
  });

  return {
    items: itemsData as unknown as MongoItem[],
    inventoryDiffs: calculateInventoryDiffs(itemsData, items, currentItems),
  };
}
