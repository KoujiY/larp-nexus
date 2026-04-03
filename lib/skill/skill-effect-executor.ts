/**
 * 技能效果執行器
 * 執行技能效果（stat_change, task_reveal, task_complete, item_take, item_steal, custom）
 *
 * 從 skill-use.ts 提取
 * stat_change 計算委派至 computeStatChange()
 * item_take / item_steal 轉移邏輯委派至 applyItemTransfer()
 */

import dbConnect from '@/lib/db/mongodb';
import { emitCharacterAffected, emitRoleUpdated } from '@/lib/websocket/events';
import type { CharacterDocument } from '@/lib/db/models';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import { writeLog } from '@/lib/logs/write-log';
import type { SkillType } from '@/lib/db/types/character-types';
import { computeStatChange, applyItemTransfer } from '@/lib/effects/shared-effect-executor';

/**
 * 執行技能效果的結果
 */
export interface SkillEffectExecutionResult {
  effectsApplied: string[];
  updatedCharacter: CharacterDocument;
  updatedTarget?: CharacterDocument;
  /** 需要延遲執行的自動揭露（呼叫者應在發送完通知後再觸發） */
  pendingReveal?: { receiverId: string };
}

/**
 * 執行技能效果
 *
 * @param skill 技能
 * @param character 角色
 * @param targetCharacterId 目標角色 ID（跨角色效果用）
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @returns 執行結果
 */
export async function executeSkillEffects(
  skill: SkillType,
  character: CharacterDocument,
  targetCharacterId?: string,
  targetItemId?: string
): Promise<SkillEffectExecutionResult> {
  await dbConnect();

  if (!skill.effects || skill.effects.length === 0) {
    const updatedCharacter = await getCharacterData(getBaselineCharacterId(character));
    return { effectsApplied: [], updatedCharacter };
  }

  const now = new Date();
  const characterId = getBaselineCharacterId(character);
  let pendingRevealReceiverId: string | undefined;

  let targetCharacter: CharacterDocument | null = null;
  if (targetCharacterId) {
    targetCharacter = await getCharacterData(targetCharacterId) as CharacterDocument;
    if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
      throw new Error('目標角色不在同一劇本內');
    }
  }

  const effectTarget = targetCharacter || character;
  const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;

  const stats = effectTarget.stats || [];
  const tasks = effectTarget.tasks || [];
  const targetStatUpdates: Record<string, unknown> = {};
  const statUpdates: Array<{
    id: string; name: string; value: number; maxValue?: number;
    deltaValue?: number; deltaMax?: number;
  }> = [];
  const crossCharacterChanges: Array<{
    name: string; deltaValue?: number; deltaMax?: number;
    newValue: number; newMax?: number;
  }> = [];
  const effectsApplied: string[] = [];

  for (const effect of skill.effects) {
    if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
      const statIndex = stats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex === -1) continue;

      const result = computeStatChange(
        stats[statIndex],
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
        id: stats[statIndex].id,
        name: stats[statIndex].name,
        value: result.newValue,
        maxValue: result.newMaxValue,
        deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
        deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
      });

      if (isAffectingOthers) {
        crossCharacterChanges.push({
          name: stats[statIndex].name,
          deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
          deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
          newValue: result.newValue,
          newMax: result.newMaxValue,
        });
      }

      // Phase 8: 時效性效果
      if (effect.duration && effect.duration > 0) {
        await createTemporaryEffectRecord(
          getBaselineCharacterId(effectTarget),
          {
            sourceType: 'skill',
            sourceId: skill.id,
            sourceCharacterId: characterId,
            sourceCharacterName: character.name,
            sourceName: skill.name,
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
      const taskIndex = tasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && !tasks[taskIndex].isRevealed) {
        targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
        targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
        effectsApplied.push(`揭露任務：${tasks[taskIndex].title}`);
      }
    } else if (effect.type === 'task_complete' && effect.targetTaskId) {
      const taskIndex = tasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && tasks[taskIndex].status !== 'completed') {
        targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
        targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
        effectsApplied.push(`完成任務：${tasks[taskIndex].title}`);
      }
    } else if (effect.type === 'item_give' && effect.targetItemId) {
      // 給予道具（未實作）
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      if (skill.checkType === 'contest' || skill.checkType === 'random_contest') continue;
      if (!targetItemId) {
        effectsApplied.push('目標角色沒有道具可互動');
        continue;
      }
      if (!targetCharacterId) throw new Error('此效果需要選擇目標角色');

      if (!targetCharacter) {
        targetCharacter = await getCharacterData(targetCharacterId!) as CharacterDocument;
        if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
          throw new Error('目標角色不存在或不在同一劇本內');
        }
      }

      const targetItems = targetCharacter.items || [];
      const targetItem = targetItems.find((i) => i.id === targetItemId);
      if (!targetItem) throw new Error('目標角色沒有此道具');

      const sourceTags = skill.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');

      const transferResult = await applyItemTransfer({
        targetIdStr: targetCharacterId!,
        sourceIdStr: characterId,
        targetItem,
        effectType: effect.type,
        notification: {
          sourceCharacterId: characterId,
          sourceCharacterName: character.name,
          sourceType: 'skill',
          sourceName: skill.name,
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

  // 應用跨角色統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    if (isAffectingOthers && targetCharacter) {
      await updateCharacterData(targetCharacterId!, {
        $set: targetStatUpdates,
      });

      if (crossCharacterChanges.length > 0) {
        const sourceTags = skill.tags || [];
        const hasStealthTag = sourceTags.includes('stealth');

        emitCharacterAffected(targetCharacterId!, {
          targetCharacterId: targetCharacterId!,
          sourceCharacterId: characterId,
          sourceCharacterName: hasStealthTag ? '' : character.name,
          sourceType: 'skill',
          sourceName: skill.name,
          sourceHasStealthTag: hasStealthTag,
          effectType: 'stat_change',
          changes: {
            stats: crossCharacterChanges.map((c) => ({
              name: c.name, deltaValue: c.deltaValue,
              deltaMax: c.deltaMax, newValue: c.newValue, newMax: c.newMax,
            })),
          },
        }).catch((err) => console.error('[skill-effect-executor] emitCharacterAffected failed', err));

        emitRoleUpdated(targetCharacterId!, {
          characterId: targetCharacterId!,
          updates: {},
        }).catch((err) => console.error('[skill-effect-executor] emitRoleUpdated failed', err));
      }
    } else {
      await updateCharacterData(characterId, {
        $set: targetStatUpdates,
      });
    }
  }

  if (statUpdates.length > 0 && !isAffectingOthers) {
    emitRoleUpdated(characterId, {
      characterId,
      updates: {},
    }).catch((err) => console.error('[skill-effect-executor] emitRoleUpdated failed', err));
  }

  const updatedCharacter = await getCharacterData(characterId);
  const updatedTarget = targetCharacterId ? await getCharacterData(targetCharacterId) : undefined;

  await writeLog({
    gameId: character.gameId.toString(),
    characterId,
    actorType: 'character',
    actorId: characterId,
    action: 'skill_use',
    details: {
      skillId: skill.id,
      skillName: skill.name,
      targetCharacterId: targetCharacterId || undefined,
      targetCharacterName: targetCharacter?.name || undefined,
      effectsApplied,
      statChanges: statUpdates.length > 0 ? statUpdates : undefined,
      isAffectingOthers,
    },
  });

  return {
    effectsApplied,
    updatedCharacter,
    updatedTarget: updatedTarget || undefined,
    pendingReveal: pendingRevealReceiverId ? { receiverId: pendingRevealReceiverId } : undefined,
  };
}
