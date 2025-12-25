'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import type { CharacterDocument } from '@/lib/db/models';
import { emitItemTransferred, emitRoleUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { isCharacterInContest } from '@/lib/contest-tracker';
import { handleItemCheck } from '@/lib/item/check-handler';
import { executeItemEffects } from '@/lib/item/item-effect-executor';
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
    let checkResultData;
    try {
      checkResultData = await handleItemCheck(item, character, checkResult, targetCharacterId);
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
      if (errorMessage.includes('隨機檢定設定不完整') || errorMessage.includes('道具隨機檢定設定不完整')) {
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

    // 如果是對抗檢定，需要提前返回
    if (checkType === 'contest') {
      // 更新道具使用記錄（但不執行效果，效果將在防守方回應後執行）
      await Character.findByIdAndUpdate(characterId, {
        $set: {
          [`items.${itemIndex}.lastUsedAt`]: now,
          [`items.${itemIndex}.usageCount`]: (item.usageCount || 0) + 1,
        },
      });

      // 獲取目標角色名稱（用於返回訊息）
      const targetCharacterName = targetCharacter?.name || '目標角色';

      return {
        success: true,
        data: {
          itemUsed: true,
          checkPassed: false, // 等待防守方回應
          contestId: checkResultData.contestId,
          attackerValue: checkResultData.attackerValue,
          defenderValue: checkResultData.defenderValue,
          preliminaryResult: checkResultData.preliminaryResult,
        },
        message: `對抗檢定請求已發送給 ${targetCharacterName}，等待回應...`,
      };
    }

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
    let effectMessages: string[] = [];
    if (checkPassed && effects.length > 0) {
      try {
        const effectResult = await executeItemEffects(item, character, targetCharacterId, targetItemId);
        effectMessages = effectResult.effectsApplied;
        // 重新載入角色資料以確保資料是最新的
        const updatedCharacter = await Character.findById(characterId);
        if (updatedCharacter) {
          // 角色資料已由 executeItemEffects 更新
        }
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

    // 執行更新：施放者（使用記錄）
    if (Object.keys(usageUpdates).length > 0) {
      await Character.findByIdAndUpdate(characterId, { $set: usageUpdates });
    }
    revalidatePath(`/c/${characterId}`);

    // 若跨角色，重新驗證目標角色路徑
    if (isAffectingOthers && targetCharacterId) {
      revalidatePath(`/c/${targetCharacterId}`);
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
      }).catch((error: unknown) => {
        console.error('[transferItem] Failed to emit role.updated (source character items)', error);
      });

      await emitRoleUpdated(targetCharacterId, {
        characterId: targetCharacterId,
        updates: {
          items: targetCleanItems as unknown as Array<Record<string, unknown>>,
        },
      }).catch((error: unknown) => {
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
