'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitSkillUsed, emitRoleUpdated, emitCharacterAffected } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';

/**
 * 使用技能
 */
export async function useSkill(
  characterId: string,
  skillId: string,
  checkResult?: number, // 檢定結果（由前端傳入，如果是 random 類型）
  targetCharacterId?: string // Phase 6.5: 目標角色 ID（跨角色效果用）
): Promise<ApiResponse<{ skillUsed: boolean; checkPassed?: boolean; checkResult?: number; effectsApplied?: string[]; targetCharacterName?: string }>> {
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
      // 對抗檢定（暫時返回錯誤，待後續實作）
      return {
        success: false,
        error: 'NOT_IMPLEMENTED',
        message: '對抗檢定功能開發中',
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
          console.warn('使用舊格式的隨機檢定設定，建議在 GM 端重新編輯技能');
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
          console.warn('item_give effect not implemented yet');
        } else if (effect.type === 'item_take' && effect.targetItemId) {
          // 拿取道具（未實作）
          console.warn('item_take effect not implemented yet');
        } else if (effect.type === 'item_steal' && effect.targetItemId) {
          // 偷取道具（未實作）
          console.warn('item_steal effect not implemented yet');
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

            // 發送 role.updated 給目標角色
            emitRoleUpdated(targetCharacterId, {
              characterId: targetCharacterId,
              updates: {
                stats: statUpdates,
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
