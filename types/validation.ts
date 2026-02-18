/**
 * Phase 10.9: 驗證系統類型定義
 *
 * 提供 Game Code 和 PIN 唯一性檢查的相關類型
 */

/**
 * 唯一性檢查結果
 */
export interface UniquenessCheckResult {
  /**
   * 是否唯一（true = 唯一，false = 已存在）
   */
  isUnique: boolean;

  /**
   * 錯誤訊息（當 isUnique = false 時）
   */
  message?: string;

  /**
   * 衝突的實體 ID（可選）
   */
  conflictId?: string;
}

/**
 * Game Code 唯一性檢查參數
 */
export interface GameCodeUniquenessParams {
  /**
   * 要檢查的 Game Code
   */
  gameCode: string;

  /**
   * 排除的遊戲 ID（編輯遊戲時，排除自己）
   */
  excludeGameId?: string;
}

/**
 * PIN 唯一性檢查參數
 */
export interface PinUniquenessParams {
  /**
   * 所屬遊戲 ID
   */
  gameId: string;

  /**
   * 要檢查的 PIN
   */
  pin: string;

  /**
   * 排除的角色 ID（編輯角色時，排除自己）
   */
  excludeCharacterId?: string;
}

/**
 * 驗證錯誤類型
 */
export type ValidationErrorType =
  | 'GAME_CODE_DUPLICATE' // Game Code 已存在
  | 'PIN_DUPLICATE' // PIN 在同遊戲中已存在
  | 'GAME_CODE_INVALID_FORMAT' // Game Code 格式錯誤
  | 'PIN_INVALID_FORMAT' // PIN 格式錯誤
  | 'VALIDATION_FAILED'; // 其他驗證失敗

/**
 * 驗證錯誤
 */
export interface ValidationError {
  /**
   * 錯誤類型
   */
  type: ValidationErrorType;

  /**
   * 錯誤訊息
   */
  message: string;

  /**
   * 欄位名稱（可選）
   */
  field?: string;
}
