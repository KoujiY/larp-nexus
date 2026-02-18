/**
 * 技能效果執行器
 * 執行技能效果（stat_change, task_reveal, task_complete, item_take, item_steal, custom）
 * 
 * 從 skill-use.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitCharacterAffected, emitRoleUpdated, emitInventoryUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import type { CharacterDocument } from '@/lib/db/models';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect'; // Phase 8
import { writeLog } from '@/lib/logs/write-log'; // Phase 10.6

/**
 * 技能類型
 */
type SkillType = NonNullable<CharacterDocument['skills']>[number];

/**
 * 執行技能效果的結果
 */
export interface SkillEffectExecutionResult {
  effectsApplied: string[];
  updatedCharacter: CharacterDocument;
  updatedTarget?: CharacterDocument;
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

  const now = new Date();
  const characterId = character._id.toString();

  // 決定效果作用對象（根據效果的 targetType）
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
  const tasks = effectTarget.tasks || [];
  const targetStatUpdates: Record<string, unknown> = {};
  const statUpdates: Array<{
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
  const effectsApplied: string[] = [];

  // 處理所有效果
  for (const effect of skill.effects) {
    if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
      // 數值變化效果
      const statIndex = stats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex !== -1) {
        const statChangeTarget = effect.statChangeTarget || 'value';
        const currentStat = stats[statIndex];
        const beforeValue = currentStat.value;
        const beforeMax = currentStat.maxValue;

        let newValue = beforeValue;
        let newMaxValue = beforeMax;
        let deltaValue = 0;
        let deltaMax = 0;

        if (statChangeTarget === 'maxValue') {
          // 修改最大值
          if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
            newMaxValue = currentStat.maxValue + effect.value;
            newMaxValue = Math.max(1, newMaxValue); // 最大值至少為 1
            deltaMax = newMaxValue - currentStat.maxValue;
            targetStatUpdates[`stats.${statIndex}.maxValue`] = newMaxValue;

            // 如果同步修改目前值
            if (effect.syncValue) {
              newValue = currentStat.value + effect.value;
              newValue = Math.min(newValue, newMaxValue); // 不超過新最大值
              newValue = Math.max(0, newValue);
              deltaValue = newValue - beforeValue;
              targetStatUpdates[`stats.${statIndex}.value`] = newValue;
              effectsApplied.push(`${effect.targetStat} 最大值 ${effect.value > 0 ? '+' : ''}${effect.value}，目前值同步調整`);
            } else {
              // 只修改最大值，但確保目前值不超過新最大值
              newValue = Math.min(currentStat.value, newMaxValue);
              deltaValue = newValue - beforeValue;
              targetStatUpdates[`stats.${statIndex}.value`] = newValue;
              effectsApplied.push(`${effect.targetStat} 最大值 ${effect.value > 0 ? '+' : ''}${effect.value}`);
            }
          }
        } else {
          // 修改目前值
          newValue = currentStat.value + effect.value;
          // 如果有最大值限制，確保不超過
          if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
            newValue = Math.min(newValue, currentStat.maxValue);
          }
          newValue = Math.max(0, newValue); // 確保不低於 0
          deltaValue = newValue - beforeValue;
          targetStatUpdates[`stats.${statIndex}.value`] = newValue;
          effectsApplied.push(`${effect.targetStat} ${effect.value > 0 ? '+' : ''}${effect.value}`);
        }

        // 記錄統計變化（用於 WebSocket 事件）
        statUpdates.push({
          id: currentStat.id,
          name: effect.targetStat,
          value: newValue,
          maxValue: newMaxValue !== beforeMax ? newMaxValue : undefined,
          deltaValue: deltaValue !== 0 ? deltaValue : undefined,
          deltaMax: deltaMax !== 0 ? deltaMax : undefined,
        });

        // 記錄跨角色變化
        if (isAffectingOthers) {
          crossCharacterChanges.push({
            name: effect.targetStat,
            deltaValue: deltaValue !== 0 ? deltaValue : undefined,
            deltaMax: deltaMax !== 0 ? deltaMax : undefined,
            newValue,
            newMax: newMaxValue !== beforeMax ? newMaxValue : undefined,
          });
        }

