'use server';

import dbConnect from '@/lib/db/mongodb';
import Log from '@/lib/db/models/Log';
import Game from '@/lib/db/models/Game';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';

/**
 * Phase 10.6.3: 日誌資料類型
 */
export interface LogData {
  id: string;
  timestamp: Date;
  gameId: string;
  characterId?: string;
  actorType: 'gm' | 'system' | 'character';
  actorId: string;
  action: string;
  details: Record<string, unknown>;
}

/**
 * Phase 10.6.3: 取得遊戲日誌 Server Action
 *
 * 功能：
 * - 驗證 GM 身份和權限
 * - 查詢遊戲日誌（按時間降序）
 * - 支援限制返回數量
 *
 * @param gameId - Baseline Game ID
 * @param limit - 返回數量限制（預設 100）
 * @returns 日誌列表
 */
export async function getGameLogs(
  gameId: string,
  options?: { limit?: number; characterId?: string }
): Promise<ApiResponse<LogData[]>> {
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

    await dbConnect();

    // 驗證 GM 對該遊戲的訪問權限
    const game = await Game.findById(gameId);
    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此遊戲',
      };
    }

    if (game.gmUserId.toString() !== gmUserId) {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看此遊戲的日誌',
      };
    }

    // 查詢日誌（按時間降序）
    const logLimit = options?.limit || 100;
    const query: Record<string, unknown> = { gameId: game._id };
    if (options?.characterId) {
      query.characterId = options.characterId;
    }
    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .limit(logLimit)
      .lean();

    // 轉換為 LogData 格式
    const logData: LogData[] = logs.map((log) => ({
      id: log._id.toString(),
      timestamp: log.timestamp,
      gameId: log.gameId.toString(),
      characterId: log.characterId?.toString(),
      actorType: log.actorType,
      actorId: log.actorId,
      action: log.action,
      details: log.details,
    }));

    return {
      success: true,
      data: logData,
      message: `成功取得 ${logData.length} 筆日誌`,
    };
  } catch (error) {
    console.error('[getGameLogs] Unexpected error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '發生錯誤，請稍後再試',
    };
  }
}
