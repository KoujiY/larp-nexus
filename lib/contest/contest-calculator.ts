/**
 * 對抗檢定計算邏輯
 * 從 contest-respond.ts 提取
 */

import type { CharacterDocument } from '@/lib/db/models/Character';

export interface ContestCalculationResult {
  attackerValue: number;
  defenderValue: number;
  result: 'attacker_wins' | 'defender_wins' | 'both_fail';
}

/**
 * 計算攻擊方數值（基礎值 + 道具/技能加成）
 */
export function calculateAttackerValue(
  baseValue: number,
): number {
  // 目前攻擊方不支援額外的道具/技能加成
  // 未來可以擴展為攻擊方也可以選擇額外的道具/技能
  return baseValue;
}

/**
 * 計算防守方數值（基礎值 + 道具/技能加成）
 */
export function calculateDefenderValue(
  baseValue: number,
  relatedStatName: string,
  defender: CharacterDocument,
  defenderItems?: Array<{ id: string; name: string; effect?: { value?: number } }>,
  defenderSkills?: Array<{ id: string; name: string }>
): number {
  let defenderValue = baseValue;

  // 計算道具加成
  if (defenderItems && defenderItems.length > 0) {
    const defenderItemsData = defender.items || [];
    for (const itemRef of defenderItems) {
      const item = defenderItemsData.find((i: { id: string }) => i.id === itemRef.id);
      if (!item) continue;

      // 重構：支援多個效果（優先使用 effects 陣列，向後兼容 effect）
      const itemEffects = item.effects || (item.effect ? [item.effect] : []);
      
      // 計算道具加成（如果道具有效果且影響相關數值）
      for (const effect of itemEffects) {
        if (effect.type === 'stat_change' && effect.targetStat === relatedStatName && typeof effect.value === 'number') {
          defenderValue += effect.value;
        }
      }
    }
  }

  // 計算技能加成
  if (defenderSkills && defenderSkills.length > 0) {
    const defenderSkillsData = defender.skills || [];
    for (const skillRef of defenderSkills) {
      const skill = defenderSkillsData.find((s: { id: string }) => s.id === skillRef.id);
      if (!skill) continue;

      // 計算技能加成（如果技能有效果且影響相關數值）
      if (skill.effects) {
        for (const effect of skill.effects) {
          if (effect.type === 'stat_change' && effect.targetStat === relatedStatName && effect.value) {
            defenderValue += effect.value;
          }
        }
      }
    }
  }

  return defenderValue;
}

/**
 * 計算對抗結果
 */
export function calculateContestResult(
  attackerValue: number,
  defenderValue: number,
  tieResolution: 'attacker_wins' | 'defender_wins' | 'both_fail' = 'attacker_wins'
): 'attacker_wins' | 'defender_wins' | 'both_fail' {
  let result: 'attacker_wins' | 'defender_wins' | 'both_fail';
  if (attackerValue > defenderValue) {
    result = 'attacker_wins';
  } else if (defenderValue > attackerValue) {
    result = 'defender_wins';
  } else {
    // 平手，根據 tieResolution 決定
    result = tieResolution === 'both_fail' ? 'both_fail' : tieResolution;
  }
  
  return result;
}

/**
 * Phase 7.6: 計算隨機對抗檢定結果
 * 攻擊方和防守方各自骰 1 到 maxValue 的隨機數，比較大小決定勝負
 * 
 * @param maxValue 隨機數上限值（來自 Game.randomContestMaxValue）
 * @param tieResolution 平手時的裁決方式
 * @returns 對抗結果和雙方骰出的數值
 */
export function calculateRandomContestResult(
  maxValue: number,
  tieResolution: 'attacker_wins' | 'defender_wins' | 'both_fail' = 'attacker_wins'
): ContestCalculationResult {
  // 攻擊方和防守方各自骰 1 到 maxValue 的隨機數
  const attackerValue = Math.floor(Math.random() * maxValue) + 1;
  const defenderValue = Math.floor(Math.random() * maxValue) + 1;

  // 比較雙方數值，較大者獲勝
  let result: 'attacker_wins' | 'defender_wins' | 'both_fail';
  if (attackerValue > defenderValue) {
    result = 'attacker_wins';
  } else if (defenderValue > attackerValue) {
    result = 'defender_wins';
  } else {
    // 平手，根據 tieResolution 決定
    result = tieResolution === 'both_fail' ? 'both_fail' : tieResolution;
  }

  return {
    attackerValue,
    defenderValue,
    result,
  };
}

