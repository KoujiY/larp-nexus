import dbConnect from '@/lib/db/mongodb';
import Game from '@/lib/db/models/Game';
import GameRuntime from '@/lib/db/models/GameRuntime';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { writeLog } from '@/lib/logs/write-log';
import { emitGameEnded } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';

/**
 * 結束遊戲邏輯（CONTEST_CONSISTENCY_PLAN D2：convert-in-place）
 *
 * 順序設計（flag-first + 原地轉型）：
 * 1. 設定 Game.isActive = false（提前到第一步 —— 新進 action 立即路由 Baseline）
 * 2. GameRuntime 原地轉型為 snapshot（updateOne $set type）
 * 3. CharacterRuntime 原地轉型為 snapshot（updateMany $set type）
 * 4. 記錄操作日誌（game_end）
 * 5. 推送 WebSocket 事件
 *
 * 與舊版「複製快照 → deleteMany → isActive=false」的差異：
 * 原地轉型是 per-doc 原子操作，不存在「快照已拍但 runtime 仍接受寫入」的
 * silent data loss 視窗 —— 已快取 isActive=true 的 in-flight 玩家寫入，
 * 要嘛在轉型前落地（保留在快照中）、要嘛轉型後查無 type='runtime' 文件
 * 而 loud throw（updateCharacterData 既有的「找不到 Runtime Character」路徑）。
 * snapshot 沿用 runtime 的 _id（codebase 無 snapshot 讀取端、
 * {refId, type} 索引非 unique，已驗證無依賴）。
 *
 * @param gameId - Baseline Game ID
 * @param gmUserId - GM User ID（用於權限檢查和日誌記錄）
 * @param snapshotName - 快照名稱（可選，預設使用時間戳）
 * @returns 操作結果
 */
export async function endGame(
  gameId: string,
  gmUserId: string,
  snapshotName?: string
): Promise<ApiResponse<{ message: string; snapshotId?: string }>> {
  try {
    await dbConnect();

    // ========== 前置：查詢 Baseline Game 並驗證權限 ==========
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
        message: '無權限操作此遊戲',
      };
    }

    // 查詢 GameRuntime
    const gameRuntime = await GameRuntime.findOne({
      refId: game._id,
      type: 'runtime',
    });

    if (!gameRuntime) {
      // 資料不一致：isActive 為 true 但 Runtime 不存在
      // 使用 updateOne 避免觸發整份文件 validation（老舊文件可能不符新 schema）
      if (game.isActive) {
        await Game.updateOne(
          { _id: game._id },
          { $set: { isActive: false } },
        );

        try {
          await writeLog({
            gameId: game._id.toString(),
            actorType: 'gm',
            actorId: gmUserId,
            action: 'game_end',
            details: {
              gameName: game.name,
              gameCode: game.gameCode,
              note: 'Runtime 不存在，僅重設 isActive',
            },
          });
        } catch (logError) {
          console.error('[endGame] writeLog failed (non-fatal):', logError);
        }

        return {
          success: true,
          data: { message: '遊戲已結束（無 Runtime 資料可快照）' },
        };
      }

      return {
        success: false,
        error: 'RUNTIME_NOT_FOUND',
        message: '遊戲尚未開始或已結束',
      };
    }

    // ========== 步驟 1：設定 Game.isActive = false（flag-first） ==========
    // 提前到轉型之前：新進 action 解析 isActive=false → 路由 Baseline，
    // 縮小「已快取 isActive=true 的 in-flight 寫入」殘留視窗。
    // 使用 updateOne 避免觸發整份文件 validation（老舊文件可能不符新 schema）
    await Game.updateOne(
      { _id: game._id },
      { $set: { isActive: false } },
    );

    // ========== 步驟 2-3：runtime 原地轉型為 snapshot ==========
    const finalSnapshotName = snapshotName || `快照 ${new Date().toISOString()}`;
    const snapshotCreatedAt = new Date();
    let characterCount = 0;

    try {
      // 2. GameRuntime 轉型
      await GameRuntime.updateOne(
        { _id: gameRuntime._id },
        {
          $set: {
            type: 'snapshot',
            isActive: false, // Snapshot 的 isActive 應為 false
            snapshotName: finalSnapshotName,
            snapshotCreatedAt,
          },
        },
      );

      // 3. CharacterRuntime 批次轉型（per-doc 原子，關聯到轉型後的 GameRuntime）
      const charResult = await CharacterRuntime.updateMany(
        { gameId, type: 'runtime' },
        {
          $set: {
            type: 'snapshot',
            snapshotGameRuntimeId: gameRuntime._id,
          },
        },
      );
      characterCount = charResult.modifiedCount;
    } catch (error) {
      // isActive 已先落地（遊戲已結束）。轉型部分失敗的殘留 runtime 文件：
      // GM 重按「結束遊戲」可重試轉型（GameRuntime 仍為 runtime 時走完整路徑、
      // 已轉型時走「僅重設 isActive」降級路徑）；下次 startGame 的 deleteMany
      // 也會清理孤兒 CharacterRuntime
      console.error('[endGame] Error during runtime conversion:', error);
      return {
        success: false,
        error: 'SNAPSHOT_CONVERSION_FAILED',
        message: '遊戲快照轉換失敗，請再次嘗試結束遊戲',
      };
    }

    // ========== 步驟 4：記錄操作日誌 ==========
    await writeLog({
      gameId: game._id.toString(),
      actorType: 'gm',
      actorId: gmUserId,
      action: 'game_end',
      details: {
        gameName: game.name,
        gameCode: game.gameCode,
        characterCount,
        snapshotName: finalSnapshotName,
        snapshotId: gameRuntime._id?.toString() || undefined,
      },
    });

    // ========== 步驟 5：推送 WebSocket 事件 ==========
    await emitGameEnded(game._id.toString(), {
      gameId: game._id.toString(),
      gameCode: game.gameCode,
      gameName: game.name,
      snapshotId: gameRuntime._id?.toString(),
    });

    return {
      success: true,
      data: {
        message: '遊戲已成功結束',
        snapshotId: gameRuntime._id.toString(),
      },
    };
  } catch (error) {
    console.error('[endGame] Unexpected error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '發生錯誤，請稍後再試',
    };
  }
}
