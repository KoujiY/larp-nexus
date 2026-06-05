/**
 * 技能驗證工具函數
 */

import type { Skill } from '@/types/character';
import { checkUsageConditions, type UsageConditionContext } from '@/lib/character/usage-condition';

/**
 * 檢查技能是否可以使用
 * @param skill 技能對象
 * @param ctx Feature 3: 角色上下文（stats / items），用於檢查使用條件。
 *   未提供時略過條件檢查（向後相容既有呼叫端）。
 * @returns 返回是否可以使用及原因
 */
export function canUseSkill(
  skill: Skill,
  ctx?: UsageConditionContext,
): { canUse: boolean; reason?: string } {
  // 使用次數檢查
  if (skill.usageLimit && skill.usageLimit > 0) {
    if ((skill.usageCount || 0) >= skill.usageLimit) {
      return { canUse: false, reason: '已達使用次數上限' };
    }
  }

  // 冷卻時間檢查
  if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
    const lastUsed = new Date(skill.lastUsedAt).getTime();
    const now = Date.now();
    const cooldownMs = skill.cooldown * 1000;
    if (now - lastUsed < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
      return { canUse: false, reason: `冷卻中 (${remainingSeconds}s)` };
    }
  }

  // Feature 3: 使用條件檢查（需 ctx）
  if (ctx) {
    const result = checkUsageConditions(skill.usageConditions, ctx);
    if (!result.satisfied) {
      return { canUse: false, reason: result.reason };
    }
  }

  return { canUse: true };
}

/**
 * 計算技能冷卻剩餘時間（秒）
 * @param skill 技能對象
 * @returns 返回剩餘秒數，如果沒有冷卻或已過期則返回 null
 */
export function getCooldownRemaining(skill: Skill): number | null {
  if (!skill.cooldown || skill.cooldown <= 0 || !skill.lastUsedAt) return null;
  
  const lastUsed = new Date(skill.lastUsedAt).getTime();
  const now = Date.now();
  const cooldownMs = skill.cooldown * 1000;
  const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
  
  return remaining > 0 ? remaining : null;
}

