import type { BaseEvent } from '@/types/event';
import { getPusherServer, isPusherEnabled } from './pusher-server';
import { writePendingEvent } from './pending-events';
import dbConnect from '@/lib/db/mongodb';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';

/**
 * Phase 10.7.4: 推送事件到遊戲的所有角色
 *
 * 功能：
 * - 查詢遊戲的所有角色（根據 isActive 狀態決定查詢 Baseline 或 Runtime）
 * - 逐一推送事件到每個角色的私有頻道
 * - 同時寫入 Pending Events（確保離線玩家也能收到）
 *
 * @param gameId - Baseline Game ID
 * @param event - WebSocket 事件物件
 *
 * @example
 * ```typescript
 * await pushEventToGame(gameId, {
 *   type: 'game.started',
 *   timestamp: Date.now(),
 *   payload: {
 *     gameId: game._id.toString(),
 *     gameCode: game.gameCode,
 *     gameName: game.name,
 *   },
 * });
 * ```
 */
export async function pushEventToGame(
  gameId: string,
  event: BaseEvent
): Promise<void> {
  await dbConnect();

  // ========== 步驟 1：查詢遊戲狀態 ==========
  const game = await Game.findById(gameId).select('isActive').lean();
  if (!game) {
    console.error('[pushEventToGame] Game not found:', gameId);
    return;
  }

  // ========== 步驟 2：根據遊戲狀態查詢角色列表 ==========
  let characterIds: string[];

  if (game.isActive) {
    // 遊戲進行中：查詢 CharacterRuntime
    const runtimeCharacters = await CharacterRuntime.find({
      gameId: game._id,
      type: 'runtime',
    })
      .select('_id refId')
      .lean();

    // 使用 refId（指向 Baseline Character）作為 characterId
    characterIds = runtimeCharacters.map((char) => char.refId.toString());
  } else {
    // 遊戲未開始或已結束：查詢 Baseline Character
    const baselineCharacters = await Character.find({
      gameId: game._id,
    })
      .select('_id')
      .lean();

    characterIds = baselineCharacters.map((char) => char._id.toString());
  }

  if (characterIds.length === 0) {
    console.warn('[pushEventToGame] No characters found for game:', gameId);
    return;
  }

  // ========== 步驟 3：推送 WebSocket 事件到所有角色 ==========
  const pusher = getPusherServer();
  const pusherEnabled = isPusherEnabled();

  if (pusher && pusherEnabled) {
    await Promise.all(
      characterIds.map((characterId) =>
        pusher
          .trigger(`private-character-${characterId}`, event.type, event)
          .catch((error) => {
            console.error('[pushEventToGame] Pusher trigger error:', {
              characterId,
              eventType: event.type,
              error,
            });
          })
      )
    );
  }

  // ========== 步驟 4：寫入 Pending Events ==========
  await Promise.all(
    characterIds.map((characterId) =>
      writePendingEvent(characterId, event.type, event.payload as Record<string, unknown>)
    )
  );

  console.log(`[pushEventToGame] Event "${event.type}" sent to ${characterIds.length} characters`);
}
