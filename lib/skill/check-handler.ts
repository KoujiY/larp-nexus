/**
 * 技能檢定處理器
 * 處理不同類型的技能檢定（none, random, contest）
 * 
 * 從 skill-use.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { handleContestCheck, type CheckResult } from '@/lib/contest/contest-handler';
import type { CharacterDocument } from '@/lib/db/models';
import type { SkillType } from '@/lib/db/types/character-types';

/**
 * 檢定結果（從統一處理器導入）
 */
export type { CheckResult };

/**
 * 處理技能檢定
 * 
 * @param skill 技能
 * @param character 角色
 * @param checkResult 檢定結果（random 類型時由前端傳入）
 * @param targetCharacterId 目標角色 ID（contest 類型時需要）
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @returns 檢定結果
 */
export async function handleSkillCheck(
  skill: SkillType,
  character: CharacterDocument,
  checkResult?: number,
  targetCharacterId?: string,
  targetItemId?: string
): Promise<CheckResult> {
  await dbConnect();

  let checkPassed = true;
  let finalCheckResult: number | undefined;

  if (skill.checkType === 'contest' || skill.checkType === 'random_contest') {
    // Phase 3: 使用統一對抗檢定處理器
    if (!targetCharacterId) {
      throw new Error('對抗檢定需要選擇目標角色');
    }

    return await handleContestCheck(skill, 'skill', character, targetCharacterId, targetItemId);
  } else if (skill.checkType === 'random') {
    // 隨機檢定（由前端傳入結果）
    if (!skill.randomConfig?.maxValue || skill.randomConfig.threshold === undefined) {
      throw new Error('技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，確保設定了上限值和門檻值。');
    }

    if (checkResult === undefined) {
      throw new Error('需要檢定結果');
    }

    // 驗證檢定結果在有效範圍內
    if (checkResult < 1 || checkResult > skill.randomConfig.maxValue) {
      throw new Error(`檢定結果必須在 1-${skill.randomConfig.maxValue} 之間`);
    }

    finalCheckResult = checkResult;
    checkPassed = checkResult >= skill.randomConfig.threshold;
  }
  // checkType === 'none' 時，checkPassed 保持為 true

  return {
    checkPassed,
    checkResult: finalCheckResult,
  };
}