        // Phase 8: 如果效果有 duration，建立時效性效果記錄
        if (effect.duration && effect.duration > 0) {
          await createTemporaryEffectRecord(
            effectTarget._id.toString(),
            {
              sourceType: 'skill',
              sourceId: skill.id,
              sourceCharacterId: characterId,
              sourceCharacterName: character.name,
              sourceName: skill.name,
            },
            {
              targetStat: effect.targetStat,
              deltaValue: deltaValue !== 0 ? deltaValue : undefined,
              deltaMax: deltaMax !== 0 ? deltaMax : undefined,
              statChangeTarget,
              syncValue: effect.syncValue,
            },
            effect.duration
          );
        }
      }
    } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
      // 任務揭露效果
      const taskIndex = tasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && !tasks[taskIndex].isRevealed) {
        targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
        targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
        effectsApplied.push(`揭露任務：${tasks[taskIndex].title}`);
      }
    } else if (effect.type === 'task_complete' && effect.targetTaskId) {
      // 任務完成效果
      const taskIndex = tasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && tasks[taskIndex].status !== 'completed') {
        targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
        targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
        effectsApplied.push(`完成任務：${tasks[taskIndex].title}`);
      }
    } else if (effect.type === 'item_give' && effect.targetItemId) {
      // 給予道具（未實作）
      // 跳過
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      // 移除道具或偷竊道具效果
      // 注意：對抗檢定時，這個效果會在對抗檢定結束後才執行，這裡跳過
      if (skill.checkType === 'contest') {
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
      const newQuantity = targetItemQuantity - 1;

      // 準備更新：先移除舊的道具
      await Character.findByIdAndUpdate(targetCharacterId, {
        $pull: { items: { id: targetItemId } },
      });

      // 如果數量 > 0，添加更新後的道具
      if (newQuantity > 0) {
        // targetItem 已經是普通的 JavaScript 對象，不需要調用 toObject()
        const updatedItem = {
          ...targetItem,
          quantity: newQuantity,
        };
        // 移除可能的 Mongoose 特定欄位（防禦性編程）
        const cleanedItem = updatedItem as Record<string, unknown>;
        delete cleanedItem._id;
        delete cleanedItem.__v;
        await Character.findByIdAndUpdate(targetCharacterId, {
          $push: { items: cleanedItem },
        });
      }

      if (effect.type === 'item_steal') {
        // 偷竊：將道具轉移到施放者身上
        // 重新載入角色資料以確保資料是最新的
        const updatedCharacter = await Character.findById(characterId);
        if (!updatedCharacter) {
          throw new Error('找不到角色');
        }

        const sourceItems = updatedCharacter.items || [];
        const sourceItemIndex = sourceItems.findIndex((i: { id: string }) => i.id === targetItemId);

        if (sourceItemIndex !== -1) {
          // 施放者已有此道具，增加數量
          const currentItem = sourceItems[sourceItemIndex];
          const currentQuantity = currentItem.quantity || 1;

          await Character.findByIdAndUpdate(characterId, {
            $pull: { items: { id: targetItemId } },
          });

          const updatedSourceItem = {
            ...currentItem,
            quantity: currentQuantity + 1,
          };
          delete (updatedSourceItem as Record<string, unknown> & { _id?: unknown; __v?: unknown })._id;
          delete (updatedSourceItem as Record<string, unknown> & { _id?: unknown; __v?: unknown }).__v;

          await Character.findByIdAndUpdate(characterId, {
            $push: { items: updatedSourceItem },
          });
        } else {
          // 施放者沒有此道具，新增道具
          const stolenItem = {
            id: targetItem.id,
            name: targetItem.name,
            description: targetItem.description || '',
            imageUrl: targetItem.imageUrl,
            type: targetItem.type,
            quantity: 1,
            isTransferable: targetItem.isTransferable !== undefined ? targetItem.isTransferable : true,
            acquiredAt: new Date(),
            usageCount: 0,
          };

          await Character.findByIdAndUpdate(characterId, {
            $push: { items: stolenItem },
          });
        }

        effectsApplied.push(`偷竊了 ${targetItemName}`);
      } else {
        // 移除：只移除目標道具，不轉移
        effectsApplied.push(`移除了 ${targetItemName}`);
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
        sourceType: 'skill',
        sourceName: skill.name,
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
          console.error('[skill-effect-executor] Failed to emit role.updated (source character items)', error);
        });

        await emitRoleUpdated(targetCharacterId, {
          characterId: targetCharacterId,
          updates: {
            items: targetCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[skill-effect-executor] Failed to emit role.updated (target character items)', error);
        });
      }
    } else if (effect.type === 'custom' && effect.description) {
      // 自定義效果
      effectsApplied.push(effect.description);
    }
  }

  // 應用跨角色統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    if (isAffectingOthers && targetCharacter) {
      // 更新目標角色
      await Character.findByIdAndUpdate(targetCharacterId, {
        $set: targetStatUpdates,
        $unset: { 'tasks.$[].gmNotes': 1 }, // 移除 gmNotes（若有）
      });

      // 發送 WebSocket 事件給目標角色
      if (crossCharacterChanges.length > 0) {
        // Phase 7.6: 檢查來源技能是否有隱匿標籤
        const sourceTags = skill.tags || [];
        const hasStealthTag = sourceTags.includes('stealth');
        
        emitCharacterAffected(targetCharacterId!, {
          targetCharacterId: targetCharacterId!,
          sourceCharacterId: characterId,
          sourceCharacterName: hasStealthTag ? '' : character.name, // Phase 7.6: 有隱匿標籤時不顯示來源方名稱
          sourceType: 'skill',
          sourceName: skill.name,
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
        }).catch((error) => console.error('Failed to emit character.affected (skill)', error));

        // 注意：跨角色影響時，不發送 role.updated 的 stats 更新
        // 因為 character.affected 已經包含了所有必要信息
        // 只發送 role.updated 用於觸發頁面刷新，但不包含 stats（避免重複通知）
        emitRoleUpdated(targetCharacterId!, {
          characterId: targetCharacterId!,
          updates: {
            // 不包含 stats，避免與 character.affected 重複
          },
        }).catch((error) => console.error('Failed to emit role.updated (skill target)', error));
      }
    } else {
      // 更新自己
      await Character.findByIdAndUpdate(characterId, {
        $set: targetStatUpdates,
        $unset: { 'tasks.$[].gmNotes': 1 }, // 移除 gmNotes（若有）
      });
    }
  }

  // 發送 role.updated 給施放者（如果有統計變化且不是跨角色）
  if (statUpdates.length > 0 && !isAffectingOthers) {
    emitRoleUpdated(characterId, {
      characterId,
      updates: {
        stats: statUpdates,
      },
    }).catch((error) => console.error('Failed to emit role.updated (skill stat)', error));
  }

  // 重新載入角色資料以確保資料是最新的
  const updatedCharacter = await Character.findById(characterId);
  const updatedTarget = targetCharacterId ? await Character.findById(targetCharacterId) : undefined;

  if (!updatedCharacter) {
    throw new Error('找不到角色');
  }

  // Phase 10.6: 記錄技能使用日誌
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
  };
}

