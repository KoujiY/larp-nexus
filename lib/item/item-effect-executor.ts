/**
 * 道具效果執行器（薄殼）
 *
 * 核心邏輯委派至 shared-effect-executor：
 *   - executeEffectBatch()        → 效果迴圈與累積
 *   - emitAffectedNotifications() → DB 套用與 WebSocket 通知
 *
 * 本檔案僅保留道具專屬邏輯：
 *   - getItemEffects() 向後兼容讀取
 *   - 目標角色載入與驗證
 *   - writeLog（action: 'item_use'）
 */

import dbConnect from '@/lib/db/mongodb';
import type { CharacterDocument } from '@/lib/db/models';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { writeLog } from '@/lib/logs/write-log';
import { getItemEffects } from '@/lib/item/get-item-effects';
import type { ItemType } from '@/lib/db/types/character-types';
import { executeEffectBatch, emitAffectedNotifications } from '@/lib/effects/shared-effect-executor';

/**
 * 執行道具效果的結果
 */
export interface ItemEffectExecutionResult {
  effectsApplied: string[];
  updatedCharacter: CharacterDocument;
  updatedTarget?: CharacterDocument;
  /** 需要延遲執行的自動揭露（呼叫者應在發送完通知後再觸發） */
  pendingReveal?: { receiverId: string };
}

/**
 * 執行道具效果
 *
 * @param item 道具
 * @param character 角色
 * @param targetCharacterId 目標角色 ID（跨角色效果用）
 * @param targetItemId 目標道具 ID（用於 item_take 和 item_steal 效果）
 * @returns 執行結果
 */
export async function executeItemEffects(
  item: ItemType,
  character: CharacterDocument,
  targetCharacterId?: string,
  targetItemId?: string
): Promise<ItemEffectExecutionResult> {
  await dbConnect();

  // 統一讀取效果列表（向後兼容已棄用的 effect 欄位）
  const effects = getItemEffects(item);

  if (effects.length === 0) {
    const updatedCharacter = await getCharacterData(getBaselineCharacterId(character));
    return { effectsApplied: [], updatedCharacter };
  }

  const characterId = getBaselineCharacterId(character);

  // 決定效果作用對象
  let targetCharacter: CharacterDocument | null = null;
  if (targetCharacterId) {
    targetCharacter = await getCharacterData(targetCharacterId) as CharacterDocument;
    if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
      throw new Error('目標角色不在同一劇本內');
    }
  }

  // 效果迴圈
  const batchResult = await executeEffectBatch({
    effects,
    character,
    targetCharacter,
    targetCharacterId,
    sourceType: 'item',
    sourceId: item.id,
    sourceName: item.name,
    sourceTags: item.tags || [],
    checkType: item.checkType || 'none',
    targetItemId,
  });

  // DB 套用 + WebSocket 通知
  const { updatedCharacter, updatedTarget } = await emitAffectedNotifications({
    characterId,
    character,
    targetCharacterId,
    targetCharacter: batchResult.targetCharacter,
    sourceType: 'item',
    sourceName: item.name,
    sourceTags: item.tags || [],
    batchResult,
  });

  // 合併 self + target 的 stat changes 作為日誌紀錄
  const allStatUpdates = [...batchResult.selfStatUpdates, ...batchResult.targetStatUpdatesList];

  await writeLog({
    gameId: character.gameId.toString(),
    characterId,
    actorType: 'character',
    actorId: characterId,
    action: 'item_use',
    details: {
      itemId: item.id,
      itemName: item.name,
      targetCharacterId: targetCharacterId || undefined,
      targetCharacterName: batchResult.targetCharacter?.name || undefined,
      effectsApplied: batchResult.effectMessages,
      statChanges: allStatUpdates.length > 0 ? allStatUpdates : undefined,
      isAffectingOthers: batchResult.hasTargetUpdates,
    },
  });

  return {
    effectsApplied: batchResult.effectMessages,
    updatedCharacter,
    updatedTarget,
    pendingReveal: batchResult.pendingRevealReceiverId
      ? { receiverId: batchResult.pendingRevealReceiverId }
      : undefined,
  };
}
