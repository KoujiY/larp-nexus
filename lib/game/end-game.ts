import dbConnect from '@/lib/db/mongodb';
import Game from '@/lib/db/models/Game';
import GameRuntime from '@/lib/db/models/GameRuntime';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { writeLog } from '@/lib/logs/write-log';
import { emitGameEnded } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';
import type { GameRuntimeDocument } from '@/lib/db/models/GameRuntime';
import type { CharacterRuntimeDocument } from '@/lib/db/models/CharacterRuntime';
import mongoose from 'mongoose';

/**
 * Phase 10.3.2: 結束遊戲邏輯
 *
 * 功能：
 * 1. 查詢 Runtime 資料（GameRuntime + CharacterRuntime）
 * 2. 建立 Snapshot（保存當前遊戲狀態）
 * 3. 刪除 Runtime 資料
 * 4. 設定 Game.isActive = false
 * 5. 記錄操作日誌（game_end）
 * 6. 推送 WebSocket 事件（Phase 10.7 實作）
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

    // ========== 步驟 1：查詢 Baseline Game 和 Runtime ==========
    const game = await Game.findById(gameId);

    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此遊戲',
      };
    }

    // 驗證 GM 權限
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

    // 查詢所有 CharacterRuntime
    const characterRuntimes = await CharacterRuntime.find({
      gameId,
      type: 'runtime',
    });

    // ========== 步驟 2：建立 Snapshot ==========
    let createdGameSnapshot: mongoose.Document | null = null;
    const createdCharacterSnapshotIds: mongoose.Types.ObjectId[] = [];

    try {
      // 2.1 建立 GameRuntime Snapshot
      const gameRuntimeDoc = gameRuntime as GameRuntimeDocument;
      const finalSnapshotName =
        snapshotName || `快照 ${new Date().toISOString()}`;
      const snapshotCreatedAt = new Date();

      createdGameSnapshot = await GameRuntime.create({
        refId: gameRuntimeDoc.refId,
        type: 'snapshot',
        gmUserId: gameRuntimeDoc.gmUserId,
        name: gameRuntimeDoc.name,
        description: gameRuntimeDoc.description,
        gameCode: gameRuntimeDoc.gameCode,
        isActive: false, // Snapshot 的 isActive 應為 false
        publicInfo: gameRuntimeDoc.publicInfo,
        randomContestMaxValue: gameRuntimeDoc.randomContestMaxValue,
        snapshotName: finalSnapshotName,
        snapshotCreatedAt,
      });

      // 2.2 批次建立 CharacterRuntime Snapshot
      const characterSnapshotDocs = characterRuntimes.map(
        (charRuntime: CharacterRuntimeDocument) => ({
          refId: charRuntime.refId,
          type: 'snapshot',
          gameId: charRuntime.gameId,
          name: charRuntime.name,
          description: charRuntime.description,
          imageUrl: charRuntime.imageUrl,
          hasPinLock: charRuntime.hasPinLock,
          pin: charRuntime.pin,
          publicInfo: charRuntime.publicInfo,
          secretInfo: charRuntime.secretInfo,
          tasks: charRuntime.tasks,
          items: charRuntime.items,
          stats: charRuntime.stats,
          skills: charRuntime.skills,
          viewedItems: charRuntime.viewedItems,
          temporaryEffects: charRuntime.temporaryEffects,
          snapshotGameRuntimeId: createdGameSnapshot?._id, // 關聯到 Snapshot Game
        })
      );

      const createdCharacters = await CharacterRuntime.insertMany(
        characterSnapshotDocs
      );
      createdCharacterSnapshotIds.push(
        ...createdCharacters.map((c) => c._id as mongoose.Types.ObjectId)
      );
    } catch (error) {
      // 錯誤處理：刪除已建立的 Snapshot（回滾）
      console.error('[endGame] Error during snapshot creation:', error);

      if (createdGameSnapshot) {
        await GameRuntime.deleteOne({ _id: createdGameSnapshot._id });
      }

      if (createdCharacterSnapshotIds.length > 0) {
        await CharacterRuntime.deleteMany({
          _id: { $in: createdCharacterSnapshotIds },
        });
      }

      return {
        success: false,
        error: 'SNAPSHOT_CREATION_FAILED',
        message: '建立遊戲快照失敗，請稍後再試',
      };
    }

    // ========== 步驟 3：刪除 Runtime ==========
    try {
      await GameRuntime.deleteOne({ _id: gameRuntime._id });
      await CharacterRuntime.deleteMany({ gameId, type: 'runtime' });
    } catch (error) {
      console.error('[endGame] Error during runtime deletion:', error);
      // 注意：此時 Snapshot 已建立，即使刪除 Runtime 失敗也不回滾 Snapshot
      // 因為 Snapshot 本身是有價值的資料，可以保留
    }

    // ========== 步驟 4：設定 Game.isActive = false ==========
    // 使用 updateOne 避免觸發整份文件 validation（老舊文件可能不符新 schema）
    await Game.updateOne(
      { _id: game._id },
      { $set: { isActive: false } },
    );

    // ========== 步驟 5：記錄操作日誌 ==========
    await writeLog({
      gameId: game._id.toString(),
      actorType: 'gm',
      actorId: gmUserId,
      action: 'game_end',
      details: {
        gameName: game.name,
        gameCode: game.gameCode,
        characterCount: characterRuntimes.length,
        snapshotName:
          snapshotName || `快照 ${new Date().toISOString()}`,
        snapshotId: createdGameSnapshot?._id?.toString() || undefined,
      },
    });

    // ========== 步驟 6：推送 WebSocket 事件（Phase 10.7）==========
    await emitGameEnded(game._id.toString(), {
      gameId: game._id.toString(),
      gameCode: game.gameCode,
      gameName: game.name,
      snapshotId: createdGameSnapshot?._id?.toString(),
    });

    return {
      success: true,
      data: {
        message: '遊戲已成功結束',
        snapshotId: createdGameSnapshot?._id.toString(),
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
