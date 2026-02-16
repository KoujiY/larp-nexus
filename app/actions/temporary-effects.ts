/**
 * Phase 8: 時效性效果系統 Server Actions
 * 提供過期檢查與效果查詢功能
 */

'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character, Game } from '@/lib/db/models';
import { processExpiredEffects, cleanupOldExpiredEffects } from '@/lib/effects/check-expired-effects';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { TemporaryEffect } from '@/types/character';
import type { ApiResponse } from '@/types/api';

/**
 * 檢查並處理過期的時效性效果
 *
 * @param characterId - 可選，指定角色 ID；若未提供則檢查所有角色
 * @returns 處理結果
 */
export async function checkExpiredEffects(characterId?: string) {
  try {
    const result = await processExpiredEffects(characterId);

    // 清理超過 24 小時的已過期記錄
    await cleanupOldExpiredEffects(characterId);

    return {
      success: true,
      data: {
        processedCount: result.processedCount,
        results: result.results,
      },
    };
  } catch (error) {
    console.error('[checkExpiredEffects] Error:', error);
    return {
      success: false,
      message: '檢查過期效果時發生錯誤',
    };
  }
}

/**
 * 取得角色的所有時效性效果（GM 端專用）
 *
 * @param characterId - 角色 ID
 * @returns 時效性效果列表（僅未過期的）
 */
export async function getTemporaryEffects(
  characterId: string
): Promise<ApiResponse<{ effects: Array<TemporaryEffect & { remainingSeconds: number }> }>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    await dbConnect();

    // 查詢角色並驗證 GM 權限
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到角色',
      };
    }

    // 驗證角色所屬的劇本是否由當前 GM 擁有
    const game = await Game.findById(character.gameId);
    if (!game || game.gmUserId.toString() !== gmUserId) {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '無權查看此角色',
      };
    }

    // 取得未過期的時效性效果
    const now = new Date();
    const activeEffects = (character.temporaryEffects || []).filter(
      (effect: TemporaryEffect) => !effect.isExpired && effect.expiresAt > now
    );

    // 計算剩餘時間
    const effectsWithRemaining = activeEffects.map((effect: TemporaryEffect) => {
      const remainingMs = effect.expiresAt.getTime() - now.getTime();
      const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

      return {
        ...effect,
        remainingSeconds,
      };
    });

    return {
      success: true,
      data: {
        effects: effectsWithRemaining,
      },
    };
  } catch (error) {
    console.error('[getTemporaryEffects] Error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '取得時效性效果時發生錯誤',
    };
  }
}
