/**
 * Phase 8: 時效性效果記錄工具
 * 建立並寫入 TemporaryEffect 記錄到目標角色
 */

import dbConnect from '@/lib/db/mongodb';
import { updateCharacterData } from '@/lib/game/update-character-data';
import type { TemporaryEffect } from '@/types/character';

/**
 * 來源資訊
 */
export interface EffectSourceInfo {
  sourceType: 'skill' | 'item' | 'preset_event';
  sourceId: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  sourceName: string;
}

/**
 * 數值變化資訊
 */
export interface StatChangeInfo {
  targetStat: string;
  deltaValue?: number;
  deltaMax?: number;
  statChangeTarget: 'value' | 'maxValue';
  syncValue?: boolean;
}

/**
 * 建立時效性效果記錄並寫入目標角色
 *
 * @param targetCharacterId 被影響方角色 ID
 * @param sourceInfo 來源資訊
 * @param statChange 數值變化資訊
 * @param duration 持續時間（秒）
 * @returns 建立的 TemporaryEffect 記錄
 */
export async function createTemporaryEffectRecord(
  targetCharacterId: string,
  sourceInfo: EffectSourceInfo,
  statChange: StatChangeInfo,
  duration: number
): Promise<TemporaryEffect> {
  await dbConnect();

  // 生成唯一效果 ID
  const effectId = `teff-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // 計算過期時間
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 1000);

  // 建立效果記錄
  const temporaryEffect: TemporaryEffect = {
    id: effectId,
    sourceType: sourceInfo.sourceType,
    sourceId: sourceInfo.sourceId,
    sourceCharacterId: sourceInfo.sourceCharacterId,
    sourceCharacterName: sourceInfo.sourceCharacterName,
    sourceName: sourceInfo.sourceName,
    effectType: 'stat_change',
    targetStat: statChange.targetStat,
    deltaValue: statChange.deltaValue,
    deltaMax: statChange.deltaMax,
    statChangeTarget: statChange.statChangeTarget,
    syncValue: statChange.syncValue,
    duration,
    appliedAt: now,
    expiresAt,
    isExpired: false,
  };

  // 寫入目標角色的 temporaryEffects 陣列（自動判斷 Baseline/Runtime）
  // 使用原子性 $push 操作，避免 .save() 覆蓋併發操作的數值更新
  await updateCharacterData(targetCharacterId, {
    $push: { temporaryEffects: temporaryEffect },
  });

  return temporaryEffect;
}
