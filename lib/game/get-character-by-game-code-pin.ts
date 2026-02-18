import dbConnect from '@/lib/db/mongodb';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';
import type { CharacterDocument } from '@/lib/db/models/Character';
import type { CharacterRuntimeDocument } from '@/lib/db/models/CharacterRuntime';

/**
 * Phase 10.4.4: 根據 Game Code 和 PIN 取得角色資料（自動判斷 Baseline/Runtime）
 *
 * 邏輯：
 * 1. 查詢 Game（使用 gameCode），取得 gameId 和 isActive
 * 2. 如果 Game 不存在，拋出錯誤
 * 3. 如果 isActive = true：
 *    - 查詢 CharacterRuntime (gameId + pin + type: 'runtime')
 *    - 如果找到 Runtime，返回 Runtime
 *    - 如果找不到 Runtime（異常情況），回退到查詢 Baseline
 * 4. 如果 isActive = false：
 *    - 查詢 Baseline Character (gameId + pin)
 *    - 如果找到，返回 Baseline
 * 5. 如果找不到角色，拋出錯誤
 *
 * @param gameCode - 遊戲代碼（6 位英數字，例如 'ABC123'）
 * @param pin - 角色 PIN 碼
 * @returns Baseline Character 或 Runtime Character
 * @throws Error 如果 Game 或 Character 不存在
 */
export async function getCharacterByGameCodeAndPin(
  gameCode: string,
  pin: string
): Promise<CharacterDocument | CharacterRuntimeDocument> {
  await dbConnect();

  // 步驟 1：查詢 Game，取得 gameId 和 isActive
  const game = await Game.findOne({ gameCode: gameCode.toUpperCase().trim() });
  if (!game) {
    throw new Error(`找不到遊戲：gameCode=${gameCode}`);
  }

  const gameId = game._id;
  const isActive = game.isActive;

  // 步驟 2：根據 isActive 狀態查詢角色
  if (isActive) {
    // 遊戲進行中，查詢 CharacterRuntime
    const runtimeCharacter = await CharacterRuntime.findOne({
      gameId,
      pin: pin.trim(),
      type: 'runtime',
    });

    if (runtimeCharacter) {
      // 找到 Runtime，返回 Runtime
      return runtimeCharacter;
    }

    // 找不到 Runtime（異常情況），記錄警告並嘗試查詢 Baseline
    console.warn(
      `[getCharacterByGameCodeAndPin] 遊戲進行中但找不到 Runtime Character：gameCode=${gameCode}, pin=${pin}, gameId=${gameId.toString()}`
    );

    // 回退到查詢 Baseline
    const baselineCharacter = await Character.findOne({
      gameId,
      pin: pin.trim(),
    });

    if (baselineCharacter) {
      console.warn(
        `[getCharacterByGameCodeAndPin] 使用 Baseline Character 作為回退方案：characterId=${baselineCharacter._id.toString()}`
      );
      return baselineCharacter;
    }
  } else {
    // 遊戲未開始或已結束，查詢 Baseline Character
    const baselineCharacter = await Character.findOne({
      gameId,
      pin: pin.trim(),
    });

    if (baselineCharacter) {
      return baselineCharacter;
    }
  }

  // 找不到角色，拋出錯誤
  throw new Error(
    `找不到角色：gameCode=${gameCode}, pin=${pin}, gameId=${gameId.toString()}, isActive=${isActive}`
  );
}
