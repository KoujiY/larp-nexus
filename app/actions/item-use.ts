'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import type { CharacterDocument } from '@/lib/db/models';
import { emitRoleUpdated, emitCharacterAffected, emitInventoryUpdated, emitItemTransferred, emitSkillContest } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { addActiveContest, isCharacterInContest } from '@/lib/contest-tracker';
import type { ApiResponse } from '@/types/api';

/**
 * 使用道具
 * Phase 8: 添加檢定系統支援
 */
export async function useItem(
  characterId: string,
  itemId: string,
  targetCharacterId?: string,
  checkResult?: number, // Phase 8: 檢定結果（由前端傳入，如果是 random 類型）
  targetItemId?: string // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
): Promise<ApiResponse<{ 
  itemUsed: boolean; 
  effectApplied?: string; 
  targetCharacterName?: string;
  // Phase 8: 檢定相關欄位
  checkPassed?: boolean;
  checkResult?: number;
  contestId?: string;
  attackerValue?: number;
  defenderValue?: number;
  preliminaryResult?: 'attacker_wins' | 'defender_wins' | 'both_fail';
}>> {
  try {
    await dbConnect();

    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 找到目標道具
    const items = character.items || [];
    const itemIndex = items.findIndex((i: { id: string }) => i.id === itemId);
    if (itemIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此道具',
      };
    }

    const item = items[itemIndex];
    const now = new Date();

    // Phase 8: 檢查使用者本身是否正在進行對抗檢定（無論道具是否需要檢定）
    const userContestStatus = isCharacterInContest(characterId);
    if (userContestStatus.inContest) {
      return {
        success: false,
        error: 'USER_IN_CONTEST',
        message: '檢定進行中，暫時無法使用道具',
      };
    }

    // Phase 6.5: 判斷是否影響他人並驗證目標
    const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;
    let targetCharacter: CharacterDocument | null = null;
    if (isAffectingOthers) {
      targetCharacter = await Character.findById(targetCharacterId);
      if (!targetCharacter || targetCharacter.gameId.toString() !== character.gameId.toString()) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '目標角色不存在或不在同一劇本內',
        };
      }

      // Phase 8: 檢查目標角色是否正在進行對抗檢定
      const targetContestStatus = isCharacterInContest(targetCharacterId);
      if (targetContestStatus.inContest) {
        return {
          success: false,
          error: 'TARGET_IN_CONTEST',
          message: '目標角色正在進行對抗檢定，暫時無法對其使用道具',
        };
      }
    } else if (targetCharacterId && targetCharacterId !== characterId) {
      // Phase 8: 即使道具不需要目標，如果選擇了目標角色，也要檢查目標是否在對抗中
      targetCharacter = await Character.findById(targetCharacterId);
      if (targetCharacter && targetCharacter.gameId.toString() === character.gameId.toString()) {
        const targetContestStatus = isCharacterInContest(targetCharacterId);
        if (targetContestStatus.inContest) {
          return {
            success: false,
            error: 'TARGET_IN_CONTEST',
            message: '目標角色正在進行對抗檢定，暫時無法對其使用道具',
          };
        }
      }
    }

    // 檢查消耗品數量
    if (item.type === 'consumable' && item.quantity <= 0) {
      return {
        success: false,
        error: 'ITEM_DEPLETED',
        message: '道具數量不足',
      };
    }

    // 檢查使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      if ((item.usageCount || 0) >= item.usageLimit) {
        return {
          success: false,
          error: 'USAGE_LIMIT_REACHED',
          message: '已達使用次數上限',
        };
      }
    }

    // 檢查冷卻時間
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      const cooldownMs = item.cooldown * 1000;
      if (now.getTime() - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now.getTime() - lastUsed)) / 1000);
        return {
          success: false,
          error: 'ON_COOLDOWN',
          message: `冷卻中，剩餘 ${remainingSeconds} 秒`,
        };
      }
    }

    // Phase 8: 驗證目標角色（如果需要）
    // 重構：支援多個效果
    const effects = item.effects || (item.effect ? [item.effect] : []);
    const checkType = item.checkType || 'none';
    const requiresTarget = effects.some((e: { requiresTarget?: boolean }) => e.requiresTarget) || checkType === 'contest';
    
    // Phase 8: 對抗檢定時，如果有 item_take/item_steal 效果，不需要在初始使用時選擇目標道具
    const hasItemTakeOrSteal = effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');
    const needsTargetItemInContest = checkType === 'contest' && hasItemTakeOrSteal;
    
    if (requiresTarget) {
      if (!targetCharacterId) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: '此道具需要選擇目標角色',
        };
      }

      if (!targetCharacter) {
        targetCharacter = await Character.findById(targetCharacterId);
        if (!targetCharacter || targetCharacter.gameId.toString() !== character.gameId.toString()) {
          return {
            success: false,
            error: 'INVALID_TARGET',
            message: '目標角色不存在或不在同一劇本內',
          };
        }
      }

      // 驗證目標類型匹配
      const targetType = effects.find((e: { requiresTarget?: boolean }) => e.requiresTarget)?.targetType;
      if (targetType === 'self' && targetCharacterId !== characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此道具只能對自己使用',
        };
      }

      if (targetType === 'other' && targetCharacterId === characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此道具不能對自己使用',
        };
      }
    }

    // Phase 8: 對抗檢定時，如果有 item_take/item_steal 效果，不要求 targetItemId
    // 非對抗檢定時，仍然需要 targetItemId
    if (!needsTargetItemInContest && hasItemTakeOrSteal && !targetItemId) {
      return {
        success: false,
        error: 'TARGET_ITEM_REQUIRED',
        message: '請選擇目標道具',
      };
    }

    // Phase 8: 執行檢定
    let checkPassed = true;
    let finalCheckResult: number | undefined;

    if (checkType === 'contest') {
      // 對抗檢定
      if (!item.contestConfig) {
        return {
          success: false,
          error: 'INVALID_CONFIG',
          message: '對抗檢定設定不完整',
        };
      }

      // 對抗檢定必須有目標角色
      if (!targetCharacterId) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: '對抗檢定需要選擇目標角色',
        };
      }

      if (!targetCharacter) {
        return {
          success: false,
          error: 'TARGET_NOT_FOUND',
          message: '找不到目標角色',
        };
      }

      const contestConfig = item.contestConfig;
      const relatedStatName = contestConfig.relatedStat;

      // 取得攻擊方的相關數值
      const attackerStats = character.stats || [];
      const attackerStat = attackerStats.find((s: { name: string }) => s.name === relatedStatName);
      if (!attackerStat) {
        return {
          success: false,
          error: 'INVALID_STAT',
          message: `你沒有 ${relatedStatName} 數值`,
        };
      }

      const attackerValue = attackerStat.value;

      // 取得防守方的相關數值（基礎值）
      const defenderStats = targetCharacter.stats || [];
      const defenderStat = defenderStats.find((s: { name: string }) => s.name === relatedStatName);
      if (!defenderStat) {
        return {
          success: false,
          error: 'INVALID_TARGET_STAT',
          message: `目標角色沒有 ${relatedStatName} 數值`,
        };
      }

      const defenderBaseValue = defenderStat.value;

      // 創建對抗請求 ID（格式：attackerId::itemId::timestamp）
      const contestId = `${characterId}::${itemId}::${now.getTime()}`;

      // 計算初步對抗結果（使用防守方基礎數值）
      let preliminaryResult: 'attacker_wins' | 'defender_wins' | 'both_fail';
      if (attackerValue > defenderBaseValue) {
        preliminaryResult = 'attacker_wins';
      } else if (defenderBaseValue > attackerValue) {
        preliminaryResult = 'defender_wins';
      } else {
        // 平手
        preliminaryResult = contestConfig.tieResolution || 'attacker_wins';
        if (preliminaryResult === 'both_fail') {
          preliminaryResult = 'both_fail';
        }
      }

      // Phase 8: 添加到對抗檢定追蹤系統
      addActiveContest(contestId, characterId, targetCharacterId, 'item', item.id);

      // Phase 8: 檢查是否有 item_take 或 item_steal 效果，如果有，則需要判定失敗後才選擇目標道具
      const hasItemTakeOrSteal = effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');
      const needsTargetItemSelection = hasItemTakeOrSteal;

      // 推送對抗檢定請求事件給防守方
      emitSkillContest(characterId, targetCharacterId, {
        attackerId: characterId,
        attackerName: character.name,
        defenderId: targetCharacterId,
        defenderName: targetCharacter.name,
        itemId: item.id,
        itemName: item.name,
        sourceType: 'item',
        attackerValue: 0, // 防守方不應該知道攻擊方數值，使用 0 作為佔位符
        defenderValue: defenderBaseValue,
        result: preliminaryResult,
        effectsApplied: undefined, // 效果將在防守方回應後執行
        opponentMaxItems: contestConfig.opponentMaxItems,
        opponentMaxSkills: contestConfig.opponentMaxSkills,
        needsTargetItemSelection, // Phase 8: 標記是否需要選擇目標道具
      }).catch((error) => console.error('Failed to emit item.contest (request)', error));

      // 更新道具使用記錄（但不執行效果，效果將在防守方回應後執行）
      await Character.findByIdAndUpdate(characterId, {
        $set: {
          [`items.${itemIndex}.lastUsedAt`]: now,
          [`items.${itemIndex}.usageCount`]: (item.usageCount || 0) + 1,
        },
      });

      // 返回對抗請求 ID
      const returnData = {
        success: true,
        data: {
          itemUsed: true,
          checkPassed: false, // 等待防守方回應
          contestId,
          attackerValue,
          defenderValue: defenderBaseValue,
          preliminaryResult,
        },
        message: `對抗檢定請求已發送給 ${targetCharacter.name}，等待回應...`,
      };
      return returnData;
    } else if (checkType === 'random') {
      // 隨機檢定（由前端傳入結果）
      if (!item.randomConfig) {
        return {
          success: false,
          error: 'INVALID_CONFIG',
          message: '隨機檢定設定不完整',
        };
      }

      if (!item.randomConfig.maxValue || item.randomConfig.threshold === undefined) {
        return {
          success: false,
          error: 'INVALID_CHECK',
          message: '道具隨機檢定設定不完整。請在 GM 端重新編輯此道具，確保設定了上限值和門檻值。',
        };
      }

      if (checkResult === undefined) {
        return {
          success: false,
          error: 'CHECK_RESULT_REQUIRED',
          message: '需要檢定結果',
        };
      }

      // 驗證檢定結果在有效範圍內
      if (checkResult < 1 || checkResult > item.randomConfig.maxValue) {
        return {
          success: false,
          error: 'INVALID_CHECK_RESULT',
          message: `檢定結果必須在 1-${item.randomConfig.maxValue} 之間`,
        };
      }

      finalCheckResult = checkResult;
      checkPassed = checkResult >= item.randomConfig.threshold;
    }
    // checkType === 'none' 時，checkPassed 保持為 true

    // 準備更新
    const usageUpdates: Record<string, unknown> = {};
    const targetStatUpdates: Record<string, unknown> = {};

    // 總是記錄道具使用時間（用於追蹤使用歷史）
    usageUpdates[`items.${itemIndex}.lastUsedAt`] = now;

    // 處理使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      // 有使用次數限制：每次使用增加 usageCount
      const newUsageCount = (item.usageCount || 0) + 1;
      usageUpdates[`items.${itemIndex}.usageCount`] = newUsageCount;
      // 不刪除道具，讓它保留在清單中顯示為已用盡
    } else {
      // 沒有使用次數限制：消耗品每次使用減少數量
      if (item.type === 'consumable') {
        const newQuantity = Math.max(0, item.quantity - 1);
        usageUpdates[`items.${itemIndex}.quantity`] = newQuantity;
        // 不刪除道具，讓它保留在清單中顯示為數量 0
      }
    }

    // Phase 8: 執行效果（只有在檢定成功時才執行）
    // 重構：支援多個效果
    let statUpdatePayload: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> | undefined;
    const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];
    const effectMessages: string[] = []; // 用於累積多個效果訊息
    
    // 只有在檢定通過時才執行效果
    if (checkPassed && effects.length > 0) {
      for (const effect of effects) {
        if (
          effect.type === 'stat_change' &&
          effect.targetStat &&
          typeof effect.value === 'number'
        ) {
          const effectTarget = targetCharacter || character;
          const stats = effectTarget.stats || [];
          const statIndex = stats.findIndex((s: { name: string }) => s.name === effect.targetStat);

          if (statIndex === -1) {
            // 繼續執行其他效果，不中斷
            continue;
          }

          if (statIndex !== -1) {
            // 使用 type assertion 處理可能缺少的欄位（向下兼容舊資料）
            interface ItemEffectExtended {
              type: string;
              targetStat?: string;
              value?: number;
              statChangeTarget?: 'value' | 'maxValue';
              syncValue?: boolean;
              description?: string;
            }
            const effectWithTarget = effect as ItemEffectExtended;
            const target = effectWithTarget.statChangeTarget || 'value';
            const delta = effect.value;
            const beforeValue = stats[statIndex].value;
            const beforeMax = stats[statIndex].maxValue ?? null;
            const syncValue = effectWithTarget.syncValue;

            // 若目標無 maxValue，但要求改 maxValue，退回改 value
            const effectiveTarget =
              target === 'maxValue' && beforeMax === null ? 'value' : target;

            let newValue = beforeValue;
            let newMax = beforeMax;
            let deltaValue = 0;
            let deltaMax = 0;

            if (effectiveTarget === 'maxValue') {
              // 修改最大值（參考技能實作）
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
              if (beforeMax !== null) newValue = Math.min(newValue, beforeMax);
              deltaValue = newValue - beforeValue;
              targetStatUpdates[`stats.${statIndex}.value`] = newValue;
              effectMessages.push(`${effect.targetStat} ${delta > 0 ? '+' : ''}${delta}`);
            }

            statUpdatePayload = [
              {
                id: stats[statIndex].id,
                name: stats[statIndex].name,
                value: newValue,
                maxValue: newMax ?? undefined,
                deltaValue: deltaValue !== 0 ? deltaValue : undefined,
                deltaMax: deltaMax !== 0 ? deltaMax : undefined,
              },
            ];
            if (isAffectingOthers) {
              crossCharacterChanges.push({
                name: stats[statIndex].name,
                deltaValue: deltaValue !== 0 ? deltaValue : undefined,
                deltaMax: deltaMax !== 0 ? deltaMax : undefined,
                newValue,
                newMax: newMax ?? undefined,
              });
            }
          }
        } else if (effect.type === 'custom' && effect.description) {
          effectMessages.push(effect.description);
        } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
          // Phase 7: 移除道具或偷竊道具
          // Phase 8: 對抗檢定時，這個效果會在判定失敗後才執行，這裡跳過
          if (checkType === 'contest') {
            continue;
          }
          
          if (!targetCharacterId) {
            return {
              success: false,
              error: 'TARGET_REQUIRED',
              message: '此效果需要選擇目標角色',
            };
          }

          if (!targetItemId) {
            return {
              success: false,
              error: 'TARGET_ITEM_REQUIRED',
              message: '請選擇目標道具',
            };
          }

          // 驗證目標角色
          if (!targetCharacter) {
            targetCharacter = await Character.findById(targetCharacterId);
            if (!targetCharacter || targetCharacter.gameId.toString() !== character.gameId.toString()) {
              return {
                success: false,
                error: 'INVALID_TARGET',
                message: '目標角色不存在或不在同一劇本內',
              };
            }
          }

          // 找到目標道具
          const targetItems = targetCharacter.items || [];
          const targetItemIndex = targetItems.findIndex((i: { id: string }) => i.id === targetItemId);
          
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
              $pull: targetUpdates.$pull,
            });
          } else {
            await Character.findByIdAndUpdate(targetCharacterId, {
              $set: targetUpdates,
            });
          }

          if (effect.type === 'item_steal') {
            // 偷竊：將道具轉移到施放者身上
            const sourceItems = character.items || [];
            const sourceItemIndex = sourceItems.findIndex((i: { id: string }) => i.id === targetItemId);

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
                $push: sourceUpdates.$push,
              });
            } else {
              await Character.findByIdAndUpdate(characterId, {
                $set: sourceUpdates,
              });
            }

            // 發送 WebSocket 事件
            // 偷竊方（characterId）：不發送任何通知，因為會顯示「道具使用結果」
            // 被偷竊方（targetCharacterId）：只發送 inventoryUpdated 通知（道具失去）
            // 注意：不發送 item.transferred 給偷竊方，因為偷竊方應該只看到「道具使用結果」

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

          // Phase 9: 發送 role.updated 事件給兩個角色，讓GM端能同步更新道具列表
          // 重新載入兩個角色的最新資料
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
              console.error('[item-use] Failed to emit role.updated (source character items)', error);
            });

            await emitRoleUpdated(targetCharacterId, {
              characterId: targetCharacterId,
              updates: {
                items: targetCleanItems as unknown as Array<Record<string, unknown>>,
              },
            }).catch((error) => {
              console.error('[item-use] Failed to emit role.updated (target character items)', error);
            });
          } else {
          }

          // 重新驗證路徑
          revalidatePath(`/c/${targetCharacterId}`);
          if (effect.type === 'item_steal') {
            revalidatePath(`/c/${characterId}`);
          }
        }
      }
    }

    // 執行更新：施放者（使用記錄 + 若非跨角色則包含自身的數值變更）
    const selfUpdates: Record<string, unknown> = { ...usageUpdates };
    if (!isAffectingOthers) {
      Object.assign(selfUpdates, targetStatUpdates);
    }
    if (Object.keys(selfUpdates).length > 0) {
      await Character.findByIdAndUpdate(characterId, { $set: selfUpdates });
    }
    revalidatePath(`/c/${characterId}`);

    // 若跨角色，寫入目標角色的數值變更
    if (isAffectingOthers && Object.keys(targetStatUpdates).length > 0) {
      await Character.findByIdAndUpdate(targetCharacterId, { $set: targetStatUpdates });
      revalidatePath(`/c/${targetCharacterId}`);
    }

    // WebSocket：數值更新（若有）
    if (statUpdatePayload) {
      const targetId = isAffectingOthers ? targetCharacterId! : characterId;
      
      if (isAffectingOthers && crossCharacterChanges.length > 0) {
        // 跨角色影響：只發送 character.affected，不發送 role.updated 的 stats（避免重複通知）
        emitCharacterAffected(targetId, {
          targetCharacterId: targetId,
          sourceCharacterId: characterId,
          sourceCharacterName: character.name,
          sourceType: 'item',
          sourceName: item.name,
          effectType: 'stat_change',
          changes: { stats: crossCharacterChanges },
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

    // 合併所有效果訊息
    const finalEffectMessage = effectMessages.length > 0 ? effectMessages.join('、') : undefined;
    
    return {
      success: true,
      data: {
        itemUsed: true,
        effectApplied: checkPassed ? finalEffectMessage || undefined : undefined,
        targetCharacterName: isAffectingOthers ? targetCharacter?.name : undefined,
        checkPassed,
        checkResult: finalCheckResult,
      },
      message: checkPassed ? '道具使用成功' : '道具使用失敗（檢定未通過）',
    };
  } catch (error) {
    console.error('Error using item:', error);
    return {
      success: false,
      error: 'USE_FAILED',
      message: `無法使用道具：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

/**
 * 轉移道具
 */
export async function transferItem(
  characterId: string,
  itemId: string,
  targetCharacterId: string,
  quantity: number
): Promise<ApiResponse<{ transferred: boolean; transferredQuantity: number }>> {
  try {
    await dbConnect();

    if (quantity <= 0) {
      return {
        success: false,
        error: 'INVALID_QUANTITY',
        message: '轉移數量必須大於 0',
      };
    }

    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到來源角色',
      };
    }

    const targetCharacter = await Character.findById(targetCharacterId);
    if (!targetCharacter) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到目標角色',
      };
    }

    // 驗證在同一劇本
    if (character.gameId.toString() !== targetCharacter.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '只能轉移給同一劇本的角色',
      };
    }

    // 找到來源道具
    const sourceItems = character.items || [];
    const sourceIndex = sourceItems.findIndex((i: { id: string }) => i.id === itemId);
    if (sourceIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此道具',
      };
    }

    const sourceItem = sourceItems[sourceIndex];

    // 檢查數量是否足夠
    if (sourceItem.quantity < quantity) {
      return {
        success: false,
        error: 'INSUFFICIENT_QUANTITY',
        message: '道具數量不足',
      };
    }

    // 檢查是否可轉移
    if (!sourceItem.isTransferable) {
      return {
        success: false,
        error: 'NOT_TRANSFERABLE',
        message: '此道具不可轉移',
      };
    }

    // 檢查目標是否已有此道具
    const targetItems = targetCharacter.items || [];
    const targetIndex = targetItems.findIndex((i: { id: string }) => i.id === itemId);

    // 準備目標角色的更新
    const targetUpdates: Record<string, unknown> = {};

    if (targetIndex !== -1) {
      // 目標已有此道具，增加數量
      const newTargetQuantity = targetItems[targetIndex].quantity + quantity;
      targetUpdates[`items.${targetIndex}.quantity`] = newTargetQuantity;
    } else {
      // 目標沒有此道具，新增道具
      const newItem = {
        ...sourceItem.toObject(),
        quantity,
        acquiredAt: new Date(),
      };
      delete newItem._id; // 移除 MongoDB ID
      targetUpdates.$push = { items: newItem };
    }

    // 準備來源角色的更新
    const newSourceQuantity = sourceItem.quantity - quantity;
    const sourceUpdates: Record<string, unknown> = {};

    if (newSourceQuantity <= 0) {
      // 數量為 0，移除道具
      sourceUpdates.$pull = { items: { id: itemId } };
    } else {
      // 更新數量
      sourceUpdates[`items.${sourceIndex}.quantity`] = newSourceQuantity;
    }

    // 執行更新：先更新目標角色，再更新來源角色
    if (targetUpdates.$push) {
      await Character.findByIdAndUpdate(targetCharacterId, {
        $push: targetUpdates.$push,
      });
    } else {
      await Character.findByIdAndUpdate(targetCharacterId, {
        $set: targetUpdates,
      });
    }

    if (sourceUpdates.$pull) {
      await Character.findByIdAndUpdate(characterId, {
        $pull: sourceUpdates.$pull,
      });
    } else {
      await Character.findByIdAndUpdate(characterId, {
        $set: sourceUpdates,
      });
    }

    // WebSocket 事件
    // 轉出方（characterId）：只發送 item.transferred 通知，不發送 inventoryUpdated
    // 這樣轉出方只會看到「道具轉移」通知，不會看到「道具更新」通知
    // 接受方（targetCharacterId）：只發送 item.transferred 通知，不發送 inventoryUpdated
    // 這樣接受方只會看到「道具獲得」通知，不會看到「道具更新」通知
    emitItemTransferred(characterId, targetCharacterId, {
      fromCharacterId: characterId,
      fromCharacterName: character.name,
      toCharacterId: targetCharacterId,
      toCharacterName: targetCharacter.name,
      itemId: sourceItem.id,
      itemName: sourceItem.name,
      quantity,
      transferType: 'give',
    }).catch((error) => console.error('Failed to emit item.transferred', error));

    // Phase 9: 發送 role.updated 事件給兩個角色，讓GM端能同步更新道具列表
    // 重新載入兩個角色的最新資料
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
        console.error('[transferItem] Failed to emit role.updated (source character items)', error);
      });

      await emitRoleUpdated(targetCharacterId, {
        characterId: targetCharacterId,
        updates: {
          items: targetCleanItems as unknown as Array<Record<string, unknown>>,
        },
      }).catch((error) => {
        console.error('[transferItem] Failed to emit role.updated (target character items)', error);
      });
    } else {
    }

    revalidatePath(`/c/${characterId}`);
    revalidatePath(`/c/${targetCharacterId}`);

    return {
      success: true,
      data: {
        transferred: true,
        transferredQuantity: quantity,
      },
      message: `已將 ${quantity} 個「${sourceItem.name}」轉移給 ${targetCharacter.name}`,
    };
  } catch (error) {
    console.error('Error transferring item:', error);
    return {
      success: false,
      error: 'TRANSFER_FAILED',
      message: `無法轉移道具：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
