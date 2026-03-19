'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { emitSkillUsed, emitItemUsed } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * 非對抗偷竊/移除道具的後續目標道具選擇
 *
 * Step 9 重構：選擇目標道具後，透過 executeSkillEffects/executeItemEffects 執行所有效果。
 * 效果執行器內部已處理：stat_change、item_steal/take、task_reveal、custom 等，
 * 並發送 character.affected、inventoryUpdated、role.updated 給防守方。
 * 本 action 只需在效果執行完成後 emit skill.used/item.used 給攻擊方。
 */
export async function selectTargetItemAfterUse(
  characterId: string,
  sourceId: string,
  sourceType: 'skill' | 'item',
  effectType: 'item_steal' | 'item_take',
  targetCharacterId: string,
  targetItemId: string
): Promise<ApiResponse<{ effectApplied?: string }>> {
  try {
    await dbConnect();

    // 載入攻擊方角色資料
    const character = await getCharacterData(characterId);
    const baselineCharacterId = getBaselineCharacterId(character);

    // 驗證目標角色在同一劇本內
    const targetCharacter = await getCharacterData(targetCharacterId);
    if (character.gameId.toString() !== targetCharacter.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '目標角色不在同一劇本內',
      };
    }

    // 找到來源技能/道具
    type SkillType = NonNullable<CharacterDocument['skills']>[number];
    type ItemType = NonNullable<CharacterDocument['items']>[number];
    let source: SkillType | ItemType | null = null;
    let sourceName = '';

    if (sourceType === 'skill') {
      const skill = (character.skills || []).find((s) => s.id === sourceId);
      if (!skill) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: '找不到技能',
        };
      }
      source = skill;
      sourceName = skill.name;
    } else {
      const item = (character.items || []).find((i) => i.id === sourceId);
      if (!item) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: '找不到道具',
        };
      }
      source = item;
      sourceName = item.name;
    }

    // Step 9: 透過效果執行器執行所有效果（包括 stat_change、item_steal/take 等）
    // 效果執行器已處理：DB 更新、character.affected、inventoryUpdated、role.updated
    let effectsApplied: string[] = [];

    if (sourceType === 'skill') {
      const { executeSkillEffects } = await import('@/lib/skill/skill-effect-executor');
      const effectResult = await executeSkillEffects(
        source as SkillType,
        character,
        targetCharacterId,
        targetItemId
      );
      effectsApplied = effectResult.effectsApplied;
    } else {
      const { executeItemEffects } = await import('@/lib/item/item-effect-executor');
      const effectResult = await executeItemEffects(
        source as ItemType,
        character,
        targetCharacterId,
        targetItemId
      );
      effectsApplied = effectResult.effectsApplied;
    }

    // Step 9: 發送 skill.used/item.used 事件給攻擊方（含完整 effectsApplied）
    // 效果執行器已處理防守方通知，這裡只需通知攻擊方
    if (sourceType === 'skill') {
      emitSkillUsed(baselineCharacterId, {
        characterId: baselineCharacterId,
        skillId: sourceId,
        skillName: sourceName,
        checkType: 'none',
        checkPassed: true,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        targetCharacterId,
        targetCharacterName: targetCharacter.name,
      }).catch((error) => console.error('Failed to emit skill.used (select-target-item)', error));
    } else {
      emitItemUsed(baselineCharacterId, {
        characterId: baselineCharacterId,
        itemId: sourceId,
        itemName: sourceName,
        checkPassed: true,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        targetCharacterId,
        targetCharacterName: targetCharacter.name,
      }).catch((error) => console.error('Failed to emit item.used (select-target-item)', error));
    }

    revalidatePath(`/c/${characterId}`);
    revalidatePath(`/c/${targetCharacterId}`);

    const finalEffectMessage = effectsApplied.length > 0 ? effectsApplied.join('、') : '效果已應用';

    return {
      success: true,
      data: { effectApplied: finalEffectMessage },
      message: finalEffectMessage,
    };
  } catch (error) {
    console.error('Error selecting target item after use:', error);
    return {
      success: false,
      error: 'SELECT_FAILED',
      message: `選擇目標道具失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
