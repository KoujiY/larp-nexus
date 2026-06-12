import {
  getCachedGameId, getCachedIsActive,
  setCachedCharGameId, setCachedIsActive,
} from '@/lib/game/game-request-cache';
import Character from '@/lib/db/models/Character';
import Game from '@/lib/db/models/Game';
import type { CharacterDocument } from '@/lib/db/models/Character';

/**
 * resolveIsActive 的解析結果
 */
export interface ResolvedActiveState {
  /** 角色所屬遊戲是否進行中（Runtime/Baseline 路由決策依據） */
  isActive: boolean;
  /** 角色所屬 game id（string） */
  gameId: string;
  /**
   * 完整路徑載入的 Baseline Character；純快取路徑為 null。
   * 呼叫端需要 Baseline 文件時可先用此值，避免重複查詢。
   */
  baselineCharacter: CharacterDocument | null;
}

/**
 * 解析角色所屬遊戲的 isActive（自動讀寫 per-request 快取）
 *
 * get/update-character-data 的共用前置：決定後續讀寫走 Runtime 還是
 * Baseline。快取命中（同請求內已解析過）時 0 查詢；未命中時查
 * Character + Game 各一次並回填快取（同請求內同 game 的 isActive
 * 已知時省去 Game 查詢）。
 *
 * 呼叫端須先完成 dbConnect。
 *
 * @param characterId - Baseline Character ID
 * @throws 找不到角色 / 找不到遊戲
 */
export async function resolveIsActive(
  characterId: string
): Promise<ResolvedActiveState> {
  // ── 快取路徑：同一請求內已知 isActive，0 查詢 ──
  const cachedGameId = getCachedGameId(characterId);
  if (cachedGameId !== undefined) {
    const cachedIsActive = getCachedIsActive(cachedGameId);
    if (cachedIsActive !== undefined) {
      return {
        isActive: cachedIsActive,
        gameId: cachedGameId,
        baselineCharacter: null,
      };
    }
  }

  // ── 完整路徑：查 Character（+ 必要時 Game）並回填快取 ──
  const baselineCharacter = await Character.findById(characterId);
  if (!baselineCharacter) {
    throw new Error(`找不到角色：${characterId}`);
  }

  const gameIdStr = baselineCharacter.gameId.toString();
  setCachedCharGameId(characterId, gameIdStr);

  // 同一請求內已查過此 game 的 isActive（例如攻擊方先查、防守方同遊戲）→ 免查 Game
  let isActive = getCachedIsActive(gameIdStr);
  if (isActive === undefined) {
    const game = await Game.findById(baselineCharacter.gameId);
    if (!game) {
      throw new Error(`找不到遊戲：${gameIdStr}`);
    }
    isActive = game.isActive === true;
    setCachedIsActive(gameIdStr, isActive);
  }

  return { isActive, gameId: gameIdStr, baselineCharacter };
}
