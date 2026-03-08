import dbConnect from '@/lib/db/mongodb';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import Game from '@/lib/db/models/Game';
import type { CharacterDocument } from '@/lib/db/models/Character';
import type { CharacterRuntimeDocument } from '@/lib/db/models/CharacterRuntime';

/**
 * Phase 10.4.1: 取得角色資料（自動判斷 Baseline/Runtime）
 *
 * 邏輯：
 * 1. 查詢 Baseline Character，取得 gameId
 * 2. 查詢 Game，取得 isActive
 * 3. 如果 isActive = true：
 *    - 查詢 CharacterRuntime (type: 'runtime')
 *    - 如果找到 Runtime，返回 Runtime
 *    - 如果找不到 Runtime（異常情況），返回 Baseline（並記錄警告）
 * 4. 如果 isActive = false：
 *    - 返回 Baseline Character
 *
 * @param characterId - Baseline Character ID
 * @returns Baseline Character 或 Runtime Character
 */
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

export async function getCharacterData(
  characterId: string
): Promise<CharacterDocument | CharacterRuntimeDocument> {
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

  // 步驟 3：如果 isActive = true，查詢 Runtime
  if (game.isActive) {
    const runtimeCharacter = await CharacterRuntime.findOne({
      refId: baselineCharacter._id,
      type: 'runtime',
    });

    if (runtimeCharacter) {
      // 找到 Runtime，返回 Runtime
      return runtimeCharacter;
    } else {
      // 找不到 Runtime（異常情況），記錄警告並返回 Baseline
      console.warn(
        `[getCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${gameId.toString()}`
      );
      return baselineCharacter;
    }
  }

  // 步驟 4：如果 isActive = false，返回 Baseline
  return baselineCharacter;
}
