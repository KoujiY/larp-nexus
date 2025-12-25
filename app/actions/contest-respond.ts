'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitCharacterAffected, emitRoleUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import { removeActiveContest, removeContestsByCharacterId } from '@/lib/contest-tracker';
import type { ApiResponse } from '@/types/api';
import type { BaseEvent } from '@/types/event';

/**
 * Phase 7: 防守方回應對抗檢定
 * 當防守方收到對抗檢定請求時，可以選擇使用道具/技能來增強防禦
 */
export async function respondToContest(
  contestId: string, // 對抗請求 ID（由前端傳入，格式：attackerId::skillId::timestamp）
  defenderId: string,
  defenderItems?: string[], // 防守方使用的道具 ID 陣列
  defenderSkills?: string[], // 防守方使用的技能 ID 陣列
  targetItemId?: string // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果，從 contestEvent 中獲取）
): Promise<ApiResponse<{ contestResult: 'attacker_wins' | 'defender_wins' | 'both_fail'; effectsApplied?: string[] }>> {
  try {
    await dbConnect();

    // Phase 8: 解析對抗請求 ID（格式：attackerId::skillId/itemId::timestamp）
    const parts = contestId.split('::');
    if (parts.length !== 3) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }
    const [attackerId, sourceId, timestamp] = parts;
    if (!attackerId || !sourceId || !timestamp) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }

    // 取得攻擊方和防守方角色
    const attacker = await Character.findById(attackerId);
    const defender = await Character.findById(defenderId);
    
    // 確保 ID 轉換為字符串，避免類型不匹配問題
    const attackerIdStr = attacker?._id?.toString() || attackerId;
    const defenderIdStr = defender?._id?.toString() || defenderId;

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

    // Phase 8: 判斷是技能還是道具
    let contestConfig: { relatedStat: string; opponentMaxItems?: number; opponentMaxSkills?: number; tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail' } | undefined;
    let relatedStatName: string;
    let sourceType: 'skill' | 'item' = 'skill';
    type SkillType = NonNullable<typeof attacker.skills>[number];
    type ItemType = NonNullable<typeof attacker.items>[number];
    let skill: SkillType | null = null;
    let item: ItemType | null = null;
    let skillIndex = -1;
    let itemIndex = -1;

    // 先嘗試找技能
    const attackerSkills = attacker.skills || [];
    skillIndex = attackerSkills.findIndex((s: { id: string }) => s.id === sourceId);
    
    if (skillIndex !== -1) {
      skill = attackerSkills[skillIndex];
      if (skill && skill.checkType === 'contest' && skill.contestConfig) {
        contestConfig = skill.contestConfig;
        relatedStatName = contestConfig!.relatedStat;
        sourceType = 'skill';
      } else {
        return {
          success: false,
          error: 'INVALID_SKILL',
          message: '此技能不是對抗檢定類型',
        };
      }
    } else {
      // 嘗試找道具
      const attackerItems = attacker.items || [];
      itemIndex = attackerItems.findIndex((i: { id: string }) => i.id === sourceId);
      
      if (itemIndex !== -1) {
        item = attackerItems[itemIndex];
        if (item && item.checkType === 'contest' && item.contestConfig) {
          contestConfig = item.contestConfig;
          if (!contestConfig) {
            return {
              success: false,
              error: 'INVALID_ITEM',
              message: '此道具不是對抗檢定類型',
            };
          }
          relatedStatName = contestConfig.relatedStat;
          sourceType = 'item';
        } else {
          return {
            success: false,
            error: 'INVALID_ITEM',
            message: '此道具不是對抗檢定類型',
          };
        }
      } else {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: '找不到攻擊技能或道具',
        };
      }
    }
    
    // 確保 contestConfig 已定義
    if (!contestConfig) {
      return {
        success: false,
        error: 'INVALID_CONFIG',
        message: '對抗檢定配置無效',
      };
    }

    // 取得攻擊方的相關數值
    const attackerStats = attacker.stats || [];
    const attackerStat = attackerStats.find((s: { name: string }) => s.name === relatedStatName);
    if (!attackerStat) {
      return {
        success: false,
        error: 'INVALID_STAT',
        message: `攻擊方沒有 ${relatedStatName} 數值`,
      };
    }

    const attackerValue = attackerStat.value;

    // 計算攻擊方使用的道具/技能加成（這裡暫時不處理，因為攻擊方已經使用技能）
    // 未來可以擴展為攻擊方也可以選擇額外的道具/技能

    // 取得防守方的相關數值
    const defenderStats = defender.stats || [];
    const defenderStat = defenderStats.find((s: { name: string }) => s.name === relatedStatName);
    if (!defenderStat) {
      return {
        success: false,
        error: 'INVALID_STAT',
        message: `防守方沒有 ${relatedStatName} 數值`,
      };
    }

    let defenderValue = defenderStat.value;

    // 驗證防守方使用的道具/技能
    const defenderItemsList: Array<{ id: string; name: string; effect?: { value?: number } }> = [];
    const defenderSkillsList: Array<{ id: string; name: string }> = [];

    if (defenderItems && defenderItems.length > 0) {
      const maxItems = contestConfig.opponentMaxItems ?? 0; // 預設為 0（不允許使用道具）
      if (maxItems === 0) {
        return {
          success: false,
          error: 'ITEMS_NOT_ALLOWED',
          message: '此對抗檢定不允許使用道具',
        };
      }
      if (defenderItems.length > maxItems) {
        return {
          success: false,
          error: 'TOO_MANY_ITEMS',
          message: `最多只能使用 ${maxItems} 個道具`,
        };
      }

      const defenderItemsData = defender.items || [];
      for (const itemId of defenderItems) {
        const item = defenderItemsData.find((i: { id: string }) => i.id === itemId);
        if (!item) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: `找不到道具 ${itemId}`,
          };
        }

        // 檢查道具是否可用（冷卻、次數限制等）
        const now = new Date();
        if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
          const lastUsed = new Date(item.lastUsedAt).getTime();
          const cooldownMs = item.cooldown * 1000;
          if (now.getTime() - lastUsed < cooldownMs) {
            return {
              success: false,
              error: 'ITEM_ON_COOLDOWN',
              message: `道具 ${item.name} 仍在冷卻中`,
            };
          }
        }

        if (item.usageLimit && item.usageLimit > 0) {
          if ((item.usageCount || 0) >= item.usageLimit) {
            return {
              success: false,
              error: 'ITEM_USAGE_LIMIT_REACHED',
              message: `道具 ${item.name} 已達使用次數上限`,
            };
          }
        }

        // 重構：支援多個效果（優先使用 effects 陣列，向後兼容 effect）
        const itemEffects = item.effects || (item.effect ? [item.effect] : []);
        defenderItemsList.push({
          id: item.id,
          name: item.name,
          effect: itemEffects.length > 0 ? (itemEffects[0] as { value?: number }) : undefined, // 向後兼容
        });

        // 計算道具加成（如果道具有效果且影響相關數值）
        for (const effect of itemEffects) {
          if (effect.type === 'stat_change' && effect.targetStat === relatedStatName && typeof effect.value === 'number') {
            defenderValue += effect.value;
          }
        }
      }
    }

    if (defenderSkills && defenderSkills.length > 0) {
      const maxSkills = contestConfig.opponentMaxSkills ?? 0; // 預設為 0（不允許使用技能）
      if (maxSkills === 0) {
        return {
          success: false,
          error: 'SKILLS_NOT_ALLOWED',
          message: '此對抗檢定不允許使用技能',
        };
      }
      if (defenderSkills.length > maxSkills) {
        return {
          success: false,
          error: 'TOO_MANY_SKILLS',
          message: `最多只能使用 ${maxSkills} 個技能`,
        };
      }

      const defenderSkillsData = defender.skills || [];
      for (const skillId of defenderSkills) {
        const defenderSkill = defenderSkillsData.find((s: { id: string }) => s.id === skillId);
        if (!defenderSkill) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: `找不到技能 ${skillId}`,
          };
        }

        // 檢查技能是否可用（冷卻、次數限制等）
        const now = new Date();
        if (defenderSkill.cooldown && defenderSkill.cooldown > 0 && defenderSkill.lastUsedAt) {
          const lastUsed = new Date(defenderSkill.lastUsedAt).getTime();
          const cooldownMs = defenderSkill.cooldown * 1000;
          if (now.getTime() - lastUsed < cooldownMs) {
            return {
              success: false,
              error: 'SKILL_ON_COOLDOWN',
              message: `技能 ${defenderSkill.name} 仍在冷卻中`,
            };
          }
        }

        if (defenderSkill.usageLimit && defenderSkill.usageLimit > 0) {
          if ((defenderSkill.usageCount || 0) >= defenderSkill.usageLimit) {
            return {
              success: false,
              error: 'SKILL_USAGE_LIMIT_REACHED',
              message: `技能 ${defenderSkill.name} 已達使用次數上限`,
            };
          }
        }

        defenderSkillsList.push({
          id: defenderSkill.id,
          name: defenderSkill.name,
        });

        // 計算技能加成（如果技能有效果且影響相關數值）
        if (defenderSkill.effects) {
          for (const effect of defenderSkill.effects) {
            if (effect.type === 'stat_change' && effect.targetStat === relatedStatName && effect.value) {
              defenderValue += effect.value;
            }
          }
        }
      }
    }

    // 計算對抗結果
    // A 發起技能，B 回應，判斷 A 和 B 誰獲勝
    let result: 'attacker_wins' | 'defender_wins' | 'both_fail';
    if (attackerValue > defenderValue) {
      result = 'attacker_wins'; // A 獲勝
    } else if (defenderValue > attackerValue) {
      result = 'defender_wins'; // B 獲勝
    } else {
      // 平手，根據 tieResolution 決定
      result = contestConfig.tieResolution || 'attacker_wins';
      if (result === 'both_fail') {
        result = 'both_fail';
      }
    }

    // 執行效果（只有 A 獲勝時才執行，效果作用於目標角色）
    const effectsApplied: string[] = [];
    const now = new Date();

    // Phase 8: 根據來源類型處理效果（技能或道具）
    if (result === 'attacker_wins') {
      // 處理技能效果
      if (sourceType === 'skill' && skill && skill.effects && skill.effects.length > 0) {
        // Phase 8: 檢查是否有 item_take/item_steal 效果且沒有 targetItemId
        const hasItemTakeOrSteal = skill.effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');
        const needsTargetItemSelection = hasItemTakeOrSteal && !targetItemId;
        
        // Phase 8: 如果需要選擇目標道具，跳過所有效果的執行，將在選擇目標道具後執行
        if (needsTargetItemSelection) {
          // 不執行任何效果，只發送對抗檢定結果事件
        } else {
          // 決定效果作用對象（根據效果的 targetType）
          const effectTarget = skill.effects.some((e: { targetType?: string }) => e.targetType === 'other')
            ? defender
            : attacker;

          const targetStats = effectTarget.stats || [];
          const targetTasks = effectTarget.tasks || [];
          const targetStatUpdates: Record<string, unknown> = {};
          const statUpdates: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> = [];
          const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];

          for (const effect of skill.effects) {
            if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
              const statIndex = targetStats.findIndex((s: { name: string }) => s.name === effect.targetStat);
              if (statIndex !== -1) {
                const statChangeTarget = effect.statChangeTarget || 'value';
                const currentStat = targetStats[statIndex];
                const beforeValue = currentStat.value;
                const beforeMax = currentStat.maxValue;

                let newValue = beforeValue;
                let newMaxValue = beforeMax;
                let deltaValue = 0;
                let deltaMax = 0;

                if (statChangeTarget === 'maxValue') {
                  if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
                    newMaxValue = currentStat.maxValue + effect.value;
                    newMaxValue = Math.max(1, newMaxValue);
                    deltaMax = newMaxValue - currentStat.maxValue;
                    targetStatUpdates[`stats.${statIndex}.maxValue`] = newMaxValue;

                    if (effect.syncValue) {
                      newValue = currentStat.value + effect.value;
                      newValue = Math.min(newValue, newMaxValue);
                      newValue = Math.max(0, newValue);
                      deltaValue = newValue - beforeValue;
                      targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                      const effectValue = typeof effect.value === 'number' ? effect.value : 0;
                      effectsApplied.push(`${effect.targetStat} 最大值 ${effectValue > 0 ? '+' : ''}${effectValue}，目前值同步調整`);
                    } else {
                      newValue = Math.min(currentStat.value, newMaxValue);
                      deltaValue = newValue - beforeValue;
                      targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                      const effectValue = typeof effect.value === 'number' ? effect.value : 0;
                      effectsApplied.push(`${effect.targetStat} 最大值 ${effectValue > 0 ? '+' : ''}${effectValue}`);
                    }
                  }
                } else {
                  newValue = currentStat.value + effect.value;
                  if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
                    newValue = Math.min(newValue, currentStat.maxValue);
                  }
                  newValue = Math.max(0, newValue);
                  deltaValue = newValue - beforeValue;
                  targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                  const effectValue = typeof effect.value === 'number' ? effect.value : 0;
                  effectsApplied.push(`${effect.targetStat} ${effectValue > 0 ? '+' : ''}${effectValue}`);
                }

                statUpdates.push({
                  id: currentStat.id,
                  name: effect.targetStat as string,
                  value: newValue,
                  maxValue: newMaxValue !== beforeMax ? newMaxValue : undefined,
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
                    newMax: newMaxValue !== beforeMax ? newMaxValue : undefined,
                  });
                }
              }
            } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
              const taskIndex = targetTasks.findIndex((t: { id: string }) => t.id === effect.targetTaskId);
              if (taskIndex !== -1 && !targetTasks[taskIndex].isRevealed) {
                targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
                targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
                effectsApplied.push(`揭露任務：${targetTasks[taskIndex].title}`);
              }
            } else if (effect.type === 'task_complete' && effect.targetTaskId) {
              const taskIndex = targetTasks.findIndex((t: { id: string }) => t.id === effect.targetTaskId);
              if (taskIndex !== -1 && targetTasks[taskIndex].status !== 'completed') {
                targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
                targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
                effectsApplied.push(`完成任務：${targetTasks[taskIndex].title}`);
              }
            } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
              // Phase 7: 移除道具或偷竊道具
              if (!targetItemId) {
                continue; // 跳過此效果，但繼續處理其他效果
              }

              // 找到目標道具（目標是防守方，因為效果作用於防守方）
              const targetItems = defender.items || [];
              const targetItemIndex = targetItems.findIndex((i: { id: string }) => i.id === targetItemId);
              
              if (targetItemIndex === -1) {
                console.error('[contest-respond] 目標角色沒有此道具:', targetItemId);
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
                const updatedItem = {
                  ...targetItem.toObject(),
                  quantity: newQuantity,
                };
                // 移除可能的 Mongoose 特定欄位
                const cleanedItem = updatedItem as Record<string, unknown>;
                delete cleanedItem._id;
                delete cleanedItem.__v;
                await Character.findByIdAndUpdate(defenderIdStr, {
                  $push: { items: updatedItem },
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
                    ...currentItem.toObject(),
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

                // 發送 WebSocket 事件
                // 偷竊方（attackerIdStr）：不發送任何通知，因為會顯示「對抗檢定結果」
                // 被偷竊方（defenderIdStr）：只發送 inventoryUpdated 通知（道具失去）
                // 注意：不發送 item.transferred 給偷竊方，因為偷竊方應該只看到「對抗檢定結果」
                // inventoryUpdated 會在下面統一發送給被偷竊方

                effectsApplied.push(`偷竊了 ${targetItemName}`);
              } else {
                // 移除：只移除目標道具，不轉移
                effectsApplied.push(`移除了 ${targetItemName}`);
              }

              // 發送 WebSocket 事件給防守方
              const { emitInventoryUpdated, emitCharacterAffected } = await import('@/lib/websocket/events');
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
                sourceType: 'skill',
                sourceName: '', // 不顯示技能名稱（隱私保護）
                effectType: effect.type === 'item_steal' ? 'item_steal' : 'item_take',
                changes: {
                  items: [{
                    id: targetItem.id,
                    name: targetItem.name,
                    action: effect.type === 'item_steal' ? 'stolen' : 'removed',
                  }],
                },
              }).catch((error) => console.error('Failed to emit character.affected (item_take/steal)', error));
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
            // 不顯示技能名稱或攻擊方名稱（隱私保護）
            const isAffectingDefender = effectTarget._id.toString() === defenderIdStr;
            if (isAffectingDefender && crossCharacterChanges.length > 0) {
              emitCharacterAffected(defenderIdStr, {
                targetCharacterId: defenderIdStr,
                sourceCharacterId: attackerIdStr,
                sourceCharacterName: '', // 不顯示攻擊方名稱
                sourceType: 'skill',
                sourceName: '', // 不顯示技能名稱
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
              }).catch((error) => console.error('Failed to emit character.affected (contest)', error));
            }
          }
        }
      }
    } else if (sourceType === 'item' && item) {
        // Phase 8: 處理道具效果
        // 重構：支援多個效果（優先使用 effects 陣列，向後兼容 effect）
        const effects = item.effects || (item.effect ? [item.effect] : []);
        
        // Phase 8: 檢查是否有 item_take/item_steal 效果且沒有 targetItemId
        const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
          return e.type === 'item_take' || e.type === 'item_steal';
        });
        const needsTargetItemSelection = hasItemTakeOrSteal && !targetItemId;
        
        // Phase 8: 如果需要選擇目標道具，跳過所有效果的執行，將在選擇目標道具後執行
        if (needsTargetItemSelection) {
          // 不執行任何效果，只發送對抗檢定結果事件
        } else {
          // 對抗檢定時，道具效果總是作用於防守方（因為這是攻擊方對防守方使用的道具）
          const effectTarget = defender;

          const targetStats = effectTarget.stats || [];
          const targetStatUpdates: Record<string, unknown> = {};
          const statUpdates: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> = [];
          const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];

          // 處理所有效果
          for (const effect of effects) {
          // 處理道具效果（目前只支援 stat_change）
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
            effectsApplied.push(effect.description);
          } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
            // Phase 8: 移除道具或偷竊道具
            // 如果沒有 targetItemId，跳過執行（將在攻擊方選擇目標道具後執行）
            if (!targetItemId) {
              // 跳過此效果處理，將在攻擊方選擇目標道具後執行
              continue;
            } else {
              // 找到目標道具（目標是防守方，因為效果作用於防守方）
              const targetItems = defender.items || [];
              const targetItemIndex = targetItems.findIndex((i: { id: string }) => i.id === targetItemId);
              
              if (targetItemIndex === -1) {
                console.error('[contest-respond] 目標角色沒有此道具:', targetItemId);
                // 跳過此效果處理
              } else {
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
                  const updatedItem = {
                    ...targetItem.toObject(),
                    quantity: newQuantity,
                  };
                  // 移除可能的 Mongoose 特定欄位
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
                  if (updatedAttacker) {
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
                        ...currentItem.toObject(),
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

                    // 發送 WebSocket 事件
                    // 偷竊方（attackerIdStr）：不發送任何通知，因為會顯示「對抗檢定結果」
                    // 被偷竊方（defenderIdStr）：只發送 inventoryUpdated 通知（道具失去）
                    // 注意：不發送 item.transferred 給偷竊方，因為偷竊方應該只看到「對抗檢定結果」

                    effectsApplied.push(`偷竊了 ${targetItemName}`);
                  } else {
                    effectsApplied.push(`移除了 ${targetItemName}`); // 如果找不到攻擊者，只移除道具
                  }
                } else {
                  // 移除：只移除目標道具，不轉移
                  effectsApplied.push(`移除了 ${targetItemName}`);
                }

                // 發送 WebSocket 事件給防守方
                const { emitInventoryUpdated, emitCharacterAffected } = await import('@/lib/websocket/events');
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
                  sourceType: 'item',
                  sourceName: '', // 不顯示道具名稱（隱私保護）
                  effectType: effect.type === 'item_steal' ? 'item_steal' : 'item_take',
                  changes: {
                    items: [{
                      id: targetItem.id,
                      name: targetItem.name,
                      action: effect.type === 'item_steal' ? 'stolen' : 'removed',
                    }],
                  },
                }).catch((error) => console.error('Failed to emit character.affected (item_take/steal)', error));

                // Phase 9: 發送 role.updated 事件給兩個角色，讓GM端能同步更新道具列表
                // 重新載入兩個角色的最新資料
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
                    console.error('[contest-respond] Failed to emit role.updated (attacker character items)', error);
                  });

                  await emitRoleUpdated(defenderIdStr, {
                    characterId: defenderIdStr,
                    updates: {
                      items: defenderCleanItems as unknown as Array<Record<string, unknown>>,
                    },
                  }).catch((error) => {
                    console.error('[contest-respond] Failed to emit role.updated (defender character items)', error);
                  });
                } else {
                }
              }
            }
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
          // 不顯示道具名稱或攻擊方名稱（隱私保護）
          const isAffectingDefender = effectTarget._id.toString() === defenderIdStr;
          if (isAffectingDefender && crossCharacterChanges.length > 0) {
            const affectedPayload = {
              targetCharacterId: defenderIdStr,
              sourceCharacterId: attackerIdStr,
              sourceCharacterName: '', // 不顯示攻擊方名稱
              sourceType: 'item' as const,
              sourceName: '', // 不顯示道具名稱
              effectType: 'stat_change' as const,
              changes: {
                stats: crossCharacterChanges.map(change => ({
                  name: change.name,
                  deltaValue: change.deltaValue,
                  deltaMax: change.deltaMax,
                  newValue: change.newValue,
                  newMax: change.newMax,
                })),
              },
            };
            emitCharacterAffected(defenderIdStr, affectedPayload).catch((error) => 
              console.error('Failed to emit character.affected (contest item)', error)
            );
          }
        }
      }
    }

    // 更新防守方使用的道具/技能的使用記錄
    const defenderUpdates: Record<string, unknown> = {};
    if (defenderItems && defenderItems.length > 0) {
      const defenderItemsData = defender.items || [];
      for (const itemId of defenderItems) {
        const itemIndex = defenderItemsData.findIndex((i: { id: string }) => i.id === itemId);
        if (itemIndex !== -1) {
          defenderUpdates[`items.${itemIndex}.lastUsedAt`] = now;
          if (defenderItemsData[itemIndex].usageLimit && defenderItemsData[itemIndex].usageLimit > 0) {
            const newUsageCount = (defenderItemsData[itemIndex].usageCount || 0) + 1;
            defenderUpdates[`items.${itemIndex}.usageCount`] = newUsageCount;
          }
        }
      }
    }

    if (defenderSkills && defenderSkills.length > 0) {
      const defenderSkillsData = defender.skills || [];
      for (const skillId of defenderSkills) {
        const skillIndex = defenderSkillsData.findIndex((s: { id: string }) => s.id === skillId);
        if (skillIndex !== -1) {
          defenderUpdates[`skills.${skillIndex}.lastUsedAt`] = now;
          if (defenderSkillsData[skillIndex].usageLimit && defenderSkillsData[skillIndex].usageLimit > 0) {
            const newUsageCount = (defenderSkillsData[skillIndex].usageCount || 0) + 1;
            defenderUpdates[`skills.${skillIndex}.usageCount`] = newUsageCount;
          }
        }
      }
    }

    if (Object.keys(defenderUpdates).length > 0) {
      await Character.findByIdAndUpdate(defenderId, {
        $set: defenderUpdates,
      });
    }

    // 注意：攻擊方技能/道具使用記錄已在 skill-use.ts/item-use.ts 中更新，這裡不需要再次更新

    // Phase 8: 發送判定結果的 socket event 給攻擊方
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
      attackerItems?: string[];
      attackerSkills?: string[];
      defenderItems?: string[];
      defenderSkills?: string[];
      result: 'attacker_wins' | 'defender_wins' | 'both_fail';
      effectsApplied?: string[];
      opponentMaxItems?: number;
      opponentMaxSkills?: number;
      needsTargetItemSelection?: boolean;
    } = {
      attackerId: attackerIdStr,
      attackerName: attacker.name,
      defenderId: defenderIdStr,
      defenderName: defender.name,
      attackerValue,
      defenderValue,
      attackerItems: undefined,
      attackerSkills: undefined,
      defenderItems: defenderItemsList.length > 0 ? defenderItemsList.map(item => item.id) : undefined,
      defenderSkills: defenderSkillsList.length > 0 ? defenderSkillsList.map(skill => skill.id) : undefined,
      result,
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      opponentMaxItems: contestConfig.opponentMaxItems,
      opponentMaxSkills: contestConfig.opponentMaxSkills,
      sourceType,
    };

    // Phase 8: 根據來源類型設定對應的 ID 和名稱
    if (sourceType === 'skill' && skill) {
      contestPayload.skillId = skill.id;
      contestPayload.skillName = skill.name;
      // Phase 8: 如果攻擊方獲勝且需要選擇目標道具，標記 needsTargetItemSelection
      if (result === 'attacker_wins') {
        const effects = skill.effects || [];
        const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
          return e.type === 'item_take' || e.type === 'item_steal';
        });
        if (hasItemTakeOrSteal && !targetItemId) {
          contestPayload.needsTargetItemSelection = true;
        }
      }
    } else if (sourceType === 'item' && item) {
      contestPayload.itemId = item.id;
      contestPayload.itemName = item.name;
      // Phase 8: 如果攻擊方獲勝且需要選擇目標道具，標記 needsTargetItemSelection
      if (result === 'attacker_wins') {
        const effects = item.effects || (item.effect ? [item.effect] : []);
        const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
          return e.type === 'item_take' || e.type === 'item_steal';
        });
        if (hasItemTakeOrSteal && !targetItemId) {
          contestPayload.needsTargetItemSelection = true;
        }
      }
    }
    
    // Phase 8: 發送結果事件給攻擊方和防守方
    const pusher = getPusherServer();
    if (pusher && isPusherEnabled()) {
      const event: BaseEvent = {
        type: 'skill.contest',
        timestamp: Date.now(),
        payload: contestPayload,
      };
      try {
        // 如果攻擊方獲勝且需要選擇目標道具，不發送包含效果的 skill.contest 事件給攻擊方
        // 效果將在攻擊方選擇目標道具後，由 contest-select-item.ts 發送完整的通知
        const needsTargetItemSelection = contestPayload.needsTargetItemSelection === true;
        const isAttackerWins = result === 'attacker_wins';
        
        if (!(needsTargetItemSelection && isAttackerWins)) {
          // 發送給攻擊方（不需要選擇目標道具，或攻擊方未獲勝）
        const attackerChannelName = `private-character-${attackerIdStr}`;
        await pusher.trigger(attackerChannelName, 'skill.contest', event);
        } else {
          // 需要選擇目標道具且攻擊方獲勝，發送一個不包含效果的版本給攻擊方
          // 這樣前端可以知道對抗檢定已完成，並觸發道具選擇 dialog
          const attackerEvent: BaseEvent = {
            type: 'skill.contest',
            timestamp: Date.now(),
            payload: {
              ...contestPayload,
              effectsApplied: undefined, // 不包含效果，將在選擇目標道具後發送完整通知
            },
          };
          const attackerChannelName = `private-character-${attackerIdStr}`;
          await pusher.trigger(attackerChannelName, 'skill.contest', attackerEvent);
        }
        
        // 也發送給防守方，讓防守方知道結果並關閉 dialog
        const defenderChannelName = `private-character-${defenderIdStr}`;
        await pusher.trigger(defenderChannelName, 'skill.contest', event);
      } catch (error) {
        console.error('[contest-respond] Failed to emit skill.contest', error);
      }
    } else {
    }

    // Phase 8: 對抗檢定完成後，從追蹤系統中移除
    // 注意：如果需要選擇目標道具（needsTargetItemSelection），不應該立即清除記錄
    // 記錄將在攻擊方選擇完目標道具後由 selectTargetItemForContest 清除
    const needsTargetItemSelection = contestPayload.needsTargetItemSelection === true;
    
    if (!needsTargetItemSelection) {
      // 不需要選擇目標道具，立即清除對抗檢定記錄
      removeActiveContest(contestId);
      // 同時根據攻擊方和防守方的 ID 清除所有相關的對抗檢定（確保清除完整）
      // 這可以處理 contestId 格式不匹配的情況
      removeContestsByCharacterId(attackerIdStr);
      removeContestsByCharacterId(defenderIdStr);
    }

    const returnData = {
      success: true,
      data: {
        contestResult: result,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      },
      message: result === 'attacker_wins' 
        ? '攻擊方獲勝' 
        : result === 'defender_wins' 
        ? '防守方獲勝' 
        : '雙方平手',
    };
    
    return returnData;
  } catch (error) {
    console.error('Error responding to contest:', error);
    
    // Phase 8: 即使發生錯誤，也要清除對抗狀態，避免狀態一直保留
    try {
      // 嘗試解析 contestId 以獲取角色 ID
      const parts = contestId.split('::');
      if (parts.length === 3) {
        const [attackerId] = parts;
        // 清除對抗狀態
        removeActiveContest(contestId);
        // 嘗試根據攻擊方 ID 清除（防守方 ID 可能無法從 contestId 獲取）
        if (attackerId) {
          removeContestsByCharacterId(String(attackerId));
        }
      }
    } catch (cleanupError) {
      console.error('[contest-respond] 清除對抗狀態時發生錯誤:', cleanupError);
    }
    
    return {
      success: false,
      error: 'RESPOND_FAILED',
      message: `無法回應對抗檢定：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

