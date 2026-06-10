import dbConnect from '@/lib/db/mongodb';
import {
  getCachedGameId, getCachedIsActive,
  setCachedCharGameId, setCachedIsActive,
} from '@/lib/game/game-request-cache';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';

/**
 * 更新選項（passthrough 至 Mongoose findOneAndUpdate）
 *
 * 目前僅開放 `arrayFilters`，用於針對陣列元素做 identity-based 更新
 * （例如 `items.$[target].equipped` 搭配 `{ 'target.id': itemId }`），
 * 以避免 index-based path 在並發寫入下發生 TOCTOU。
 */
export interface UpdateCharacterDataOptions {
  arrayFilters?: Array<Record<string, unknown>>;
}

/**
 * Phase 10.4.2: 更新角色資料（自動判斷 Baseline/Runtime）
 *
 * 邏輯：
 * 1. 查詢 Baseline Character，取得 gameId
 * 2. 查詢 Game，取得 isActive
 * 3. 如果 isActive = true：
 *    - 更新 CharacterRuntime.findOneAndUpdate({ refId: characterId, type: 'runtime' }, updates)
 * 4. 如果 isActive = false：
 *    - 更新 Character.findByIdAndUpdate(characterId, updates)
 *
 * @param characterId - Baseline Character ID
 * @param updates - 要更新的欄位（使用 MongoDB 更新語法，如 { $set: {...}, $push: {...} }）
 * @param options - 可選的更新選項（arrayFilters 等）
 * @returns void
 */
export async function updateCharacterData(
  characterId: string,
  updates: Record<string, unknown>,
  options?: UpdateCharacterDataOptions
): Promise<void> {
  await dbConnect();

  const mongooseOptions: {
    new: boolean;
    arrayFilters?: Array<Record<string, unknown>>;
  } = { new: true };
  if (options?.arrayFilters && options.arrayFilters.length > 0) {
    mongooseOptions.arrayFilters = options.arrayFilters;
  }

  // ── 快取路徑：同一請求內已知 isActive 時跳過 2 次前置查詢 ──
  const cachedGameId = getCachedGameId(characterId);
  if (cachedGameId !== undefined) {
    const cachedIsActive = getCachedIsActive(cachedGameId);
    if (cachedIsActive !== undefined) {
      if (cachedIsActive) {
        const result = await CharacterRuntime.findOneAndUpdate(
          { refId: characterId, type: 'runtime' },
          updates,
          mongooseOptions,
        );
        if (!result) {
          console.error(
            `[updateCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${cachedGameId}`
          );
          throw new Error(`找不到 Runtime Character：characterId=${characterId}`);
        }
        return;
      }
      await Character.findByIdAndUpdate(characterId, updates, mongooseOptions);
      return;
    }
  }

  // ── 完整路徑：無快取，查 Character+Game 並填入快取 ──
  const baselineCharacter = await Character.findById(characterId);
  if (!baselineCharacter) {
    throw new Error(`找不到角色：${characterId}`);
  }

  const gameId = baselineCharacter.gameId;
  const gameIdStr = gameId.toString();
  setCachedCharGameId(characterId, gameIdStr);

  // 同一請求內已查過此 game 的 isActive → 免查 Game
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
    const result = await CharacterRuntime.findOneAndUpdate(
      { refId: baselineCharacter._id, type: 'runtime' },
      updates,
      mongooseOptions,
    );

    if (!result) {
      console.error(
        `[updateCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${gameIdStr}`
      );
      throw new Error(`找不到 Runtime Character：characterId=${characterId}`);
    }

    return;
  }

  await Character.findByIdAndUpdate(characterId, updates, mongooseOptions);
}
