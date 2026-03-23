/**
 * 對抗檢定效果執行器
 * 執行對抗檢定獲勝後的效果
 * 
 * 從 contest-respond.ts 提取
 */

import dbConnect from '@/lib/db/mongodb';
import { emitCharacterAffected, emitRoleUpdated, emitInventoryUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { getBaselineCharacterId, getCharacterData } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import type { CharacterDocument } from '@/lib/db/models';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect'; // Phase 8
import { getItemEffects } from '@/lib/item/get-item-effects';
import { writeLog } from '@/lib/logs/write-log'; // Phase 10.6

/**
 * 技能或道具的效果類型
 */
type Effect = {
  type: 'stat_change' | 'item_take' | 'item_steal' | 'item_give' | 'task_reveal' | 'task_complete' | 'custom';
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number; // Phase 8: 時效性效果
  targetItemId?: string;
  targetTaskId?: string;
  targetType?: 'self' | 'other' | 'any';
  description?: string;
};

import type { SkillType, ItemType } from '@/lib/db/types/character-types';

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

  // Phase 10.4: 使用 Baseline ID（避免 Runtime _id 與頻道、追蹤系統不匹配）
  const attackerIdStr = getBaselineCharacterId(attacker);
  const defenderIdStr = getBaselineCharacterId(defender);

  // Phase 7.6: 根據對抗結果決定執行攻擊方還是防守方的效果
  // Phase 9: 如果防守方獲勝且傳入了 defenderSources，優先使用傳入的 source（已經從防守方身上找到的正確對象）
  // 只有在 contest-respond.ts 中調用時（沒有傳入正確的 source）才需要重新查找
  let actualSource: SkillType | ItemType = source;
  let actualSourceType: 'skill' | 'item' = 'effects' in source && Array.isArray(source.effects) ? 'skill' : 'item';
  
  // Phase 9: 只有在沒有 targetItemId 的情況下（從 contest-respond.ts 調用），才需要重新查找防守方的技能/道具
  // 如果有 targetItemId（從 contest-select-item.ts 調用），說明已經找到了正確的 source，直接使用即可
  if (contestResult === 'defender_wins' && defenderSources && defenderSources.length > 0 && !targetItemId) {
    // 防守方獲勝：執行防守方使用的第一個技能/道具的效果
    // 注意：如果防守方使用了多個技能/道具，這裡只執行第一個的效果
    // 未來可以擴展為執行所有防守方技能/道具的效果
    const firstDefenderSource = defenderSources[0];
    
    if (firstDefenderSource.type === 'skill') {
      const defenderSkill = defender.skills?.find((s: { id: string }) => s.id === firstDefenderSource.id);
      if (defenderSkill) {
        actualSource = defenderSkill as SkillType;
        actualSourceType = 'skill';
      }
    } else {
      const defenderItem = defender.items?.find((i: { id: string }) => i.id === firstDefenderSource.id);
      if (defenderItem) {
        actualSource = defenderItem as ItemType;
        actualSourceType = 'item';
      }
    }
  } else if (contestResult === 'defender_wins' && targetItemId) {
    // Phase 9: 防守方獲勝且有 targetItemId，說明是從 contest-select-item.ts 調用，直接使用傳入的 source
  }
  

  // 判斷來源類型並獲取效果列表
  const effects: Effect[] = actualSourceType === 'skill' 
    ? (actualSource as SkillType).effects || []
    : getItemEffects(actualSource as ItemType);

  // Phase 12: 不再提前返回 — 即使有 item_steal/item_take 且沒有 targetItemId，
  // 仍需執行其他效果（stat_change, task_reveal 等）。
  // item_steal/item_take 本身會在迴圈中透過 continue 跳過。

  // Step 9: 決定效果作用對象 — 獲勝方的效果作用於對手
  // 與 skill-effect-executor.ts 保持一致：不依賴 effect.targetType 判定
  // 攻擊方獲勝：效果作用於防守方
  // 防守方獲勝：效果作用於攻擊方
  const effectTarget: CharacterDocument = contestResult === 'defender_wins' ? attacker : defender;

  // Phase 10.4: 取得效果目標的 Baseline ID（用於 WebSocket 頻道和 DB 更新路由）
  const effectTargetBaselineId = getBaselineCharacterId(effectTarget);

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

        // Phase 7.6: 判斷是否影響他人（根據對抗結果和效果目標）
        const isAffectingOthers = contestResult === 'defender_wins'
          ? effectTargetBaselineId !== defenderIdStr
          : effectTargetBaselineId !== attackerIdStr;
        if (isAffectingOthers) {
          crossCharacterChanges.push({
            name: effect.targetStat,
            deltaValue: deltaValue !== 0 ? deltaValue : undefined,
            deltaMax: deltaMax !== 0 ? deltaMax : undefined,
            newValue,
            newMax: newMaxValue !== null && newMaxValue !== beforeMax ? newMaxValue : undefined,
          });
        }

        // Phase 8: 如果效果有 duration，建立時效性效果記錄
        if (effect.duration && effect.duration > 0) {
          // 決定來源角色（誰獲勝就是誰的效果）
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
              deltaValue: deltaValue !== 0 ? deltaValue : undefined,
              deltaMax: deltaMax !== 0 ? deltaMax : undefined,
              statChangeTarget: effectiveTarget,
              syncValue: effect.syncValue,
            },
            effect.duration
          );
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
      // Step 9.1: 無 targetItemId（目標無道具時由 contest-select-item 呼叫）→ 記錄訊息並跳過
      if (!targetItemId) {
        effectsApplied.push('目標角色沒有道具可互動');
        continue;
      }

      // Phase 4: 修復目標道具查找邏輯
      // 根據效果作用對象決定目標道具所在位置
      // 攻擊方獲勝：效果作用於防守方，目標道具在防守方身上
      // 防守方獲勝：效果作用於攻擊方，目標道具在攻擊方身上
      const targetItems = effectTarget.items || [];
      const targetItemIndex = targetItems.findIndex((i) => i.id === targetItemId);

      if (targetItemIndex === -1) {
        console.error('[contest-effect-executor] 目標角色沒有此道具:', targetItemId);
        continue; // 跳過此效果
      }

      const targetItem = targetItems[targetItemIndex];
      const targetItemName = targetItem.name;
      const targetItemQuantity = targetItem.quantity || 1;
      const newQuantity = targetItemQuantity - 1;

      // Phase 4: 修復道具更新邏輯
      // 根據效果作用對象決定更新哪個角色
      const targetIdStr = effectTargetBaselineId;
      
      // 準備更新：先移除舊的道具
      await updateCharacterData(targetIdStr, {
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
        await updateCharacterData(targetIdStr, {
          $push: { items: cleanedItem },
        });
      }

      if (effect.type === 'item_steal') {
        // Phase 4: 修復偷竊邏輯
        // 偷竊：將道具轉移到效果來源方身上
        // 攻擊方獲勝：道具從防守方轉移到攻擊方
        // 防守方獲勝：道具從攻擊方轉移到防守方
        const sourceIdStr = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
        
        const updatedSource = await getCharacterData(sourceIdStr);
        if (!updatedSource) {
          continue;
        }

        const sourceItems = updatedSource.items || [];
        const sourceItemIndex = sourceItems.findIndex((i: { id: string }) => i.id === targetItemId);

        if (sourceItemIndex !== -1) {
          // 來源方已有此道具，增加數量
          const currentItem = sourceItems[sourceItemIndex];
          const currentQuantity = currentItem.quantity || 1;
          
          await updateCharacterData(sourceIdStr, {
            $pull: { items: { id: targetItemId } },
          });
          
          const updatedSourceItem = {
            ...JSON.parse(JSON.stringify(currentItem)),
            quantity: currentQuantity + 1,
          };
          const cleanedSourceItem = updatedSourceItem as Record<string, unknown>;
          delete cleanedSourceItem._id;
          delete cleanedSourceItem.__v;

          await updateCharacterData(sourceIdStr, {
            $push: { items: cleanedSourceItem },
          });
        } else {
          // 來源方沒有此道具，新增道具
          // 完整複製原道具屬性（保留 usageCount、usageLimit、tags、effects 等）
          const stolenItem = {
            ...JSON.parse(JSON.stringify(targetItem)),
            quantity: 1,
            acquiredAt: new Date(),
          };
          delete (stolenItem as Record<string, unknown> & { _id?: unknown; __v?: unknown })._id;
          delete (stolenItem as Record<string, unknown> & { _id?: unknown; __v?: unknown }).__v;

          await updateCharacterData(sourceIdStr, {
            $push: { items: stolenItem },
          });
        }

        effectsApplied.push(`偷竊了 ${targetItemName}`);
      } else {
        // 移除：只移除目標道具，不轉移
        effectsApplied.push(`移除了 ${targetItemName}`);
      }

      // Phase 4: 修復通知發送邏輯
      // 發送 WebSocket 事件給效果作用對象
      emitInventoryUpdated(targetIdStr, {
        characterId: targetIdStr,
        item: {
          id: targetItem.id,
          name: targetItem.name,
          description: targetItem.description || '',
          imageUrl: targetItem.imageUrl,
          acquiredAt: targetItem.acquiredAt?.toISOString(),
        },
        action: targetItemQuantity <= 1 ? 'deleted' : 'updated',
      }).catch((error) => console.error('Failed to emit inventory.updated (take/steal)', error));

      // 發送跨角色影響事件給效果作用對象
      const sourceIdForNotification = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
      const sourceNameForNotification = contestResult === 'defender_wins' ? defender.name : attacker.name;
      
      // Phase 7.6: 檢查來源技能/道具是否有隱匿標籤
      const sourceTags = actualSource.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');
      
      emitCharacterAffected(targetIdStr, {
        targetCharacterId: targetIdStr,
        sourceCharacterId: sourceIdForNotification,
        sourceCharacterName: hasStealthTag ? '' : sourceNameForNotification, // Phase 7.6: 有隱匿標籤時不顯示來源方名稱
        sourceType: actualSourceType,
        sourceName: '', // 不顯示技能/道具名稱（隱私保護）
        sourceHasStealthTag: hasStealthTag, // Phase 7.6: 標記是否有隱匿標籤
        effectType: effect.type === 'item_steal' ? 'item_steal' : 'item_take',
        changes: {
          items: [{
            id: targetItem.id,
            name: targetItem.name,
            action: effect.type === 'item_steal' ? 'stolen' : 'removed',
          }],
        },
      }).catch((error) => console.error('Failed to emit character.affected (item_take/steal)', error));

      // Phase 4: 修復 role.updated 事件發送邏輯
      // 發送 role.updated 事件給兩個角色，讓GM端能同步更新道具列表
      // 需要重新載入兩個角色的最新資料（因為道具可能已經轉移）
      // Phase 10.4: 使用統一讀取函數（自動判斷 Baseline/Runtime）
      const [updatedAttackerCharacter, updatedDefenderCharacter] = await Promise.all([
        getCharacterData(attackerIdStr),
        getCharacterData(defenderIdStr),
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

      // Phase 7.7: item_steal 後，記錄接收方 ID 供呼叫者延遲觸發自動揭露
      // 不在此處立即執行，避免揭露通知搶先於對抗結果通知送達客戶端
      if (effect.type === 'item_steal') {
        pendingRevealReceiverId = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
      }
    } else if (effect.type === 'custom' && effect.description) {
      // 自定義效果
      effectsApplied.push(effect.description);
    }
  }

  // 應用統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    const targetId = effectTargetBaselineId;
    // Phase 10.4: 使用統一寫入函數（自動判斷 Baseline/Runtime）
    await updateCharacterData(targetId, {
      $set: targetStatUpdates,
      $unset: { 'tasks.$[].gmNotes': 1 },
    });

    // Phase 7.6: 發送 character.affected 事件（根據對抗結果）
    if (crossCharacterChanges.length > 0) {
      const targetId = effectTargetBaselineId;
      const sourceId = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
      const sourceName = contestResult === 'defender_wins' ? defender.name : attacker.name;
      
      // Phase 7.6: 檢查來源技能/道具是否有隱匿標籤
      const sourceTags = actualSource.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');
      
      emitCharacterAffected(targetId, {
        targetCharacterId: targetId,
        sourceCharacterId: sourceId,
        sourceCharacterName: hasStealthTag ? '' : sourceName, // Phase 7.6: 有隱匿標籤時不顯示來源方名稱
        sourceType: actualSourceType,
        sourceName: '', // 不顯示技能/道具名稱（隱私保護）
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
      }).catch((error) => console.error('Failed to emit character.affected (contest)', error));
    }
  }

  // Phase 10.4: 使用統一讀取函數重新載入角色資料（自動判斷 Baseline/Runtime）
  const updatedAttacker = await getCharacterData(attackerIdStr);
  const updatedDefender = await getCharacterData(defenderIdStr);

  if (!updatedAttacker || !updatedDefender) {
    throw new Error('找不到角色');
  }

  // Phase 10.6: 記錄對抗結果日誌
  // 決定誰是 actor（獲勝方）
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

