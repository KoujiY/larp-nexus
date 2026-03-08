// Phase 10: 前端 Game Code 生成函數（純函數，不依賴資料庫）

/**
 * Game Code 字符集（大寫英文字母 + 數字）
 */
const GAME_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Game Code 長度
 */
const GAME_CODE_LENGTH = 6;

/**
 * 生成隨機的 Game Code（6 位英數字）
 * 前端專用函數，不檢查唯一性
 *
 * @returns 6 位英數字的字串（例如：'ABC123'）
 *
 * @example
 * ```typescript
 * const code = generateGameCodeClient();
 * console.log(code); // 'A1B2C3'
 * ```
 */
export function generateGameCodeClient(): string {
  let code = '';
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * GAME_CODE_CHARSET.length);
    code += GAME_CODE_CHARSET[randomIndex];
  }
  return code;
}

/**
 * 驗證 Game Code 格式是否正確
 *
 * @param gameCode - 要驗證的 Game Code
 * @returns 如果格式正確返回 true，否則返回 false
 *
 * @example
 * ```typescript
 * isValidGameCodeFormat('ABC123'); // true
 * isValidGameCodeFormat('abc123'); // true（會自動轉大寫）
 * isValidGameCodeFormat('ABCD12'); // true
 * isValidGameCodeFormat('AB123');  // false（只有 5 位）
 * isValidGameCodeFormat('ABCD@1'); // false（包含特殊字符）
 * ```
 */
export function isValidGameCodeFormat(gameCode: string): boolean {
  const gameCodeRegex = /^[A-Z0-9]{6}$/;
  const trimmedCode = gameCode.trim().toUpperCase();
  return gameCodeRegex.test(trimmedCode);
}
