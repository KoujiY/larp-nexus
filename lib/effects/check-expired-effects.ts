/**
 * Phase 8: 時效性效果過期檢查與數值恢復
 * 處理已過期的 temporaryEffects 並恢復受影響的數值
 *
 * Phase 10.4: 同時查詢 Character（Baseline）和 CharacterRuntime 兩個 collection，
 * 使用原子性 updateOne 操作避免 VersionError（併發安全）。
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { emitEffectExpired, emitRoleUpdated } from '@/lib/websocket/events';
import { getBaselineCharacterId } from '@/lib/game/get-character-data';
import { writeLog } from '@/lib/logs/write-log';
import { computeEffectiveStats } from '@/lib/utils/compute-effective-stats';
import type { TemporaryEffect } from '@/types/character';
import type { CharacterDocument } from '@/lib/db/models/Character';

/**
 * 過期效果處理結果
 */
export interface ExpiredEffectResult {
  effectId: string;
  characterId: string;
  characterName: string;
  targetStat: string;
  restoredValue?: number;
  restoredMax?: number;
}

/**
 * 處理過期的時效性效果並恢復數值
 *
 * Phase 10.4: 同時查詢 Character 和 CharacterRuntime，
 * 確保 active game 期間的 Runtime 效果也能被正確處理。
 *
 * @param characterId - 可選，指定角色 ID（Baseline ID）；若未提供則檢查所有角色
 * @returns 處理結果：成功處理的效果數量和詳細資訊
 */
export async function processExpiredEffects(characterId?: string): Promise<{
  processedCount: number;
  results: ExpiredEffectResult[];
}> {
  await dbConnect();

  const now = new Date();
  const results: ExpiredEffectResult[] = [];

  // 建立查詢條件
  const expiredMatch = {
    temporaryEffects: {
      $elemMatch: {
        expiresAt: { $lte: now },
        isExpired: false,
      },
    },
  };

  // Baseline 查詢
  const baselineQuery: Record<string, unknown> = { ...expiredMatch };
  if (characterId) {
    baselineQuery._id = characterId;
  }

  // Runtime 查詢（active game 期間效果存在 Runtime collection）
  const runtimeQuery: Record<string, unknown> = { ...expiredMatch, type: 'runtime' };
  if (characterId) {
    runtimeQuery.refId = characterId;
  }

  // 同時查詢兩個 collection
  const [baselineCharacters, runtimeCharacters] = await Promise.all([
    Character.find(baselineQuery),
    CharacterRuntime.find(runtimeQuery),
  ]);

  // 合併結果（CharacterRuntimeDocument 與 CharacterDocument schema 相容）
  const characters = [
    ...baselineCharacters,
    ...runtimeCharacters as unknown as CharacterDocument[],
  ];

  // 處理每個角色的過期效果
  for (const character of characters) {
    if (!character.temporaryEffects || character.temporaryEffects.length === 0) {
      continue;
    }

    // 篩選出過期且未處理的效果
    const expiredEffects = character.temporaryEffects.filter(
      (effect: TemporaryEffect) => effect.expiresAt <= now && !effect.isExpired
    );

    // 處理每個過期效果
    for (const effect of expiredEffects) {
      const result = await processExpiredEffect(character, effect);
      if (result) {
        results.push(result);
      }
    }
  }

  return {
    processedCount: results.length,
    results,
  };
}

/**
 * 處理單一過期效果：恢復數值並標記為已過期
 *
 * 使用原子性 Model.updateOne() 操作，透過 document.constructor 自動
 * 寫入正確的 collection（Character 或 CharacterRuntime）。
 * 以 $elemMatch + isExpired:false 作為冪等性保護，避免併發重複處理。
 *
 * @param character - 被影響的角色文檔（用於讀取當前數值和確定 Model）
 * @param effect - 過期的效果記錄
 * @returns 處理結果，若已被處理或目標數值已移除則回傳 null
 */
