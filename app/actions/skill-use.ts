'use server';

import { withAction } from '@/lib/actions/action-wrapper';
import { validatePlayerAccess } from '@/lib/auth/session';
import { emitSkillUsed } from '@/lib/websocket/events';
import { isCharacterInContest } from '@/lib/contest-tracker';
import { handleSkillCheck } from '@/lib/skill/check-handler';
import { executeSkillEffects } from '@/lib/skill/skill-effect-executor';
import { executeAutoReveal } from '@/lib/reveal/auto-reveal-evaluator';
import { checkExpiredEffects } from './temporary-effects'; // Phase 8: 過期效果檢查
import { getCharacterData } from '@/lib/game/get-character-data'; // Phase 10.4: 統一讀取
import { updateCharacterData } from '@/lib/game/update-character-data'; // Phase 10.4: 統一寫入
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
  // 非對抗偷竊/移除：使用成功後需要選擇目標道具
  needsTargetItemSelection?: boolean;
  targetCharacterId?: string;
}>> {
  return withAction(async () => {
    // 驗證玩家是否已解鎖此角色（防止未授權操作）
    if (!(await validatePlayerAccess(characterId))) {
      return { success: false, error: 'UNAUTHORIZED', message: '未授權操作此角色' };
    }

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    const character = await getCharacterData(characterId);

    // Phase 8: 使用技能前檢查並處理過期的時效性效果
    await checkExpiredEffects(characterId);

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
    const requiresTarget = skill.effects?.some((effect) => effect.requiresTarget) || skill.checkType === 'contest' || skill.checkType === 'random_contest';
    const hasItemTakeOrSteal = skill.effects?.some((e) => e.type === 'item_take' || e.type === 'item_steal') ?? false;

    if (requiresTarget) {
      if (!targetCharacterId) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: '此技能需要選擇目標角色',
        };
      }

      // 獲取目標角色（驗證在同一劇本內）
      // Phase 10.4: 使用統一的讀取函數
      targetCharacter = await getCharacterData(targetCharacterId);
      if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '目標角色不在同一劇本內',
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
      const effectWithTarget = skill.effects?.find((e) => e.requiresTarget);
      const targetType = effectWithTarget && 'targetType' in effectWithTarget
        ? (effectWithTarget.targetType as string)
        : undefined;

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
      // Phase 10.4: 使用統一的讀取函數（如果角色不存在則忽略錯誤）
      try {
        targetCharacter = await getCharacterData(targetCharacterId);
        if (targetCharacter.gameId.toString() === character.gameId.toString()) {
          const targetContestStatus = isCharacterInContest(targetCharacterId);
          if (targetContestStatus.inContest) {
            return {
              success: false,
              error: 'TARGET_IN_CONTEST',
              message: '目標角色正在進行對抗檢定，暫時無法對其使用技能',
            };
          }
        }
      } catch {
        // 目標角色不存在或其他錯誤，忽略（這是可選的檢查）
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
    let checkResultData;
    try {
      checkResultData = await handleSkillCheck(skill, character, checkResult, targetCharacterId, targetItemId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '檢定處理失敗';
      // 將錯誤轉換為適當的錯誤代碼
      if (errorMessage.includes('對抗檢定設定不完整')) {
        return {
          success: false,
          error: 'INVALID_CONFIG',
          message: errorMessage,
        };
      }
      if (errorMessage.includes('對抗檢定需要選擇目標角色') || errorMessage.includes('找不到目標角色')) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: errorMessage,
        };
      }
      if (errorMessage.includes('需要檢定結果')) {
        return {
          success: false,
          error: 'CHECK_RESULT_REQUIRED',
          message: errorMessage,
        };
      }
      if (errorMessage.includes('檢定結果必須在')) {
        return {
          success: false,
          error: 'INVALID_CHECK_RESULT',
          message: errorMessage,
        };
      }
      if (errorMessage.includes('隨機檢定設定不完整')) {
        return {
          success: false,
          error: 'INVALID_CHECK',
          message: errorMessage,
        };
      }
      if (errorMessage.includes('數值')) {
        return {
          success: false,
          error: 'INVALID_STAT',
          message: errorMessage,
        };
      }
      return {
        success: false,
        error: 'CHECK_FAILED',
        message: errorMessage,
      };
    }

    const checkPassed = checkResultData.checkPassed;
    const finalCheckResult = checkResultData.checkResult;

    // 如果是對抗檢定或隨機對抗檢定，需要提前返回
    if (skill.checkType === 'contest' || skill.checkType === 'random_contest') {
      // Phase 10.4: 使用統一的寫入函數（自動判斷 Baseline/Runtime）
      await updateCharacterData(characterId, {
        $set: {
          [`skills.${skillIndex}.lastUsedAt`]: now,
          [`skills.${skillIndex}.usageCount`]: (skill.usageCount || 0) + 1,
        },
      });

      // 獲取目標角色名稱（用於返回訊息）
      const targetCharacterName = targetCharacter?.name || '目標角色';

      return {
        success: true,
        data: {
          skillUsed: true,
          checkPassed: false, // 等待防守方回應
          contestId: checkResultData.contestId, // 返回對抗請求 ID，防守方需要使用此 ID 來回應
          attackerValue: checkResultData.attackerValue,
          defenderValue: checkResultData.defenderValue,
          preliminaryResult: checkResultData.preliminaryResult,
        },
        message: `對抗檢定請求已發送給 ${targetCharacterName}，等待回應...`,
      };
    }

    // Step 9: 非對抗偷竊/移除：檢定通過但尚未選擇目標道具 → 延遲所有效果
    // 所有效果（含 stat_change）都延遲到選擇目標道具後由 selectTargetItemAfterUse 一起執行
    // 即使目標無道具，仍走延遲流程 — 用戶點「確認」後觸發結算（含「無道具可互動」通知）
    if (hasItemTakeOrSteal && !targetItemId && checkPassed) {
      // 仍然更新使用記錄（usageCount, lastUsedAt）
      const usageUpdates: Record<string, unknown> = {};
      usageUpdates[`skills.${skillIndex}.lastUsedAt`] = now;
      if (skill.usageLimit && skill.usageLimit > 0) {
        const newUsageCount = (skill.usageCount || 0) + 1;
        usageUpdates[`skills.${skillIndex}.usageCount`] = newUsageCount;
      }
      if (Object.keys(usageUpdates).length > 0) {
        await updateCharacterData(characterId, { $set: usageUpdates });
      }

      const targetCharacterName = targetCharacter?.name || '目標角色';
      return {
        success: true,
        data: {
          skillUsed: true,
          checkPassed: true,
          checkResult: finalCheckResult,
          targetCharacterName,
          needsTargetItemSelection: true,
          targetCharacterId,
        },
        message: `技能使用成功，請選擇要${skill.effects?.some((e) => e.type === 'item_steal') ? '偷竊' : '移除'}的目標道具`,
      };
    }

    // 執行技能效果（只有在檢定成功時才執行）
    let effectsApplied: string[] = [];
    let pendingReveal: { receiverId: string } | undefined;
    if (checkPassed && skill.effects && skill.effects.length > 0) {
      try {
        const effectResult = await executeSkillEffects(skill, character, targetCharacterId, targetItemId);
        effectsApplied = effectResult.effectsApplied;
        pendingReveal = effectResult.pendingReveal;
        // 角色資料已由 executeSkillEffects 更新
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '效果執行失敗';
        // 將錯誤轉換為適當的錯誤代碼
        if (errorMessage.includes('需要選擇目標角色')) {
          return {
            success: false,
            error: 'TARGET_REQUIRED',
            message: errorMessage,
          };
        }
        if (errorMessage.includes('請選擇目標道具')) {
          return {
            success: false,
            error: 'TARGET_ITEM_REQUIRED',
            message: errorMessage,
          };
        }
        if (errorMessage.includes('目標角色') || errorMessage.includes('不在同一劇本')) {
          return {
            success: false,
            error: 'INVALID_TARGET',
            message: errorMessage,
          };
        }
        if (errorMessage.includes('沒有此道具')) {
          return {
            success: false,
            error: 'TARGET_ITEM_NOT_FOUND',
            message: errorMessage,
          };
        }
        return {
          success: false,
          error: 'EFFECT_EXECUTION_FAILED',
          message: errorMessage,
        };
      }
    }

    // 更新技能使用記錄
    const usageUpdates: Record<string, unknown> = {};
    usageUpdates[`skills.${skillIndex}.lastUsedAt`] = now;
    if (skill.usageLimit && skill.usageLimit > 0) {
      const newUsageCount = (skill.usageCount || 0) + 1;
      usageUpdates[`skills.${skillIndex}.usageCount`] = newUsageCount;
    }

    if (Object.keys(usageUpdates).length > 0) {
      // Phase 10.4: 使用統一的寫入函數（自動判斷 Baseline/Runtime）
      await updateCharacterData(characterId, {
        $set: usageUpdates,
      });
    }

    // 判斷是否影響他人
    const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;

    // 獲取目標角色名稱（targetCharacter 在前面已載入）
    const targetCharacterName = isAffectingOthers ? targetCharacter?.name : undefined;

    // WebSocket 事件：技能使用（非阻斷，若未配置 Pusher 則安全跳過）
    // 包含目標角色名稱，讓通知訊息能顯示完整資訊
    emitSkillUsed(characterId, {
      characterId,
      skillId: skill.id,
      skillName: skill.name,
      checkType: skill.checkType,
      checkPassed,
      checkResult: finalCheckResult,
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      targetCharacterId: isAffectingOthers ? targetCharacterId : undefined,
      targetCharacterName,
    }).catch((error) => {
      console.error('Failed to emit skill.used event', error);
    });

    // Phase 7.7: 技能使用通知發送完成後，觸發自動揭露評估（items_acquired）
    // 延遲到此處執行，確保揭露通知不會搶先於技能結果通知送達客戶端
    if (pendingReveal) {
      executeAutoReveal(pendingReveal.receiverId, { type: 'items_acquired' })
        .catch((error) => console.error('[skill-use] Failed to execute auto-reveal', error));
    }

    // Step 9: needsTargetItemSelection 已在效果執行前提前返回，此處不再需要

    // Toast 訊息：保持簡潔，詳細資訊由 WebSocket 通知處理
    let toastMessage = '';
    if (checkPassed) {
      toastMessage = '技能使用成功';
      if (effectsApplied.length > 0) {
        toastMessage += `，效果：${effectsApplied.join('、')}`;
      }
    } else {
      toastMessage = '檢定失敗，技能未生效';
    }

    return {
      success: true,
      data: {
        skillUsed: true,
        checkPassed,
        checkResult: finalCheckResult,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        targetCharacterName,
      },
      message: toastMessage,
    };
  });
}
