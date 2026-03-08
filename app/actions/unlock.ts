'use server';

import { getCharacterByGameCodeAndPin } from '@/lib/game/get-character-by-game-code-pin';
import { getCharactersByPinOnly } from '@/lib/game/get-characters-by-pin';
import Game from '@/lib/db/models/Game';
import type { ApiResponse } from '@/types/api';

/**
 * Phase 10.5.1: 使用 Game Code + PIN 解鎖角色
 *
 * 使用場景：
 * - 玩家輸入完整的 Game Code 和 PIN 以進入遊戲
 * - 前端會根據返回的 characterId 導航到角色頁面
 *
 * @param gameCode - 遊戲代碼（6 位英數字，例如 'ABC123'）
 * @param pin - 角色 PIN 碼
 * @returns 角色 ID 和基本資訊
 */
export async function unlockByGameCodeAndPin(
  gameCode: string,
  pin: string
): Promise<
  ApiResponse<{
    characterId: string;
    characterName: string;
    gameId: string;
    gameName: string;
  }>
> {
  try {
    // 輸入驗證
    if (!gameCode || !pin) {
      return {
        success: false,
        error: 'INVALID_INPUT',
        message: '請輸入遊戲代碼和 PIN',
      };
    }

    // 調用工具函數查詢角色
    const character = await getCharacterByGameCodeAndPin(gameCode, pin);

    // 查詢 Game 取得遊戲名稱
    const game = await Game.findById(character.gameId).select('name').lean();
    const gameName = game?.name || '未知遊戲';

    // 成功返回角色資訊
    return {
      success: true,
      data: {
        characterId: character._id.toString(),
        characterName: character.name,
        gameId: character.gameId.toString(),
        gameName,
      },
      message: '解鎖成功',
    };
  } catch (error) {
    console.error('Error unlocking by game code and pin:', error);

    // 轉換錯誤訊息
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';

    if (errorMessage.includes('找不到遊戲')) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: '遊戲代碼不存在',
      };
    }

    if (errorMessage.includes('找不到角色')) {
      return {
        success: false,
        error: 'CHARACTER_NOT_FOUND',
        message: 'PIN 碼不正確或角色不存在',
      };
    }

    return {
      success: false,
      error: 'UNLOCK_FAILED',
      message: `解鎖失敗：${errorMessage}`,
    };
  }
}

/**
 * Phase 10.5.1: 僅使用 PIN 預覽角色列表
 *
 * 使用場景：
 * - 玩家只輸入 PIN（沒有 Game Code）時，顯示所有使用該 PIN 的角色
 * - 用於預覽或選擇角色
 *
 * @param pin - 角色 PIN 碼
 * @returns 所有匹配的角色列表
 */
export async function unlockByPinOnly(
  pin: string
): Promise<
  ApiResponse<
    Array<{
      characterId: string;
      characterName: string;
      gameId: string;
      gameName: string;
    }>
  >
> {
  try {
    // 輸入驗證
    if (!pin) {
      return {
        success: false,
        error: 'INVALID_INPUT',
        message: '請輸入 PIN',
      };
    }

    // 調用工具函數查詢所有匹配的角色
    const characters = await getCharactersByPinOnly(pin);

    // 返回結果
    if (characters.length === 0) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'PIN 不存在',
      };
    }

    return {
      success: true,
      data: characters,
      message: `找到 ${characters.length} 個角色`,
    };
  } catch (error) {
    console.error('Error unlocking by pin only:', error);

    const errorMessage = error instanceof Error ? error.message : '未知錯誤';

    return {
      success: false,
      error: 'UNLOCK_FAILED',
      message: `查詢失敗：${errorMessage}`,
    };
  }
}
