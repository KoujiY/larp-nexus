'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import type { CharacterDocument } from '@/lib/db/models';
import { emitRoleUpdated, emitCharacterAffected, emitInventoryUpdated, emitItemTransferred } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';

/**
 * 使用道具
 */
export async function useItem(
  characterId: string,
  itemId: string,
  targetCharacterId?: string
): Promise<ApiResponse<{ itemUsed: boolean; effectApplied?: string; targetCharacterName?: string }>> {
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

    // 準備更新
    const usageUpdates: Record<string, unknown> = {};
    const targetStatUpdates: Record<string, unknown> = {};
    let effectMessage = '';

    // 更新冷卻時間
    if (item.cooldown && item.cooldown > 0) {
      usageUpdates[`items.${itemIndex}.lastUsedAt`] = now;
    }

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

    // 執行效果
    let statUpdatePayload: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> | undefined;
    const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];
    if (item.effect) {
      if (
        item.effect.type === 'stat_change' &&
        item.effect.targetStat &&
        typeof item.effect.value === 'number'
      ) {
        const effectTarget = targetCharacter || character;
        const stats = effectTarget.stats || [];
        const statIndex = stats.findIndex((s: { name: string }) => s.name === item.effect.targetStat);

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
          const effectWithTarget = item.effect as ItemEffectExtended;
          const target = effectWithTarget.statChangeTarget || 'value';
          const delta = item.effect.value;
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
                effectMessage = `${item.effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}，目前值同步調整`;
              } else {
                // 只修改最大值，確保目前值不超過新最大值
                newValue = Math.min(beforeValue, newMax);
                deltaValue = newValue - beforeValue;
                targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                effectMessage = `${item.effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}`;
              }
            }
          } else {
            // 修改目前值
            newValue = Math.max(0, beforeValue + delta);
            if (beforeMax !== null) newValue = Math.min(newValue, beforeMax);
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectMessage = `${item.effect.targetStat} ${delta > 0 ? '+' : ''}${delta}`;
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
      } else if (item.effect.type === 'custom' && item.effect.description) {
        effectMessage = item.effect.description;
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
      emitRoleUpdated(targetId, {
        characterId: targetId,
        updates: {
          stats: statUpdatePayload,
        },
      }).catch((error) => console.error('Failed to emit role.updated (item stat)', error));

      if (isAffectingOthers && crossCharacterChanges.length > 0) {
        emitCharacterAffected(targetId, {
          targetCharacterId: targetId,
          sourceCharacterId: characterId,
          sourceCharacterName: character.name,
          sourceType: 'item',
          sourceName: item.name,
          effectType: 'stat_change',
          changes: { stats: crossCharacterChanges },
        }).catch((error) => console.error('Failed to emit character.affected (item)', error));
      }
    }

    return {
      success: true,
      data: {
        itemUsed: true,
        effectApplied: effectMessage || undefined,
        targetCharacterName: isAffectingOthers ? targetCharacter?.name : undefined,
      },
      message: '道具使用成功',
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

    // 準備更新
    const updates: Record<string, unknown> = {};

    if (targetIndex !== -1) {
      // 目標已有此道具，增加數量
      const newTargetQuantity = targetItems[targetIndex].quantity + quantity;
      updates[`items.${targetIndex}.quantity`] = newTargetQuantity;
    } else {
      // 目標沒有此道具，新增道具
      const newItem = {
        ...sourceItem.toObject(),
        quantity,
        acquiredAt: new Date(),
      };
      delete newItem._id; // 移除 MongoDB ID
      updates.$push = { items: newItem };
    }

    // 減少來源數量
    const newSourceQuantity = sourceItem.quantity - quantity;
    if (newSourceQuantity <= 0) {
      // 數量為 0，移除道具
      updates.$pull = { items: { id: itemId } };
    } else {
      // 更新數量
      updates[`items.${sourceIndex}.quantity`] = newSourceQuantity;
    }

    // 執行更新
    await Character.findByIdAndUpdate(targetCharacterId, updates);
    await Character.findByIdAndUpdate(characterId, {
      [newSourceQuantity <= 0 ? '$pull' : '$set']: newSourceQuantity <= 0
        ? { items: { id: itemId } }
        : { [`items.${sourceIndex}.quantity`]: newSourceQuantity }
    });

    // WebSocket 事件
    emitInventoryUpdated(characterId, {
      characterId,
      item: {
        id: sourceItem.id,
        name: sourceItem.name,
        description: sourceItem.description || '',
        imageUrl: sourceItem.imageUrl,
        acquiredAt: sourceItem.acquiredAt?.toISOString(),
      },
      action: newSourceQuantity <= 0 ? 'deleted' : 'updated',
    }).catch((error) => console.error('Failed to emit inventory.updated (transfer source)', error));

    emitInventoryUpdated(targetCharacterId, {
      characterId: targetCharacterId,
      item: {
        id: sourceItem.id,
        name: sourceItem.name,
        description: sourceItem.description || '',
        imageUrl: sourceItem.imageUrl,
        acquiredAt: targetIndex === -1 ? new Date().toISOString() : undefined,
      },
      action: targetIndex === -1 ? 'added' : 'updated',
    }).catch((error) => console.error('Failed to emit inventory.updated (transfer target)', error));

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

    revalidatePath(`/c/${characterId}`);
    revalidatePath(`/c/${targetCharacterId}`);

    return {
      success: true,
      data: {
        transferred: true,
        transferredQuantity: quantity,
      },
      message: `已轉移 ${quantity} 個 ${sourceItem.name}`,
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
