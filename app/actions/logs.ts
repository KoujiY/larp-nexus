'use server';

import dbConnect from '@/lib/db/mongodb';
import { withAction } from '@/lib/actions/action-wrapper';
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
 * getGameLogs 查詢選項
 */
export interface GetGameLogsOptions {
  /** 返回數量上限（預設 100） */
  limit?: number;
  /** 僅查詢指定角色的紀錄 */
  characterId?: string;
  /**
   * 增量游標（ISO 時間戳）：僅回傳此時間（含）之後的紀錄。
   * 以 `$gte` 查詢——與游標同毫秒的既有紀錄會重複出現，
   * 呼叫端須以 id 去重（見 mergeIncrementalLogs）。
   * 無效字串視同未提供（退回全量查詢）。
   */
  since?: string;
}

/**
 * Phase 10.6.3: 取得遊戲日誌 Server Action
 *
 * 功能：
 * - 驗證 GM 身份和權限
 * - 查詢遊戲日誌（按時間降序）
 * - 支援限制返回數量與 since 增量游標（BACKLOG：GM log 增量抓取）
 *
 * @param gameId - Baseline Game ID
 * @param options - 查詢選項（limit / characterId / since）
 * @returns 日誌列表
 */
export async function getGameLogs(
  gameId: string,
  options?: GetGameLogsOptions
): Promise<ApiResponse<LogData[]>> {
  // withAction 統一包裝（perf + dbConnect + 錯誤格式化）；量測 GM 端 burst 時的呼叫頻率
  return withAction<LogData[]>('get-game-logs', () => getGameLogsImpl(gameId, options));
}

async function getGameLogsImpl(
  gameId: string,
  options?: GetGameLogsOptions
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
    // 增量游標：{gameId, timestamp} 複合 index 直接支撐此查詢形狀
    if (options?.since) {
      const sinceDate = new Date(options.since);
      if (!Number.isNaN(sinceDate.getTime())) {
        query.timestamp = { $gte: sinceDate };
      }
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
