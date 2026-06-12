import dbConnect from '@/lib/db/mongodb';
import { incrGetChar } from '@/lib/perf/perf-context';
import { resolveIsActive } from '@/lib/game/resolve-is-active';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
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

  const { isActive, gameId, baselineCharacter } = await resolveIsActive(characterId);

  if (isActive) {
    const runtimeCharacter = await CharacterRuntime.findOne({
      refId: characterId,
      type: 'runtime',
    });
    if (runtimeCharacter) return runtimeCharacter;

    // Runtime 遺失（異常）：降級回 Baseline（純快取路徑需 1 額外查詢）
    console.warn(
      `[getCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${gameId}`
    );
    const fallback = baselineCharacter ?? (await Character.findById(characterId));
    if (!fallback) throw new Error(`找不到角色：${characterId}`);
    return fallback;
  }

  const baseline = baselineCharacter ?? (await Character.findById(characterId));
  if (!baseline) throw new Error(`找不到角色：${characterId}`);
  return baseline;
}
