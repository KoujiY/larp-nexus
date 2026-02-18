import Log from '@/lib/db/models/Log';

/**
 * Phase 10.6.1: Log 寫入參數介面
 */
export interface WriteLogParams {
  /** 所屬遊戲 ID */
  gameId: string;
  /** 相關角色 ID（可選） */
  characterId?: string;
  /** 操作者類型 */
  actorType: 'gm' | 'system' | 'character';
  /** 操作者 ID（GM User ID / 'system' / Character ID） */
  actorId: string;
  /** 操作類型（如：'game_start', 'stat_change', 'item_use'） */
  action: string;
  /** 操作詳細資訊（彈性設計，支援任意結構） */
  details: Record<string, unknown>;
}

/**
 * Phase 10.6.1: 通用 Log 寫入函數
 *
 * 功能：
 * - 統一的 Log 寫入介面
 * - 自動設定 timestamp
 * - 簡化各處的 Log 記錄邏輯
 *
 * @param params - Log 寫入參數
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await writeLog({
 *   gameId: game._id.toString(),
 *   actorType: 'gm',
 *   actorId: gmUserId,
 *   action: 'game_start',
 *   details: {
 *     gameName: game.name,
 *     characterCount: characters.length,
 *   },
 * });
 * ```
 */
export async function writeLog(params: WriteLogParams): Promise<void> {
  await Log.create({
    timestamp: new Date(),
    ...params,
  });
}
