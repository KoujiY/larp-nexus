/**
 * 對抗檢定驗證邏輯
 * 從 contest-respond.ts 提取
 */

import type { CharacterDocument } from '@/lib/db/models/Character';

export interface ValidationResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * 驗證對抗檢定請求
 */
export async function validateContestRequest(
  contestId: string,
  attackerId: string,
  defenderId: string,
  attacker: CharacterDocument | null,
  defender: CharacterDocument | null
): Promise<ValidationResult> {
  // 解析對抗請求 ID（格式：attackerId::skillId/itemId::timestamp）
  const { parseContestId } = await import('@/lib/contest/contest-id');
  const parsed = parseContestId(contestId);
  if (!parsed) {
    return {
      success: false,
      error: 'INVALID_CONTEST_ID',
      message: '無效的對抗請求 ID',
    };
  }
  const { attackerId: parsedAttackerId } = parsed;

  // 驗證攻擊方 ID 匹配
  const attackerIdStr = attacker?._id?.toString() || attackerId;
  if (parsedAttackerId !== attackerIdStr && parsedAttackerId !== attackerId) {
    return {
      success: false,
      error: 'INVALID_CONTEST_ID',
      message: '對抗請求 ID 與攻擊方不匹配',
    };
  }

  if (!attacker || !defender) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: '找不到角色',
    };
  }

  // 驗證在同一劇本內
  if (attacker.gameId.toString() !== defender.gameId.toString()) {
    return {
      success: false,
      error: 'INVALID_TARGET',
      message: '角色不在同一劇本內',
    };
  }

  return { success: true };
}

/**
 * 驗證技能或道具是否存在且為對抗檢定類型
 */
export function validateContestSource(
  attacker: CharacterDocument,
  sourceId: string
): {
  success: boolean;
  error?: string;
  message?: string;
  sourceType?: 'skill' | 'item';
  contestConfig?: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  };
} {
  // 先嘗試找技能
  const attackerSkills = attacker.skills || [];
  const skillIndex = attackerSkills.findIndex((s: { id: string }) => s.id === sourceId);
  
  if (skillIndex !== -1) {
    const skill = attackerSkills[skillIndex];
    // Phase 7.6: 支援 contest 和 random_contest 類型
    if (skill && (skill.checkType === 'contest' || skill.checkType === 'random_contest') && skill.contestConfig) {
      return {
        success: true,
        sourceType: 'skill',
        contestConfig: skill.contestConfig,
      };
    } else {
      return {
        success: false,
        error: 'INVALID_SKILL',
        message: '此技能不是對抗檢定類型',
      };
    }
  }

  // 嘗試找道具
  const attackerItems = attacker.items || [];
  const itemIndex = attackerItems.findIndex((i: { id: string }) => i.id === sourceId);
  
  if (itemIndex !== -1) {
    const item = attackerItems[itemIndex];
    // Phase 7.6: 支援 contest 和 random_contest 類型
    const itemCheckType = item.checkType || 'none';
    if (item && (itemCheckType === 'contest' || itemCheckType === 'random_contest') && item.contestConfig) {
      return {
        success: true,
        sourceType: 'item',
        contestConfig: item.contestConfig,
      };
    } else {
      return {
        success: false,
        error: 'INVALID_ITEM',
        message: '此道具不是對抗檢定類型',
      };
    }
  }

  return {
    success: false,
    error: 'NOT_FOUND',
    message: '找不到攻擊技能或道具',
  };
}

/**
 * 驗證防守方道具
 */
export function validateDefenderItems(
  defender: CharacterDocument,
  itemIds: string[],
  contestConfig: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  }
): {
  success: boolean;
  error?: string;
  message?: string;
  items?: Array<{ id: string; name: string; effect?: { value?: number } }>;
} {
  if (!itemIds || itemIds.length === 0) {
    return { success: true, items: [] };
  }

  const maxItems = contestConfig.opponentMaxItems ?? 0;
  if (maxItems === 0) {
    return {
      success: false,
      error: 'ITEMS_NOT_ALLOWED',
      message: '此對抗檢定不允許使用道具',
    };
  }
  if (itemIds.length > maxItems) {
    return {
      success: false,
      error: 'TOO_MANY_ITEMS',
      message: `最多只能使用 ${maxItems} 個道具`,
    };
  }

  const defenderItemsData = defender.items || [];
  const items: Array<{ id: string; name: string; effect?: { value?: number } }> = [];
  const now = new Date();

  for (const itemId of itemIds) {
    const item = defenderItemsData.find((i: { id: string }) => i.id === itemId);
    if (!item) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: `找不到道具 ${itemId}`,
      };
    }

    // 檢查道具是否可用（冷卻、次數限制等）
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      const cooldownMs = item.cooldown * 1000;
      if (now.getTime() - lastUsed < cooldownMs) {
        return {
          success: false,
          error: 'ITEM_ON_COOLDOWN',
          message: `道具 ${item.name} 仍在冷卻中`,
        };
      }
    }

    if (item.usageLimit && item.usageLimit > 0) {
      if ((item.usageCount || 0) >= item.usageLimit) {
        return {
          success: false,
          error: 'ITEM_USAGE_LIMIT_REACHED',
          message: `道具 ${item.name} 已達使用次數上限`,
        };
      }
    }

    // 重構：支援多個效果（優先使用 effects 陣列，向後兼容 effect）
    const itemEffects = item.effects || (item.effect ? [item.effect] : []);
    items.push({
      id: item.id,
      name: item.name,
      effect: itemEffects.length > 0 ? (itemEffects[0] as { value?: number }) : undefined,
    });
  }

  return { success: true, items };
}

