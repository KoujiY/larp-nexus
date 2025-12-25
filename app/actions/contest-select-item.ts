'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitInventoryUpdated, emitCharacterAffected, emitRoleUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { getContestInfo, removeActiveContest, removeContestsByCharacterId } from '@/lib/contest-tracker';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import type { ApiResponse } from '@/types/api';
import type { BaseEvent } from '@/types/event';

/**
 * Phase 8: 攻擊方選擇目標道具後執行效果
 * 用於對抗檢定獲勝後，需要選擇目標道具的情況
 */
export async function selectTargetItemForContest(
  contestId: string,
  attackerId: string,
  targetItemId: string,
  defenderId?: string // 可選參數：如果服務器端記錄丟失，可以使用此參數
): Promise<ApiResponse<{ success: boolean; effectApplied?: string }>> {
  try {
    await dbConnect();

    // 解析對抗請求 ID（格式：attackerId::itemId::timestamp）
    const parts = contestId.split('::');
    if (parts.length !== 3) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }
    const [parsedAttackerId, sourceId, timestamp] = parts;
    if (!parsedAttackerId || !sourceId || !timestamp) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }

    // 驗證攻擊方 ID 匹配
    if (parsedAttackerId !== attackerId) {
      return {
        success: false,
        error: 'INVALID_ATTACKER',
        message: '攻擊方 ID 不匹配',
      };
    }

    // 從對抗檢定追蹤系統中獲取防守方 ID
    const contestInfo = getContestInfo(contestId);
    let resolvedDefenderId: string;
    let sourceType: 'skill' | 'item';
    
    if (!contestInfo) {
      // 如果找不到記錄（可能是服務器重啟或記錄過期），嘗試從參數或 contestId 解析信息
      if (defenderId) {
        // 如果提供了 defenderId 參數，使用它
        resolvedDefenderId = defenderId;
        
        // 從 contestId 解析 sourceId，然後從資料庫查詢確定 sourceType
        const attacker = await Character.findById(attackerId);
        if (!attacker) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: '找不到攻擊方角色',
          };
        }
        
        // 先嘗試找道具
        const attackerItems = attacker.items || [];
        const itemIndex = attackerItems.findIndex((i: { id: string }) => i.id === sourceId);
        
        if (itemIndex !== -1) {
          sourceType = 'item';
        } else {
          // 嘗試找技能
          const attackerSkills = attacker.skills || [];
          const skillIndex = attackerSkills.findIndex((s: { id: string }) => s.id === sourceId);
          
          if (skillIndex !== -1) {
            sourceType = 'skill';
          } else {
            return {
              success: false,
              error: 'NOT_FOUND',
              message: '找不到對應的技能或道具',
            };
          }
        }
      } else {
        // 如果沒有提供 defenderId 且找不到記錄，返回錯誤
        return {
          success: false,
          error: 'CONTEST_NOT_FOUND',
          message: '找不到對抗檢定記錄，可能已過期。請重新發起對抗檢定。',
        };
      }
    } else {
      resolvedDefenderId = contestInfo.defenderId;
      sourceType = contestInfo.sourceType;
    }

    // 取得攻擊方和防守方角色
    const attacker = await Character.findById(attackerId);
    const defender = await Character.findById(resolvedDefenderId);
    
    if (!attacker || !defender) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到角色',
      };
    }

    // 驗證在同一劇本內
    if (attacker.gameId.toString() !== defender.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '角色不在同一劇本內',
      };
    }

    // 根據來源類型找到技能或道具
    let effects: Array<{ type: string; [key: string]: unknown }> = [];
    let sourceName = '';
    
    if (sourceType === 'item') {
      // 找到道具
      const attackerItems = attacker.items || [];
      const itemIndex = attackerItems.findIndex((i: { id: string }) => i.id === sourceId);
      if (itemIndex === -1) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: '找不到道具',
        };
      }
      const item = attackerItems[itemIndex];
      effects = item.effects || (item.effect ? [item.effect] : []);
      sourceName = item.name;
    } else if (sourceType === 'skill') {
      // 找到技能
      const attackerSkills = attacker.skills || [];
      const skillIndex = attackerSkills.findIndex((s: { id: string }) => s.id === sourceId);
      if (skillIndex === -1) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: '找不到技能',
        };
      }
      const skill = attackerSkills[skillIndex];
      effects = skill.effects || [];
      sourceName = skill.name;
    } else {
      return {
        success: false,
        error: 'INVALID_SOURCE_TYPE',
        message: '無效的來源類型',
      };
    }


    // Phase 8: 執行所有效果（包括 stat_change 和 item_take/item_steal）
    // 決定效果作用對象：
    // - 道具效果：總是作用於防守方
    // - 技能效果：根據效果的 targetType 決定（other = 防守方，self = 攻擊方）
    const effectTarget = sourceType === 'item' 
      ? defender 
      : (effects.some((e: { type: string; targetType?: string }) => e.targetType === 'other') ? defender : attacker);
    const targetStats = effectTarget.stats || [];
    const targetStatUpdates: Record<string, unknown> = {};
    const statUpdates: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> = [];
    const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];
    const effectsApplied: string[] = [];
    // 保存目標道具資訊，用於後續發送通知
    let targetItemInfo: { id: string; name: string; description?: string; imageUrl?: string; acquiredAt?: Date; quantity: number } | null = null;

    // 處理所有效果
    for (const effect of effects) {
      // 處理 stat_change 效果
      if (effect.type === 'stat_change' && effect.targetStat && typeof effect.value === 'number') {
        const statIndex = targetStats.findIndex((s: { name: string }) => s.name === effect.targetStat);
        if (statIndex !== -1) {
          const statChangeTarget = effect.statChangeTarget || 'value';
          const currentStat = targetStats[statIndex];
          const beforeValue = currentStat.value;
          const beforeMax = currentStat.maxValue ?? null;
          const syncValue = effect.syncValue;
          const delta = effect.value;

          // 若目標無 maxValue，但要求改 maxValue，退回改 value
          const effectiveTarget = statChangeTarget === 'maxValue' && beforeMax === null ? 'value' : statChangeTarget;

          let newValue = beforeValue;
          let newMaxValue = beforeMax;
          let deltaValue = 0;
          let deltaMax = 0;

          if (effectiveTarget === 'maxValue' && beforeMax !== null) {
            // 修改最大值
            newMaxValue = Math.max(1, beforeMax + delta);
            deltaMax = newMaxValue - beforeMax;
            targetStatUpdates[`stats.${statIndex}.maxValue`] = newMaxValue;

            if (syncValue) {
              // 同步修改目前值
              newValue = Math.max(0, beforeValue + delta);
              newValue = Math.min(newValue, newMaxValue);
              deltaValue = newValue - beforeValue;
              targetStatUpdates[`stats.${statIndex}.value`] = newValue;
              effectsApplied.push(`${effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}，目前值同步調整`);
            } else {
              // 只修改最大值，確保目前值不超過新最大值
              newValue = Math.min(beforeValue, newMaxValue);
              deltaValue = newValue - beforeValue;
              targetStatUpdates[`stats.${statIndex}.value`] = newValue;
              effectsApplied.push(`${effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}`);
            }
          } else {
            // 修改目前值
            newValue = Math.max(0, beforeValue + delta);
            if (beforeMax !== null) {
              newValue = Math.min(newValue, beforeMax);
            }
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectsApplied.push(`${effect.targetStat} ${delta > 0 ? '+' : ''}${delta}`);
          }

          statUpdates.push({
            id: currentStat.id,
            name: effect.targetStat as string,
            value: newValue,
            maxValue: newMaxValue !== null && newMaxValue !== beforeMax ? newMaxValue : undefined,
            deltaValue: deltaValue !== 0 ? deltaValue : undefined,
            deltaMax: deltaMax !== 0 ? deltaMax : undefined,
          });

          const isAffectingOthers = effectTarget._id.toString() !== attacker._id.toString();
          if (isAffectingOthers) {
            crossCharacterChanges.push({
              name: effect.targetStat as string,
              deltaValue: deltaValue !== 0 ? deltaValue : undefined,
              deltaMax: deltaMax !== 0 ? deltaMax : undefined,
              newValue,
              newMax: newMaxValue !== null && newMaxValue !== beforeMax ? newMaxValue : undefined,
            });
          }
        }
      } else if (effect.type === 'custom' && effect.description) {
        const description = effect.description as string | undefined;
        if (description) {
          effectsApplied.push(description);
        }
      } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
        // 處理 item_take/item_steal 效果
        // 找到目標道具（目標是防守方）
        const targetItems = defender.items || [];
        const targetItemIndex = targetItems.findIndex((i: { id: string }) => i.id === targetItemId);
        
        if (targetItemIndex === -1) {
          continue; // 跳過此效果
        }

        const targetItem = targetItems[targetItemIndex];
        const targetItemName = targetItem.name;
        const targetItemQuantity = targetItem.quantity || 1;
        const newQuantity = targetItemQuantity - 1;
        
        // 保存目標道具資訊，用於後續發送通知
        targetItemInfo = {
          id: targetItem.id,
          name: targetItem.name,
          description: targetItem.description,
          imageUrl: targetItem.imageUrl,
          acquiredAt: targetItem.acquiredAt,
          quantity: targetItemQuantity,
        };

        // 準備更新：先移除舊的道具
        await Character.findByIdAndUpdate(resolvedDefenderId, {
          $pull: { items: { id: targetItemId } },
        });

        // 如果數量 > 0，添加更新後的道具
        if (newQuantity > 0) {
          const updatedItem = {
            ...targetItem,
            quantity: newQuantity,
          };
          // 移除可能的 Mongoose 特定欄位
          const cleanedItem = updatedItem as Record<string, unknown>;
          delete cleanedItem._id;
          delete cleanedItem.__v;
          await Character.findByIdAndUpdate(resolvedDefenderId, {
            $push: { items: cleanedItem },
          });
        }

        if (effect.type === 'item_steal') {
          // 偷竊：將道具轉移到攻擊者身上
          // 重新載入攻擊者資料以確保資料是最新的
          const updatedAttacker = await Character.findById(attackerId);
          if (updatedAttacker) {
            const attackerItemsList = updatedAttacker.items || [];
            const attackerItemIndex = attackerItemsList.findIndex((i: { id: string }) => i.id === targetItemId);

            if (attackerItemIndex !== -1) {
              // 攻擊者已有此道具，增加數量
              const currentItem = attackerItemsList[attackerItemIndex];
              const currentQuantity = currentItem.quantity || 1;
              
              await Character.findByIdAndUpdate(attackerId, {
                $pull: { items: { id: targetItemId } },
              });
              
              const updatedAttackerItem = {
                ...currentItem,
                quantity: currentQuantity + 1,
              };
              const cleanedAttackerItem = updatedAttackerItem as Record<string, unknown>;
              delete cleanedAttackerItem._id;
              delete cleanedAttackerItem.__v;
              
              await Character.findByIdAndUpdate(attackerId, {
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
              
              await Character.findByIdAndUpdate(attackerId, {
                $push: { items: stolenItem },
              });
            }
          }

          effectsApplied.push(`偷竊了 ${targetItemName}`);
        } else {
          // 移除：只移除目標道具，不轉移
          effectsApplied.push(`移除了 ${targetItemName}`);
        }

        // 注意：WebSocket 事件將在所有效果執行完成後統一發送（見下方）
      }
    }

    // 應用統計變化
    if (Object.keys(targetStatUpdates).length > 0) {
      const targetId = effectTarget._id.toString();
      await Character.findByIdAndUpdate(targetId, {
        $set: targetStatUpdates,
        $unset: { 'tasks.$[].gmNotes': 1 },
      });
    }

    // Phase 8: 重新驗證路徑，確保頁面資料更新（在所有效果執行完成後）
    revalidatePath(`/c/${attackerId}`);
    revalidatePath(`/c/${resolvedDefenderId}`);

    // Phase 8: 在所有效果執行完成後，統一發送 WebSocket 事件
    // 1. 發送統計變化通知（如果有）
    const isAffectingDefender = effectTarget._id.toString() === resolvedDefenderId;
    const isAffectingAttacker = effectTarget._id.toString() === attackerId;
    
    if (isAffectingDefender && crossCharacterChanges.length > 0) {
      // 效果作用於防守方
      emitCharacterAffected(resolvedDefenderId, {
        targetCharacterId: resolvedDefenderId,
        sourceCharacterId: attackerId,
        sourceCharacterName: '', // 不顯示攻擊方名稱
        sourceType,
        sourceName: '', // 不顯示來源名稱
        effectType: 'stat_change',
        changes: {
          stats: crossCharacterChanges.map(change => ({
            name: change.name,
            deltaValue: change.deltaValue,
            deltaMax: change.deltaMax,
            newValue: change.newValue,
            newMax: change.newMax,
          })),
        },
      }).catch((error) => console.error('Failed to emit character.affected (stat_change)', error));
    } else if (isAffectingAttacker && statUpdates.length > 0) {
      // 效果作用於攻擊方（技能對自己使用）
      emitRoleUpdated(attackerId, {
        characterId: attackerId,
        updates: {
          stats: statUpdates.map(stat => ({
            name: stat.name,
            value: stat.value,
            maxValue: stat.maxValue,
            deltaValue: stat.deltaValue,
            deltaMax: stat.deltaMax,
          })),
        },
      }).catch((error) => console.error('Failed to emit role.updated (attacker)', error));
    }

    // 2. 發送道具變化通知（如果有 item_take/item_steal 效果）
    const itemTakeOrStealEffects = effects.filter(e => e.type === 'item_take' || e.type === 'item_steal');
    if (itemTakeOrStealEffects.length > 0 && targetItemInfo) {
      // 使用之前保存的目標道具資訊發送通知
      const wasCompletelyRemoved = targetItemInfo.quantity <= 1;
      
      // 發送 inventory.updated 事件給防守方
      emitInventoryUpdated(resolvedDefenderId, {
        characterId: resolvedDefenderId,
        item: {
          id: targetItemInfo.id,
          name: targetItemInfo.name,
          description: targetItemInfo.description || '',
          imageUrl: targetItemInfo.imageUrl,
          acquiredAt: targetItemInfo.acquiredAt?.toISOString(),
        },
        action: wasCompletelyRemoved ? 'deleted' : 'updated',
      }).catch((error) => console.error('Failed to emit inventory.updated (select target item)', error));

      // 發送跨角色影響事件給防守方（道具變化）
      const effectType = itemTakeOrStealEffects[0].type === 'item_steal' ? 'item_steal' : 'item_take';
      
      emitCharacterAffected(resolvedDefenderId, {
        targetCharacterId: resolvedDefenderId,
        sourceCharacterId: attackerId,
        sourceCharacterName: '', // 不顯示攻擊方名稱（隱私保護）
        sourceType,
        sourceName: '', // 不顯示來源名稱（隱私保護）
        effectType,
        changes: {
          items: [{
            id: targetItemInfo.id,
            name: targetItemInfo.name,
            action: effectType === 'item_steal' ? 'stolen' : 'removed',
          }],
        },
      }).catch((error) => console.error('Failed to emit character.affected (select target item)', error));

      // Phase 9: 發送 role.updated 事件給兩個角色，讓GM端能同步更新道具列表
      // 重新載入兩個角色的最新資料
      const [updatedAttackerCharacter, updatedDefenderCharacter] = await Promise.all([
        Character.findById(attackerId).lean(),
        Character.findById(resolvedDefenderId).lean(),
      ]);

      if (updatedAttackerCharacter && updatedDefenderCharacter) {
        const attackerCleanItems = cleanItemData(updatedAttackerCharacter.items);
        const defenderCleanItems = cleanItemData(updatedDefenderCharacter.items);


        // 發送 role.updated 給兩個角色，包含最新的道具列表
        await emitRoleUpdated(attackerId, {
          characterId: attackerId,
          updates: {
            items: attackerCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[contest-select-item] Failed to emit role.updated (attacker character items)', error);
        });

        await emitRoleUpdated(resolvedDefenderId, {
          characterId: resolvedDefenderId,
          updates: {
            items: defenderCleanItems as unknown as Array<Record<string, unknown>>,
          },
        }).catch((error) => {
          console.error('[contest-select-item] Failed to emit role.updated (defender character items)', error);
        });
      } else {
      }
    }

    // 3. 發送技能/道具使用成功通知給攻擊方（使用 skill.contest 事件，讓攻擊方能看見完整訊息）
    const pusher = getPusherServer();
    if (pusher && isPusherEnabled()) {
      const contestPayload: {
        attackerId: string;
        attackerName: string;
        defenderId: string;
        defenderName: string;
        skillId?: string;
        skillName?: string;
        itemId?: string;
        itemName?: string;
        sourceType?: 'skill' | 'item';
        attackerValue: number;
        defenderValue: number;
        result: 'attacker_wins';
        effectsApplied?: string[];
      } = {
        attackerId: attackerId,
        attackerName: attacker.name,
        defenderId: resolvedDefenderId,
        defenderName: defender.name,
        attackerValue: 1, // 必須不為 0，否則會被 mapSkillContest 忽略（這是結果通知，對抗檢定已完成）
        defenderValue: 0,
        result: 'attacker_wins',
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        sourceType,
      };
      
      // 根據來源類型設定對應的 ID 和名稱
      if (sourceType === 'skill') {
        contestPayload.skillId = sourceId;
        contestPayload.skillName = sourceName;
      } else if (sourceType === 'item') {
        contestPayload.itemId = sourceId;
        contestPayload.itemName = sourceName;
      }

      const event: BaseEvent = {
        type: 'skill.contest',
        timestamp: Date.now(),
        payload: contestPayload,
      };

      try {
        // 只發送給攻擊方，因為這是攻擊方選擇目標道具後的結果通知
        const attackerChannelName = `private-character-${attackerId}`;
        await pusher.trigger(attackerChannelName, 'skill.contest', event);
      } catch (error) {
        console.error('[contest-select-item] Failed to emit skill.contest', error);
      }
    } else {
    }

    // Phase 8: 清除對抗檢定追蹤
    // 先清除特定 contestId 的對抗檢定
    removeActiveContest(contestId);
    // 同時根據攻擊方和防守方的 ID 清除所有相關的對抗檢定（確保清除完整）
    // 這可以處理 contestId 格式不匹配的情況
    removeContestsByCharacterId(attackerId);
    removeContestsByCharacterId(resolvedDefenderId);

    const finalEffectMessage = effectsApplied.length > 0 ? effectsApplied.join('、') : '效果已應用';


    return {
      success: true,
      data: {
        success: true,
        effectApplied: finalEffectMessage,
      },
      message: `${sourceType === 'skill' ? '技能' : '道具'}使用成功：${finalEffectMessage}`,
    };
  } catch (error) {
    console.error('Error selecting target item for contest:', error);
    return {
      success: false,
      error: 'SELECT_FAILED',
      message: `無法選擇目標道具：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
