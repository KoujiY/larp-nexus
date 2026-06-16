/**
 * 統一檢定處理器
 * 處理物品與技能的檢定邏輯（none, random, contest）
 *
 * 由 Phase 3 合併自 lib/item/check-handler.ts 與 lib/skill/check-handler.ts
 */

import dbConnect from '@/lib/db/mongodb';
import { handleContestCheck, type CheckResult } from '@/lib/contest/contest-handler';
import type { CharacterDocument } from '@/lib/db/models';
import type { ItemType, SkillType } from '@/lib/db/types/character-types';

export type { CheckResult };

const abilityLabel = { item: '物品', skill: '技能' } as const;

/**
 * 處理物品或技能的檢定
 *
 * @param ability 物品或技能
 * @param abilityType 類型標記
 * @param character 角色
 * @param targetCharacterId 目標角色 ID（contest 類型時需要）
 * @param checkResult 檢定結果（random 類型時由前端傳入）
 * @param targetItemId 目標物品 ID（用於 item_take 和 item_steal 效果）
 * @returns 檢定結果
 */
export async function handleAbilityCheck(params: {
  ability: ItemType | SkillType;
  abilityType: 'item' | 'skill';
  character: CharacterDocument;
  targetCharacterId?: string;
  checkResult?: number;
  targetItemId?: string;
}): Promise<CheckResult> {
  const { ability, abilityType, character, targetCharacterId, checkResult, targetItemId } = params;
  await dbConnect();

  let checkPassed = true;
  let finalCheckResult: number | undefined;

  const checkType = ability.checkType || 'none';
  const label = abilityLabel[abilityType];

  if (checkType === 'contest' || checkType === 'random_contest') {
    if (!targetCharacterId) {
      throw new Error('對抗檢定需要選擇目標角色');
    }

    return await handleContestCheck(ability, abilityType, character, targetCharacterId, targetItemId);
  } else if (checkType === 'random') {
    if (!ability.randomConfig?.maxValue || ability.randomConfig.threshold === undefined) {
      throw new Error(`${label}隨機檢定設定不完整。請在 GM 端重新編輯此${label}，確保設定了上限值和門檻值。`);
    }

    if (checkResult === undefined) {
      throw new Error('需要檢定結果');
    }

    if (checkResult < 1 || checkResult > ability.randomConfig.maxValue) {
      throw new Error(`檢定結果必須在 1-${ability.randomConfig.maxValue} 之間`);
    }

    finalCheckResult = checkResult;
    checkPassed = checkResult >= ability.randomConfig.threshold;
  }
  // checkType === 'none' 時，checkPassed 保持為 true

  return {
    checkPassed,
    checkResult: finalCheckResult,
  };
}
