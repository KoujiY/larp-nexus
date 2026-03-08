import dbConnect from '@/lib/db/mongodb';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';

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
 * @returns void
 */
export async function updateCharacterData(
  characterId: string,
  updates: Record<string, unknown>
): Promise<void> {
  await dbConnect();

  // 步驟 1：查詢 Baseline Character，取得 gameId
  const baselineCharacter = await Character.findById(characterId);
  if (!baselineCharacter) {
    throw new Error(`找不到角色：${characterId}`);
  }

  const gameId = baselineCharacter.gameId;

  // 步驟 2：查詢 Game，取得 isActive
  const game = await Game.findById(gameId);
  if (!game) {
    throw new Error(`找不到遊戲：${gameId.toString()}`);
  }

  // 步驟 3：如果 isActive = true，更新 Runtime
  if (game.isActive) {
    const result = await CharacterRuntime.findOneAndUpdate(
      {
        refId: baselineCharacter._id,
        type: 'runtime',
      },
      updates,
      { new: true }
    );

    if (!result) {
      // 找不到 Runtime（異常情況），記錄錯誤
      console.error(
        `[updateCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${gameId.toString()}`
      );
      throw new Error(
        `找不到 Runtime Character：characterId=${characterId}`
      );
    }

    return;
  }

  // 步驟 4：如果 isActive = false，更新 Baseline
  await Character.findByIdAndUpdate(characterId, updates, { new: true });
}