/**
 * 驗證防守方技能
 */
export function validateDefenderSkills(
  defender: CharacterDocument,
  skillIds: string[],
  contestConfig: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  }
): {
  success: boolean;
  error?: string;
  message?: string;
  skills?: Array<{ id: string; name: string }>;
} {
  if (!skillIds || skillIds.length === 0) {
    return { success: true, skills: [] };
  }

  const maxSkills = contestConfig.opponentMaxSkills ?? 0;
  if (maxSkills === 0) {
    return {
      success: false,
      error: 'SKILLS_NOT_ALLOWED',
      message: '此對抗檢定不允許使用技能',
    };
  }
  if (skillIds.length > maxSkills) {
    return {
      success: false,
      error: 'TOO_MANY_SKILLS',
      message: `最多只能使用 ${maxSkills} 個技能`,
    };
  }

  const defenderSkillsData = defender.skills || [];
  const skills: Array<{ id: string; name: string }> = [];
  const now = new Date();

  for (const skillId of skillIds) {
    const defenderSkill = defenderSkillsData.find((s: { id: string }) => s.id === skillId);
    if (!defenderSkill) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: `找不到技能 ${skillId}`,
      };
    }

    // 檢查技能是否可用（冷卻、次數限制等）
    if (defenderSkill.cooldown && defenderSkill.cooldown > 0 && defenderSkill.lastUsedAt) {
      const lastUsed = new Date(defenderSkill.lastUsedAt).getTime();
      const cooldownMs = defenderSkill.cooldown * 1000;
      if (now.getTime() - lastUsed < cooldownMs) {
        return {
          success: false,
          error: 'SKILL_ON_COOLDOWN',
          message: `技能 ${defenderSkill.name} 仍在冷卻中`,
        };
      }
    }

    if (defenderSkill.usageLimit && defenderSkill.usageLimit > 0) {
      if ((defenderSkill.usageCount || 0) >= defenderSkill.usageLimit) {
        return {
          success: false,
          error: 'SKILL_USAGE_LIMIT_REACHED',
          message: `技能 ${defenderSkill.name} 已達使用次數上限`,
        };
      }
    }

    skills.push({
      id: defenderSkill.id,
      name: defenderSkill.name,
    });
  }

  return { success: true, skills };
}

/**
 * Phase 7.6: 驗證攻擊方技能/道具是否具有 "戰鬥" 標籤
 */
export function validateAttackerCombatTag(
  source: { tags?: string[] },
  sourceName: string,
  sourceType: 'skill' | 'item'
): ValidationResult {
  const tags = source.tags || [];
  if (!tags.includes('combat')) {
    return {
      success: false,
      error: 'MISSING_COMBAT_TAG',
      message: `${sourceType === 'skill' ? '技能' : '道具'}「${sourceName}」必須具有「戰鬥」標籤才能發起對抗檢定`,
    };
  }
  return { success: true };
}

/**
 * Phase 7.6: 驗證防守方技能/道具是否具有 "戰鬥" 標籤
 * 如果攻擊方有戰鬥標籤，防守方也必須有戰鬥標籤
 * 如果攻擊方沒有戰鬥標籤，防守方也不需要有戰鬥標籤
 */
