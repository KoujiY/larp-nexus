/**
 * 道具效果執行器
 * 執行道具效果（stat_change, custom, item_take, item_steal）
 * 
 * 從 item-use.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitCharacterAffected, emitRoleUpdated, emitInventoryUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import type { CharacterDocument } from '@/lib/db/models';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect'; // Phase 8
import { writeLog } from '@/lib/logs/write-log'; // Phase 10.6

/**
 * 道具類型
 */
type ItemType = NonNullable<CharacterDocument['items']>[number];

/**
 * 道具效果類型
 */
type ItemEffect = NonNullable<ItemType['effects']>[number] | NonNullable<ItemType['effect']>;

/**
 * 執行道具效果的結果
 */
export interface ItemEffectExecutionResult {
  effectsApplied: string[];
  updatedCharacter: CharacterDocument;
  updatedTarget?: CharacterDocument;
}

/**
 * 執行道具效果
 * 
 * @param item 道具
 * @param character 角色
 * @param targetCharacterId 目標角色 ID（跨角色效果用）
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @returns 執行結果
 */
export async function executeItemEffects(
  item: ItemType,
  character: CharacterDocument,
  targetCharacterId?: string,
  targetItemId?: string
): Promise<ItemEffectExecutionResult> {
  await dbConnect();

  // 重構：支援多個效果（優先使用 effects 陣列，向後兼容 effect）
  const effects: ItemEffect[] = item.effects || (item.effect ? [item.effect] : []);

  if (effects.length === 0) {
    // 重新載入角色資料
    const updatedCharacter = await Character.findById(character._id);
    if (!updatedCharacter) {
      throw new Error('找不到角色');
    }
    return {
      effectsApplied: [],
      updatedCharacter,
    };
  }

  const characterId = character._id.toString();
  const checkType = item.checkType || 'none';

  // 決定效果作用對象
  let targetCharacter: CharacterDocument | null = null;
  if (targetCharacterId) {
    targetCharacter = await Character.findById(targetCharacterId);
    if (!targetCharacter) {
      throw new Error('找不到目標角色');
    }
    // 驗證在同一劇本內
    if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
      throw new Error('目標角色不在同一劇本內');
    }
  }

  const effectTarget = targetCharacter || character;
  const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;

  const stats = effectTarget.stats || [];
  const targetStatUpdates: Record<string, unknown> = {};
  const statUpdatePayload: Array<{
    id: string;
    name: string;
    value: number;
    maxValue?: number;
    deltaValue?: number;
    deltaMax?: number;
  }> = [];
  const crossCharacterChanges: Array<{
    name: string;
    deltaValue?: number;
    deltaMax?: number;
    newValue: number;
    newMax?: number;
  }> = [];
  const effectMessages: string[] = [];

  // 處理所有效果
  for (const effect of effects) {
    if (
      effect.type === 'stat_change' &&
      effect.targetStat &&
      typeof effect.value === 'number'
    ) {
      // 數值變化效果
      const statIndex = stats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex === -1) {
        // 繼續執行其他效果，不中斷
        continue;
      }

      // 使用 type assertion 處理可能缺少的欄位（向下兼容舊資料）
      interface ItemEffectExtended {
        type: string;
        targetStat?: string;
        value?: number;
        statChangeTarget?: 'value' | 'maxValue';
        syncValue?: boolean;
        duration?: number; // Phase 8: 時效性效果
        description?: string;
      }
      const effectWithTarget = effect as ItemEffectExtended;
      const target = effectWithTarget.statChangeTarget || 'value';
      const delta = effect.value;
      const beforeValue = stats[statIndex].value;
      const beforeMax = stats[statIndex].maxValue ?? null;
      const syncValue = effectWithTarget.syncValue;

      // 若目標無 maxValue，但要求改 maxValue，退回改 value
      const effectiveTarget = target === 'maxValue' && beforeMax === null ? 'value' : target;

      let newValue = beforeValue;
      let newMax = beforeMax;
      let deltaValue = 0;
      let deltaMax = 0;

      if (effectiveTarget === 'maxValue') {
        // 修改最大值
        if (beforeMax !== null) {
          newMax = Math.max(1, beforeMax + delta);
          deltaMax = newMax - beforeMax;
          targetStatUpdates[`stats.${statIndex}.maxValue`] = newMax;

          if (syncValue) {
            // 同步修改目前值
            newValue = Math.max(0, beforeValue + delta);
            newValue = Math.min(newValue, newMax);
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectMessages.push(`${effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}，目前值同步調整`);
          } else {
            // 只修改最大值，確保目前值不超過新最大值
            newValue = Math.min(beforeValue, newMax);
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectMessages.push(`${effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}`);
          }
        }
      } else {
        // 修改目前值
        newValue = Math.max(0, beforeValue + delta);
        if (beforeMax !== null) {
          newValue = Math.min(newValue, beforeMax);
        }
        deltaValue = newValue - beforeValue;
        targetStatUpdates[`stats.${statIndex}.value`] = newValue;
        effectMessages.push(`${effect.targetStat} ${delta > 0 ? '+' : ''}${delta}`);
      }

      statUpdatePayload.push({
        id: stats[statIndex].id,
        name: stats[statIndex].name,
        value: newValue,
        maxValue: newMax ?? undefined,
        deltaValue: deltaValue !== 0 ? deltaValue : undefined,
        deltaMax: deltaMax !== 0 ? deltaMax : undefined,
      });

      if (isAffectingOthers) {
        crossCharacterChanges.push({
          name: stats[statIndex].name,
          deltaValue: deltaValue !== 0 ? deltaValue : undefined,
          deltaMax: deltaMax !== 0 ? deltaMax : undefined,
          newValue,
          newMax: newMax ?? undefined,
        });
      }

      // Phase 8: 如果效果有 duration，建立時效性效果記錄
      if (effectWithTarget.duration && effectWithTarget.duration > 0) {
        await createTemporaryEffectRecord(
          effectTarget._id.toString(),
          {
            sourceType: 'item',
            sourceId: item.id,
            sourceCharacterId: characterId,
            sourceCharacterName: character.name,
            sourceName: item.name,
          },
          {
            targetStat: effect.targetStat!,
            deltaValue: deltaValue !== 0 ? deltaValue : undefined,
            deltaMax: deltaMax !== 0 ? deltaMax : undefined,
            statChangeTarget: effectiveTarget,
            syncValue: effectWithTarget.syncValue,
          },
          effectWithTarget.duration
        );
      }
    } else if (effect.type === 'custom' && effect.description) {
      // 自定義效果
      effectMessages.push(effect.description);
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      // 移除道具或偷竊道具效果
      // 注意：對抗檢定時，這個效果會在對抗檢定結束後才執行，這裡跳過
      if (checkType === 'contest') {
        continue;
      }

      if (!targetCharacterId) {
        throw new Error('此效果需要選擇目標角色');
      }

      if (!targetItemId) {
        throw new Error('請選擇目標道具');
      }

      // 驗證目標角色
      if (!targetCharacter) {
        targetCharacter = await Character.findById(targetCharacterId);
        if (!targetCharacter || targetCharacter.gameId.toString() !== character.gameId.toString()) {
          throw new Error('目標角色不存在或不在同一劇本內');
        }
      }

      // 找到目標道具
      const targetItems = targetCharacter.items || [];
      const targetItemIndex = targetItems.findIndex((i) => i.id === targetItemId);

      if (targetItemIndex === -1) {
        throw new Error('目標角色沒有此道具');
      }

      const targetItem = targetItems[targetItemIndex];
      const targetItemName = targetItem.name;
      const targetItemQuantity = targetItem.quantity || 1;

      // 準備更新
      const targetUpdates: Record<string, unknown> = {};
      const sourceUpdates: Record<string, unknown> = {};

      if (targetItemQuantity <= 1) {
        // 數量為 1 或更少，直接移除
        targetUpdates.$pull = { items: { id: targetItemId } };
      } else {
        // 減少數量
        const newQuantity = targetItemQuantity - 1;
        targetUpdates[`items.${targetItemIndex}.quantity`] = newQuantity;
      }

      // 更新目標角色（移除道具）
      if (targetUpdates.$pull) {
        await Character.findByIdAndUpdate(targetCharacterId, {
          $pull: targetUpdates.$pull as { items: { id: string } },
        });
      } else {
        await Character.findByIdAndUpdate(targetCharacterId, {
          $set: targetUpdates,
        });
      }

      if (effect.type === 'item_steal') {
        // 偷竊：將道具轉移到施放者身上
        const sourceItems = character.items || [];
        const sourceItemIndex = sourceItems.findIndex((i) => i.id === targetItemId);

        if (sourceItemIndex !== -1) {
          // 施放者已有此道具，增加數量
          const currentQuantity = sourceItems[sourceItemIndex].quantity || 1;
          sourceUpdates[`items.${sourceItemIndex}.quantity`] = currentQuantity + 1;
        } else {
          // 施放者沒有此道具，新增道具
          const stolenItem = {
            ...targetItem,
            quantity: 1,
            acquiredAt: new Date(),
          };
          delete (stolenItem as Record<string, unknown> & { _id?: unknown })._id; // 移除 MongoDB ID
          sourceUpdates.$push = { items: stolenItem };
        }

        // 更新施放者（添加道具）
        if (sourceUpdates.$push) {
          await Character.findByIdAndUpdate(characterId, {
            $push: sourceUpdates.$push as { items: unknown },
          });
        } else {
          await Character.findByIdAndUpdate(characterId, {
            $set: sourceUpdates,
          });
        }

        effectMessages.push(`偷竊了 ${targetItemName}`);
      } else {
        // 移除：只移除目標道具，不轉移
        effectMessages.push(`移除了 ${targetItemName}`);
      }

      // 發送 WebSocket 事件給目標角色
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
      }).catch((error) => console.error('Failed to emit inventory.updated (take/steal target)', error));

      // 發送跨角色影響事件
      emitCharacterAffected(targetCharacterId, {
        targetCharacterId,
        sourceCharacterId: characterId,
        sourceCharacterName: character.name,
        sourceType: 'item',
        sourceName: item.name,
        effectType: effect.type === 'item_steal' ? 'item_steal' : 'item_take',
        changes: {
          items: [{
            id: targetItem.id,
            name: targetItem.name,
            action: effect.type === 'item_steal' ? 'stolen' : 'removed',
          }],
        },
      }).catch((error) => console.error('Failed to emit character.affected (item_take/steal)', error));

      // 發送 role.updated 事件給兩個角色，讓GM端能同步更新道具列表
      const [updatedSourceCharacter, updatedTargetCharacter] = await Promise.all([
        Character.findById(characterId).lean(),
        Character.findById(targetCharacterId).lean(),
      ]);

      if (updatedSourceCharacter && updatedTargetCharacter) {
        const sourceCleanItems = cleanItemData(updatedSourceCharacter.items);
        const targetCleanItems = cleanItemData(updatedTargetCharacter.items);

        // 發送 role.updated 給兩個角色，包含最新的道具列表
        await emitRoleUpdated(characterId, {
          characterId,
          updates: {
            items: sourceCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[item-effect-executor] Failed to emit role.updated (source character items)', error);
        });

        await emitRoleUpdated(targetCharacterId, {
          characterId: targetCharacterId,
          updates: {
            items: targetCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[item-effect-executor] Failed to emit role.updated (target character items)', error);
        });
      }
    }
  }

  // 應用統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    if (isAffectingOthers && targetCharacter) {
      // 更新目標角色
      await Character.findByIdAndUpdate(targetCharacterId!, {
        $set: targetStatUpdates,
      });
    } else {
      // 更新自己
      await Character.findByIdAndUpdate(characterId, {
        $set: targetStatUpdates,
      });
    }
  }

  // WebSocket：數值更新（若有）
  if (statUpdatePayload.length > 0) {
    const targetId = isAffectingOthers ? targetCharacterId! : characterId;

    if (isAffectingOthers && crossCharacterChanges.length > 0) {
      // Phase 7.6: 檢查來源道具是否有隱匿標籤
      const sourceTags = item.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');
      
      // 跨角色影響：只發送 character.affected，不發送 role.updated 的 stats（避免重複通知）
      emitCharacterAffected(targetId, {
        targetCharacterId: targetId,
        sourceCharacterId: characterId,
        sourceCharacterName: hasStealthTag ? '' : character.name, // Phase 7.6: 有隱匿標籤時不顯示來源方名稱
        sourceType: 'item',
        sourceName: item.name,
        sourceHasStealthTag: hasStealthTag, // Phase 7.6: 標記是否有隱匿標籤
        effectType: 'stat_change',
        changes: {
          stats: crossCharacterChanges.map((change) => ({
            name: change.name,
            deltaValue: change.deltaValue,
            deltaMax: change.deltaMax,
            newValue: change.newValue,
            newMax: change.newMax,
          })),
        },
      }).catch((error) => console.error('Failed to emit character.affected (item)', error));

      // 只發送 role.updated 用於觸發頁面刷新，但不包含 stats
      emitRoleUpdated(targetId, {
        characterId: targetId,
        updates: {
          // 不包含 stats，避免與 character.affected 重複
        },
      }).catch((error) => console.error('Failed to emit role.updated (item target)', error));
    } else {
      // 自己使用道具：只發送 role.updated
      emitRoleUpdated(targetId, {
        characterId: targetId,
        updates: {
          stats: statUpdatePayload,
        },
      }).catch((error) => console.error('Failed to emit role.updated (item stat)', error));
    }
  }

  // 重新載入角色資料以確保資料是最新的
  const updatedCharacter = await Character.findById(characterId);
  const updatedTarget = targetCharacterId ? await Character.findById(targetCharacterId) : undefined;

  if (!updatedCharacter) {
    throw new Error('找不到角色');
  }

  // Phase 10.6: 記錄道具使用日誌
  await writeLog({
    gameId: character.gameId.toString(),
    characterId,
    actorType: 'character',
    actorId: characterId,
    action: 'item_use',
    details: {
      itemId: item.id,
      itemName: item.name,
      targetCharacterId: targetCharacterId || undefined,
      targetCharacterName: targetCharacter?.name || undefined,
      effectsApplied: effectMessages,
      statChanges: statUpdatePayload.length > 0 ? statUpdatePayload : undefined,
      isAffectingOthers,
    },
  });

  return {
    effectsApplied: effectMessages,
    updatedCharacter,
    updatedTarget: updatedTarget || undefined,
  };
}

