// Phase 10: Game Code 生成邏輯

import Game from '@/lib/db/models/Game';

/**
 * Game Code 字符集（大寫英文字母 + 數字）
 */
const GAME_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Game Code 長度
 */
const GAME_CODE_LENGTH = 6;

/**
 * 最大重試次數（生成唯一 Game Code 時）
 */
const MAX_RETRY_ATTEMPTS = 10;

/**
 * 生成隨機的 Game Code（6 位英數字）
 *
 * @returns 6 位英數字的字串（例如：'ABC123'）
 *
 * @example
 * ```typescript
 * const code = generateGameCode();
 * console.log(code); // 'A1B2C3'
 * ```
 */
export function generateGameCode(): string {
  let code = '';
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * GAME_CODE_CHARSET.length);
    code += GAME_CODE_CHARSET[randomIndex];
  }
  return code;
}

/**
 * 檢查 Game Code 是否唯一（資料庫中不存在）
 *
 * @param gameCode - 要檢查的 Game Code
 * @returns 如果唯一（不存在）則返回 true，否則返回 false
 *
 * @example
 * ```typescript
 * const isUnique = await isGameCodeUnique('ABC123');
 * if (isUnique) {
 *   console.log('此 Game Code 可以使用');
 * } else {
 *   console.log('此 Game Code 已被使用');
 * }
 * ```
 */
export async function isGameCodeUnique(gameCode: string): Promise<boolean> {
  try {
    const existingGame = await Game.findOne({ gameCode });
    return !existingGame; // 如果找不到，表示唯一
  } catch (error) {
    console.error('檢查 Game Code 唯一性時發生錯誤:', error);
    throw new Error('無法檢查 Game Code 唯一性');
  }
}

/**
 * 生成唯一的 Game Code（最多重試 10 次）
 *
 * @returns 唯一的 6 位英數字 Game Code
 * @throws 如果重試 10 次後仍然無法生成唯一的 Game Code，則拋出錯誤
 *
 * @example
 * ```typescript
 * try {
 *   const uniqueCode = await generateUniqueGameCode();
 *   console.log('生成的唯一 Game Code:', uniqueCode);
 * } catch (error) {
 *   console.error('無法生成唯一的 Game Code:', error);
 * }
 * ```
 */
export async function generateUniqueGameCode(): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const code = generateGameCode();
    const isUnique = await isGameCodeUnique(code);

    if (isUnique) {
      return code;
    }

    // 如果不唯一，記錄重試資訊（僅在開發環境）
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `Game Code '${code}' 已存在，正在重試... (${attempt}/${MAX_RETRY_ATTEMPTS})`
      );
    }
  }

  // 重試次數用盡，拋出錯誤
  throw new Error(
    `無法生成唯一的 Game Code（已重試 ${MAX_RETRY_ATTEMPTS} 次）。請稍後再試。`
  );
}
