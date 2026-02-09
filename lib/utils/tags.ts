/**
 * Tags 處理工具函數
 * 統一處理技能和道具的 tags 欄位標準化
 */

/**
 * 標準化 tags 陣列
 * 確保 tags 是一個有效的字串陣列，過濾無效值
 * 
 * @param tags - 可能是 undefined、null、陣列或單一字串的 tags
 * @returns 標準化的字串陣列（至少是空陣列）
 */
export function normalizeTags(tags: unknown): string[] {
  // 如果 tags 是 undefined 或 null，返回空陣列
  if (tags === undefined || tags === null) {
    return [];
  }
  
  // 如果是陣列，過濾並確保所有元素都是字串
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }
  
  // 如果是單一字串，轉換為陣列
  if (typeof tags === 'string') {
    return [tags];
  }
  
  // 其他情況返回空陣列
  return [];
}

