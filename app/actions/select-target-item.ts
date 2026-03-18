'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { emitCharacterAffected, emitRoleUpdated, emitInventoryUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { writeLog } from '@/lib/logs/write-log';
import type { ApiResponse } from '@/types/api';

/**
 * 非對抗偷竊/移除道具的後續目標道具選擇
 *
 * 用於道具或技能使用成功後（非對抗檢定），選擇要偷竊/移除的目標道具。
 * 對抗檢定的目標道具選擇仍由 selectTargetItemForContest 處理。
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

    // 載入雙方角色資料
    const [character, targetCharacter] = await Promise.all([
      getCharacterData(characterId),
      getCharacterData(targetCharacterId),
    ]);

    // 驗證在同一劇本內
    if (character.gameId.toString() !== targetCharacter.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '目標角色不在同一劇本內',
      };
    }

    // 找到目標道具
    const targetItems = targetCharacter.items || [];
    const targetItemIndex = targetItems.findIndex((i) => i.id === targetItemId);
    if (targetItemIndex === -1) {
      return {
        success: false,
        error: 'TARGET_ITEM_NOT_FOUND',
        message: '目標角色沒有此道具',
      };
    }

    const targetItem = targetItems[targetItemIndex];
    const targetItemName = targetItem.name;
    const targetItemQuantity = targetItem.quantity || 1;

    // 找到來源技能/道具名稱（用於日誌和通知）
    let sourceName = '';
    if (sourceType === 'item') {
      const sourceItem = (character.items || []).find((i) => i.id === sourceId);
      sourceName = sourceItem?.name || '道具';
    } else {
      const sourceSkill = (character.skills || []).find((s) => s.id === sourceId);
      sourceName = sourceSkill?.name || '技能';
    }

    const baselineCharacterId = getBaselineCharacterId(character);

    // 從目標角色移除道具
    if (targetItemQuantity <= 1) {
      await updateCharacterData(targetCharacterId, {
        $pull: { items: { id: targetItemId } },
      });
    } else {
      await updateCharacterData(targetCharacterId, {
        $set: { [`items.${targetItemIndex}.quantity`]: targetItemQuantity - 1 },
      });
    }

    let effectMessage = '';

    if (effectType === 'item_steal') {
      // 偷竊：將道具轉移到施放者身上
      const sourceItems = character.items || [];
      const existingItemIndex = sourceItems.findIndex((i) => i.id === targetItemId);

      if (existingItemIndex !== -1) {
        // 已有此道具，增加數量
        const currentQuantity = sourceItems[existingItemIndex].quantity || 1;
        await updateCharacterData(characterId, {
          $set: { [`items.${existingItemIndex}.quantity`]: currentQuantity + 1 },
        });
      } else {
        // 新增道具到施放者
        const stolenItem = {
          ...targetItem,
          quantity: 1,
          acquiredAt: new Date(),
        };
        delete (stolenItem as Record<string, unknown> & { _id?: unknown })._id;
        await updateCharacterData(characterId, {
          $push: { items: stolenItem },
        });
      }

      effectMessage = `偷竊了 ${targetItemName}`;
    } else {
      effectMessage = `移除了 ${targetItemName}`;
    }

    // WebSocket 通知：目標角色道具變更
    emitInventoryUpdated(targetCharacterId, {
      characterId: targetCharacterId,
      item: {
        id: targetItem.id,
        name: targetItem.name,
        description: targetItem.description || '',
        imageUrl: targetItem.imageUrl,
        acquiredAt: targetItem.acquiredAt?.toISOString(),
      },
      action: targetItemQuantity <= 1 ? 'deleted' : 'updated',
    }).catch((error) => console.error('Failed to emit inventory.updated (select-target-item)', error));

    // 跨角色影響事件
    emitCharacterAffected(targetCharacterId, {
      targetCharacterId,
      sourceCharacterId: baselineCharacterId,
      sourceCharacterName: character.name,
      sourceType,
      sourceName,
      effectType,
      changes: {
        items: [{
          id: targetItem.id,
          name: targetItem.name,
          action: effectType === 'item_steal' ? 'stolen' : 'removed',
        }],
      },
    }).catch((error) => console.error('Failed to emit character.affected (select-target-item)', error));

    // 發送 role.updated 給雙方，同步 GM 端道具列表
    const [updatedSource, updatedTarget] = await Promise.all([
      getCharacterData(characterId),
      getCharacterData(targetCharacterId),
    ]);

    if (updatedSource && updatedTarget) {
      const sourceCleanItems = cleanItemData(updatedSource.items);
      const targetCleanItems = cleanItemData(updatedTarget.items);

      await Promise.all([
        emitRoleUpdated(baselineCharacterId, {
          characterId: baselineCharacterId,
          updates: { items: sourceCleanItems as unknown as Array<Record<string, unknown>> },
        }),
        emitRoleUpdated(targetCharacterId, {
          characterId: targetCharacterId,
          updates: { items: targetCleanItems as unknown as Array<Record<string, unknown>> },
        }),
      ]).catch((error) => console.error('Failed to emit role.updated (select-target-item)', error));
    }

    revalidatePath(`/c/${characterId}`);
    revalidatePath(`/c/${targetCharacterId}`);

    // 記錄日誌
    await writeLog({
      gameId: character.gameId.toString(),
      characterId: baselineCharacterId,
      actorType: 'character',
      actorId: baselineCharacterId,
      action: effectType === 'item_steal' ? 'item_steal' : 'item_take',
      details: {
        sourceType,
        sourceId,
        sourceName,
        targetCharacterId,
        targetCharacterName: targetCharacter.name,
        targetItemId,
        targetItemName,
        effectType,
      },
    });

    return {
      success: true,
      data: { effectApplied: effectMessage },
      message: effectMessage,
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
