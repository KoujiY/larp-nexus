/**
 * PIN 碼驗證常數
 *
 * 獨立檔案，不含任何 server-side import（mongoose、dbConnect 等），
 * 確保 client component 可安全 import。
 */

/** PIN 碼格式：4 位數字 */
export const PIN_REGEX = /^\d{4}$/;

/** PIN 碼格式錯誤訊息 */
export const PIN_ERROR_MESSAGE = 'PIN 碼必須為 4 位數字';
