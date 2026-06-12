import dbConnect from '@/lib/db/mongodb';
import { resolveIsActive } from '@/lib/game/resolve-is-active';
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';

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
 * 路由決策（含 per-request 快取）由 resolveIsActive 統一處理：
 * - isActive = true：CharacterRuntime.findOneAndUpdate({ refId, type: 'runtime' })
 * - isActive = false：Character.findByIdAndUpdate(characterId)
 * 兩個分支更新落空（目標文件不存在）時一律 throw，不靜默 no-op。
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

  const { isActive, gameId } = await resolveIsActive(characterId);

  if (isActive) {
    const result = await CharacterRuntime.findOneAndUpdate(
      { refId: characterId, type: 'runtime' },
      updates,
      mongooseOptions,
    );
    if (!result) {
      console.error(
        `[updateCharacterData] 遊戲進行中但找不到 Runtime Character：characterId=${characterId}, gameId=${gameId}`
      );
      throw new Error(`找不到 Runtime Character：characterId=${characterId}`);
    }
    return;
  }

  const baselineResult = await Character.findByIdAndUpdate(characterId, updates, mongooseOptions);
  if (!baselineResult) {
    // 與快取路徑一致：更新落空（角色於解析後消失）不可靜默 no-op
    throw new Error(`找不到角色：${characterId}`);
  }
}
