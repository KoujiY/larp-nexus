/**
 * 道具檢定處理器
 * 處理不同類型的道具檢定（none, random, contest）
 * 
 * 從 item-use.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitSkillContest } from '@/lib/websocket/events';
import { addActiveContest } from '@/lib/contest-tracker';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * 道具類型
 */
type ItemType = NonNullable<CharacterDocument['items']>[number];

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
 * 處理道具檢定
 * 
 * @param item 道具
 * @param character 角色
 * @param checkResult 檢定結果（random 類型時由前端傳入）
 * @param targetCharacterId 目標角色 ID（contest 類型時需要）
 * @returns 檢定結果
 */
export async function handleItemCheck(
  item: ItemType,
  character: CharacterDocument,
  checkResult?: number,
  targetCharacterId?: string
): Promise<CheckResult> {
  await dbConnect();

  let checkPassed = true;
  let finalCheckResult: number | undefined;

  const checkType = item.checkType || 'none';

  if (checkType === 'contest') {
    // 對抗檢定
    if (!item.contestConfig) {
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

    const contestConfig = item.contestConfig;
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

    // 創建對抗請求 ID（格式：attackerId::itemId::timestamp）
    const now = new Date();
    const contestId = `${character._id.toString()}::${item.id}::${now.getTime()}`;

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
    addActiveContest(contestId, character._id.toString(), targetCharacterId, 'item', item.id);

    // 檢查是否有 item_take 或 item_steal 效果
    const effects = item.effects || (item.effect ? [item.effect] : []);
    const hasItemTakeOrSteal = effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');
    const needsTargetItemSelection = hasItemTakeOrSteal;

    // 推送對抗檢定請求事件給防守方
    emitSkillContest(character._id.toString(), targetCharacterId, {
      attackerId: character._id.toString(),
      attackerName: character.name,
      defenderId: targetCharacterId,
      defenderName: targetCharacter.name,
      itemId: item.id,
      itemName: item.name,
      sourceType: 'item',
      attackerValue: 0, // 防守方不應該知道攻擊方數值，使用 0 作為佔位符
      defenderValue: defenderBaseValue,
      result: preliminaryResult,
      effectsApplied: undefined, // 效果將在防守方回應後執行
      opponentMaxItems: contestConfig.opponentMaxItems,
      opponentMaxSkills: contestConfig.opponentMaxSkills,
      needsTargetItemSelection, // 標記是否需要選擇目標道具
    }).catch((error) => console.error('Failed to emit item.contest (request)', error));

    return {
      checkPassed: false, // 等待防守方回應
      contestId,
      attackerValue,
      defenderValue: defenderBaseValue,
      preliminaryResult,
    };
  } else if (checkType === 'random') {
    // 隨機檢定（由前端傳入結果）
    if (!item.randomConfig) {
      throw new Error('隨機檢定設定不完整');
    }

    if (!item.randomConfig.maxValue || item.randomConfig.threshold === undefined) {
      throw new Error('道具隨機檢定設定不完整。請在 GM 端重新編輯此道具，確保設定了上限值和門檻值。');
    }

    if (checkResult === undefined) {
      throw new Error('需要檢定結果');
    }

    // 驗證檢定結果在有效範圍內
    if (checkResult < 1 || checkResult > item.randomConfig.maxValue) {
      throw new Error(`檢定結果必須在 1-${item.randomConfig.maxValue} 之間`);
    }

    finalCheckResult = checkResult;
    checkPassed = checkResult >= item.randomConfig.threshold;
  }
  // checkType === 'none' 時，checkPassed 保持為 true

  return {
    checkPassed,
    checkResult: finalCheckResult,
  };
}

