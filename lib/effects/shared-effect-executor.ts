/**
 * 共用效果執行器
 *
 * 提供 item / skill / contest executor 共用的函數：
 *   - computeStatChange()         — 純函數，計算數值變化
 *   - applyItemTransfer()         — 執行道具移除／偷竊的 DB 操作與 WebSocket 通知
 *   - resolveEffectTarget()       — 純函數，解析效果作用對象
 *   - executeEffectBatch()        — 遍歷效果陣列、累積 stat 變更、處理 item/task 效果
 *   - emitAffectedNotifications() — 套用累積器至 DB 並發送 WebSocket 通知
 */

import { emitInventoryUpdated, emitCharacterAffected, emitRoleUpdated } from '@/lib/websocket/events';
import { cleanItemData } from '@/lib/character-cleanup';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import { computeEffectiveStats } from '@/lib/utils/compute-effective-stats';
import type { BaseEffect } from '@/types/character';
import type { CharacterDocument } from '@/lib/db/models';

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
      Object.entries({ ...JSON.parse(JSON.stringify(targetItem)) as Record<string, unknown>, quantity: quantity - 1 })
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
      // 沒有此道具：新增完整複本（裝備自動卸除）
      const stolenItem = Object.fromEntries(
        Object.entries({ ...JSON.parse(JSON.stringify(targetItem)) as Record<string, unknown>, quantity: 1, acquiredAt: new Date(), equipped: false })
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

// ─── resolveEffectTarget — 純函數 ────────────────────────────────────────────

/**
 * 解析單一效果的作用對象
 *
 * @param targetType   效果的 targetType 設定（'self' | 'other' | 'any' | undefined）
 * @param character    技能/道具使用者
 * @param characterId  使用者的 baseline ID
 * @param targetCharacter 已載入的目標角色（可為 null）
 * @param targetCharacterId 目標角色 ID（可為 undefined）
 * @returns 作用對象 document 與是否為跨角色
 */
export function resolveEffectTarget(
  targetType: 'self' | 'other' | 'any' | undefined,
  character: CharacterDocument,
  characterId: string,
  targetCharacter: CharacterDocument | null,
  targetCharacterId?: string
): { char: CharacterDocument; isOther: boolean } {
  if (targetType === 'self') return { char: character, isOther: false };
  if (targetCharacter && targetCharacterId && targetCharacterId !== characterId) {
    return { char: targetCharacter, isOther: true };
  }
  return { char: character, isOther: false };
}

// ─── executeEffectBatch — 效果迴圈核心 ───────────────────────────────────────

/** stat 變更追蹤項 */
export interface StatUpdateEntry {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  deltaValue?: number;
  deltaMax?: number;
}

/** 跨角色數值變更項（用於 WebSocket 通知） */
export interface CrossCharacterChange {
  name: string;
  deltaValue?: number;
  deltaMax?: number;
  newValue: number;
  newMax?: number;
}

/** executeEffectBatch 參數 */
export interface EffectBatchParams {
  effects: BaseEffect[];
  character: CharacterDocument;
  targetCharacter: CharacterDocument | null;
  targetCharacterId?: string;
  sourceType: 'item' | 'skill';
  sourceId: string;
  sourceName: string;
  sourceTags: string[];
  checkType?: string;
  targetItemId?: string;
}

/** executeEffectBatch 結果 */
export interface EffectBatchResult {
  effectMessages: string[];
  selfStatSet: Record<string, unknown>;
  targetStatSet: Record<string, unknown>;
  selfStatUpdates: StatUpdateEntry[];
  targetStatUpdatesList: StatUpdateEntry[];
  crossCharacterChanges: CrossCharacterChange[];
  hasSelfUpdates: boolean;
  hasTargetUpdates: boolean;
  pendingRevealReceiverId?: string;
  /** item_take/item_steal 可能已重新載入 targetCharacter */
  targetCharacter: CharacterDocument | null;
}

/**
 * 遍歷效果陣列，累積 stat 變更，處理 item_take/item_steal/task_reveal/task_complete/custom
 *
 * 不執行 DB 寫入（累積器由呼叫端透過 emitAffectedNotifications 套用）
 * 例外：item_take/item_steal 的 DB 操作委派至 applyItemTransfer（立即執行）
 *      時效性效果的 createTemporaryEffectRecord 也立即執行
 */
export async function executeEffectBatch(params: EffectBatchParams): Promise<EffectBatchResult> {
  const {
    effects, character, sourceType, sourceId, sourceName,
    sourceTags, checkType, targetItemId, targetCharacterId,
  } = params;
  let { targetCharacter } = params;

  const characterId = getBaselineCharacterId(character);
  const now = new Date();
  let pendingRevealReceiverId: string | undefined;

  const selfStatSet: Record<string, unknown> = {};
  const targetStatSet: Record<string, unknown> = {};
  const selfStatUpdates: StatUpdateEntry[] = [];
  const targetStatUpdatesList: StatUpdateEntry[] = [];
  const crossCharacterChanges: CrossCharacterChange[] = [];
  const effectMessages: string[] = [];

  for (const effect of effects) {
    if (effect.type === 'stat_change' && effect.targetStat && typeof effect.value === 'number') {
      const { char: effectTarget, isOther } = resolveEffectTarget(
        effect.targetType, character, characterId, targetCharacter, targetCharacterId
      );
      const stats = effectTarget.stats || [];
      const statIndex = stats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex === -1) continue;

      const result = computeStatChange(
        stats[statIndex],
        effect.value,
        effect.statChangeTarget ?? 'value',
        effect.syncValue ?? false
      );

      const statSet = isOther ? targetStatSet : selfStatSet;
      const statList = isOther ? targetStatUpdatesList : selfStatUpdates;

      statSet[`stats.${statIndex}.value`] = result.newValue;
      if (result.effectiveTarget === 'maxValue' && result.newMaxValue !== undefined) {
        statSet[`stats.${statIndex}.maxValue`] = result.newMaxValue;
      }
      effectMessages.push(result.message);

      statList.push({
        id: stats[statIndex].id,
        name: stats[statIndex].name,
        value: result.newValue,
        maxValue: result.newMaxValue,
        deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
        deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
      });

      if (isOther) {
        crossCharacterChanges.push({
          name: stats[statIndex].name,
          deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
          deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
          newValue: result.newValue,
          newMax: result.newMaxValue,
        });
      }

      // 時效性效果
      if (effect.duration && effect.duration > 0) {
        await createTemporaryEffectRecord(
          getBaselineCharacterId(effectTarget),
          {
            sourceType,
            sourceId,
            sourceCharacterId: characterId,
            sourceCharacterName: character.name,
            sourceName,
          },
          {
            targetStat: effect.targetStat,
            deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
            deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
            statChangeTarget: result.effectiveTarget,
            syncValue: effect.syncValue,
          },
          effect.duration
        );
      }
    } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
      const { char: effectTarget, isOther } = resolveEffectTarget(
        effect.targetType, character, characterId, targetCharacter, targetCharacterId
      );
      const tasks = effectTarget.tasks || [];
      const taskIndex = tasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && !tasks[taskIndex].isRevealed) {
        const statSet = isOther ? targetStatSet : selfStatSet;
        statSet[`tasks.${taskIndex}.isRevealed`] = true;
        statSet[`tasks.${taskIndex}.revealedAt`] = now;
        effectMessages.push(`揭露任務：${tasks[taskIndex].title}`);
      }
    } else if (effect.type === 'task_complete' && effect.targetTaskId) {
      const { char: effectTarget, isOther } = resolveEffectTarget(
        effect.targetType, character, characterId, targetCharacter, targetCharacterId
      );
      const tasks = effectTarget.tasks || [];
      const taskIndex = tasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && tasks[taskIndex].status !== 'completed') {
        const statSet = isOther ? targetStatSet : selfStatSet;
        statSet[`tasks.${taskIndex}.status`] = 'completed';
        statSet[`tasks.${taskIndex}.completedAt`] = now;
        effectMessages.push(`完成任務：${tasks[taskIndex].title}`);
      }
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      if (checkType === 'contest' || checkType === 'random_contest') continue;
      if (!targetItemId) {
        effectMessages.push('目標角色沒有道具可互動');
        continue;
      }
      if (!targetCharacterId) throw new Error('此效果需要選擇目標角色');

      if (!targetCharacter) {
        targetCharacter = await getCharacterData(targetCharacterId) as CharacterDocument;
        if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
          throw new Error('目標角色不存在或不在同一劇本內');
        }
      }

      const targetItems = targetCharacter.items || [];
      const targetItem = targetItems.find((i) => i.id === targetItemId);
      if (!targetItem) throw new Error('目標角色沒有此道具');

      const hasStealthTag = sourceTags.includes('stealth');

      const transferResult = await applyItemTransfer({
        targetIdStr: targetCharacterId,
        sourceIdStr: characterId,
        targetItem,
        effectType: effect.type,
        notification: {
          sourceCharacterId: characterId,
          sourceCharacterName: character.name,
          sourceType,
          sourceName,
          hasStealthTag,
        },
      });

      effectMessages.push(transferResult.message);
      if (transferResult.pendingRevealReceiverId) {
        pendingRevealReceiverId = transferResult.pendingRevealReceiverId;
      }
    } else if (effect.type === 'custom' && effect.description) {
      effectMessages.push(effect.description);
    }
  }

  return {
    effectMessages,
    selfStatSet,
    targetStatSet,
    selfStatUpdates,
    targetStatUpdatesList,
    crossCharacterChanges,
    hasSelfUpdates: Object.keys(selfStatSet).length > 0,
    hasTargetUpdates: Object.keys(targetStatSet).length > 0,
    pendingRevealReceiverId,
    targetCharacter,
  };
}