async function processExpiredEffect(
  character: CharacterDocument,
  effect: TemporaryEffect
): Promise<ExpiredEffectResult | null> {
  // 取得文件所屬的 Model（Character 或 CharacterRuntime），用於原子性更新
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CharacterModel = (character as any).constructor as typeof Character;

  // 冪等性查詢條件：只匹配尚未過期的效果
  const idempotentQuery = {
    _id: character._id,
    temporaryEffects: { $elemMatch: { id: effect.id, isExpired: false } },
  };

  // 尋找目標數值
  const targetStat = character.stats?.find((s) => s.name === effect.targetStat);
  const statIndex = character.stats?.findIndex((s) => s.name === effect.targetStat) ?? -1;

  if (!targetStat || statIndex < 0) {
    // 目標數值已被 GM 移除，直接標記效果為已過期
    await CharacterModel.updateOne(idempotentQuery, {
      $set: { 'temporaryEffects.$.isExpired': true },
    });
    return null;
  }

  let restoredValue: number | undefined;
  let restoredMax: number | undefined;
  const setOps: Record<string, unknown> = {};

  // 恢復數值
  if (effect.statChangeTarget === 'value') {
    // 恢復 value：反向 delta
    const deltaValue = effect.deltaValue ?? 0;
    const newValue = targetStat.value - deltaValue;

    // Clamp：確保 value 在 [0, maxValue] 範圍內
    const maxValue = targetStat.maxValue ?? Number.MAX_SAFE_INTEGER;
    restoredValue = Math.max(0, Math.min(maxValue, newValue));
    setOps[`stats.${statIndex}.value`] = restoredValue;
  } else if (effect.statChangeTarget === 'maxValue') {
    // 恢復 maxValue：反向 delta
    const deltaMax = effect.deltaMax ?? 0;
    const newMax = (targetStat.maxValue ?? 0) - deltaMax;

    // Clamp：確保 maxValue >= 1
    restoredMax = Math.max(1, newMax);
    setOps[`stats.${statIndex}.maxValue`] = restoredMax;

    // 如果當初有 syncValue，恢復時也需要同步
    if (effect.syncValue) {
      const clampedValue = Math.min(targetStat.value, restoredMax);
      restoredValue = clampedValue;
      setOps[`stats.${statIndex}.value`] = clampedValue;
    } else {
      // 即使沒有 syncValue，也需確保 value 不超過新的 maxValue
      if (targetStat.value > restoredMax) {
        restoredValue = restoredMax;
        setOps[`stats.${statIndex}.value`] = restoredMax;
      }
    }
  }

  // 標記效果為已過期
  setOps['temporaryEffects.$.isExpired'] = true;

  // 原子性更新（不使用 .save()，避免 VersionError）
  const updateResult = await CharacterModel.updateOne(idempotentQuery, { $set: setOps });

  // 若 modifiedCount === 0，表示已被另一個併發請求處理，跳過
  if (updateResult.modifiedCount === 0) {
    return null;
  }

  // Phase 10.4: 使用 Baseline ID 作為 WebSocket 頻道，確保玩家端能收到事件
  const channelId = getBaselineCharacterId(character);

  // 計算含裝備加成的有效恢復值（玩家/GM 通知應顯示玩家實際看到的數值）
  // 用 try-catch 包裹，確保即使計算失敗也不影響 WebSocket 事件發送
  let displayRestoredValue = restoredValue;
  let displayRestoredMax = restoredMax;

  try {
    const charObj = character.toObject();
    const plainItems = charObj.items ?? [];
    const plainStats = charObj.stats ?? [];
    if (plainItems.length > 0 && plainStats.length > 0) {
      // 建構恢復後的 stats 快照（只替換被恢復的那個 stat）
      const patchedStats = plainStats.map((s: Record<string, unknown>, i: number) => {
        if (i !== statIndex) return s;
        return {
          ...s,
          value: restoredValue ?? s.value,
          maxValue: restoredMax ?? s.maxValue,
        };
      });
      const effectiveStats = computeEffectiveStats(patchedStats, plainItems);
      const effectiveStat = effectiveStats.find((s) => s.name === effect.targetStat);
      if (effectiveStat) {
        if (displayRestoredValue !== undefined) displayRestoredValue = effectiveStat.value;
        if (displayRestoredMax !== undefined) displayRestoredMax = effectiveStat.maxValue;
      }
    }
  } catch (err) {
    console.error('[processExpiredEffect] Failed to compute effective restored value, using base value:', err);
  }

  // 推送 WebSocket 事件
  await emitEffectExpired(channelId, {
    targetCharacterId: channelId,
    effectId: effect.id,
    sourceType: effect.sourceType,
    sourceId: effect.sourceId,
    sourceCharacterId: effect.sourceCharacterId,
    sourceCharacterName: effect.sourceCharacterName,
    sourceName: effect.sourceName,
    effectType: effect.effectType,
    targetStat: effect.targetStat,
    restoredValue: displayRestoredValue!,
    restoredMax: displayRestoredMax,
    deltaValue: effect.deltaValue,
    deltaMax: effect.deltaMax,
    statChangeTarget: effect.statChangeTarget,
    duration: effect.duration,
  });

  // 寫入 Log，讓 GM 端歷史紀錄可見
  const gameId = character.gameId?.toString();
  if (gameId) {
    await writeLog({
      gameId,
      characterId: channelId,
      actorType: 'system',
      actorId: 'system',
      action: 'effect_expired',
      details: {
        effectId: effect.id,
        sourceName: effect.sourceName,
        sourceType: effect.sourceType,
        targetStat: effect.targetStat,
        statChangeTarget: effect.statChangeTarget,
        restoredValue: displayRestoredValue,
        restoredMax: displayRestoredMax,
        deltaValue: effect.deltaValue,
        deltaMax: effect.deltaMax,
      },
    });
  }

  // 額外發送 role.updated 事件確保頁面刷新 + GM Console 即時同步
  // 帶 DB base stats（不含裝備加成），讓 GM Console 的顯示層自行套用裝備加成
  // 避免雙重計算（過去送 effective stats → overview 再算一次 → 加成被加兩次）
  try {
    const charObj = character.toObject();
    const plainStats = (charObj.stats ?? []) as Array<Record<string, unknown>>;
    // 建構恢復後的 base stats 快照
    const patchedStats = plainStats.map((s, i) => {
      if (i !== statIndex) return s;
      return {
        ...s,
        value: restoredValue ?? s.value,
        maxValue: restoredMax ?? s.maxValue,
      };
    });

    // _statsSync: 玩家端不產生通知（通知由 effect.expired 處理）
    emitRoleUpdated(channelId, {
      characterId: channelId,
      _statsSync: true,
      updates: {
        stats: patchedStats.map((s) => ({
          id: s.id as string,
          name: s.name as string,
          value: s.value as number,
          maxValue: s.maxValue as number | undefined,
        })),
      },
    }).catch((error) => console.error('Failed to emit role.updated (effect expired)', error));
  } catch {
    // Fallback: 不帶 stats，僅觸發頁面刷新
    emitRoleUpdated(channelId, {
      characterId: channelId,
      _statsSync: true,
      updates: {},
    }).catch((error) => console.error('Failed to emit role.updated (effect expired)', error));
  }

  return {
    effectId: effect.id,
    characterId: channelId,
    characterName: character.name,
    targetStat: effect.targetStat,
    restoredValue,
    restoredMax,
  };
}

/**
 * 清理超過 24 小時的已過期效果記錄
 * 避免 temporaryEffects 陣列無限增長
 *
 * Phase 10.4: 同時清理 Character 和 CharacterRuntime 兩個 collection。
 *
 * @param characterId - 可選，指定角色 ID（Baseline ID）；若未提供則清理所有角色
 * @returns 清理的記錄數量
 */
export async function cleanupOldExpiredEffects(characterId?: string): Promise<number> {
  await dbConnect();

  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 小時前

  const pullOperation = {
    $pull: {
      temporaryEffects: {
        isExpired: true,
        expiresAt: { $lt: cutoffTime },
      },
    },
  };

  // Baseline 查詢
  const baselineQuery: Record<string, unknown> = {};
  if (characterId) {
    baselineQuery._id = characterId;
  }

  // Runtime 查詢
  const runtimeQuery: Record<string, unknown> = {};
  if (characterId) {
    runtimeQuery.refId = characterId;
  }

  const [baselineResult, runtimeResult] = await Promise.all([
    Character.updateMany(baselineQuery, pullOperation),
    CharacterRuntime.updateMany(runtimeQuery, pullOperation),
  ]);

  return baselineResult.modifiedCount + runtimeResult.modifiedCount;
}
