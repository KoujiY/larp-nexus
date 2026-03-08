/**
 * 道具驗證工具函數
 */

import type { Item } from '@/types/character';

/**
 * 檢查道具是否可以使用（不包含對抗檢定檢查）
 * @param item 道具對象
 * @returns 返回是否可以使用及原因
 */
export function canUseItem(item: Item): { canUse: boolean; reason?: string } {
  // 消耗品數量檢查
  if (item.type === 'consumable' && item.quantity <= 0) {
    return { canUse: false, reason: '數量不足' };
  }

  // 使用次數檢查
  if (item.usageLimit && item.usageLimit > 0) {
    if ((item.usageCount || 0) >= item.usageLimit) {
      return { canUse: false, reason: '已達使用次數上限' };
    }
  }

  // 冷卻時間檢查
  if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
    const lastUsed = new Date(item.lastUsedAt).getTime();
    const now = Date.now();
    const cooldownMs = item.cooldown * 1000;
    if (now - lastUsed < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
      return { canUse: false, reason: `冷卻中 (${remainingSeconds}s)` };
    }
  }

  return { canUse: true };
}

/**
 * 計算道具冷卻剩餘時間（秒）
 * @param item 道具對象
 * @returns 返回剩餘秒數，如果沒有冷卻或已過期則返回 null
 */
export function getCooldownRemaining(item: Item): number | null {
  if (!item.cooldown || item.cooldown <= 0 || !item.lastUsedAt) return null;
  
  const lastUsed = new Date(item.lastUsedAt).getTime();
  const now = Date.now();
  const cooldownMs = item.cooldown * 1000;
  const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
  
  return remaining > 0 ? remaining : null;
}

