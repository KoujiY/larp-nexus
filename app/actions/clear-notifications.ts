'use server';

import dbConnect from '@/lib/db/mongodb';
import Game from '@/lib/db/models/Game';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { emitNotificationsCleared } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';

/**
 * 一鍵清除全體玩家前端通知（不刪除任何 DB 資料）
 *
 * 僅廣播 `notifications.cleared` 事件到遊戲頻道，由各玩家 client 自行清空
 * localStorage 中的通知面板。玩家通知本就不入庫，GM 端歷史紀錄
 * （Log collection）亦完全不受影響 —— 此操作對資料庫零寫入。
 *
 * 權限：限該遊戲的 GM。
 *
 * @param gameId - Baseline Game ID
 */
export async function clearPlayerNotifications(gameId: string): Promise<ApiResponse<null>> {
  try {
    // 驗證 GM 身份
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    await dbConnect();

    // 驗證 GM 對該遊戲的訪問權限
    const game = await Game.findById(gameId);
    if (!game) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此遊戲' };
    }
    if (game.gmUserId.toString() !== gmUserId) {
      return { success: false, error: 'FORBIDDEN', message: '無權限操作此遊戲' };
    }

    // 廣播前端清除訊號（不碰 DB）
    await emitNotificationsCleared(gameId, { gameId, clearedAt: Date.now() });

    return { success: true, data: null, message: '已通知全體玩家清除通知顯示' };
  } catch (error) {
    console.error('[clearPlayerNotifications] Unexpected error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '發生錯誤，請稍後再試',
    };
  }
}
