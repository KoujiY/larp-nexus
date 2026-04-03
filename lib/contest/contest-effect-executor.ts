/**
 * 對抗檢定效果執行器
 * 執行對抗檢定獲勝後的效果
 *
 * 從 contest-respond.ts 提取
 * stat_change 計算委派至 computeStatChange()
 * item_take / item_steal 轉移邏輯委派至 applyItemTransfer()
 */

import dbConnect from '@/lib/db/mongodb';
import { emitCharacterAffected } from '@/lib/websocket/events';
import { getBaselineCharacterId, getCharacterData } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import type { CharacterDocument } from '@/lib/db/models';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import { getItemEffects } from '@/lib/item/get-item-effects';
import { writeLog } from '@/lib/logs/write-log';
import type { SkillType, ItemType } from '@/lib/db/types/character-types';
import { computeStatChange, applyItemTransfer } from '@/lib/effects/shared-effect-executor';

/**
 * 技能或道具的效果類型
 */
type Effect = {
  type: 'stat_change' | 'item_take' | 'item_steal' | 'item_give' | 'task_reveal' | 'task_complete' | 'custom';
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;
  targetItemId?: string;
  targetTaskId?: string;
  targetType?: 'self' | 'other' | 'any';
  description?: string;
};

/**
 * 執行對抗檢定效果的結果
 */
export interface ContestEffectExecutionResult {
  effectsApplied: string[];
  updatedAttacker: CharacterDocument;
  updatedDefender: CharacterDocument;
  /** 需要延遲執行的自動揭露（呼叫者應在發送完通知後再觸發） */
  pendingReveal?: { receiverId: string };
}

/**
 * 執行對抗檢定獲勝後的效果
 *
 * @param attacker 攻擊方角色
 * @param defender 防守方角色
 * @param source 技能或道具（攻擊方或防守方）
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @param contestResult 對抗檢定結果（Phase 7.6: 決定執行攻擊方還是防守方的效果）
 * @param defenderSources 防守方使用的技能/道具列表（Phase 7.6: 防守方獲勝時使用）
 * @returns 執行結果
 */
