/**
 * 對抗檢定效果執行器
 * 執行對抗檢定獲勝後的效果
 * 
 * 從 contest-respond.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitCharacterAffected, emitRoleUpdated, emitInventoryUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * 技能或道具的效果類型
 */
type Effect = {
  type: 'stat_change' | 'item_take' | 'item_steal' | 'item_give' | 'task_reveal' | 'task_complete' | 'custom';
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  targetItemId?: string;
  targetTaskId?: string;
  targetType?: 'self' | 'other' | 'any';
  description?: string;
};

/**
 * 技能類型
 */
type SkillType = NonNullable<CharacterDocument['skills']>[number];

/**
 * 道具類型
 */
type ItemType = NonNullable<CharacterDocument['items']>[number];

/**
 * 執行對抗檢定效果的結果
 */
export interface ContestEffectExecutionResult {
  effectsApplied: string[];
  updatedAttacker: CharacterDocument;
  updatedDefender: CharacterDocument;
}

/**
 * 執行對抗檢定獲勝後的效果
 * 
 * @param attacker 攻擊方角色
 * @param defender 防守方角色
 * @param source 技能或道具
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @returns 執行結果
 */
export async function executeContestEffects(
  attacker: CharacterDocument,
  defender: CharacterDocument,
  source: SkillType | ItemType,
  targetItemId?: string
): Promise<ContestEffectExecutionResult> {
  await dbConnect();

  const effectsApplied: string[] = [];
  const now = new Date();

  // 確保 ID 轉換為字符串，避免類型不匹配問題
  const attackerIdStr = attacker._id.toString();
  const defenderIdStr = defender._id.toString();

  // 判斷來源類型並獲取效果列表
  const sourceType: 'skill' | 'item' = 'effects' in source && Array.isArray(source.effects) ? 'skill' : 'item';
  const effects: Effect[] = sourceType === 'skill' 
    ? (source as SkillType).effects || []
    : (source as ItemType).effects || ((source as ItemType).effect ? [(source as ItemType).effect!] : []);

  // 檢查是否有 item_take/item_steal 效果且沒有 targetItemId
  const hasItemTakeOrSteal = effects.some((e) => e.type === 'item_take' || e.type === 'item_steal');
  const needsTargetItemSelection = hasItemTakeOrSteal && !targetItemId;

  // 如果需要選擇目標道具，跳過所有效果的執行
  if (needsTargetItemSelection) {
    // 重新載入角色資料以確保資料是最新的
    const updatedAttacker = await Character.findById(attackerIdStr);
    const updatedDefender = await Character.findById(defenderIdStr);
    
    if (!updatedAttacker || !updatedDefender) {
      throw new Error('找不到角色');
    }

    return {
      effectsApplied: [],
      updatedAttacker,
      updatedDefender,
    };
  }

  // 決定效果作用對象（根據效果的 targetType）
  // 對抗檢定時，技能效果可能作用於自己或防守方，道具效果總是作用於防守方
  const effectTarget = sourceType === 'skill' && effects.some((e) => e.targetType === 'other')
    ? defender
    : sourceType === 'item'
    ? defender
    : attacker;

  const targetStats = effectTarget.stats || [];
  const targetTasks = effectTarget.tasks || [];
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

  // 處理所有效果
  for (const effect of effects) {
    if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
      // 數值變化效果
      const statIndex = targetStats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex !== -1) {
        const statChangeTarget = effect.statChangeTarget || 'value';
        const currentStat = targetStats[statIndex];
        const beforeValue = currentStat.value;
        const beforeMax = currentStat.maxValue ?? null;

        // 若目標無 maxValue，但要求改 maxValue，退回改 value
        const effectiveTarget = statChangeTarget === 'maxValue' && beforeMax === null ? 'value' : statChangeTarget;

        let newValue = beforeValue;
        let newMaxValue = beforeMax;
        let deltaValue = 0;
        let deltaMax = 0;

        if (effectiveTarget === 'maxValue' && beforeMax !== null) {
          // 修改最大值
          newMaxValue = Math.max(1, beforeMax + effect.value);
          deltaMax = newMaxValue - beforeMax;
          targetStatUpdates[`stats.${statIndex}.maxValue`] = newMaxValue;

          if (effect.syncValue) {
            // 同步修改目前值
            newValue = Math.max(0, beforeValue + effect.value);
            newValue = Math.min(newValue, newMaxValue);
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectsApplied.push(`${effect.targetStat} 最大值 ${effect.value > 0 ? '+' : ''}${effect.value}，目前值同步調整`);
          } else {
            // 只修改最大值，確保目前值不超過新最大值
            newValue = Math.min(beforeValue, newMaxValue);
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectsApplied.push(`${effect.targetStat} 最大值 ${effect.value > 0 ? '+' : ''}${effect.value}`);
          }
        } else {
          // 修改目前值
          newValue = Math.max(0, beforeValue + effect.value);
          if (beforeMax !== null) {
            newValue = Math.min(newValue, beforeMax);
          }
          deltaValue = newValue - beforeValue;
          targetStatUpdates[`stats.${statIndex}.value`] = newValue;
          effectsApplied.push(`${effect.targetStat} ${effect.value > 0 ? '+' : ''}${effect.value}`);
        }

        statUpdates.push({
          id: currentStat.id,
          name: effect.targetStat,
          value: newValue,
          maxValue: newMaxValue !== null && newMaxValue !== beforeMax ? newMaxValue : undefined,
          deltaValue: deltaValue !== 0 ? deltaValue : undefined,
          deltaMax: deltaMax !== 0 ? deltaMax : undefined,
        });

        const isAffectingOthers = effectTarget._id.toString() !== attackerIdStr;
        if (isAffectingOthers) {
          crossCharacterChanges.push({
            name: effect.targetStat,
            deltaValue: deltaValue !== 0 ? deltaValue : undefined,
            deltaMax: deltaMax !== 0 ? deltaMax : undefined,
            newValue,
            newMax: newMaxValue !== null && newMaxValue !== beforeMax ? newMaxValue : undefined,
          });
        }
      }
    } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
      // 揭露任務效果
      const taskIndex = targetTasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && !targetTasks[taskIndex].isRevealed) {
        targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
        targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
        effectsApplied.push(`揭露任務：${targetTasks[taskIndex].title}`);
      }
    } else if (effect.type === 'task_complete' && effect.targetTaskId) {
      // 完成任務效果
      const taskIndex = targetTasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && targetTasks[taskIndex].status !== 'completed') {
        targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
        targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
        effectsApplied.push(`完成任務：${targetTasks[taskIndex].title}`);
      }
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      // 移除道具或偷竊道具效果
      if (!targetItemId) {
        continue; // 跳過此效果，但繼續處理其他效果
      }

      // 找到目標道具（目標是防守方，因為效果作用於防守方）
      const targetItems = defender.items || [];
      const targetItemIndex = targetItems.findIndex((i) => i.id === targetItemId);

      if (targetItemIndex === -1) {
        console.error('[contest-effect-executor] 目標角色沒有此道具:', targetItemId);
        continue; // 跳過此效果
      }

      const targetItem = targetItems[targetItemIndex];
      const targetItemName = targetItem.name;
      const targetItemQuantity = targetItem.quantity || 1;
      const newQuantity = targetItemQuantity - 1;

      // 準備更新：先移除舊的道具
      await Character.findByIdAndUpdate(defenderIdStr, {
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
        await Character.findByIdAndUpdate(defenderIdStr, {
          $push: { items: cleanedItem },
        });
      }

      if (effect.type === 'item_steal') {
        // 偷竊：將道具轉移到攻擊者身上
        // 重新載入攻擊者資料以確保資料是最新的
        const updatedAttacker = await Character.findById(attackerIdStr);
        if (!updatedAttacker) {
          continue;
        }

        const attackerItems = updatedAttacker.items || [];
        const attackerItemIndex = attackerItems.findIndex((i: { id: string }) => i.id === targetItemId);

        if (attackerItemIndex !== -1) {
          // 攻擊者已有此道具，增加數量
          const currentItem = attackerItems[attackerItemIndex];
          const currentQuantity = currentItem.quantity || 1;

          await Character.findByIdAndUpdate(attackerIdStr, {
            $pull: { items: { id: targetItemId } },
          });

          const updatedAttackerItem = {
            ...(currentItem.toObject ? currentItem.toObject() : currentItem),
            quantity: currentQuantity + 1,
          };
          const cleanedAttackerItem = updatedAttackerItem as Record<string, unknown>;
          delete cleanedAttackerItem._id;
          delete cleanedAttackerItem.__v;

          await Character.findByIdAndUpdate(attackerIdStr, {
            $push: { items: cleanedAttackerItem },
          });
        } else {
          // 攻擊者沒有此道具，新增道具
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

          await Character.findByIdAndUpdate(attackerIdStr, {
            $push: { items: stolenItem },
          });
        }

        effectsApplied.push(`偷竊了 ${targetItemName}`);
      } else {
        // 移除：只移除目標道具，不轉移
        effectsApplied.push(`移除了 ${targetItemName}`);
      }

      // 發送 WebSocket 事件給防守方
      emitInventoryUpdated(defenderIdStr, {
        characterId: defenderIdStr,
        item: {
          id: targetItem.id,
          name: targetItem.name,
          description: targetItem.description || '',
          imageUrl: targetItem.imageUrl,
          acquiredAt: targetItem.acquiredAt?.toISOString(),
        },
        action: targetItemQuantity <= 1 ? 'deleted' : 'updated',
      }).catch((error) => console.error('Failed to emit inventory.updated (take/steal defender)', error));

      // 發送跨角色影響事件
      emitCharacterAffected(defenderIdStr, {
        targetCharacterId: defenderIdStr,
        sourceCharacterId: attackerIdStr,
        sourceCharacterName: '', // 不顯示攻擊方名稱（隱私保護）
        sourceType: sourceType,
        sourceName: '', // 不顯示技能/道具名稱（隱私保護）
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
      const [updatedAttackerCharacter, updatedDefenderCharacter] = await Promise.all([
        Character.findById(attackerIdStr).lean(),
        Character.findById(defenderIdStr).lean(),
      ]);

      if (updatedAttackerCharacter && updatedDefenderCharacter) {
        const attackerCleanItems = cleanItemData(updatedAttackerCharacter.items);
        const defenderCleanItems = cleanItemData(updatedDefenderCharacter.items);

        // 發送 role.updated 給兩個角色，包含最新的道具列表
        await emitRoleUpdated(attackerIdStr, {
          characterId: attackerIdStr,
          updates: {
            items: attackerCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[contest-effect-executor] Failed to emit role.updated (attacker character items)', error);
        });

        await emitRoleUpdated(defenderIdStr, {
          characterId: defenderIdStr,
          updates: {
            items: defenderCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[contest-effect-executor] Failed to emit role.updated (defender character items)', error);
        });
      }
    } else if (effect.type === 'custom' && effect.description) {
      // 自定義效果
      effectsApplied.push(effect.description);
    }
  }

  // 應用統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    const targetId = effectTarget._id.toString();
    await Character.findByIdAndUpdate(targetId, {
      $set: targetStatUpdates,
      $unset: { 'tasks.$[].gmNotes': 1 },
    });

    // 如果效果作用於防守方（攻擊方獲勝），發送 character.affected 事件給防守方
    // 不顯示技能/道具名稱或攻擊方名稱（隱私保護）
    const isAffectingDefender = effectTarget._id.toString() === defenderIdStr;
    if (isAffectingDefender && crossCharacterChanges.length > 0) {
      emitCharacterAffected(defenderIdStr, {
        targetCharacterId: defenderIdStr,
        sourceCharacterId: attackerIdStr,
        sourceCharacterName: '', // 不顯示攻擊方名稱
        sourceType: sourceType,
        sourceName: '', // 不顯示技能/道具名稱
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
      }).catch((error) => console.error('Failed to emit character.affected (contest)', error));
    }
  }

  // 重新載入角色資料以確保資料是最新的
  const updatedAttacker = await Character.findById(attackerIdStr);
  const updatedDefender = await Character.findById(defenderIdStr);

  if (!updatedAttacker || !updatedDefender) {
    throw new Error('找不到角色');
  }

  return {
    effectsApplied,
    updatedAttacker,
    updatedDefender,
  };
}