export function validateDefenderCombatTag(
  defender: CharacterDocument,
  itemIds: string[],
  skillIds: string[],
  attackerHasCombatTag: boolean
): ValidationResult {
  // 如果攻擊方沒有戰鬥標籤，防守方也不需要戰鬥標籤
  if (!attackerHasCombatTag) {
    return { success: true };
  }

  // 如果攻擊方有戰鬥標籤，防守方也必須有戰鬥標籤
  // 驗證道具標籤
  if (itemIds && itemIds.length > 0) {
    const defenderItemsData = defender.items || [];
    for (const itemId of itemIds) {
      const item = defenderItemsData.find((i: { id: string }) => i.id === itemId);
      if (!item) {
        continue; // 已由 validateDefenderItems 驗證，這裡跳過
      }
      const tags = item.tags || [];
      if (!tags.includes('combat')) {
        return {
          success: false,
          error: 'MISSING_COMBAT_TAG',
          message: `道具「${item.name}」必須具有「戰鬥」標籤才能回應具備戰鬥標籤的對抗檢定`,
        };
      }
    }
  }

  // 驗證技能標籤
  if (skillIds && skillIds.length > 0) {
    const defenderSkillsData = defender.skills || [];
    for (const skillId of skillIds) {
      const skill = defenderSkillsData.find((s: { id: string }) => s.id === skillId);
      if (!skill) {
        continue; // 已由 validateDefenderSkills 驗證，這裡跳過
      }
      const tags = skill.tags || [];
      if (!tags.includes('combat')) {
        return {
          success: false,
          error: 'MISSING_COMBAT_TAG',
          message: `技能「${skill.name}」必須具有「戰鬥」標籤才能回應具備戰鬥標籤的對抗檢定`,
        };
      }
    }
  }

  return { success: true };
}

/**
 * Phase 7.6: 驗證防守方的檢定類型必須與攻擊方相同
 */
export function validateDefenderCheckType(
  attackerCheckType: 'contest' | 'random_contest',
  defender: CharacterDocument,
  itemIds: string[],
  skillIds: string[]
): ValidationResult {
  // 驗證道具檢定類型
  if (itemIds && itemIds.length > 0) {
    const defenderItemsData = defender.items || [];
    for (const itemId of itemIds) {
      const item = defenderItemsData.find((i: { id: string }) => i.id === itemId);
      if (!item) {
        continue;
      }
      const itemCheckType = item.checkType || 'none';
      if (itemCheckType !== attackerCheckType) {
        return {
          success: false,
          error: 'INVALID_CHECK_TYPE',
          message: `道具「${item.name}」的檢定類型必須與攻擊方相同（${attackerCheckType === 'contest' ? '對抗檢定' : '隨機對抗檢定'}）`,
        };
      }
    }
  }

  // 驗證技能檢定類型
  if (skillIds && skillIds.length > 0) {
    const defenderSkillsData = defender.skills || [];
    for (const skillId of skillIds) {
      const skill = defenderSkillsData.find((s: { id: string }) => s.id === skillId);
      if (!skill) {
        continue;
      }
      const skillCheckType = skill.checkType || 'none';
      if (skillCheckType !== attackerCheckType) {
        return {
          success: false,
          error: 'INVALID_CHECK_TYPE',
          message: `技能「${skill.name}」的檢定類型必須與攻擊方相同（${attackerCheckType === 'contest' ? '對抗檢定' : '隨機對抗檢定'}）`,
        };
      }
    }
  }

  return { success: true };
}

/**
 * Phase 7.6: 驗證防守方的 relatedStat 必須與攻擊方相同（僅適用於 contest 類型）
 */
export function validateDefenderRelatedStat(
  attackerRelatedStat: string,
  defender: CharacterDocument,
  itemIds: string[],
  skillIds: string[]
): ValidationResult {
  // 驗證道具 relatedStat
  if (itemIds && itemIds.length > 0) {
    const defenderItemsData = defender.items || [];
    for (const itemId of itemIds) {
      const item = defenderItemsData.find((i: { id: string }) => i.id === itemId);
      if (!item) {
        continue;
      }
      // 只驗證 contest 類型的道具
      if (item.checkType === 'contest' && item.contestConfig) {
        if (item.contestConfig.relatedStat !== attackerRelatedStat) {
          return {
            success: false,
            error: 'INVALID_RELATED_STAT',
            message: `道具「${item.name}」使用的數值（${item.contestConfig.relatedStat}）必須與攻擊方相同（${attackerRelatedStat}）`,
          };
        }
      }
    }
  }

  // 驗證技能 relatedStat
  if (skillIds && skillIds.length > 0) {
    const defenderSkillsData = defender.skills || [];
    for (const skillId of skillIds) {
      const skill = defenderSkillsData.find((s: { id: string }) => s.id === skillId);
      if (!skill) {
        continue;
      }
      // 只驗證 contest 類型的技能
      if (skill.checkType === 'contest' && skill.contestConfig) {
        if (skill.contestConfig.relatedStat !== attackerRelatedStat) {
          return {
            success: false,
            error: 'INVALID_RELATED_STAT',
            message: `技能「${skill.name}」使用的數值（${skill.contestConfig.relatedStat}）必須與攻擊方相同（${attackerRelatedStat}）`,
          };
        }
      }
    }
  }

  return { success: true };
}

