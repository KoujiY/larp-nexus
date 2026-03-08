/**
 * Phase 7.7: 自動揭露條件健全性清理
 *
 * GM 端切換分頁時呼叫，驗證並移除揭露條件中引用已刪除道具或隱藏資訊的 ID。
 * 清理後若條件中所有引用項為空，自動將條件重設為 undefined（即 'none'）。
 *
 * 清理操作在前端執行（即時反映），並在下次儲存時持久化到資料庫。
 */

import type { Secret, Task, AutoRevealCondition } from '@/types/character';

/** 清理結果 */
export interface CleanResult {
  /** 清理後的資料 */
  cleaned: boolean;
  /** 被移除的引用數量 */
  removedCount: number;
}

/**
 * 清理單一 AutoRevealCondition 中的無效引用
 *
 * @param condition 目前的揭露條件
 * @param existingItemIds 劇本中仍存在的所有道具 ID 集合
 * @param existingSecretIds 該角色仍存在的隱藏資訊 ID 集合（僅隱藏目標需要）
 * @returns 清理後的條件（若條件為空則回傳 undefined）與移除數量
 */
function cleanCondition(
  condition: AutoRevealCondition | undefined,
  existingItemIds: Set<string>,
  existingSecretIds?: Set<string>
): { condition: AutoRevealCondition | undefined; removedCount: number } {
  if (!condition || condition.type === 'none') {
    return { condition: undefined, removedCount: 0 };
  }

  let removedCount = 0;

  // 清理 itemIds（items_viewed 和 items_acquired）
  if (
    (condition.type === 'items_viewed' || condition.type === 'items_acquired') &&
    condition.itemIds
  ) {
    const originalLength = condition.itemIds.length;
    const filteredItemIds = condition.itemIds.filter((id) => existingItemIds.has(id));
    removedCount = originalLength - filteredItemIds.length;

    if (filteredItemIds.length === 0) {
      // 所有引用都失效，重設為 none
      return { condition: undefined, removedCount };
    }

    if (removedCount > 0) {
      return {
        condition: { ...condition, itemIds: filteredItemIds },
        removedCount,
      };
    }
  }

  // 清理 secretIds（secrets_revealed）
  if (condition.type === 'secrets_revealed' && condition.secretIds && existingSecretIds) {
    const originalLength = condition.secretIds.length;
    const filteredSecretIds = condition.secretIds.filter((id) => existingSecretIds.has(id));
    removedCount = originalLength - filteredSecretIds.length;

    if (filteredSecretIds.length === 0) {
      // 所有引用都失效，重設為 none
      return { condition: undefined, removedCount };
    }

    if (removedCount > 0) {
      return {
        condition: { ...condition, secretIds: filteredSecretIds },
        removedCount,
      };
    }
  }

  return { condition, removedCount: 0 };
}

/**
 * 清理隱藏資訊的自動揭露條件
 *
 * 掃描所有隱藏資訊的 autoRevealCondition，移除引用已刪除道具的 ID。
 * 用於 GM 切換到「基本資訊」分頁時。
 *
 * @param secrets 角色的隱藏資訊列表
 * @param existingItemIds 劇本中仍存在的所有道具 ID 陣列
 * @returns 清理後的隱藏資訊列表與清理結果
 */
export function cleanSecretConditions(
  secrets: Secret[],
  existingItemIds: string[]
): { secrets: Secret[]; result: CleanResult } {
  const itemIdSet = new Set(existingItemIds);
  let totalRemoved = 0;
  let anyCleaned = false;

  const cleanedSecrets = secrets.map((secret) => {
    if (!secret.autoRevealCondition) return secret;

    const { condition, removedCount } = cleanCondition(
      secret.autoRevealCondition,
      itemIdSet
    );

    if (removedCount > 0) {
      totalRemoved += removedCount;
      anyCleaned = true;
      return { ...secret, autoRevealCondition: condition };
    }

    return secret;
  });

  return {
    secrets: cleanedSecrets,
    result: { cleaned: anyCleaned, removedCount: totalRemoved },
  };
}

/**
 * 清理隱藏目標的自動揭露條件
 *
 * 掃描所有隱藏目標的 autoRevealCondition，移除引用已刪除道具或隱藏資訊的 ID。
 * 用於 GM 切換到「任務管理」分頁時。
 *
 * @param tasks 角色的任務列表
 * @param existingItemIds 劇本中仍存在的所有道具 ID 陣列
 * @param existingSecretIds 該角色仍存在的隱藏資訊 ID 陣列
 * @returns 清理後的任務列表與清理結果
 */
export function cleanTaskConditions(
  tasks: Task[],
  existingItemIds: string[],
  existingSecretIds: string[]
): { tasks: Task[]; result: CleanResult } {
  const itemIdSet = new Set(existingItemIds);
  const secretIdSet = new Set(existingSecretIds);
  let totalRemoved = 0;
  let anyCleaned = false;

  const cleanedTasks = tasks.map((task) => {
    if (!task.autoRevealCondition) return task;

    const { condition, removedCount } = cleanCondition(
      task.autoRevealCondition,
      itemIdSet,
      secretIdSet
    );

    if (removedCount > 0) {
      totalRemoved += removedCount;
      anyCleaned = true;
      return { ...task, autoRevealCondition: condition };
    }

    return task;
  });

  return {
    tasks: cleanedTasks,
    result: { cleaned: anyCleaned, removedCount: totalRemoved },
  };
}
