/**
 * 對抗檢定效果執行器
 * 執行對抗檢定獲勝後的效果
 *
 * 從 contest-respond.ts 提取
 * stat_change 計算委派至 computeStatChange()
 * item_take / item_steal 轉移邏輯委派至 applyItemTransfer()
 */

import dbConnect from '@/lib/db/mongodb';
import { emitCharacterAffected } from '@/lib/websocket/events';
import { getBaselineCharacterId, getCharacterData } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import type { CharacterDocument } from '@/lib/db/models';
import { buildTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import type { TemporaryEffect } from '@/types/character';
import { getItemEffects } from '@/lib/item/get-item-effects';
import { writeLog } from '@/lib/logs/write-log';
import type { SkillType, ItemType } from '@/lib/db/types/character-types';
import { computeStatChange, applyItemTransfer } from '@/lib/effects/shared-effect-executor';
import { executeAutoReveal } from '@/lib/reveal/auto-reveal-evaluator';

/**
 * 技能或物品的效果類型
 */
type Effect = {
  type: 'stat_change' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete' | 'custom';
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;
  targetItemId?: string;
  targetTaskId?: string;
  targetType?: 'self' | 'other' | 'any';
  description?: string;
};

/**
 * 執行對抗檢定效果的結果
 */
export interface ContestEffectExecutionResult {
  effectsApplied: string[];
  updatedAttacker: CharacterDocument;
  updatedDefender: CharacterDocument;
  /** 需要延遲執行的自動揭露（呼叫者應在發送完通知後再觸發） */
  pendingReveal?: { receiverId: string };
}

/**
 * 執行對抗檢定獲勝後的效果
 *
 * @param attacker 攻擊方角色
 * @param defender 防守方角色
 * @param source 技能或物品（攻擊方或防守方）
 * @param targetItemId 目標物品 ID（用於 item_take 和 item_steal 效果）
 * @param contestResult 對抗檢定結果（Phase 7.6: 決定執行攻擊方還是防守方的效果）
 * @param defenderSources 防守方使用的技能/物品列表（Phase 7.6: 防守方獲勝時使用）
 * @param options.skipFinalReload 跳過結尾的角色重讀（省 2 次 DB 查詢）。
 *   ⚠️ 設為 true 時回傳的 updatedAttacker/updatedDefender 是「效果套用前」的傳入 doc，
 *   不可用於讀取最新狀態——僅供不使用這兩個欄位的呼叫端（contest-respond）使用
 * @returns 執行結果
 */
export async function executeContestEffects(
  attacker: CharacterDocument,
  defender: CharacterDocument,
  source: SkillType | ItemType,
  targetItemId?: string,
  contestResult: 'attacker_wins' | 'defender_wins' | 'both_fail' = 'attacker_wins',
  defenderSources?: Array<{ type: 'skill' | 'item'; id: string }>,
  options?: { skipFinalReload?: boolean }
): Promise<ContestEffectExecutionResult> {
  await dbConnect();

  const effectsApplied: string[] = [];
  let pendingRevealReceiverId: string | undefined;
  const now = new Date();

  const attackerIdStr = getBaselineCharacterId(attacker);
  const defenderIdStr = getBaselineCharacterId(defender);

  // Phase 7.6: 根據對抗結果決定執行攻擊方還是防守方的效果
  let actualSource: SkillType | ItemType = source;
  let actualSourceType: 'skill' | 'item' = 'effects' in source && Array.isArray(source.effects) ? 'skill' : 'item';

  if (contestResult === 'defender_wins' && defenderSources && defenderSources.length > 0 && !targetItemId) {
    const firstDefenderSource = defenderSources[0];
    if (firstDefenderSource.type === 'skill') {
      const defenderSkill = defender.skills?.find((s: { id: string }) => s.id === firstDefenderSource.id);
      if (defenderSkill) { actualSource = defenderSkill as SkillType; actualSourceType = 'skill'; }
    } else {
      const defenderItem = defender.items?.find((i: { id: string }) => i.id === firstDefenderSource.id);
      if (defenderItem) { actualSource = defenderItem as ItemType; actualSourceType = 'item'; }
    }
  }

  const effects: Effect[] = actualSourceType === 'skill'
    ? (actualSource as SkillType).effects || []
    : getItemEffects(actualSource as ItemType);

  // §4 per-effect 分派：
  //   sourceOwner = actualSource 的擁有者（attacker_wins → attacker；defender_wins → defender）
  //     這是從「效果設計者」視角看的「自己」
  //   opponent = sourceOwner 的對手
  //     targetType === 'other' | 'any' | undefined 都套用到 opponent
  //   targetType === 'self' → sourceOwner；item_take/item_steal Wizard 已擋 self 選項
  const sourceOwner: CharacterDocument = contestResult === 'defender_wins' ? defender : attacker;
  const opponent: CharacterDocument = contestResult === 'defender_wins' ? attacker : defender;
  const sourceOwnerIdStr = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
  const opponentIdStr = contestResult === 'defender_wins' ? attackerIdStr : defenderIdStr;

  /** 單一目標的累積 bucket */
  interface TargetBucket {
    character: CharacterDocument;
    idStr: string;
    isOpponent: boolean;
    statSet: Record<string, unknown>;
    statUpdates: Array<{
      id: string; name: string; value: number; maxValue?: number;
      deltaValue?: number; deltaMax?: number;
    }>;
    crossCharacterChanges: Array<{
      name: string; deltaValue?: number; deltaMax?: number;
      newValue: number; newMax?: number;
    }>;
    /** 時效性效果記錄：與 statSet 併入同一次 updateCharacterData（$set + $push 原子合併） */
    tempEffects: TemporaryEffect[];
  }
  const buckets = new Map<string, TargetBucket>();
  const initBucket = (character: CharacterDocument, isOpponent: boolean): TargetBucket => {
    const idStr = getBaselineCharacterId(character);
    let bucket = buckets.get(idStr);
    if (!bucket) {
      bucket = { character, idStr, isOpponent, statSet: {}, statUpdates: [], crossCharacterChanges: [], tempEffects: [] };
      buckets.set(idStr, bucket);
    }
    return bucket;
  };
  const resolveEffectTarget = (targetType: Effect['targetType']): { character: CharacterDocument; isOpponent: boolean } => {
    if (targetType === 'self') {
      return { character: sourceOwner, isOpponent: false };
    }
    // 'other' / 'any' / undefined（向下相容）都套用到對手
    return { character: opponent, isOpponent: true };
  };

  for (const effect of effects) {
    if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
      const { character: effectTarget, isOpponent } = resolveEffectTarget(effect.targetType);
      const bucket = initBucket(effectTarget, isOpponent);
      const targetStats = effectTarget.stats || [];
      const statIndex = targetStats.findIndex((s) => s.name === effect.targetStat);
      if (statIndex === -1) continue;

      const result = computeStatChange(
        targetStats[statIndex],
        effect.value,
        effect.statChangeTarget ?? 'value',
        effect.syncValue ?? false
      );

      bucket.statSet[`stats.${statIndex}.value`] = result.newValue;
      if (result.effectiveTarget === 'maxValue' && result.newMaxValue !== undefined) {
        bucket.statSet[`stats.${statIndex}.maxValue`] = result.newMaxValue;
      }
      effectsApplied.push(result.message);

      bucket.statUpdates.push({
        id: targetStats[statIndex].id,
        name: targetStats[statIndex].name,
        value: result.newValue,
        maxValue: result.newMaxValue,
        deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
        deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
      });

      // §4: 僅當 target 為對手時才推送 cross-character 通知（self 效果不需要）
      if (isOpponent) {
        bucket.crossCharacterChanges.push({
          name: targetStats[statIndex].name,
          deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
          deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
          newValue: result.newValue,
          newMax: result.newMaxValue,
        });
      }

      // Phase 8: 時效性效果 — source 永遠是 sourceOwner，target 依 effect 決定
      // 記錄入桶，與 statSet 併入同一次 updateCharacterData（$set + $push 同一原子操作），
      // 確保 character.affected 發出時數值與倒數條目同時落地
      if (effect.duration && effect.duration > 0) {
        bucket.tempEffects.push(buildTemporaryEffectRecord(
          {
            sourceType: actualSourceType,
            sourceId: actualSource.id,
            sourceCharacterId: sourceOwnerIdStr,
            sourceCharacterName: sourceOwner.name,
            sourceName: actualSource.name,
          },
          {
            targetStat: effect.targetStat,
            deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
            deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
            statChangeTarget: result.effectiveTarget,
            syncValue: effect.syncValue,
          },
          effect.duration
        ));
      }
    } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
      const { character: effectTarget, isOpponent } = resolveEffectTarget(effect.targetType);
      const bucket = initBucket(effectTarget, isOpponent);
      const targetTasks = effectTarget.tasks || [];
      const taskIndex = targetTasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && !targetTasks[taskIndex].isRevealed) {
        bucket.statSet[`tasks.${taskIndex}.isRevealed`] = true;
        bucket.statSet[`tasks.${taskIndex}.revealedAt`] = now;
        effectsApplied.push(`揭露任務：${targetTasks[taskIndex].title}`);
      }
    } else if (effect.type === 'task_complete' && effect.targetTaskId) {
      const { character: effectTarget, isOpponent } = resolveEffectTarget(effect.targetType);
      const bucket = initBucket(effectTarget, isOpponent);
      const targetTasks = effectTarget.tasks || [];
      const taskIndex = targetTasks.findIndex((t) => t.id === effect.targetTaskId);
      if (taskIndex !== -1 && targetTasks[taskIndex].status !== 'completed') {
        bucket.statSet[`tasks.${taskIndex}.status`] = 'completed';
        bucket.statSet[`tasks.${taskIndex}.completedAt`] = now;
        effectsApplied.push(`完成任務：${targetTasks[taskIndex].title}`);
      }
    } else if (effect.type === 'item_take' || effect.type === 'item_steal') {
      // §4: item_take/item_steal 的語意固定是「從對手拿 → 給自己」，
      // Wizard 已擋 targetType: 'self'，這裡忽略 targetType 直接走 opponent → sourceOwner
      if (!targetItemId) {
        effectsApplied.push('放棄物品獲取');
        continue;
      }

      const opponentItems = opponent.items || [];
      const targetItem = opponentItems.find((i) => i.id === targetItemId);
      if (!targetItem) {
        console.error('[contest-effect-executor] 目標角色沒有此物品:', targetItemId);
        continue;
      }

      const sourceTags = actualSource.tags || [];
      const hasStealthTag = sourceTags.includes('stealth');

      const transferResult = await applyItemTransfer({
        targetIdStr: opponentIdStr,
        sourceIdStr: sourceOwnerIdStr,
        targetItem,
        effectType: effect.type,
        notification: {
          sourceCharacterId: sourceOwnerIdStr,
          sourceCharacterName: sourceOwner.name,
          sourceType: actualSourceType,
          sourceName: '', // contest executor 不顯示技能/物品名稱（隱私保護）
          hasStealthTag,
        },
      });

      effectsApplied.push(transferResult.message);
      if (transferResult.pendingRevealReceiverId) {
        pendingRevealReceiverId = transferResult.pendingRevealReceiverId;
      }
    } else if (effect.type === 'custom' && effect.description) {
      effectsApplied.push(effect.description);
    }
  }

  // §4: 對每個 bucket 獨立應用更新，並為對手 target 發送 character-affected 通知
  // 批 2：bucket 之間是不同角色的獨立寫入 → 平行；單一 bucket 內維持
  // 「DB 更新完成 → 才發 character.affected」的順序。
  // 時效性效果以 $push 併入同一次更新（單文件原子性保證 client 重抓時
  // 數值與倒數條目一致，不可能只見其一）
  const statUpdates: Array<{
    id: string; name: string; value: number; maxValue?: number;
    deltaValue?: number; deltaMax?: number;
  }> = [];
  const bucketWrites: Promise<void>[] = [];
  for (const bucket of buckets.values()) {
    statUpdates.push(...bucket.statUpdates);

    if (Object.keys(bucket.statSet).length === 0 && bucket.tempEffects.length === 0) continue;

    bucketWrites.push((async () => {
      await updateCharacterData(bucket.idStr, {
        ...(Object.keys(bucket.statSet).length > 0 ? { $set: bucket.statSet } : {}),
        ...(bucket.tempEffects.length > 0
          ? { $push: { temporaryEffects: { $each: bucket.tempEffects } } }
          : {}),
      });

      if (bucket.crossCharacterChanges.length > 0) {
        const sourceTags = actualSource.tags || [];
        const hasStealthTag = sourceTags.includes('stealth');

        emitCharacterAffected(bucket.idStr, {
          targetCharacterId: bucket.idStr,
          sourceCharacterId: sourceOwnerIdStr,
          sourceCharacterName: hasStealthTag ? '' : sourceOwner.name,
          sourceType: actualSourceType,
          sourceName: '', // 不顯示技能/物品名稱
          sourceHasStealthTag: hasStealthTag,
          effectType: 'stat_change',
          changes: {
            stats: bucket.crossCharacterChanges.map((c) => ({
              name: c.name, deltaValue: c.deltaValue,
              deltaMax: c.deltaMax, newValue: c.newValue, newMax: c.newMax,
            })),
          },
        }).catch((err) => console.error('[contest-effect-executor] emitCharacterAffected failed', err));
      }
    })());
  }
  await Promise.all(bucketWrites);

  const winnerCharacterId = contestResult === 'defender_wins' ? defenderIdStr : attackerIdStr;
  const winnerCharacterName = contestResult === 'defender_wins' ? defender.name : attacker.name;
  const loserCharacterId = contestResult === 'defender_wins' ? attackerIdStr : defenderIdStr;
  const loserCharacterName = contestResult === 'defender_wins' ? attacker.name : defender.name;

  // 批 2：結算 log 與結尾重讀互不依賴 → 平行；重讀本身的兩個角色也平行。
  // skipFinalReload：呼叫端不需要最新 doc 時跳過重讀（回傳傳入的原始 doc）
  const [reloaded] = await Promise.all([
    options?.skipFinalReload
      ? Promise.resolve(null)
      : Promise.all([getCharacterData(attackerIdStr), getCharacterData(defenderIdStr)]),
    writeLog({
      gameId: attacker.gameId.toString(),
      characterId: winnerCharacterId,
      actorType: 'character',
      actorId: winnerCharacterId,
      action: 'contest_result',
      details: {
        contestResult,
        sourceType: actualSourceType,
        sourceId: actualSource.id,
        sourceName: actualSource.name,
        attackerCharacterId: attackerIdStr,
        attackerCharacterName: attacker.name,
        defenderCharacterId: defenderIdStr,
        defenderCharacterName: defender.name,
        winnerCharacterId,
        winnerCharacterName,
        loserCharacterId,
        loserCharacterName,
        effectsApplied,
        statChanges: statUpdates.length > 0 ? statUpdates : undefined,
        targetItemId: targetItemId || undefined,
      },
    }),
  ]);

  let updatedAttacker = attacker;
  let updatedDefender = defender;
  if (reloaded) {
    [updatedAttacker, updatedDefender] = reloaded;

    if (!updatedAttacker || !updatedDefender) {
      throw new Error('找不到角色');
    }
  }

  // 隱藏技能/物品自動揭露：actualSource 的擁有者（sourceOwner，依勝負可能為攻或守）
  // = 主動使用；其對手（opponent）= 被動被使用。以 source 的歸屬判定，而非固定攻/守。
  const activeTrigger = actualSourceType === 'skill'
    ? ({ type: 'skill_used' as const, skillIds: [actualSource.id] })
    : ({ type: 'item_used' as const, itemIds: [actualSource.id] });
  const passiveTrigger = actualSourceType === 'skill'
    ? ({ type: 'skill_targeted' as const, skillIds: [actualSource.id] })
    : ({ type: 'item_targeted' as const, itemIds: [actualSource.id] });
  executeAutoReveal(sourceOwnerIdStr, activeTrigger)
    .catch((error) => console.error('[contest-effect] auto-reveal active trigger failed', error));
  executeAutoReveal(opponentIdStr, passiveTrigger)
    .catch((error) => console.error('[contest-effect] auto-reveal passive trigger failed', error));

  return {
    effectsApplied,
    updatedAttacker,
    updatedDefender,
    pendingReveal: pendingRevealReceiverId ? { receiverId: pendingRevealReceiverId } : undefined,
  };
}
