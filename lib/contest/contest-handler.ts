/**
 * 統一對抗檢定處理器
 * 處理技能和道具的對抗檢定邏輯（contest 和 random_contest）
 * 
 * Phase 3: 統一技能和道具的對抗檢定處理邏輯
 */

import dbConnect from '@/lib/db/mongodb';
import { Game } from '@/lib/db/models';
import { emitSkillUsed } from '@/lib/websocket/events';
import { emitContestRequest } from '@/lib/contest/contest-event-emitter';
import { addActiveContest } from '@/lib/contest-tracker';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import type { CharacterDocument } from '@/lib/db/models';
import type { SkillContestEvent } from '@/types/event';
import { getItemEffects } from '@/lib/item/get-item-effects';

/**
 * 技能類型
 */
type SkillType = NonNullable<CharacterDocument['skills']>[number];

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
 * 對抗檢定來源（技能或道具）
 */
export type ContestSource = SkillType | ItemType;

/**
 * 處理對抗檢定（contest 或 random_contest）
 * 
 * @param source 技能或道具
 * @param sourceType 來源類型（'skill' 或 'item'）
 * @param character 角色
 * @param targetCharacterId 目標角色 ID
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @returns 檢定結果
 */
export async function handleContestCheck(
  source: ContestSource,
  sourceType: 'skill' | 'item',
  character: CharacterDocument,
  targetCharacterId: string,
  targetItemId?: string
): Promise<CheckResult> {
  await dbConnect();

  // 取得檢定類型（道具的 checkType 可能是 undefined，默認為 'none'）
  const checkType = sourceType === 'skill' 
    ? (source as SkillType).checkType 
    : ((source as ItemType).checkType || 'none');

  // 只處理對抗檢定類型
  if (checkType !== 'contest' && checkType !== 'random_contest') {
    throw new Error('此函數只處理對抗檢定類型');
  }

  // 驗證對抗檢定設定
  const contestConfig = source.contestConfig;
  if (!contestConfig) {
    throw new Error('對抗檢定設定不完整');
  }

  // Phase 10.4: 使用統一讀取函數（自動判斷 Baseline/Runtime）
  const targetCharacter = await getCharacterData(targetCharacterId);
  if (!targetCharacter) {
    throw new Error('找不到目標角色');
  }

  // 驗證在同一劇本內
  if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
    throw new Error('目標角色不在同一劇本內');
  }

  // Phase 10.4: 取得 Baseline ID（避免使用 Runtime _id 作為外部識別碼）
  const attackerBaselineId = getBaselineCharacterId(character);
  const defenderBaselineId = getBaselineCharacterId(targetCharacter);

  // 生成對抗檢定 ID（使用 Baseline ID，確保防守方回應時能正確解析）
  const { generateContestId } = await import('@/lib/contest/contest-id');
  const contestId = generateContestId(attackerBaselineId, source.id);

  let attackerValue: number;
  let defenderBaseValue: number;
  let preliminaryResult: 'attacker_wins' | 'defender_wins' | 'both_fail';

  if (checkType === 'random_contest') {
    // 隨機對抗檢定
    // 取得劇本的 randomContestMaxValue
    const game = await Game.findById(character.gameId);
    const maxValue = game?.randomContestMaxValue || 100;

    // 攻擊方隨機數在選擇目標後、等待防守方回應時決定
    // 防守方的隨機數將在防守方按下確認按鈕時決定（在 contest-respond.ts 中）
    attackerValue = Math.floor(Math.random() * maxValue) + 1;
    // 防守方基礎值暫時設為 0（佔位符），實際值將在防守方回應時計算
    defenderBaseValue = 0;
    // 初步結果暫時設為 undefined，實際結果將在防守方回應時計算
    preliminaryResult = 'attacker_wins'; // 暫時值，實際結果將在防守方回應時計算
  } else {
    // 原有對抗檢定邏輯（contest 類型）
    const relatedStatName = contestConfig.relatedStat;

    // 取得攻擊方的相關數值
    const attackerStats = character.stats || [];
    const attackerStat = attackerStats.find((s) => s.name === relatedStatName);
    if (!attackerStat) {
      throw new Error(`你沒有 ${relatedStatName} 數值`);
    }

    attackerValue = attackerStat.value;

    // 取得防守方的相關數值（基礎值）
    const defenderStats = targetCharacter.stats || [];
    const defenderStat = defenderStats.find((s: { name: string }) => s.name === relatedStatName);
    if (!defenderStat) {
      throw new Error(`目標角色沒有 ${relatedStatName} 數值`);
    }

    defenderBaseValue = defenderStat.value;

    // 計算初步對抗結果（使用防守方基礎數值）
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
  }

  // 添加到對抗檢定追蹤系統（使用 Baseline ID）
  // 對於 random_contest，儲存攻擊方的隨機數
  addActiveContest(
    contestId,
    attackerBaselineId,
    defenderBaselineId,
    sourceType,
    source.id,
    checkType === 'random_contest' ? attackerValue : undefined, // 儲存攻擊方的隨機數
    checkType === 'random_contest' ? 'random_contest' : 'contest' // 儲存檢定類型
  );

  // 檢查是否需要選擇目標道具
  let needsTargetItemSelection = false;
  if (sourceType === 'item') {
    const effects = getItemEffects(source as ItemType);
    const hasItemTakeOrSteal = effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');
    needsTargetItemSelection = hasItemTakeOrSteal;
  } else if (sourceType === 'skill') {
    const effects = (source as SkillType).effects || [];
    const hasItemTakeOrSteal = effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');
    if (hasItemTakeOrSteal && !targetItemId) {
      needsTargetItemSelection = true;
    }
  }

  // 取得劇本的 randomContestMaxValue（用於 random_contest）
  const game = await Game.findById(character.gameId);
  const randomContestMaxValue = checkType === 'random_contest' 
    ? (game?.randomContestMaxValue || 100) 
    : undefined;

  // 構建事件 payload（使用 Baseline ID，確保 WebSocket 頻道與玩家端訂閱一致）
  // 注意：對於 random_contest，result 暫時設為 'attacker_wins'（佔位符），實際結果將在防守方回應時計算
  const eventPayload: Omit<SkillContestEvent['payload'], 'subType'> = {
    attackerId: attackerBaselineId,
    attackerName: character.name,
    defenderId: defenderBaselineId,
    defenderName: targetCharacter.name,
    attackerValue: 0, // 防守方不應該知道攻擊方數值，使用 0 作為佔位符
    defenderValue: checkType === 'random_contest' ? 0 : defenderBaseValue, // random_contest 時防守方基礎值為 0（佔位符）
    result: checkType === 'random_contest' ? 'attacker_wins' : preliminaryResult, // random_contest 時使用佔位符，實際結果將在防守方回應時計算
    effectsApplied: undefined, // 效果將在防守方回應後執行
    opponentMaxItems: contestConfig.opponentMaxItems, // 防守方最多可使用道具數
    opponentMaxSkills: contestConfig.opponentMaxSkills, // 防守方最多可使用技能數
    targetItemId: targetItemId, // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
    checkType: checkType, // Phase 7.6: 檢定類型
    relatedStat: checkType === 'contest' ? contestConfig.relatedStat : undefined, // Phase 7.6: 數值判定名稱（contest 類型時使用）
    randomContestMaxValue: randomContestMaxValue, // Phase 7.6: 隨機對抗檢定上限值
    contestId: contestId, // Phase 7.6: 對抗檢定 ID，確保防守方能正確找到追蹤資訊
    sourceType: sourceType,
  };

  // 根據來源類型設定對應的 ID 和名稱
  if (sourceType === 'skill') {
    eventPayload.skillId = source.id;
    eventPayload.skillName = source.name;
  } else {
    eventPayload.itemId = source.id;
    eventPayload.itemName = source.name;
  }

  // Phase 7.6: 設定攻擊方標籤（戰鬥標籤用於決定防守方是否需要戰鬥標籤，隱匿標籤用於隱藏攻擊方名稱）
  const attackerTags = source.tags || [];
  eventPayload.attackerHasCombatTag = attackerTags.includes('combat');
  eventPayload.sourceHasStealthTag = attackerTags.includes('stealth');

  // 設定是否需要選擇目標道具
  eventPayload.needsTargetItemSelection = needsTargetItemSelection;

  // Phase 2: 推送對抗檢定請求事件給防守方（使用 Baseline ID 作為頻道名）
  // 防守方可以選擇使用道具/技能來增強防禦
  // Phase 7.6: 對於 random_contest，攻擊方隨機數已在選擇目標後決定，但防守方不應該知道
  // 對於 contest，防守方不應該知道攻擊方的數值，所以發送 0 作為佔位符
  emitContestRequest(attackerBaselineId, defenderBaselineId, eventPayload).catch((error) => {
    console.error('Failed to emit contest request', error);
  });

  // 技能需要發送 skill.used 事件（道具不需要）
  if (sourceType === 'skill') {
    emitSkillUsed(attackerBaselineId, {
      characterId: attackerBaselineId,
      skillId: source.id,
      skillName: source.name,
      checkType: checkType === 'random_contest' ? 'random_contest' : checkType === 'contest' ? 'contest' : 'none',
      checkPassed: false, // 暫時設為 false，等待防守方回應
      checkResult: undefined,
      effectsApplied: undefined,
    }).catch((error) => {
      console.error('Failed to emit skill.used event', error);
    });
  }

  return {
    checkPassed: false, // 等待防守方回應
    contestId,
    attackerValue,
    defenderValue: defenderBaseValue,
    preliminaryResult,
  };
}

