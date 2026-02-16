/**
 * Phase 8: 時效性效果過期檢查與數值恢復
 * 處理已過期的 temporaryEffects 並恢復受影響的數值
 */

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { emitEffectExpired } from '@/lib/websocket/events';
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
 * @param characterId - 可選，指定角色 ID；若未提供則檢查所有角色
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
  const query: Record<string, unknown> = {
    temporaryEffects: {
      $elemMatch: {
        expiresAt: { $lte: now },
        isExpired: false,
      },
    },
  };

  if (characterId) {
    query._id = characterId;
  }

  // 查詢有過期效果的角色
  const characters = await Character.find(query);

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
 * @param character - 被影響的角色文檔
 * @param effect - 過期的效果記錄
 * @returns 處理結果，若目標數值已被移除則回傳 null
 */
async function processExpiredEffect(
  character: CharacterDocument,
  effect: TemporaryEffect
): Promise<ExpiredEffectResult | null> {
  // 尋找目標數值
  const targetStat = character.stats?.find((s) => s.name === effect.targetStat);

  if (!targetStat) {
    // 目標數值已被 GM 移除，直接標記效果為已過期
    await markEffectAsExpired(character._id.toString(), effect.id);
    return null;
  }

  let restoredValue: number | undefined;
  let restoredMax: number | undefined;

  // 恢復數值
  if (effect.statChangeTarget === 'value') {
    // 恢復 value：反向 delta
    const deltaValue = effect.deltaValue ?? 0;
    const newValue = targetStat.value - deltaValue;

    // Clamp：確保 value 在 [0, maxValue] 範圍內
    const maxValue = targetStat.maxValue ?? Number.MAX_SAFE_INTEGER;
    restoredValue = Math.max(0, Math.min(maxValue, newValue));

    // 更新資料庫
    await Character.updateOne(
      { _id: character._id, 'stats.id': targetStat.id },
      {
        $set: {
          'stats.$.value': restoredValue,
        },
      }
    );
  } else if (effect.statChangeTarget === 'maxValue') {
    // 恢復 maxValue：反向 delta
    const deltaMax = effect.deltaMax ?? 0;
    const newMax = (targetStat.maxValue ?? 0) - deltaMax;

    // Clamp：確保 maxValue >= 1
    restoredMax = Math.max(1, newMax);

    // 更新 maxValue
    await Character.updateOne(
      { _id: character._id, 'stats.id': targetStat.id },
      {
        $set: {
          'stats.$.maxValue': restoredMax,
        },
      }
    );

    // 如果當初有 syncValue，恢復時也需要同步
    if (effect.syncValue) {
      // value 需要 clamp 到新的 maxValue
      const clampedValue = Math.min(targetStat.value, restoredMax);
      restoredValue = clampedValue;

      await Character.updateOne(
        { _id: character._id, 'stats.id': targetStat.id },
        {
          $set: {
            'stats.$.value': clampedValue,
          },
        }
      );
    } else {
      // 即使沒有 syncValue，也需確保 value 不超過新的 maxValue
      if (targetStat.value > restoredMax) {
        restoredValue = restoredMax;

        await Character.updateOne(
          { _id: character._id, 'stats.id': targetStat.id },
          {
            $set: {
              'stats.$.value': restoredMax,
            },
          }
        );
      }
    }
  }

  // 標記效果為已過期
  await markEffectAsExpired(character._id.toString(), effect.id);

  // 推送 WebSocket 事件
  await emitEffectExpired(character._id.toString(), {
    targetCharacterId: character._id.toString(),
    effectId: effect.id,
    sourceType: effect.sourceType,
    sourceId: effect.sourceId,
    sourceCharacterId: effect.sourceCharacterId,
    sourceCharacterName: effect.sourceCharacterName,
    sourceName: effect.sourceName,
    effectType: effect.effectType,
    targetStat: effect.targetStat,
    restoredValue: restoredValue!,
    restoredMax,
    deltaValue: effect.deltaValue,
    deltaMax: effect.deltaMax,
    statChangeTarget: effect.statChangeTarget,
    duration: effect.duration,
  });

  return {
    effectId: effect.id,
    characterId: character._id.toString(),
    characterName: character.name,
    targetStat: effect.targetStat,
    restoredValue,
    restoredMax,
  };
}

/**
 * 標記效果為已過期（當目標數值已被移除時使用）
 *
 * @param characterId - 角色 ID
 * @param effectId - 效果 ID
 */
async function markEffectAsExpired(
  characterId: string,
  effectId: string
): Promise<void> {
  await Character.updateOne(
    { _id: characterId, 'temporaryEffects.id': effectId },
    {
      $set: {
        'temporaryEffects.$.isExpired': true,
      },
    }
  );
}

/**
 * 清理超過 24 小時的已過期效果記錄
 * 避免 temporaryEffects 陣列無限增長
 *
 * @param characterId - 可選，指定角色 ID；若未提供則清理所有角色
 * @returns 清理的記錄數量
 */
export async function cleanupOldExpiredEffects(characterId?: string): Promise<number> {
  await dbConnect();

  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 小時前

  const query: Record<string, unknown> = {};
  if (characterId) {
    query._id = characterId;
  }

  const result = await Character.updateMany(query, {
    $pull: {
      temporaryEffects: {
        isExpired: true,
        expiresAt: { $lt: cutoffTime },
      },
    },
  });

  return result.modifiedCount;
}
