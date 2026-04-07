/**
 * 道具效果執行器
 * 執行道具效果（stat_change, custom, item_take, item_steal）
 *
 * 從 item-use.ts 提取
 * stat_change 計算委派至 computeStatChange()
 * item_take / item_steal 轉移邏輯委派至 applyItemTransfer()
 */

import dbConnect from '@/lib/db/mongodb';
import { emitCharacterAffected, emitRoleUpdated } from '@/lib/websocket/events';
import type { CharacterDocument } from '@/lib/db/models';
import { getCharacterData, getBaselineCharacterId } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import { writeLog } from '@/lib/logs/write-log';
import { getItemEffects } from '@/lib/item/get-item-effects';
import type { ItemType } from '@/lib/db/types/character-types';
import { computeStatChange, applyItemTransfer } from '@/lib/effects/shared-effect-executor';
import { computeEffectiveStats } from '@/lib/utils/compute-effective-stats';

/**
 * 道具效果類型
 */
type ItemEffect = NonNullable<ItemType['effects']>[number];

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
  const effects: ItemEffect[] = getItemEffects(item);

  if (effects.length === 0) {
    const updatedCharacter = await getCharacterData(getBaselineCharacterId(character));
    return { effectsApplied: [], updatedCharacter };
  }

  const characterId = getBaselineCharacterId(character);
  let pendingRevealReceiverId: string | undefined;
  const checkType = item.checkType || 'none';

  // 決定效果作用對象
  let targetCharacter: CharacterDocument | null = null;
  if (targetCharacterId) {
    targetCharacter = await getCharacterData(targetCharacterId) as CharacterDocument;
    if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
      throw new Error('目標角色不在同一劇本內');
    }
  }

  const effectTarget = targetCharacter || character;
  const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;

  const stats = effectTarget.stats || [];
  const targetStatUpdates: Record<string, unknown> = {};
  const statUpdatePayload: Array<{
    id: string; name: string; value: number; maxValue?: number;
    deltaValue?: number; deltaMax?: number;
  }> = [];
  const crossCharacterChanges: Array<{
    name: string; deltaValue?: number; deltaMax?: number;
    newValue: number; newMax?: number;
  }> = [];
  const effectMessages: string[] = [];

  // 處理所有效果
  for (const effect of effects) {
    if (effect.type === 'stat_change' && effect.targetStat && typeof effect.value === 'number') {
      const statIndex = stats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex === -1) continue;

      const result = computeStatChange(
        stats[statIndex],
        effect.value,
        effect.statChangeTarget ?? 'value',
        effect.syncValue ?? false
      );

      targetStatUpdates[`stats.${statIndex}.value`] = result.newValue;
      if (result.effectiveTarget === 'maxValue' && result.newMaxValue !== undefined) {
        targetStatUpdates[`stats.${statIndex}.maxValue`] = result.newMaxValue;
      }
      effectMessages.push(result.message);

      statUpdatePayload.push({
        id: stats[statIndex].id,
        name: stats[statIndex].name,
        value: result.newValue,
        maxValue: result.newMaxValue,
        deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
        deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
      });

      if (isAffectingOthers) {
        crossCharacterChanges.push({
          name: stats[statIndex].name,
          deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
          deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
          newValue: result.newValue,
          newMax: result.newMaxValue,
        });
      }

      // Phase 8: 時效性效果
      if (effect.duration && effect.duration > 0) {
        await createTemporaryEffectRecord(
          getBaselineCharacterId(effectTarget),
          {
            sourceType: 'item',
            sourceId: item.id,
            sourceCharacterId: characterId,
            sourceCharacterName: character.name,
            sourceName: item.name,
          },
          {
            targetStat: effect.targetStat!,
            deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
            deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
            statChangeTarget: result.effectiveTarget,
            syncValue: effect.syncValue,
          },
          effect.duration
        );
      }
    } else if (effect.type === 'custom' && effect.description) {
      effectMessages.push(effect.description);
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      if (checkType === 'contest' || checkType === 'random_contest') continue;
      if (!targetItemId) {
        effectMessages.push('目標角色沒有道具可互動');
        continue;
      }
      if (!targetCharacterId) throw new Error('此效果需要選擇目標角色');

      if (!targetCharacter) {
        targetCharacter = await getCharacterData(targetCharacterId!) as CharacterDocument;
        if (targetCharacter.gameId.toString() !== character.gameId.toString()) {
          throw new Error('目標角色不存在或不在同一劇本內');
        }
      }

      const targetItems = targetCharacter.items || [];
      const targetItem = targetItems.find((i) => i.id === targetItemId);
      if (!targetItem) throw new Error('目標角色沒有此道具');

      const sourceTags = item.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');

      const transferResult = await applyItemTransfer({
        targetIdStr: targetCharacterId!,
        sourceIdStr: characterId,
        targetItem,
        effectType: effect.type,
        notification: {
          sourceCharacterId: characterId,
          sourceCharacterName: character.name,
          sourceType: 'item',
          sourceName: item.name,
          hasStealthTag,
        },
      });

      effectMessages.push(transferResult.message);
      if (transferResult.pendingRevealReceiverId) {
        pendingRevealReceiverId = transferResult.pendingRevealReceiverId;
      }
    }
  }

  // 應用統計變化
  if (Object.keys(targetStatUpdates).length > 0) {
    const updateTargetId = isAffectingOthers ? targetCharacterId! : characterId;
    await updateCharacterData(updateTargetId, { $set: targetStatUpdates });
  }

  // WebSocket：數值更新（若有）
  if (statUpdatePayload.length > 0) {
    const targetId = isAffectingOthers ? targetCharacterId! : characterId;

    // 重新讀取目標角色的 DB 狀態
    const updatedTargetDoc = await getCharacterData(targetId);
    const targetObj = (updatedTargetDoc as { toObject?: () => Record<string, unknown> }).toObject
      ? (updatedTargetDoc as { toObject: () => Record<string, unknown> }).toObject()
      : JSON.parse(JSON.stringify(updatedTargetDoc));
    const targetBaseStats = (targetObj.stats ?? []) as Array<{ id: string; name: string; value: number; maxValue?: number }>;

    if (isAffectingOthers && crossCharacterChanges.length > 0) {
      const sourceTags = item.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');

      // character.affected 用於通知顯示，newValue/newMax 使用含裝備加成的 effective 值
      // 讓玩家端通知顯示與實際畫面一致
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

      emitCharacterAffected(targetId, {
        targetCharacterId: targetId,
        sourceCharacterId: characterId,
        sourceCharacterName: hasStealthTag ? '' : character.name,
        sourceType: 'item',
        sourceName: item.name,
        sourceHasStealthTag: hasStealthTag,
        effectType: 'stat_change',
        changes: {
          stats: effectiveCrossChanges.map((c) => ({
            name: c.name, deltaValue: c.deltaValue,
            deltaMax: c.deltaMax, newValue: c.newValue, newMax: c.newMax,
          })),
        },
      }).catch((err) => console.error('[item-effect-executor] emitCharacterAffected failed', err));
    }

    // role.updated 帶 DB base stats，讓 GM Console 的顯示層自行套用裝備加成
    // 避免雙重計算（過去送 effective stats → overview 再算一次 → 裝備加成被加兩次）
    // _statsSync: 玩家端不產生通知
    emitRoleUpdated(targetId, {
      characterId: targetId,
      _statsSync: true,
      updates: {
        stats: targetBaseStats.map((s) => ({
          id: s.id, name: s.name, value: s.value, maxValue: s.maxValue,
        })),
      },
    }).catch((err) => console.error('[item-effect-executor] emitRoleUpdated failed', err));
  }

  const updatedCharacter = await getCharacterData(characterId);
  const updatedTarget = targetCharacterId ? await getCharacterData(targetCharacterId) : undefined;

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
      targetCharacterName: targetCharacter?.name || undefined,
      effectsApplied: effectMessages,
      statChanges: statUpdatePayload.length > 0 ? statUpdatePayload : undefined,
      isAffectingOthers,
    },
  });

  return {
    effectsApplied: effectMessages,
    updatedCharacter,
    updatedTarget: updatedTarget || undefined,
    pendingReveal: pendingRevealReceiverId ? { receiverId: pendingRevealReceiverId } : undefined,
  };
}