export async function executeContestEffects(
  attacker: CharacterDocument,
  defender: CharacterDocument,
  source: SkillType | ItemType,
  targetItemId?: string,
  contestResult: 'attacker_wins' | 'defender_wins' | 'both_fail' = 'attacker_wins',
  defenderSources?: Array<{ type: 'skill' | 'item'; id: string }>
): Promise<ContestEffectExecutionResult> {
  await dbConnect();

  const effectsApplied: string[] = [];
  let pendingRevealReceiverId: string | undefined;
  const now = new Date();

  const attackerIdStr = getBaselineCharacterId(attacker);
  const defenderIdStr = getBaselineCharacterId(defender);

  // Phase 7.6: 根據對抗結果決定執行攻擊方還是防守方的效果
  let actualSource: SkillType | ItemType = source;
  let actualSourceType: 'skill' | 'item' = 'effects' in source && Array.isArray(source.effects) ? 'skill' : 'item';

  if (contestResult === 'defender_wins' && defenderSources && defenderSources.length > 0 && !targetItemId) {
    const firstDefenderSource = defenderSources[0];
    if (firstDefenderSource.type === 'skill') {
      const defenderSkill = defender.skills?.find((s: { id: string }) => s.id === firstDefenderSource.id);
      if (defenderSkill) { actualSource = defenderSkill as SkillType; actualSourceType = 'skill'; }
    } else {
      const defenderItem = defender.items?.find((i: { id: string }) => i.id === firstDefenderSource.id);
      if (defenderItem) { actualSource = defenderItem as ItemType; actualSourceType = 'item'; }
    }
  }

  const effects: Effect[] = actualSourceType === 'skill'
    ? (actualSource as SkillType).effects || []
    : getItemEffects(actualSource as ItemType);

  // 效果作用對象：攻擊方獲勝 → 效果作用於防守方；防守方獲勝 → 作用於攻擊方
  const effectTarget: CharacterDocument = contestResult === 'defender_wins' ? attacker : defender;
  const effectTargetBaselineId = getBaselineCharacterId(effectTarget);

  const targetStats = effectTarget.stats || [];
  const targetTasks = effectTarget.tasks || [];
  const targetStatUpdates: Record<string, unknown> = {};
  const statUpdates: Array<{
    id: string; name: string; value: number; maxValue?: number;
    deltaValue?: number; deltaMax?: number;
  }> = [];
  const crossCharacterChanges: Array<{
    name: string; deltaValue?: number; deltaMax?: number;
    newValue: number; newMax?: number;
  }> = [];

  for (const effect of effects) {
    if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
      const statIndex = targetStats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex === -1) continue;

      const result = computeStatChange(
        targetStats[statIndex],
        effect.value,
        effect.statChangeTarget ?? 'value',
        effect.syncValue ?? false
      );

      targetStatUpdates[`stats.${statIndex}.value`] = result.newValue;
      if (result.effectiveTarget === 'maxValue' && result.newMaxValue !== undefined) {
        targetStatUpdates[`stats.${statIndex}.maxValue`] = result.newMaxValue;
      }
      effectsApplied.push(result.message);

      statUpdates.push({
        id: targetStats[statIndex].id,
        name: targetStats[statIndex].name,
        value: result.newValue,
        maxValue: result.newMaxValue,
        deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
        deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
      });

      // Phase 7.6: 判斷是否影響他人
      const isAffectingOthers = contestResult === 'defender_wins'
        ? effectTargetBaselineId !== defenderIdStr
        : effectTargetBaselineId !== attackerIdStr;
      if (isAffectingOthers) {
        crossCharacterChanges.push({
          name: targetStats[statIndex].name,
          deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
          deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
          newValue: result.newValue,
          newMax: result.newMaxValue,
        });
      }

      // Phase 8: 時效性效果
      if (effect.duration && effect.duration > 0) {
        const sourceCharacter = contestResult === 'defender_wins' ? defender : attacker;
        await createTemporaryEffectRecord(
          effectTargetBaselineId,
          {
            sourceType: actualSourceType,
            sourceId: actualSource.id,
            sourceCharacterId: getBaselineCharacterId(sourceCharacter),
            sourceCharacterName: sourceCharacter.name,
            sourceName: actualSource.name,
          },
          {
            targetStat: effect.targetStat,
            deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
            deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
            statChangeTarget: result.effectiveTarget,
            syncValue: effect.syncValue,
          },
          effect.duration
        );
      }
    } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
      const taskIndex = targetTasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && !targetTasks[taskIndex].isRevealed) {
        targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
        targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
        effectsApplied.push(`揭露任務：${targetTasks[taskIndex].title}`);
      }
    } else if (effect.type === 'task_complete' && effect.targetTaskId) {
      const taskIndex = targetTasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && targetTasks[taskIndex].status !== 'completed') {
        targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
        targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
        effectsApplied.push(`完成任務：${targetTasks[taskIndex].title}`);
      }
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      if (!targetItemId) {
        effectsApplied.push('放棄道具獲取');
        continue;
      }

      const targetItems = effectTarget.items || [];
      const targetItem = targetItems.find((i) => i.id === targetItemId);
      if (!targetItem) {
        console.error('[contest-effect-executor] 目標角色沒有此道具:', targetItemId);
        continue;
      }

      // 獲勝方為來源（source），效果作用對象為目標（target）
      const sourceIdStr = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
      const sourceCharacter = contestResult === 'defender_wins' ? defender : attacker;

      const sourceTags = actualSource.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');

      const transferResult = await applyItemTransfer({
        targetIdStr: effectTargetBaselineId,
        sourceIdStr,
        targetItem,
        effectType: effect.type,
        notification: {
          sourceCharacterId: sourceIdStr,
          sourceCharacterName: sourceCharacter.name,
          sourceType: actualSourceType,
          sourceName: '', // contest executor 不顯示技能/道具名稱（隱私保護）
          hasStealthTag,
        },
      });

      effectsApplied.push(transferResult.message);
      if (transferResult.pendingRevealReceiverId) {
        pendingRevealReceiverId = transferResult.pendingRevealReceiverId;
      }
    } else if (effect.type === 'custom' && effect.description) {
      effectsApplied.push(effect.description);
    }
  }

  // 應用統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    await updateCharacterData(effectTargetBaselineId, {
      $set: targetStatUpdates,
    });

    if (crossCharacterChanges.length > 0) {
      const sourceId = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
      const sourceName = contestResult === 'defender_wins' ? defender.name : attacker.name;
      const sourceTags = actualSource.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');

      emitCharacterAffected(effectTargetBaselineId, {
        targetCharacterId: effectTargetBaselineId,
        sourceCharacterId: sourceId,
        sourceCharacterName: hasStealthTag ? '' : sourceName,
        sourceType: actualSourceType,
        sourceName: '', // 不顯示技能/道具名稱
        sourceHasStealthTag: hasStealthTag,
        effectType: 'stat_change',
        changes: {
          stats: crossCharacterChanges.map((c) => ({
            name: c.name, deltaValue: c.deltaValue,
            deltaMax: c.deltaMax, newValue: c.newValue, newMax: c.newMax,
          })),
        },
      }).catch((err) => console.error('[contest-effect-executor] emitCharacterAffected failed', err));
    }
  }

  const updatedAttacker = await getCharacterData(attackerIdStr);
  const updatedDefender = await getCharacterData(defenderIdStr);

  if (!updatedAttacker || !updatedDefender) {
    throw new Error('找不到角色');
  }

  const winnerCharacterId = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
  const winnerCharacterName = contestResult === 'defender_wins' ? defender.name : attacker.name;
  const loserCharacterId = contestResult === 'defender_wins' ? attackerIdStr : defenderIdStr;
  const loserCharacterName = contestResult === 'defender_wins' ? attacker.name : defender.name;

  await writeLog({
    gameId: attacker.gameId.toString(),
    characterId: winnerCharacterId,
    actorType: 'character',
    actorId: winnerCharacterId,
    action: 'contest_result',
    details: {
      contestResult,
      sourceType: actualSourceType,
      sourceId: actualSource.id,
      sourceName: actualSource.name,
      attackerCharacterId: attackerIdStr,
      attackerCharacterName: attacker.name,
      defenderCharacterId: defenderIdStr,
      defenderCharacterName: defender.name,
      winnerCharacterId,
      winnerCharacterName,
      loserCharacterId,
      loserCharacterName,
      effectsApplied,
      statChanges: statUpdates.length > 0 ? statUpdates : undefined,
      targetItemId: targetItemId || undefined,
    },
  });

  return {
    effectsApplied,
    updatedAttacker,
    updatedDefender,
    pendingReveal: pendingRevealReceiverId ? { receiverId: pendingRevealReceiverId } : undefined,
  };
}