// ─── emitAffectedNotifications — DB 套用 + WebSocket 通知 ────────────────────

/** emitAffectedNotifications 參數 */
export interface AffectedNotificationsParams {
  characterId: string;
  character: CharacterDocument;
  targetCharacterId?: string;
  targetCharacter: CharacterDocument | null;
  sourceType: 'item' | 'skill';
  sourceName: string;
  sourceTags: string[];
  batchResult: EffectBatchResult;
}

/** emitAffectedNotifications 結果 */
export interface AffectedNotificationsResult {
  updatedCharacter: CharacterDocument;
  updatedTarget?: CharacterDocument;
}

/**
 * 套用 executeEffectBatch 的累積器至 DB，並發送 WebSocket 通知
 *
 * 處理：
 *   1. $set selfStatSet / targetStatSet 至 DB
 *   2. emitCharacterAffected（跨角色 stat_change 通知）
 *   3. emitRoleUpdated（GM 端 silentSync）
 *   4. 重新讀取最終角色狀態
 */
export async function emitAffectedNotifications(
  params: AffectedNotificationsParams
): Promise<AffectedNotificationsResult> {
  const {
    characterId, character, targetCharacterId, sourceType, sourceName, sourceTags,
    batchResult,
  } = params;
  const {
    selfStatSet, targetStatSet, crossCharacterChanges,
    hasSelfUpdates, hasTargetUpdates,
  } = batchResult;

  const hasStealthTag = sourceTags.includes('stealth');

  // §4: 套用 self / target 兩組累積器至 DB
  if (hasSelfUpdates) {
    await updateCharacterData(characterId, { $set: selfStatSet });
  }

  if (hasTargetUpdates && targetCharacterId) {
    await updateCharacterData(targetCharacterId, { $set: targetStatSet });

    if (crossCharacterChanges.length > 0) {
      // 重新讀取目標角色的 DB 狀態作為通知/同步的依據
      const updatedTargetDoc = await getCharacterData(targetCharacterId);
      const targetObj = (updatedTargetDoc as unknown as { toObject?: () => Record<string, unknown> }).toObject
        ? (updatedTargetDoc as unknown as { toObject: () => Record<string, unknown> }).toObject()
        : JSON.parse(JSON.stringify(updatedTargetDoc));
      const targetBaseStats = (targetObj.stats ?? []) as Array<{ id: string; name: string; value: number; maxValue?: number }>;

      // character.affected 用於通知顯示，newValue/newMax 使用含裝備加成的 effective 值
      const targetEffectiveStats = computeEffectiveStats(
        targetObj.stats as Parameters<typeof computeEffectiveStats>[0],
        targetObj.items as Parameters<typeof computeEffectiveStats>[1],
      );
      const effectiveCrossChanges = crossCharacterChanges.map((c) => {
        const eff = targetEffectiveStats.find((s) => s.name === c.name);
        return {
          ...c,
          newValue: eff?.value ?? c.newValue,
          newMax: eff?.maxValue ?? c.newMax,
        };
      });

      emitCharacterAffected(targetCharacterId, {
        targetCharacterId,
        sourceCharacterId: characterId,
        sourceCharacterName: hasStealthTag ? '' : character.name,
        sourceType,
        sourceName,
        sourceHasStealthTag: hasStealthTag,
        effectType: 'stat_change',
        changes: {
          stats: effectiveCrossChanges.map((c) => ({
            name: c.name, deltaValue: c.deltaValue,
            deltaMax: c.deltaMax, newValue: c.newValue, newMax: c.newMax,
          })),
        },
      }).catch((err) => console.error('[shared-effect-executor] emitCharacterAffected failed', err));

      // role.updated 帶 DB base stats，讓 GM Console 的顯示層自行套用裝備加成
      emitRoleUpdated(targetCharacterId, {
        characterId: targetCharacterId,
        silentSync: true,
        updates: {
          stats: targetBaseStats.map((s) => ({
            id: s.id, name: s.name, value: s.value, maxValue: s.maxValue,
          })),
        },
      }).catch((err) => console.error('[shared-effect-executor] emitRoleUpdated failed', err));
    }
  }

  if (hasSelfUpdates) {
    const selfDoc = await getCharacterData(characterId);
    const selfObj = (selfDoc as unknown as { toObject?: () => Record<string, unknown> }).toObject
      ? (selfDoc as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : JSON.parse(JSON.stringify(selfDoc));
    const selfBaseStats = (selfObj.stats ?? []) as Array<{ id: string; name: string; value: number; maxValue?: number }>;

    emitRoleUpdated(characterId, {
      characterId,
      silentSync: true,
      updates: {
        stats: selfBaseStats.map((s) => ({
          id: s.id, name: s.name, value: s.value, maxValue: s.maxValue,
        })),
      },
    }).catch((err) => console.error('[shared-effect-executor] emitRoleUpdated failed', err));
  }

  const updatedCharacter = await getCharacterData(characterId);
  const updatedTarget = targetCharacterId ? await getCharacterData(targetCharacterId) : undefined;

  return { updatedCharacter, updatedTarget: updatedTarget || undefined };
}
