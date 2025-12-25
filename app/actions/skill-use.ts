'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitSkillUsed, emitRoleUpdated, emitCharacterAffected, emitSkillContest } from '@/lib/websocket/events';
import { addActiveContest, isCharacterInContest } from '@/lib/contest-tracker';
import { cleanItemData } from '@/lib/character-cleanup';
import type { ApiResponse } from '@/types/api';

/**
 * 使用技能
 */
export async function useSkill(
  characterId: string,
  skillId: string,
  checkResult?: number, // 檢定結果（由前端傳入，如果是 random 類型）
  targetCharacterId?: string, // Phase 6.5: 目標角色 ID（跨角色效果用）
  targetItemId?: string // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
): Promise<ApiResponse<{ 
  skillUsed: boolean; 
  checkPassed?: boolean; 
  checkResult?: number; 
  effectsApplied?: string[]; 
  targetCharacterName?: string;
  // Phase 7: 對抗檢定相關欄位
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

    // 找到目標技能
    const skills = character.skills || [];
    const skillIndex = skills.findIndex((s: { id: string }) => s.id === skillId);
    if (skillIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此技能',
      };
    }

    const skill = skills[skillIndex];
    const now = new Date();

    // Phase 8: 檢查使用者本身是否正在進行對抗檢定（無論技能是否需要檢定）
    const userContestStatus = isCharacterInContest(characterId);
    if (userContestStatus.inContest) {
      return {
        success: false,
        error: 'USER_IN_CONTEST',
        message: '檢定進行中，暫時無法使用技能',
      };
    }

    // Phase 6.5: 驗證目標角色（如果需要）
    let targetCharacter = null;
    const requiresTarget = skill.effects?.some((effect: Record<string, unknown>) => effect.requiresTarget);

    if (requiresTarget) {
      if (!targetCharacterId) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: '此技能需要選擇目標角色',
        };
      }

      // 獲取目標角色（驗證在同一劇本內）
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
          message: '目標角色正在進行對抗檢定，暫時無法對其使用技能',
        };
      }

      // 驗證目標類型匹配
      const effectWithTarget = skill.effects?.find((e: Record<string, unknown>) => e.requiresTarget);
      const targetType = effectWithTarget?.targetType as string | undefined;

      if (targetType === 'self' && targetCharacterId !== characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此技能只能對自己使用',
        };
      }

      if (targetType === 'other' && targetCharacterId === characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此技能不能對自己使用',
        };
      }
    } else if (targetCharacterId) {
      // Phase 8: 即使技能不需要目標，如果選擇了目標角色，也要檢查目標是否在對抗中
      targetCharacter = await Character.findById(targetCharacterId);
      if (targetCharacter && targetCharacter.gameId.toString() === character.gameId.toString()) {
        const targetContestStatus = isCharacterInContest(targetCharacterId);
        if (targetContestStatus.inContest) {
          return {
            success: false,
            error: 'TARGET_IN_CONTEST',
            message: '目標角色正在進行對抗檢定，暫時無法對其使用技能',
          };
        }
      }
    }

    // 檢查使用次數限制
    if (skill.usageLimit && skill.usageLimit > 0) {
      if ((skill.usageCount || 0) >= skill.usageLimit) {
        return {
          success: false,
          error: 'USAGE_LIMIT_REACHED',
          message: '已達使用次數上限',
        };
      }
    }

    // 檢查冷卻時間
    if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
      const lastUsed = new Date(skill.lastUsedAt).getTime();
      const cooldownMs = skill.cooldown * 1000;
      if (now.getTime() - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now.getTime() - lastUsed)) / 1000);
        return {
          success: false,
          error: 'ON_COOLDOWN',
          message: `冷卻中，剩餘 ${remainingSeconds} 秒`,
        };
      }
    }

    // 執行檢定
    let checkPassed = true;
    let finalCheckResult: number | undefined;

    if (skill.checkType === 'contest') {
      // Phase 7: 對抗檢定
      if (!skill.contestConfig) {
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

      const contestConfig = skill.contestConfig;
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

      // 創建對抗請求 ID（格式：attackerId::skillId::timestamp）
      const contestId = `${characterId}::${skillId}::${now.getTime()}`;

      // Phase 7: 對抗檢定流程
      // 1. 攻擊方使用技能 → 創建對抗請求 → 通知防守方
      // 2. 防守方可以選擇使用道具/技能來回應（通過 respondToContest API）
      // 3. 如果防守方不回應，使用基礎數值計算結果
      // 
      // 為了簡化流程，我們先使用防守方的基礎數值計算初步結果
      // 防守方可以通過 respondToContest API 來重新計算（使用道具/技能）
      // 效果將在防守方回應後執行（或使用基礎數值時立即執行）

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
      addActiveContest(contestId, characterId, targetCharacterId, 'skill', skill.id);

      // 推送對抗檢定請求事件給防守方
      // 防守方可以選擇使用道具/技能來增強防禦
      // 注意：防守方不應該知道攻擊方的數值，所以發送 0 作為佔位符
      emitSkillContest(characterId, targetCharacterId, {
        attackerId: characterId,
        attackerName: character.name,
        defenderId: targetCharacterId,
        defenderName: targetCharacter.name,
        skillId: skill.id,
        skillName: skill.name,
        attackerValue: 0, // 防守方不應該知道攻擊方數值，使用 0 作為佔位符
        defenderValue: defenderBaseValue,
        result: preliminaryResult,
        effectsApplied: undefined, // 效果將在防守方回應後執行
        opponentMaxItems: contestConfig.opponentMaxItems, // 防守方最多可使用道具數
        opponentMaxSkills: contestConfig.opponentMaxSkills, // 防守方最多可使用技能數
        targetItemId: targetItemId, // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
      }).catch((error) => console.error('Failed to emit skill.contest (request)', error));

      // 更新技能使用記錄（但不執行效果，效果將在防守方回應後執行）
      await Character.findByIdAndUpdate(characterId, {
        $set: {
          [`skills.${skillIndex}.lastUsedAt`]: now,
          [`skills.${skillIndex}.usageCount`]: (skill.usageCount || 0) + 1,
        },
      });

      // 推送技能使用事件（通知攻擊方對抗請求已發送）
      emitSkillUsed(characterId, {
        characterId,
        skillId: skill.id,
        skillName: skill.name,
        checkType: 'contest',
        checkPassed: false, // 暫時設為 false，等待防守方回應
        checkResult: undefined,
        effectsApplied: undefined,
      }).catch((error) => {
        console.error('Failed to emit skill.used event', error);
      });

      // 返回對抗請求 ID，讓前端可以顯示等待防守方回應的狀態
      return {
        success: true,
        data: {
          skillUsed: true,
          checkPassed: false, // 等待防守方回應
          contestId, // 返回對抗請求 ID，防守方需要使用此 ID 來回應
          attackerValue,
          defenderValue: defenderBaseValue,
          preliminaryResult,
        },
        message: `對抗檢定請求已發送給 ${targetCharacter.name}，等待回應...`,
      };
    } else if (skill.checkType === 'random') {
      // 隨機檢定（由前端傳入結果）
      // 處理舊資料格式：如果沒有 randomConfig，嘗試使用舊的 checkThreshold
      if (!skill.randomConfig) {
        // 檢查是否有舊格式的資料
        const oldThreshold = (skill as { checkThreshold?: number }).checkThreshold;
        const oldMaxValue = 100; // 舊格式預設上限為 100

        if (oldThreshold !== undefined) {
          // 使用舊格式的資料，但建議用戶更新
          if (checkResult === undefined) {
            return {
              success: false,
              error: 'CHECK_RESULT_REQUIRED',
              message: '需要檢定結果',
            };
          }
          finalCheckResult = checkResult;
          // 驗證檢定結果在有效範圍內（舊格式預設上限為 100）
          if (checkResult < 1 || checkResult > oldMaxValue) {
            return {
              success: false,
              error: 'INVALID_CHECK_RESULT',
              message: `檢定結果必須在 1-${oldMaxValue} 之間`,
            };
          }
          checkPassed = checkResult >= oldThreshold;
        } else {
          console.error('隨機檢定設定不完整:', skill);
          return {
            success: false,
            error: 'INVALID_CHECK',
            message: '技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，設定上限值和門檻值。',
          };
        }
      } else if (!skill.randomConfig.maxValue || skill.randomConfig.threshold === undefined) {
        console.error('隨機檢定設定不完整:', skill.randomConfig);
        return {
          success: false,
          error: 'INVALID_CHECK',
          message: '技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，確保設定了上限值和門檻值。',
        };
      } else {
        // 正常的新格式
        if (checkResult === undefined) {
          return {
            success: false,
            error: 'CHECK_RESULT_REQUIRED',
            message: '需要檢定結果',
          };
        }

        // 驗證檢定結果在有效範圍內
        if (checkResult < 1 || checkResult > skill.randomConfig.maxValue) {
          return {
            success: false,
            error: 'INVALID_CHECK_RESULT',
            message: `檢定結果必須在 1-${skill.randomConfig.maxValue} 之間`,
          };
        }

        finalCheckResult = checkResult;
        checkPassed = checkResult >= skill.randomConfig.threshold;
      }
    }
    // checkType === 'none' 時，checkPassed 保持為 true

    // Phase 6.5: 判斷是否影響他人
    const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;

    // 分離更新：技能使用記錄 vs. 數值變更
    const usageUpdates: Record<string, unknown> = {};
    const targetStatUpdates: Record<string, unknown> = {};
    const effectsApplied: string[] = [];

    // 技能使用記錄（作用在施放者）
    usageUpdates[`skills.${skillIndex}.lastUsedAt`] = now;
    if (skill.usageLimit && skill.usageLimit > 0) {
      const newUsageCount = (skill.usageCount || 0) + 1;
      usageUpdates[`skills.${skillIndex}.usageCount`] = newUsageCount;
    }

    // 執行技能效果（只有在檢定成功時才執行）
    if (checkPassed && skill.effects && skill.effects.length > 0) {
      // Phase 6.5: 決定效果作用對象
      const effectTarget = targetCharacter || character;

      const stats = effectTarget.stats || [];
      const tasks = effectTarget.tasks || []; // tasks 仍作用於目標
      const statUpdates: Array<{ id: string; name: string; value: number; maxValue?: number; delta?: number; deltaValue?: number; deltaMax?: number }> = [];

      // Phase 6.5: 用於記錄跨角色影響的變化
      const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];

      for (const effect of skill.effects) {
        if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
          // 數值變化
          const statIndex = stats.findIndex((s: { name: string }) => s.name === effect.targetStat);
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

            // Phase 6.5: 記錄跨角色變化
            if (isAffectingOthers) {
              crossCharacterChanges.push({
                name: effect.targetStat,
                deltaValue: deltaValue !== 0 ? deltaValue : undefined,
                deltaMax: deltaMax !== 0 ? deltaMax : undefined,
                newValue,
                newMax: newMaxValue !== beforeMax ? newMaxValue : undefined,
              });
            }
          }
        } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
          // 任務揭露
          const taskIndex = tasks.findIndex((t: { id: string }) => t.id === effect.targetTaskId);
          if (taskIndex !== -1 && !tasks[taskIndex].isRevealed) {
            targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
            targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
            effectsApplied.push(`揭露任務：${tasks[taskIndex].title}`);
          }
        } else if (effect.type === 'task_complete' && effect.targetTaskId) {
          // 任務完成
          const taskIndex = tasks.findIndex((t: { id: string }) => t.id === effect.targetTaskId);
          if (taskIndex !== -1 && tasks[taskIndex].status !== 'completed') {
            targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
            targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
            effectsApplied.push(`完成任務：${tasks[taskIndex].title}`);
          }
        } else if (effect.type === 'item_give' && effect.targetItemId) {
          // 給予道具（未實作）
        } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
          // Phase 7: 移除道具或偷竊道具
          // Phase 8: 對抗檢定時，這個效果會在判定結束後才執行，這裡跳過
          if (skill.checkType === 'contest') {
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
          const newQuantity = targetItemQuantity - 1;

          // 準備更新：先移除舊的道具
          await Character.findByIdAndUpdate(targetCharacterId, {
            $pull: { items: { id: targetItemId } },
          });

          // 如果數量 > 0，添加更新後的道具
          if (newQuantity > 0) {
            const updatedItem = {
              ...(targetItem.toObject ? targetItem.toObject() : targetItem),
              quantity: newQuantity,
            };
            // 移除可能的 Mongoose 特定欄位
            delete (updatedItem as Record<string, unknown> & { _id?: unknown; __v?: unknown })._id;
            delete (updatedItem as Record<string, unknown> & { _id?: unknown; __v?: unknown }).__v;
            await Character.findByIdAndUpdate(targetCharacterId, {
              $push: { items: updatedItem },
            });
          }

          if (effect.type === 'item_steal') {
            // 偷竊：將道具轉移到施放者身上
            // 重新載入角色資料以確保資料是最新的
            const updatedCharacter = await Character.findById(characterId);
            if (!updatedCharacter) {
              return {
                success: false,
                error: 'NOT_FOUND',
                message: '找不到角色',
              };
            }
            
            const sourceItems = updatedCharacter.items || [];
            const sourceItemIndex = sourceItems.findIndex((i: { id: string }) => i.id === targetItemId);

            if (sourceItemIndex !== -1) {
              // 施放者已有此道具，增加數量
              // 使用 $pull 和 $push 確保正確更新
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

            // 發送 WebSocket 事件
            // 偷竊方（characterId）：不發送任何通知，因為會顯示「技能使用結果」
            // 被偷竊方（targetCharacterId）：只發送 inventoryUpdated 通知（道具失去）
            // 注意：不發送 item.transferred 給偷竊方，因為偷竊方應該只看到「技能使用結果」
            // inventoryUpdated 會在下面統一發送給被偷竊方

            effectsApplied.push(`偷竊了 ${targetItemName}`);
          } else {
            // 移除：只移除目標道具，不轉移
            effectsApplied.push(`移除了 ${targetItemName}`);
          }

          // 發送 WebSocket 事件給目標角色
          const { emitInventoryUpdated, emitCharacterAffected } = await import('@/lib/websocket/events');
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
              console.error('[skill-use] Failed to emit role.updated (source character items)', error);
            });

            await emitRoleUpdated(targetCharacterId, {
              characterId: targetCharacterId,
              updates: {
                items: targetCleanItems as unknown as Array<Record<string, unknown>>,
              },
            }).catch((error) => {
              console.error('[skill-use] Failed to emit role.updated (target character items)', error);
            });
          } else {
          }
        }
      }

      // Phase 6.5: 應用跨角色統計變化
      if (Object.keys(targetStatUpdates).length > 0) {
        if (isAffectingOthers && targetCharacter) {
          // 更新目標角色
          await Character.findByIdAndUpdate(targetCharacterId, {
            $set: targetStatUpdates,
            $unset: { 'tasks.$[].gmNotes': 1 }, // 移除 gmNotes（若有）
          });

          // 發送 WebSocket 事件給目標角色
          if (crossCharacterChanges.length > 0) {
            emitCharacterAffected(targetCharacterId, {
              targetCharacterId,
              sourceCharacterId: characterId,
              sourceCharacterName: character.name,
              sourceType: 'skill',
              sourceName: skill.name,
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
            }).catch((error) => console.error('Failed to emit character.affected (skill)', error));

            // 注意：跨角色影響時，不發送 role.updated 的 stats 更新
            // 因為 character.affected 已經包含了所有必要信息
            // 只發送 role.updated 用於觸發頁面刷新，但不包含 stats（避免重複通知）
            emitRoleUpdated(targetCharacterId, {
              characterId: targetCharacterId,
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
    }

    // 更新技能使用記錄
    if (Object.keys(usageUpdates).length > 0) {
      await Character.findByIdAndUpdate(characterId, {
        $set: usageUpdates,
      });
    }

    // WebSocket 事件：技能使用（非阻斷，若未配置 Pusher 則安全跳過）
    emitSkillUsed(characterId, {
      characterId,
      skillId: skill.id,
      skillName: skill.name,
      checkType: skill.checkType,
      checkPassed,
      checkResult: finalCheckResult,
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
    }).catch((error) => {
      console.error('Failed to emit skill.used event', error);
    });

    const messageParts: string[] = [];
    if (!checkPassed) {
      messageParts.push('檢定失敗');
    } else {
      messageParts.push('技能使用成功');
      if (isAffectingOthers && targetCharacter) {
        messageParts.push(`對象：${targetCharacter.name}`);
      }
      if (effectsApplied.length > 0) {
        messageParts.push(`效果：${effectsApplied.join('、')}`);
      }
    }

    return {
      success: true,
      data: {
        skillUsed: true,
        checkPassed,
        checkResult: finalCheckResult,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        targetCharacterName: targetCharacter?.name,
      },
      message: messageParts.join('，'),
    };
  } catch (error) {
    console.error('Error using skill:', error);
    return {
      success: false,
      error: 'USE_FAILED',
      message: `無法使用技能：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
