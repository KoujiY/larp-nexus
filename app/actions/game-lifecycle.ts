'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { startGame } from '@/lib/game/start-game';
import { endGame } from '@/lib/game/end-game';
import type { ApiResponse } from '@/types/api';

/**
 * Phase 10.3.3: 開始遊戲 Server Action
 *
 * 功能：
 * - 驗證 GM 身份（使用 getCurrentGMUserId）
 * - 調用底層 startGame 邏輯
 * - 重新驗證頁面快取（觸發 UI 更新）
 *
 * @param gameId - Baseline Game ID
 * @returns 操作結果
 */
export async function startGameAction(
  gameId: string
): Promise<ApiResponse<{ message: string }>> {
  try {
    // 驗證 GM 身份
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    // 調用底層邏輯
    const result = await startGame(gameId, gmUserId);

    // 如果成功，重新驗證相關頁面
    if (result.success) {
      revalidatePath(`/games/${gameId}`);
      revalidatePath('/games');
    }

    return result;
  } catch (error) {
    console.error('[startGameAction] Unexpected error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '發生錯誤，請稍後再試',
    };
  }
}

/**
 * Phase 10.3.3: 結束遊戲 Server Action
 *
 * 功能：
 * - 驗證 GM 身份（使用 getCurrentGMUserId）
 * - 調用底層 endGame 邏輯
 * - 重新驗證頁面快取（觸發 UI 更新）
 *
 * @param gameId - Baseline Game ID
 * @param snapshotName - 快照名稱（可選）
 * @returns 操作結果（包含 snapshotId）
 */
export async function endGameAction(
  gameId: string,
  snapshotName?: string
): Promise<ApiResponse<{ message: string; snapshotId?: string }>> {
  try {
    // 驗證 GM 身份
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    // 調用底層邏輯
    const result = await endGame(gameId, gmUserId, snapshotName);

    // 如果成功，重新驗證相關頁面
    if (result.success) {
      revalidatePath(`/games/${gameId}`);
      revalidatePath('/games');
    }

    return result;
  } catch (error) {
    console.error('[endGameAction] Unexpected error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '發生錯誤，請稍後再試',
    };
  }
}
