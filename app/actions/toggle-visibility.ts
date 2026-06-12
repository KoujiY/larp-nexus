'use server';

import { withAction } from '@/lib/actions/action-wrapper';
import { runWithGameCache } from '@/lib/game/game-request-cache';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { getCharacterData } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { emitSkillRevealed, emitSkillHidden, emitItemRevealed, emitItemHidden } from '@/lib/websocket/events';
import { executeAutoReveal } from '@/lib/reveal/auto-reveal-evaluator';
import { writeLog } from '@/lib/logs/write-log';
import type { ApiResponse } from '@/types/api';

/**
 * GM 手動切換技能 / 物品的可見性（隱藏 ↔ 揭露）
 *
 * @param characterId - 角色 ID
 * @param type - 'skill' 或 'item'
 * @param targetId - 技能或物品的 ID
 */
export async function toggleVisibility(
  characterId: string,
  type: 'skill' | 'item',
  targetId: string,
): Promise<ApiResponse<{ isHidden: boolean }>> {
  return runWithGameCache(() => withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    const character = await getCharacterData(characterId);
    if (!character) {
      return { success: false, error: 'NOT_FOUND', message: '角色不存在' };
    }

    const gameId = character.gameId.toString();
    const now = new Date();

    if (type === 'skill') {
      const skills = character.skills ?? [];
      const skillIndex = skills.findIndex((s: { id: string }) => s.id === targetId);
      if (skillIndex === -1) {
        return { success: false, error: 'NOT_FOUND', message: '技能不存在' };
      }
      const skill = skills[skillIndex];
      const newHidden = !skill.isHidden;

      await updateCharacterData(characterId, {
        $set: {
          [`skills.${skillIndex}.isHidden`]: newHidden,
          [`skills.${skillIndex}.hiddenAt`]: now,
        },
      });

      if (newHidden) {
        emitSkillHidden(characterId, {
          characterId,
          skillId: skill.id,
          skillName: skill.name,
          hideType: 'manual',
        }).catch((err) => console.error('[toggle-visibility] emit error', err));
      } else {
        emitSkillRevealed(characterId, {
          characterId,
          skillId: skill.id,
          skillName: skill.name,
          revealType: 'manual',
        }).catch((err) => console.error('[toggle-visibility] emit error', err));

        // 揭露後觸發鏈式自動揭露（用 visibility_changed 純訊號，避免誤觸 skill_used 使用型條件）
        executeAutoReveal(characterId, { type: 'skill_visibility_changed' as const })
          .catch((err) => console.error('[toggle-visibility] auto-reveal error', err));
      }

      await writeLog({
        gameId,
        characterId,
        actorType: 'gm',
        actorId: gmUserId,
        action: newHidden ? 'hide_skill' : 'reveal_skill',
        details: { skillId: skill.id, skillName: skill.name },
      });

      return { success: true, data: { isHidden: newHidden }, message: newHidden ? '技能已隱藏' : '技能已揭露' };
    }

    // type === 'item'
    const items = character.items ?? [];
    const itemIndex = items.findIndex((i: { id: string }) => i.id === targetId);
    if (itemIndex === -1) {
      return { success: false, error: 'NOT_FOUND', message: '物品不存在' };
    }
    const item = items[itemIndex];
    const newHidden = !item.isHidden;

    const updateFields: Record<string, unknown> = {
      [`items.${itemIndex}.isHidden`]: newHidden,
      [`items.${itemIndex}.hiddenAt`]: now,
    };
    // 隱藏已裝備的物品時自動卸下
    if (newHidden && item.equipped) {
      updateFields[`items.${itemIndex}.equipped`] = false;
    }

    await updateCharacterData(characterId, { $set: updateFields });

    if (newHidden) {
      emitItemHidden(characterId, {
        characterId,
        itemId: item.id,
        itemName: item.name,
        hideType: 'manual',
      }).catch((err) => console.error('[toggle-visibility] emit error', err));
    } else {
      emitItemRevealed(characterId, {
        characterId,
        itemId: item.id,
        itemName: item.name,
        revealType: 'manual',
      }).catch((err) => console.error('[toggle-visibility] emit error', err));

      // 揭露後觸發鏈式自動揭露（用 visibility_changed 純訊號，避免誤觸 item_used 使用型條件）
      executeAutoReveal(characterId, { type: 'item_visibility_changed' as const })
        .catch((err) => console.error('[toggle-visibility] auto-reveal error', err));
    }

    await writeLog({
      gameId,
      characterId,
      actorType: 'gm',
      actorId: gmUserId,
      action: newHidden ? 'hide_item' : 'reveal_item',
      details: { itemId: item.id, itemName: item.name },
    });

    return { success: true, data: { isHidden: newHidden }, message: newHidden ? '物品已隱藏' : '物品已揭露' };
  }));
}
