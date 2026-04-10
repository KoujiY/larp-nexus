'use server';

import { revalidatePath } from 'next/cache';
import { withAction } from '@/lib/actions/action-wrapper';
import { validatePlayerAccess } from '@/lib/auth/session';
import type { CharacterDocument } from '@/lib/db/models';
import { emitItemTransferred, emitItemUsed, emitRoleUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { isCharacterInContest } from '@/lib/contest-tracker';
import { handleItemCheck } from '@/lib/item/check-handler';
import { executeItemEffects } from '@/lib/item/item-effect-executor';
import { executeAutoReveal } from '@/lib/reveal/auto-reveal-evaluator';
import { checkExpiredEffects } from './temporary-effects'; // Phase 8: 過期效果檢查
import { getCharacterData } from '@/lib/game/get-character-data'; // Phase 10.4: 統一讀取
import { getItemEffects } from '@/lib/item/get-item-effects';
import { updateCharacterData } from '@/lib/game/update-character-data'; // Phase 10.4: 統一寫入
import { buildEquipmentBoostUpdates } from '@/lib/item/apply-equipment-boosts';
import type { ApiResponse } from '@/types/api';
import type { Stat, StatBoost } from '@/types/character';

/**
 * 使用物品
 * Phase 8: 添加檢定系統支援
 */
export async function useItem(
  characterId: string,
  itemId: string,
  targetCharacterId?: string,
  checkResult?: number, // Phase 8: 檢定結果（由前端傳入，如果是 random 類型）
  targetItemId?: string // Phase 7: 目標物品 ID（用於 item_take 和 item_steal 效果）
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
  // 非對抗偷竊/移除：使用成功後需要選擇目標物品
  needsTargetItemSelection?: boolean;
  targetCharacterId?: string;
}>> {
  return withAction(async () => {
    // 驗證玩家是否已解鎖此角色（防止未授權操作）
    if (!(await validatePlayerAccess(characterId))) {
      return { success: false, error: 'UNAUTHORIZED', message: '未授權操作此角色' };
    }

    // Phase 8: 使用物品前檢查並處理過期的時效性效果
    // 必須在 getCharacterData 之前執行，否則讀取的數值可能包含已過期效果的加值
    await checkExpiredEffects(characterId);

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    const character = await getCharacterData(characterId);

    // 找到目標物品
    const items = character.items || [];
    const itemIndex = items.findIndex((i: { id: string }) => i.id === itemId);
    if (itemIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此物品',
      };
    }

    const item = items[itemIndex];

    // 裝備類型物品不能透過「使用」操作，需透過 toggleEquipment
    if (item.type === 'equipment') {
      return {
        success: false,
        error: 'INVALID_TYPE',
        message: '裝備類型物品請使用「裝備/卸除」功能',
      };
    }

    const now = new Date();

    // Phase 8: 取得物品檢定類型
    const itemCheckType = item.checkType || 'none';

    // Phase 8: 檢查使用者本身是否正在進行對抗檢定（無論物品是否需要檢定）
    const userContestStatus = isCharacterInContest(characterId);
    if (userContestStatus.inContest) {
      return {
        success: false,
        error: 'USER_IN_CONTEST',
        message: '檢定進行中，暫時無法使用物品',
      };
    }

    // Phase 6.5: 判斷是否影響他人並驗證目標
    const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;
    let targetCharacter: CharacterDocument | null = null;
    if (isAffectingOthers) {
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
          message: '目標角色正在進行對抗檢定，暫時無法對其使用物品',
        };
      }
    }

    // 檢查消耗品數量
    if (item.type === 'consumable' && item.quantity <= 0) {
      return {
        success: false,
        error: 'ITEM_DEPLETED',
        message: '物品數量不足',
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
    // §4: 由 effects 陣列整體推導 targetType（Wizard mutex 規則保證 other / any 不並存）
    //   - 有任一效果 targetType = 'other' 或 'any' → 需要選擇目標角色
    //   - 只有 self 效果 → 不需要目標角色
    //   - 對抗檢定類型 → 固定需要對手作為目標
    const effects = getItemEffects(item);
    const hasOtherEffect = effects.some((e: { targetType?: string }) => e.targetType === 'other');
    const hasAnyEffect = effects.some((e: { targetType?: string }) => e.targetType === 'any');
    const hasNonSelfEffect = hasOtherEffect || hasAnyEffect;
    const isContestCheck = itemCheckType === 'contest' || itemCheckType === 'random_contest';
    const requiresTarget = hasNonSelfEffect || isContestCheck;

    const hasItemTakeOrSteal = effects.some((e: { type?: string }) => e.type === 'item_take' || e.type === 'item_steal');

    if (requiresTarget) {
      if (!targetCharacterId) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: '此物品需要選擇目標角色',
        };
      }

      if (!targetCharacter) {
        // Phase 10.4: 使用統一的讀取函數
        targetCharacter = await getCharacterData(targetCharacterId);
        if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
          return {
            success: false,
            error: 'INVALID_TARGET',
            message: '目標角色不在同一劇本內',
          };
        }
      }

      // §4: 目標類型驗證（mutex 規則下只需檢查 other / contest 的非自身限制）
      //   - hasOtherEffect: 至少一個效果明確指定「對方」→ 不得對自己使用
      //   - isContestCheck: 對抗檢定本質上需要對手 → 不得對自己發起
      //   - hasAnyEffect（單獨存在）: 允許自選，不做限制
      //   - 純 self 效果: 不會進入此分支
      if ((hasOtherEffect || isContestCheck) && targetCharacterId === characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此物品不能對自己使用',
        };
      }
    }

    // 偷竊/移除物品效果的 targetItemId 不再在此處驗證
    // 對抗檢定：targetItemId 在對抗結束後由 selectTargetItemForContest 處理
    // 非對抗檢定：targetItemId 在使用成功後由 select-target-item action 處理（延遲選擇）

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
      if (errorMessage.includes('隨機檢定設定不完整') || errorMessage.includes('物品隨機檢定設定不完整')) {
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
    if (itemCheckType === 'contest' || itemCheckType === 'random_contest') {
      // Phase 10.4: 使用統一的寫入函數（自動判斷 Baseline/Runtime）
      await updateCharacterData(characterId, {
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
        message: `已對 ${targetCharacterName} 發起對抗檢定`,
      };
    }

    // Step 9: 非對抗偷竊/移除：檢定通過但尚未選擇目標物品 → 延遲所有效果
    // 所有效果（含 stat_change）都延遲到選擇目標物品後由 selectTargetItemAfterUse 一起執行
    // 即使目標無物品，仍走延遲流程 — 用戶點「確認」後觸發結算（含「無物品可互動」通知）
    if (hasItemTakeOrSteal && !targetItemId && checkPassed) {
      // 仍然更新使用記錄
      const earlyUsageUpdates: Record<string, unknown> = {};
      earlyUsageUpdates[`items.${itemIndex}.lastUsedAt`] = now;
      if (item.usageLimit && item.usageLimit > 0) {
        const newUsageCount = (item.usageCount || 0) + 1;
        earlyUsageUpdates[`items.${itemIndex}.usageCount`] = newUsageCount;
      } else if (item.type === 'consumable') {
        const newQuantity = Math.max(0, item.quantity - 1);
        earlyUsageUpdates[`items.${itemIndex}.quantity`] = newQuantity;
      }
      if (Object.keys(earlyUsageUpdates).length > 0) {
        await updateCharacterData(characterId, { $set: earlyUsageUpdates });
      }

      const targetCharacterName = targetCharacter?.name || '目標角色';
      return {
        success: true,
        data: {
          itemUsed: true,
          checkPassed: true,
          checkResult: finalCheckResult,
          targetCharacterName: isAffectingOthers ? targetCharacterName : undefined,
          needsTargetItemSelection: true,
          targetCharacterId,
        },
        message: `物品使用成功，請選擇要${effects.some((e: { type?: string }) => e.type === 'item_steal') ? '偷竊' : '移除'}的目標物品`,
      };
    }

    // 準備更新
    const usageUpdates: Record<string, unknown> = {};

    // 總是記錄物品使用時間（用於追蹤使用歷史）
    usageUpdates[`items.${itemIndex}.lastUsedAt`] = now;

    // 處理使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      // 有使用次數限制：每次使用增加 usageCount
      const newUsageCount = (item.usageCount || 0) + 1;
      usageUpdates[`items.${itemIndex}.usageCount`] = newUsageCount;
      // 不刪除物品，讓它保留在清單中顯示為已用盡
    } else {
      // 沒有使用次數限制：消耗品每次使用減少數量
      if (item.type === 'consumable') {
        const newQuantity = Math.max(0, item.quantity - 1);
        usageUpdates[`items.${itemIndex}.quantity`] = newQuantity;
        // 不刪除物品，讓它保留在清單中顯示為數量 0
      }
    }

    // Phase 8: 執行效果（只有在檢定成功時才執行）
    let effectMessages: string[] = [];
    if (checkPassed && effects.length > 0) {
      try {
        const effectResult = await executeItemEffects(item, character, targetCharacterId, targetItemId);
        effectMessages = effectResult.effectsApplied;
        // 角色資料已由 executeItemEffects 更新
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
        if (errorMessage.includes('請選擇目標物品')) {
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
        if (errorMessage.includes('沒有此物品')) {
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
      // Phase 10.4: 使用統一的寫入函數（自動判斷 Baseline/Runtime）
      await updateCharacterData(characterId, { $set: usageUpdates });
    }
    revalidatePath(`/c/${characterId}`);

    // 若跨角色，重新驗證目標角色路徑
    if (isAffectingOthers && targetCharacterId) {
      revalidatePath(`/c/${targetCharacterId}`);
    }

    // 合併所有效果訊息
    const finalEffectMessage = effectMessages.length > 0 ? effectMessages.join('、') : undefined;

    // WebSocket 事件：物品使用通知（非阻斷）
    emitItemUsed(characterId, {
      characterId,
      itemId: item.id,
      itemName: item.name,
      checkPassed,
      checkResult: finalCheckResult,
      effectsApplied: effectMessages.length > 0 ? effectMessages : undefined,
      targetCharacterId: isAffectingOthers ? targetCharacterId : undefined,
      targetCharacterName: isAffectingOthers ? targetCharacter?.name : undefined,
    }).catch((error) => {
      console.error('Failed to emit item.used event', error);
    });

    // Toast 訊息：保持簡潔，詳細資訊由 WebSocket 通知處理
    let toastMessage = '';
    if (checkPassed) {
      toastMessage = '物品使用成功';
      if (finalEffectMessage) {
        toastMessage += `，效果：${finalEffectMessage}`;
      }
    } else {
      toastMessage = '檢定未通過，物品未生效';
    }

    return {
      success: true,
      data: {
        itemUsed: true,
        effectApplied: checkPassed ? finalEffectMessage || undefined : undefined,
        targetCharacterName: isAffectingOthers ? targetCharacter?.name : undefined,
        checkPassed,
        checkResult: finalCheckResult,
      },
      message: toastMessage,
    };
  });
}

/**
 * 轉移物品
 */
export async function transferItem(
  characterId: string,
  itemId: string,
  targetCharacterId: string,
  quantity: number
): Promise<ApiResponse<{ transferred: boolean; transferredQuantity: number }>> {
  return withAction(async () => {

    // 驗證玩家是否已解鎖此角色（防止未授權操作）
    if (!(await validatePlayerAccess(characterId))) {
      return { success: false, error: 'UNAUTHORIZED', message: '未授權操作此角色' };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        success: false,
        error: 'INVALID_QUANTITY',
        message: '轉移數量必須為正整數',
      };
    }

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    const character = await getCharacterData(characterId);
    const targetCharacter = await getCharacterData(targetCharacterId);

    // 驗證在同一劇本
    if (character.gameId.toString() !== targetCharacter.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '只能轉移給同一劇本的角色',
      };
    }

    // 找到來源物品
    const sourceItems = character.items || [];
    const sourceIndex = sourceItems.findIndex((i: { id: string }) => i.id === itemId);
    if (sourceIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此物品',
      };
    }

    const sourceItem = sourceItems[sourceIndex];

    // 檢查數量是否足夠
    if (sourceItem.quantity < quantity) {
      return {
        success: false,
        error: 'INSUFFICIENT_QUANTITY',
        message: '物品數量不足',
      };
    }

    // 檢查是否可轉移
    if (!sourceItem.isTransferable) {
      return {
        success: false,
        error: 'NOT_TRANSFERABLE',
        message: '此物品不可轉移',
      };
    }

    // 檢查目標是否已有此物品
    const targetItems = targetCharacter.items || [];
    const targetIndex = targetItems.findIndex((i: { id: string }) => i.id === itemId);

    // 準備目標角色的更新
    const targetUpdates: Record<string, unknown> = {};

    if (targetIndex !== -1) {
      // 目標已有此物品，增加數量
      const newTargetQuantity = targetItems[targetIndex].quantity + quantity;
      targetUpdates[`items.${targetIndex}.quantity`] = newTargetQuantity;
    } else {
      // 目標沒有此物品，新增物品
      // Phase 10.4: 使用 JSON 序列化來複製對象，避免 Mongoose document 類型問題
      const newItem = {
        ...JSON.parse(JSON.stringify(sourceItem)),
        quantity,
        acquiredAt: new Date(),
        // 裝備轉移時自動卸除
        ...(sourceItem.type === 'equipment' ? { equipped: false } : {}),
      };
      delete newItem._id; // 移除 MongoDB ID
      targetUpdates.$push = { items: newItem };
    }

    // 準備來源角色的更新
    const newSourceQuantity = sourceItem.quantity - quantity;
    const sourceUpdates: Record<string, unknown> = {};

    if (newSourceQuantity <= 0) {
      // 數量為 0，移除物品
      sourceUpdates.$pull = { items: { id: itemId } };
    } else {
      // 更新數量
      sourceUpdates[`items.${sourceIndex}.quantity`] = newSourceQuantity;
    }

    // 裝備轉移時：若源端物品為已穿戴裝備，需 revert stat boosts
    // 避免 stat boosts 殘留在源端角色上（即使物品已轉移走）
    let equipRevertUpdates: Record<string, number> = {};
    if (sourceItem.type === 'equipment' && sourceItem.equipped) {
      const currentStats = (character.stats || []) as Stat[];
      const boosts = (sourceItem.statBoosts || []) as StatBoost[];
      if (boosts.length > 0) {
        equipRevertUpdates = buildEquipmentBoostUpdates(currentStats, boosts, 'revert');
      }
      // 若物品未被移除（qty > 0），需標記為未穿戴
      if (newSourceQuantity > 0) {
        sourceUpdates[`items.${sourceIndex}.equipped`] = false;
      }
    }

    // Phase 10.4: 使用統一的寫入函數（自動判斷 Baseline/Runtime）
    // 執行更新：先更新目標角色，再更新來源角色
    if (targetUpdates.$push) {
      await updateCharacterData(targetCharacterId, {
        $push: targetUpdates.$push,
      });
    } else {
      await updateCharacterData(targetCharacterId, {
        $set: targetUpdates,
      });
    }

    // 組合來源角色更新（物品移除/減量 + stat boost revert）
    const hasEquipRevert = Object.keys(equipRevertUpdates).length > 0;
    if (sourceUpdates.$pull) {
      const sourceOp: Record<string, unknown> = {
        $pull: sourceUpdates.$pull,
      };
      if (hasEquipRevert) {
        sourceOp.$set = equipRevertUpdates;
      }
      await updateCharacterData(characterId, sourceOp);
    } else {
      const mergedSet = { ...sourceUpdates, ...(hasEquipRevert ? equipRevertUpdates : {}) };
      await updateCharacterData(characterId, {
        $set: mergedSet,
      });
    }

    // WebSocket 事件
    // 轉出方（characterId）：只發送 item.transferred 通知，不發送 inventoryUpdated
    // 這樣轉出方只會看到「物品轉移」通知，不會看到「物品更新」通知
    // 接受方（targetCharacterId）：只發送 item.transferred 通知，不發送 inventoryUpdated
    // 這樣接受方只會看到「物品獲得」通知，不會看到「物品更新」通知
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

    // Phase 9: 發送 role.updated 事件給兩個角色，讓GM端能同步更新物品列表
    // 重新載入兩個角色的最新資料
    // Phase 10.4: 使用統一讀取（自動判斷 Baseline/Runtime）
    const [updatedSourceCharacter, updatedTargetCharacter] = await Promise.all([
      getCharacterData(characterId),
      getCharacterData(targetCharacterId),
    ]);

    if (updatedSourceCharacter && updatedTargetCharacter) {
      const sourceCleanItems = cleanItemData(updatedSourceCharacter.items);
      const targetCleanItems = cleanItemData(updatedTargetCharacter.items);


      // 發送 role.updated 給兩個角色，包含最新的物品列表
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
    }

    // Phase 7.7: 物品轉移後，為接收方觸發自動揭露評估（items_acquired）
    executeAutoReveal(targetCharacterId, { type: 'items_acquired' })
      .catch((error) => console.error('[transferItem] Failed to execute auto-reveal for target', error));

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
  });
}
