/**
 * Phase 10.9: 唯一性檢查函數
 *
 * 提供 Game Code 和 PIN 的唯一性驗證功能
 *
 * TODO Phase 11:
 * - 移除所有 TODO 標記
 * - 實作實際的 DB 查詢邏輯
 * - 執行完整測試
 */

// TODO Phase 11: 移除以下 import 的註解
// import dbConnect from '@/lib/db/mongodb';
// import Game from '@/lib/db/models/Game';
// import Character from '@/lib/db/models/Character';

import type {
  UniquenessCheckResult,
  GameCodeUniquenessParams,
  PinUniquenessParams,
} from '@/types/validation';

/**
 * 檢查 Game Code 是否唯一
 *
 * @param params - 檢查參數
 * @param params.gameCode - 要檢查的 Game Code
 * @param params.excludeGameId - 排除的遊戲 ID（編輯時使用，排除自己）
 * @returns 唯一性檢查結果
 *
 * @example
 * ```typescript
 * // 建立新遊戲時檢查
 * const result = await checkGameCodeUniqueness({ gameCode: 'ABC123' });
 * if (!result.isUnique) {
 *   console.error(result.message); // "此遊戲代碼已被使用"
 * }
 *
 * // 編輯遊戲時檢查（排除自己）
 * const result = await checkGameCodeUniqueness({
 *   gameCode: 'ABC123',
 *   excludeGameId: 'game001'
 * });
 * ```
 */
export async function checkGameCodeUniqueness(
  params: GameCodeUniquenessParams
): Promise<UniquenessCheckResult> {
  const { gameCode, excludeGameId } = params;

  try {
    // TODO Phase 11: 實作 DB 連接
    // await dbConnect();

    // TODO Phase 11: 實作 DB 查詢邏輯
    /*
    const query: any = { gameCode: gameCode.toUpperCase() };

    // 如果是編輯模式，排除自己
    if (excludeGameId) {
      query._id = { $ne: excludeGameId };
    }

    const existingGame = await Game.findOne(query).select('_id name');

    if (existingGame) {
      return {
        isUnique: false,
        message: '此遊戲代碼已被使用，請選擇其他代碼',
        conflictId: existingGame._id.toString(),
      };
    }

    return {
      isUnique: true,
    };
    */

    // TODO Phase 11: 移除以下 placeholder 邏輯
    console.warn(
      '[checkGameCodeUniqueness] TODO Phase 11: 實作 DB 查詢邏輯',
      params
    );

    // Placeholder: 假設都是唯一的
    return {
      isUnique: true,
      message: undefined,
    };
  } catch (error) {
    console.error('[checkGameCodeUniqueness] Error:', error);
    throw new Error('檢查遊戲代碼唯一性時發生錯誤');
  }
}

/**
 * 檢查 PIN 是否在同遊戲內唯一
 *
 * @param params - 檢查參數
 * @param params.gameId - 所屬遊戲 ID
 * @param params.pin - 要檢查的 PIN
 * @param params.excludeCharacterId - 排除的角色 ID（編輯時使用，排除自己）
 * @returns 唯一性檢查結果
 *
 * @example
 * ```typescript
 * // 建立新角色時檢查
 * const result = await checkPinUniqueness({
 *   gameId: 'game001',
 *   pin: '1234'
 * });
 * if (!result.isUnique) {
 *   console.error(result.message); // "此 PIN 在本遊戲中已被使用"
 * }
 *
 * // 編輯角色時檢查（排除自己）
 * const result = await checkPinUniqueness({
 *   gameId: 'game001',
 *   pin: '1234',
 *   excludeCharacterId: 'char001'
 * });
 * ```
 */
export async function checkPinUniqueness(
  params: PinUniquenessParams
): Promise<UniquenessCheckResult> {
  const { gameId, pin, excludeCharacterId } = params;

  try {
    // TODO Phase 11: 實作 DB 連接
    // await dbConnect();

    // TODO Phase 11: 實作 DB 查詢邏輯
    /*
    const query: any = {
      gameId,
      pin,
    };

    // 如果是編輯模式，排除自己
    if (excludeCharacterId) {
      query._id = { $ne: excludeCharacterId };
    }

    const existingCharacter = await Character.findOne(query).select('_id name');

    if (existingCharacter) {
      return {
        isUnique: false,
        message: '此 PIN 在本遊戲中已被使用，請選擇其他 PIN',
        conflictId: existingCharacter._id.toString(),
      };
    }

    return {
      isUnique: true,
    };
    */

    // TODO Phase 11: 移除以下 placeholder 邏輯
    console.warn(
      '[checkPinUniqueness] TODO Phase 11: 實作 DB 查詢邏輯',
      params
    );

    // Placeholder: 假設都是唯一的
    return {
      isUnique: true,
      message: undefined,
    };
  } catch (error) {
    console.error('[checkPinUniqueness] Error:', error);
    throw new Error('檢查 PIN 唯一性時發生錯誤');
  }
}

/**
 * 驗證 Game Code 格式
 *
 * @param gameCode - 要驗證的 Game Code
 * @returns 是否符合格式（6 位英數字）
 *
 * @example
 * ```typescript
 * validateGameCodeFormat('ABC123'); // true
 * validateGameCodeFormat('abc123'); // true (會自動轉大寫)
 * validateGameCodeFormat('AB12'); // false (長度不足)
 * validateGameCodeFormat('ABC-123'); // false (包含非法字元)
 * ```
 */
export function validateGameCodeFormat(gameCode: string): boolean {
  const pattern = /^[A-Z0-9]{6}$/i; // i flag 允許小寫，後續會轉大寫
  return pattern.test(gameCode);
}

/**
 * 驗證 PIN 格式
 *
 * @param pin - 要驗證的 PIN
 * @returns 是否符合格式（4-6 位數字）
 *
 * @example
 * ```typescript
 * validatePinFormat('1234'); // true
 * validatePinFormat('123456'); // true
 * validatePinFormat('123'); // false (長度不足)
 * validatePinFormat('1234567'); // false (長度過長)
 * validatePinFormat('12a4'); // false (包含非數字)
 * ```
 */
export function validatePinFormat(pin: string): boolean {
  const pattern = /^[0-9]{4,6}$/;
  return pattern.test(pin);
}
