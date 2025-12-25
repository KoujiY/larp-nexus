/**
 * 技能檢定處理器
 * 處理不同類型的技能檢定（none, random, contest）
 * 
 * 從 skill-use.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitSkillContest, emitSkillUsed } from '@/lib/websocket/events';
import { addActiveContest } from '@/lib/contest-tracker';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * 技能類型
 */
type SkillType = NonNullable<CharacterDocument['skills']>[number];

/**
 * 檢定結果
 */
export interface CheckResult {
  checkPassed: boolean;
  checkResult?: number;
  contestId?: string;
  attackerValue?: number;
  defenderValue?: number;
  preliminaryResult?: 'attacker_wins' | 'defender_wins' | 'both_fail';
}

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

  if (skill.checkType === 'contest') {
    // 對抗檢定
    if (!skill.contestConfig) {
      throw new Error('對抗檢定設定不完整');
    }

    // 對抗檢定必須有目標角色
    if (!targetCharacterId) {
      throw new Error('對抗檢定需要選擇目標角色');
    }

    const targetCharacter = await Character.findById(targetCharacterId);
    if (!targetCharacter) {
      throw new Error('找不到目標角色');
    }

    // 驗證在同一劇本內
    if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
      throw new Error('目標角色不在同一劇本內');
    }

    const contestConfig = skill.contestConfig;
    const relatedStatName = contestConfig.relatedStat;

    // 取得攻擊方的相關數值
    const attackerStats = character.stats || [];
    const attackerStat = attackerStats.find((s) => s.name === relatedStatName);
    if (!attackerStat) {
      throw new Error(`你沒有 ${relatedStatName} 數值`);
    }

    const attackerValue = attackerStat.value;

    // 取得防守方的相關數值（基礎值）
    const defenderStats = targetCharacter.stats || [];
    const defenderStat = defenderStats.find((s: { name: string }) => s.name === relatedStatName);
    if (!defenderStat) {
      throw new Error(`目標角色沒有 ${relatedStatName} 數值`);
    }

    const defenderBaseValue = defenderStat.value;

    // 創建對抗請求 ID（格式：attackerId::skillId::timestamp）
    const now = new Date();
    const contestId = `${character._id.toString()}::${skill.id}::${now.getTime()}`;

    // 計算初步對抗結果（使用防守方基礎數值）
    let preliminaryResult: 'attacker_wins' | 'defender_wins' | 'both_fail';
    if (attackerValue > defenderBaseValue) {
      preliminaryResult = 'attacker_wins';
    } else if (defenderBaseValue > attackerValue) {
      preliminaryResult = 'defender_wins';
    } else {
      // 平手
      preliminaryResult = contestConfig.tieResolution || 'attacker_wins';
      if (preliminaryResult === 'both_fail') {
        preliminaryResult = 'both_fail';
      }
    }

    // 添加到對抗檢定追蹤系統
    addActiveContest(contestId, character._id.toString(), targetCharacterId, 'skill', skill.id);

    // 推送對抗檢定請求事件給防守方
    // 防守方可以選擇使用道具/技能來增強防禦
    // 注意：防守方不應該知道攻擊方的數值，所以發送 0 作為佔位符
    emitSkillContest(character._id.toString(), targetCharacterId, {
      attackerId: character._id.toString(),
      attackerName: character.name,
      defenderId: targetCharacterId,
      defenderName: targetCharacter.name,
      skillId: skill.id,
      skillName: skill.name,
      attackerValue: 0, // 防守方不應該知道攻擊方數值，使用 0 作為佔位符
      defenderValue: defenderBaseValue,
      result: preliminaryResult,
      effectsApplied: undefined, // 效果將在防守方回應後執行
      opponentMaxItems: contestConfig.opponentMaxItems, // 防守方最多可使用道具數
      opponentMaxSkills: contestConfig.opponentMaxSkills, // 防守方最多可使用技能數
      targetItemId: targetItemId, // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
    }).catch((error) => console.error('Failed to emit skill.contest (request)', error));

    // 推送技能使用事件（通知攻擊方對抗請求已發送）
    emitSkillUsed(character._id.toString(), {
      characterId: character._id.toString(),
      skillId: skill.id,
      skillName: skill.name,
      checkType: 'contest',
      checkPassed: false, // 暫時設為 false，等待防守方回應
      checkResult: undefined,
      effectsApplied: undefined,
    }).catch((error) => {
      console.error('Failed to emit skill.used event', error);
    });

    return {
      checkPassed: false, // 等待防守方回應
      contestId,
      attackerValue,
      defenderValue: defenderBaseValue,
      preliminaryResult,
    };
  } else if (skill.checkType === 'random') {
    // 隨機檢定（由前端傳入結果）
    // 處理舊資料格式：如果沒有 randomConfig，嘗試使用舊的 checkThreshold
    if (!skill.randomConfig) {
      // 檢查是否有舊格式的資料
      const oldThreshold = (skill as { checkThreshold?: number }).checkThreshold;
      const oldMaxValue = 100; // 舊格式預設上限為 100

      if (oldThreshold !== undefined) {
        // 使用舊格式的資料，但建議用戶更新
        if (checkResult === undefined) {
          throw new Error('需要檢定結果');
        }
        finalCheckResult = checkResult;
        // 驗證檢定結果在有效範圍內（舊格式預設上限為 100）
        if (checkResult < 1 || checkResult > oldMaxValue) {
          throw new Error(`檢定結果必須在 1-${oldMaxValue} 之間`);
        }
        checkPassed = checkResult >= oldThreshold;
      } else {
        throw new Error('技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，設定上限值和門檻值。');
      }
    } else if (!skill.randomConfig.maxValue || skill.randomConfig.threshold === undefined) {
      throw new Error('技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，確保設定了上限值和門檻值。');
    } else {
      // 正常的新格式
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
  }
  // checkType === 'none' 時，checkPassed 保持為 true

  return {
    checkPassed,
    checkResult: finalCheckResult,
  };
}

