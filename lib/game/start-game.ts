import dbConnect from '@/lib/db/mongodb';
import Game from '@/lib/db/models/Game';
import Character from '@/lib/db/models/Character';
import GameRuntime from '@/lib/db/models/GameRuntime';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { writeLog } from '@/lib/logs/write-log';
import { emitGameStarted } from '@/lib/websocket/events';
import type { ApiResponse } from '@/types/api';
import type { CharacterDocument } from '@/lib/db/models/Character';
import mongoose from 'mongoose';

/**
 * Phase 10.3.1: 開始遊戲邏輯
 *
 * 功能：
 * 1. 查詢 Baseline Game 和所有 Characters
 * 2. 檢查遊戲狀態（避免重複開始）
 * 3. 複製 Baseline → Runtime（GameRuntime + CharacterRuntime）
 * 4. 設定 Game.isActive = true
 * 5. 記錄操作日誌（game_start）
 * 6. 推送 WebSocket 事件（Phase 10.7 實作）
 *
 * @param gameId - Baseline Game ID
 * @param gmUserId - GM User ID（用於權限檢查和日誌記錄）
 * @returns 操作結果
 */
export async function startGame(
  gameId: string,
  gmUserId: string
): Promise<ApiResponse<{ message: string }>> {
  try {
    await dbConnect();

    // ========== 步驟 1：查詢 Baseline Game 和所有 Characters ==========
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

    const characters = await Character.find({ gameId });

    // ========== 步驟 2：檢查遊戲狀態 ==========
    const existingRuntime = await GameRuntime.findOne({
      refId: game._id,
      type: 'runtime',
    });

    if (game.isActive && existingRuntime) {
      // 遊戲已在進行中，且 Runtime 存在
      console.warn(
        `[startGame] Game ${gameId} is already active with runtime. Frontend should confirm overwrite.`
      );
      // 前端應在調用此函數前顯示確認對話框，因此這裡繼續執行覆蓋邏輯
    }

    // ========== 步驟 3：複製 Baseline → Runtime ==========
    let createdGameRuntime: mongoose.Document | null = null;
    const createdCharacterRuntimeIds: mongoose.Types.ObjectId[] = [];

    try {
      // 3.1 建立 GameRuntime（使用 findOneAndUpdate + upsert 確保唯一性）
      createdGameRuntime = await GameRuntime.findOneAndUpdate(
        { refId: game._id, type: 'runtime' }, // 查詢條件
        {
          refId: game._id,
          type: 'runtime',
          gmUserId: game.gmUserId,
          name: game.name,
          description: game.description,
          gameCode: game.gameCode,
          isActive: true,
          publicInfo: game.publicInfo,
          randomContestMaxValue: game.randomContestMaxValue,
          // 複製預設事件，初始化執行狀態
          presetEvents: (game.presetEvents || []).map(
            (event: unknown) => {
              const plain = typeof (event as { toObject?: unknown }).toObject === 'function'
                ? (event as { toObject: () => Record<string, unknown> }).toObject()
                : event as Record<string, unknown>;
              return { ...plain, executionCount: 0, executedAt: undefined };
            },
          ),
        },
        {
          upsert: true, // 不存在則建立
          new: true, // 返回更新後的文檔
          setDefaultsOnInsert: true,
        }
      );

      // 3.2 刪除舊的 CharacterRuntime（如果存在）
      await CharacterRuntime.deleteMany({ gameId, type: 'runtime' });

      // 3.3 批次建立所有 CharacterRuntime
      const characterRuntimeDocs = characters.map((char: CharacterDocument) => ({
        refId: char._id,
        type: 'runtime',
        gameId: char.gameId,
        name: char.name,
        description: char.description,
        imageUrl: char.imageUrl,
        hasPinLock: char.hasPinLock,
        pin: char.pin,
        publicInfo: char.publicInfo,
        secretInfo: char.secretInfo,
        tasks: char.tasks,
        items: char.items,
        stats: char.stats,
        skills: char.skills,
        viewedItems: char.viewedItems || [],
        temporaryEffects: char.temporaryEffects || [],
      }));

      const createdCharacters = await CharacterRuntime.insertMany(
        characterRuntimeDocs
      );
      createdCharacterRuntimeIds.push(
        ...createdCharacters.map((c) => c._id as mongoose.Types.ObjectId)
      );
    } catch (error) {
      // 錯誤處理：手動回滾（刪除已建立的 Runtime）
      console.error('[startGame] Error during runtime creation:', error);

      // 回滾：刪除已建立的 GameRuntime
      if (createdGameRuntime) {
        await GameRuntime.deleteOne({ _id: createdGameRuntime._id });
      }

      // 回滾：刪除已建立的 CharacterRuntime
      if (createdCharacterRuntimeIds.length > 0) {
        await CharacterRuntime.deleteMany({
          _id: { $in: createdCharacterRuntimeIds },
        });
      }

      return {
        success: false,
        error: 'RUNTIME_CREATION_FAILED',
        message: '建立遊戲進行中狀態失敗，請稍後再試',
      };
    }

    // ========== 步驟 4：設定 Game.isActive = true ==========
    game.isActive = true;
    await game.save();

    // ========== 步驟 5：記錄操作日誌 ==========
    await writeLog({
      gameId: game._id.toString(),
      actorType: 'gm',
      actorId: gmUserId,
      action: 'game_start',
      details: {
        gameName: game.name,
        gameCode: game.gameCode,
        characterCount: characters.length,
      },
    });

    // ========== 步驟 6：推送 WebSocket 事件（Phase 10.7）==========
    await emitGameStarted(game._id.toString(), {
      gameId: game._id.toString(),
      gameCode: game.gameCode,
      gameName: game.name,
    });

    return {
      success: true,
      data: {
        message: '遊戲已成功開始',
      },
    };
  } catch (error) {
    console.error('[startGame] Unexpected error:', error);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '發生錯誤，請稍後再試',
    };
  }
}
