/**
 * 共用效果執行器
 *
 * 提供三個 effect executor（item / skill / contest）共用的純函數與 DB 輔助函式：
 *   - computeStatChange()   — 純函數，計算數值變化（不含 DB / WebSocket 操作）
 *   - applyItemTransfer()   — 執行道具移除／偷竊的 DB 操作與 WebSocket 通知
 *
 * 各 executor 自行負責的差異邏輯：
 *   - log 記錄（action 名稱各不相同）
 *   - 最終 role.updated / character.affected 的 stats 通知時機
 */

import { emitInventoryUpdated, emitCharacterAffected, emitRoleUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { getCharacterData } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';

// ─── 公開型別 ──────────────────────────────────────────────────────────────────

/** stat 物件最小結構 */
export interface StatLike {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}

/** computeStatChange 計算結果 */
export interface StatChangeResult {
  /** 實際修改的目標欄位（maxValue 不存在時退回 value） */
  effectiveTarget: 'value' | 'maxValue';
  newValue: number;
  newMaxValue: number | undefined; // undefined = 此 stat 沒有 maxValue
  deltaValue: number;
  deltaMax: number;
  message: string;
}

/** applyItemTransfer 最小道具結構 */
export interface ItemLike {
  id: string;
  name: string;
  description: string;
  quantity: number;
  acquiredAt?: Date;
  imageUrl?: string;
  [key: string]: unknown; // 允許額外欄位（usageCount, tags, effects 等）
}

/** applyItemTransfer 呼叫參數 */
export interface ItemTransferParams {
  /** 失去道具的角色（效果作用對象） */
  targetIdStr: string;
  /** 偷竊時取得道具的角色（item_take 時不使用） */
  sourceIdStr: string;
  targetItem: ItemLike;
  effectType: 'item_take' | 'item_steal';
  notification: {
    sourceCharacterId: string;
    sourceCharacterName: string;
    sourceType: 'item' | 'skill';
    /** 可傳 '' 以隱藏技能/道具名稱（contest executor 隱私保護） */
    sourceName: string;
    hasStealthTag: boolean;
  };
}

/** applyItemTransfer 執行結果 */
export interface ItemTransferResult {
  message: string;
  /** item_steal 後需延遲觸發自動揭露的接收方 ID */
  pendingRevealReceiverId?: string;
}

// ─── computeStatChange — 純函數 ───────────────────────────────────────────────

/**
 * 計算 stat 數值變化（不含任何 DB / WebSocket 操作）
 *
 * @param stat            目標 stat 物件
 * @param delta           變化量（正為增加，負為減少）
 * @param statChangeTarget 修改 'value' 或 'maxValue'
 * @param syncValue       是否同步修改目前值（只在 maxValue 目標時生效）
 */
export function computeStatChange(
  stat: StatLike,
  delta: number,
  statChangeTarget: 'value' | 'maxValue',
  syncValue: boolean
): StatChangeResult {
  const beforeValue = stat.value;
  const beforeMax = stat.maxValue ?? null; // null = 無 maxValue

  // 若目標無 maxValue 但要求改 maxValue，退回改 value
  const effectiveTarget: 'value' | 'maxValue' =
    statChangeTarget === 'maxValue' && beforeMax === null ? 'value' : statChangeTarget;

  let newValue = beforeValue;
  let newMaxValue: number | undefined = beforeMax ?? undefined;
  let deltaValue = 0;
  let deltaMax = 0;
  let message = '';

  if (effectiveTarget === 'maxValue' && beforeMax !== null) {
    // 修改最大值（最小 1）
    const computedMax = Math.max(1, beforeMax + delta);
    deltaMax = computedMax - beforeMax;
    newMaxValue = computedMax;

    if (syncValue) {
      // 同步修改目前值
      newValue = Math.max(0, Math.min(beforeValue + delta, computedMax));
      deltaValue = newValue - beforeValue;
      message = `${stat.name} 最大值 ${delta > 0 ? '+' : ''}${delta}，目前值同步調整`;
    } else {
      // 只修改最大值，確保目前值不超過新最大值
      newValue = Math.min(beforeValue, computedMax);
      deltaValue = newValue - beforeValue;
      message = `${stat.name} 最大值 ${delta > 0 ? '+' : ''}${delta}`;
    }
  } else {
    // 修改目前值（下限 0，上限 maxValue）
    newValue = Math.max(0, beforeValue + delta);
    if (beforeMax !== null) {
      newValue = Math.min(newValue, beforeMax);
    }
    deltaValue = newValue - beforeValue;
    message = `${stat.name} ${delta > 0 ? '+' : ''}${delta}`;
  }

  return { effectiveTarget, newValue, newMaxValue, deltaValue, deltaMax, message };
}

// ─── applyItemTransfer — DB + 通知 ───────────────────────────────────────────

/**
 * 執行道具移除（item_take）或偷竊（item_steal）的 DB 操作與 WebSocket 通知
 *
 * DB 策略：統一使用 $pull + $push（與 skill / contest executor 一致）
 *   - 移除：從 targetIdStr 的 items 中 $pull 指定道具；數量 > 1 時 $push 減量版本
 *   - 偷竊：額外重新讀取 sourceIdStr 的最新資料，$push 道具給來源角色
 *
 * 不在此處發送最終 role.updated（各 executor 有不同的時機需求）
 */
export async function applyItemTransfer(
  params: ItemTransferParams
): Promise<ItemTransferResult> {
  const { targetIdStr, sourceIdStr, targetItem, effectType, notification } = params;
  const { quantity } = targetItem;

  // Step 1: 從目標角色移除道具
  await updateCharacterData(targetIdStr, {
    $pull: { items: { id: targetItem.id } },
  });

  // 數量 > 1 時把減量版本推回目標角色
  if (quantity > 1) {
    const reducedItem = Object.fromEntries(
      Object.entries({ ...targetItem as unknown as Record<string, unknown>, quantity: quantity - 1 })
        .filter(([k]) => k !== '_id' && k !== '__v')
    );
    await updateCharacterData(targetIdStr, {
      $push: { items: reducedItem },
    });
  }

  let pendingRevealReceiverId: string | undefined;

  if (effectType === 'item_steal') {
    // Step 2a: 重新讀取來源角色（確保 items 為最新狀態）
    const updatedSource = await getCharacterData(sourceIdStr);
    const sourceItems = updatedSource?.items || [];
    const existingIndex = sourceItems.findIndex((i: { id: string }) => i.id === targetItem.id);

    if (existingIndex !== -1) {
      // 已有此道具：增加數量
      const existing = sourceItems[existingIndex];
      const newQuantity = (existing.quantity || 1) + 1;

      await updateCharacterData(sourceIdStr, {
        $pull: { items: { id: targetItem.id } },
      });
      const updatedItem = Object.fromEntries(
        Object.entries({ ...JSON.parse(JSON.stringify(existing)) as Record<string, unknown>, quantity: newQuantity })
          .filter(([k]) => k !== '_id' && k !== '__v')
      );
      await updateCharacterData(sourceIdStr, {
        $push: { items: updatedItem },
      });
    } else {
      // 沒有此道具：新增完整複本
      const stolenItem = Object.fromEntries(
        Object.entries({ ...JSON.parse(JSON.stringify(targetItem)) as Record<string, unknown>, quantity: 1, acquiredAt: new Date() })
          .filter(([k]) => k !== '_id' && k !== '__v')
      );
      await updateCharacterData(sourceIdStr, {
        $push: { items: stolenItem },
      });
    }

    pendingRevealReceiverId = sourceIdStr;
  }

  // Step 3: WebSocket 通知

  // 3a. 通知目標角色 inventory 變化
  emitInventoryUpdated(targetIdStr, {
    characterId: targetIdStr,
    item: {
      id: targetItem.id,
      name: targetItem.name,
      description: targetItem.description || '',
      imageUrl: targetItem.imageUrl,
      acquiredAt: targetItem.acquiredAt?.toISOString(),
    },
    action: quantity <= 1 ? 'deleted' : 'updated',
  }).catch((err) => console.error('[shared-effect-executor] emitInventoryUpdated failed', err));

  // 3b. 通知目標角色跨角色影響
  emitCharacterAffected(targetIdStr, {
    targetCharacterId: targetIdStr,
    sourceCharacterId: notification.sourceCharacterId,
    sourceCharacterName: notification.hasStealthTag ? '' : notification.sourceCharacterName,
    sourceType: notification.sourceType,
    sourceName: notification.sourceName,
    sourceHasStealthTag: notification.hasStealthTag,
    effectType: effectType === 'item_steal' ? 'item_steal' : 'item_take',
    changes: {
      items: [{
        id: targetItem.id,
        name: targetItem.name,
        action: effectType === 'item_steal' ? 'stolen' : 'removed',
      }],
    },
  }).catch((err) => console.error('[shared-effect-executor] emitCharacterAffected failed', err));

  // 3c. 發送 role.updated 讓 GM 端同步最新道具列表（目標 + 來源）
  const charIds = effectType === 'item_steal'
    ? [targetIdStr, sourceIdStr]
    : [targetIdStr];

  const latestChars = await Promise.all(charIds.map((id) => getCharacterData(id)));
  for (let i = 0; i < charIds.length; i++) {
    const char = latestChars[i];
    if (char) {
      const cleanItems = cleanItemData(char.items);
      emitRoleUpdated(charIds[i], {
        characterId: charIds[i],
        updates: { items: cleanItems as unknown as Array<Record<string, unknown>> },
      }).catch((err) =>
        console.error(`[shared-effect-executor] emitRoleUpdated failed for ${charIds[i]}`, err)
      );
    }
  }

  const message = effectType === 'item_steal'
    ? `偷竊了 ${targetItem.name}`
    : `移除了 ${targetItem.name}`;

  return { message, pendingRevealReceiverId };
}
