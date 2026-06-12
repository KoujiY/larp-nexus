import dbConnect from '@/lib/db/mongodb';
import { incrGetChar } from '@/lib/perf/perf-context';
import {
  getCachedGameId, getCachedIsActive,
  setCachedCharGameId, setCachedIsActive,
} from '@/lib/game/game-request-cache';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';
import type { CharacterDocument } from '@/lib/db/models/Character';
import type { CharacterRuntimeDocument } from '@/lib/db/models/CharacterRuntime';

/**
 * Phase 10.4.3: 從角色文件取得 Baseline Character ID
 *
 * 當角色文件可能是 Runtime 或 Baseline 時，此函數確保回傳的是 Baseline ID。
 * - 如果是 CharacterRuntimeDocument（具有 refId），回傳 refId
 * - 如果是 CharacterDocument（沒有 refId），回傳 _id
 *
 * 使用場景：WebSocket 頻道名稱、contestId 生成、外部 API 回傳等
 * 需要穩定的 Baseline ID 而非 Runtime ID 的情境。
 */
export function getBaselineCharacterId(
  doc: CharacterDocument | CharacterRuntimeDocument
): string {
  const runtimeDoc = doc as CharacterRuntimeDocument;
  if (runtimeDoc.refId) {
    return runtimeDoc.refId.toString();
  }
  return doc._id.toString();
}

/**
 * 取得角色資料（自動判斷 Baseline/Runtime）
 *
 * 遊戲進行中（isActive=true）時回傳 Runtime，否則回傳 Baseline。
 * 找不到 Runtime 時降級回傳 Baseline 並記錄警告。
 *
 * @param characterId - Baseline Character ID
 * @returns Baseline Character 或 Runtime Character
 */
export async function getCharacterData(
  characterId: string
): Promise<CharacterDocument | CharacterRuntimeDocument> {
  incrGetChar();

  await dbConnect();

  // ── 快取路徑：同一請求內已知 isActive 時跳過 Character+Game 查詢 ──
  const cachedGameId = getCachedGameId(characterId);
  if (cachedGameId !== undefined) {
    const cachedIsActive = getCachedIsActive(cachedGameId);
    if (cachedIsActive !== undefined) {
      if (cachedIsActive) {
        const runtimeCharacter = await CharacterRuntime.findOne({
          refId: characterId,
          type: 'runtime',
        });
        if (runtimeCharacter) return runtimeCharacter;
        // Runtime 遺失（異常）：降級回 Baseline（需 1 額外查詢）
        const fallback = await Character.findById(characterId);
        if (!fallback) throw new Error(`找不到角色：${characterId}`);
        console.warn(
          `[getCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${cachedGameId}`
        );
        return fallback;
      }
      // isActive=false：直接查 Baseline
      const baselineCharacter = await Character.findById(characterId);
      if (!baselineCharacter) throw new Error(`找不到角色：${characterId}`);
      return baselineCharacter;
    }
  }

  // ── 完整路徑：首次呼叫，查 Character+Game 並填入快取 ──
  const baselineCharacter = await Character.findById(characterId);
  if (!baselineCharacter) {
    throw new Error(`找不到角色：${characterId}`);
  }

  const gameId = baselineCharacter.gameId;
  const gameIdStr = gameId.toString();
  setCachedCharGameId(characterId, gameIdStr);

  // 同一請求內已查過此 game 的 isActive（例如攻擊方先查、防守方同遊戲）→ 免查 Game
  let isActive = getCachedIsActive(gameIdStr);
  if (isActive === undefined) {
    const game = await Game.findById(gameId);
    if (!game) {
      throw new Error(`找不到遊戲：${gameIdStr}`);
    }
    isActive = game.isActive === true;
    setCachedIsActive(gameIdStr, isActive);
  }

  if (isActive) {
    const runtimeCharacter = await CharacterRuntime.findOne({
      refId: baselineCharacter._id,
      type: 'runtime',
    });

    if (runtimeCharacter) {
      return runtimeCharacter;
    } else {
      console.warn(
        `[getCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${gameIdStr}`
      );
      return baselineCharacter;
    }
  }

  return baselineCharacter;
}
