/**
 * 技能效果執行器（薄殼）
 *
 * 核心邏輯委派至 shared-effect-executor：
 *   - executeEffectBatch()        → 效果迴圈與累積（含 task_reveal/task_complete）
 *   - emitAffectedNotifications() → DB 套用與 WebSocket 通知
 *
 * 本檔案僅保留技能專屬邏輯：
 *   - 目標角色載入與驗證
 *   - writeLog（action: 'skill_use'）
 */

import dbConnect from '@/lib/db/mongodb';
import type { CharacterDocument } from '@/lib/db/models';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { writeLog } from '@/lib/logs/write-log';
import type { SkillType } from '@/lib/db/types/character-types';
import { executeEffectBatch, emitAffectedNotifications } from '@/lib/effects/shared-effect-executor';

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

  const characterId = getBaselineCharacterId(character);

  let targetCharacter: CharacterDocument | null = null;
  if (targetCharacterId) {
    targetCharacter = await getCharacterData(targetCharacterId) as CharacterDocument;
    if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
      throw new Error('目標角色不在同一劇本內');
    }
  }

  // 效果迴圈
  const batchResult = await executeEffectBatch({
    effects: skill.effects,
    character,
    targetCharacter,
    targetCharacterId,
    sourceType: 'skill',
    sourceId: skill.id,
    sourceName: skill.name,
    sourceTags: skill.tags || [],
    checkType: skill.checkType,
    targetItemId,
  });

  // DB 套用 + WebSocket 通知
  const { updatedCharacter, updatedTarget } = await emitAffectedNotifications({
    characterId,
    character,
    targetCharacterId,
    targetCharacter: batchResult.targetCharacter,
    sourceType: 'skill',
    sourceName: skill.name,
    sourceTags: skill.tags || [],
    batchResult,
  });

  // 合併 self + target 的 stat changes 作為日誌紀錄
  const allStatUpdates = [...batchResult.selfStatUpdates, ...batchResult.targetStatUpdatesList];

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
      targetCharacterName: batchResult.targetCharacter?.name || undefined,
      effectsApplied: batchResult.effectMessages,
      statChanges: allStatUpdates.length > 0 ? allStatUpdates : undefined,
      isAffectingOthers: batchResult.hasTargetUpdates,
    },
  });

  return {
    effectsApplied: batchResult.effectMessages,
    updatedCharacter,
    updatedTarget,
    pendingReveal: batchResult.pendingRevealReceiverId
      ? { receiverId: batchResult.pendingRevealReceiverId }
      : undefined,
  };
}
