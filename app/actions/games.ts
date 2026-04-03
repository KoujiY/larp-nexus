'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Game, Character, CharacterRuntime } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';
import type { GameData } from '@/types/game';
// Phase 10: Game Code 生成邏輯
import {
  generateUniqueGameCode,
  isGameCodeUnique,
} from '@/lib/game/generate-game-code';

/**
 * Game 驗證 Schema
 */
const gameSchema = z.object({
  name: z.string().min(1, '劇本名稱不可為空').max(100, '劇本名稱不可超過 100 字元'),
  description: z.string().optional(),
});

/**
 * 取得當前 GM 的所有劇本
 */
export async function getGames(): Promise<ApiResponse<GameData[]>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    await dbConnect();
    const games = await Game.find({ gmUserId })
      .sort({ createdAt: -1 })
      .lean();

    // 一次查完所有劇本的角色數量（避免 N+1）
    const gameIds = games.map((g) => g._id);
    const counts = await Character.aggregate<{ _id: string; count: number }>([
      { $match: { gameId: { $in: gameIds } } },
      { $group: { _id: '$gameId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      counts.map((c) => [c._id.toString(), c.count]),
    );

    return {
      success: true,
      data: games.map((game) => ({
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        gameCode: game.gameCode, // Phase 10
        isActive: game.isActive,
        publicInfo: game.publicInfo,
        randomContestMaxValue: game.randomContestMaxValue,
        characterCount: countMap.get(game._id.toString()) ?? 0,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      })),
    };
  } catch (error) {
    console.error('Error fetching games:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得劇本列表',
    };
  }
}

/**
 * 根據 ID 取得劇本
 */
export async function getGameById(
  gameId: string
): Promise<ApiResponse<GameData>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    await dbConnect();
    const game = await Game.findOne({ _id: gameId, gmUserId }).lean();

    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    return {
      success: true,
      data: {
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        gameCode: game.gameCode, // Phase 10
        isActive: game.isActive,
        publicInfo: game.publicInfo,
        randomContestMaxValue: game.randomContestMaxValue,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error fetching game:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得劇本資料',
    };
  }
}

/**
 * 建立新劇本
 * Phase 10: 支援可選的 gameCode 參數（如果提供，會先檢查唯一性）
 */
export async function createGame(data: {
  name: string;
  description?: string;
  gameCode?: string; // Phase 10: 可選的 Game Code
  randomContestMaxValue?: number; // Phase D P7: 最大檢定值
}): Promise<ApiResponse<GameData>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    // 驗證輸入
    const validated = gameSchema.parse(data);

    await dbConnect();

    // Phase 10: 處理 Game Code
    let gameCode: string;
    if (data.gameCode) {
      // 使用者提供了 Game Code，需要驗證格式和唯一性
      const gameCodeRegex = /^[A-Z0-9]{6}$/;
      const trimmedCode = data.gameCode.trim().toUpperCase();

      if (!gameCodeRegex.test(trimmedCode)) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Game Code 必須是 6 位英數字（例如：ABC123）',
        };
      }

      const isUnique = await isGameCodeUnique(trimmedCode);
      if (!isUnique) {
        return {
          success: false,
          error: 'DUPLICATE_ERROR',
          message: '此遊戲代碼已被使用，請使用其他代碼',
        };
      }

      gameCode = trimmedCode;
    } else {
      // 自動生成唯一的 Game Code
      gameCode = await generateUniqueGameCode();
    }

    const game = await Game.create({
      gmUserId,
      name: validated.name,
      description: validated.description || '',
      gameCode, // Phase 10: 加入 Game Code
      isActive: false, // Phase 10: 預設為待機狀態（false）
      ...(data.randomContestMaxValue && data.randomContestMaxValue > 0
        ? { randomContestMaxValue: data.randomContestMaxValue }
        : {}),
    });

    revalidatePath('/games');

    return {
      success: true,
      data: {
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        gameCode: game.gameCode, // Phase 10
        isActive: game.isActive,
        publicInfo: game.publicInfo,
        randomContestMaxValue: game.randomContestMaxValue,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      },
      message: '劇本建立成功',
    };
  } catch (error) {
    console.error('Error creating game:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.issues[0]?.message || '驗證失敗',
      };
    }

    return {
      success: false,
      error: 'CREATE_FAILED',
      message: '無法建立劇本',
    };
  }
}

/**
 * 更新劇本
 * Phase 3: 支援更新 publicInfo
 */
export async function updateGame(
  gameId: string,
  data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    publicInfo?: {
      blocks?: Array<{
        type: 'title' | 'body';
        content: string;
      }>;
    };
    // Phase 7.6: 隨機對抗檢定設定
    randomContestMaxValue?: number;
  }
): Promise<ApiResponse<GameData>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    // 驗證輸入（部分欄位）
    if (data.name !== undefined) {
      gameSchema.shape.name.parse(data.name);
    }

    await dbConnect();
    
    // 準備更新資料
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    
    // 處理 publicInfo 更新（BackgroundBlock[] 結構）
    if (data.publicInfo !== undefined) {
      const currentGame = await Game.findOne({ _id: gameId, gmUserId });
      const currentPublicInfo = currentGame?.publicInfo || {};
      updateData.publicInfo = {
        blocks: data.publicInfo.blocks ?? currentPublicInfo.blocks ?? [],
      };
    }
    
    // Phase 7.6: 處理 randomContestMaxValue 更新
    if (data.randomContestMaxValue !== undefined) {
      if (data.randomContestMaxValue <= 0) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: '隨機對抗檢定上限值必須大於 0',
        };
      }
      updateData.randomContestMaxValue = data.randomContestMaxValue;
    }

    const game = await Game.findOneAndUpdate(
      { _id: gameId, gmUserId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    revalidatePath('/games');
    revalidatePath(`/games/${gameId}`);

    return {
      success: true,
      data: {
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        gameCode: game.gameCode, // Phase 10
        isActive: game.isActive,
        publicInfo: game.publicInfo,
        randomContestMaxValue: game.randomContestMaxValue,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      },
      message: '劇本更新成功',
    };
  } catch (error) {
    console.error('Error updating game:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.issues[0]?.message || '驗證失敗',
      };
    }

    return {
      success: false,
      error: 'UPDATE_FAILED',
      message: '無法更新劇本',
    };
  }
}

/**
 * 刪除劇本
 */
export async function deleteGame(gameId: string): Promise<ApiResponse<undefined>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    await dbConnect();
    const game = await Game.findOneAndDelete({ _id: gameId, gmUserId });

    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    // TODO: 同時刪除關聯的角色（Phase 2-6 實作）

    revalidatePath('/games');

    return {
      success: true,
      message: '劇本刪除成功',
    };
  } catch (error) {
    console.error('Error deleting game:', error);
    return {
      success: false,
      error: 'DELETE_FAILED',
      message: '無法刪除劇本',
    };
  }
}

/**
 * Phase 7.7: 取得劇本中所有角色的所有道具列表
 * GM 端使用，用於自動揭露條件的道具選擇器
 */
export interface GameItemInfo {
  characterId: string;
  characterName: string;
  itemId: string;
  itemName: string;
}

export async function getGameItems(
  gameId: string
): Promise<ApiResponse<GameItemInfo[]>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    await dbConnect();

    // 驗證劇本屬於當前 GM
    const game = await Game.findOne({ _id: gameId, gmUserId }).lean();
    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    // 取得該劇本所有角色及其道具（遊戲進行中讀 Runtime）
    const baselineCharacters = await Character.find({ gameId })
      .select('_id name items')
      .lean();

    // 遊戲進行中時，用 Runtime 資料覆蓋
    let runtimeMap: Map<string, { name: string; items: typeof baselineCharacters[number]['items'] }> | null = null;
    if (game.isActive) {
      const runtimeCharacters = await CharacterRuntime.find({ gameId, type: 'runtime' })
        .select('refId name items')
        .lean();
      runtimeMap = new Map(
        runtimeCharacters.map((rc) => [
          rc.refId.toString(),
          { name: rc.name, items: rc.items },
        ])
      );
    }

    const items: GameItemInfo[] = [];
    for (const baseline of baselineCharacters) {
      const runtime = runtimeMap?.get(baseline._id.toString());
      const charName = runtime?.name ?? baseline.name;
      const charItems = runtime?.items ?? baseline.items ?? [];
      for (const item of charItems) {
        items.push({
          characterId: baseline._id.toString(),
          characterName: charName,
          itemId: item.id,
          itemName: item.name,
        });
      }
    }

    return {
      success: true,
      data: items,
    };
  } catch (error) {
    console.error('Error fetching game items:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得劇本道具列表',
    };
  }
}

/**
 * Phase 10: 更新劇本的 Game Code
 *
 * @param gameId - 劇本 ID
 * @param newGameCode - 新的 Game Code（6 位英數字）
 * @returns API 回應（成功或錯誤訊息）
 */
export async function updateGameCode(
  gameId: string,
  newGameCode: string
): Promise<ApiResponse<GameData>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    // 驗證 Game Code 格式（6 位英數字）
    const gameCodeRegex = /^[A-Z0-9]{6}$/;
    const trimmedCode = newGameCode.trim().toUpperCase();

    if (!gameCodeRegex.test(trimmedCode)) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Game Code 必須是 6 位英數字（例如：ABC123）',
      };
    }

    await dbConnect();

    // 檢查 Game Code 唯一性
    const isUnique = await isGameCodeUnique(trimmedCode);
    if (!isUnique) {
      return {
        success: false,
        error: 'DUPLICATE_ERROR',
        message: '此遊戲代碼已被使用，請使用其他代碼',
      };
    }

    // 更新 Game Code
    const game = await Game.findOneAndUpdate(
      { _id: gameId, gmUserId },
      { $set: { gameCode: trimmedCode } },
      { new: true, runValidators: true }
    ).lean();

    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    revalidatePath('/games');
    revalidatePath(`/games/${gameId}`);

    return {
      success: true,
      data: {
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        gameCode: game.gameCode,
        isActive: game.isActive,
        publicInfo: game.publicInfo,
        randomContestMaxValue: game.randomContestMaxValue,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      },
      message: 'Game Code 更新成功',
    };
  } catch (error) {
    console.error('Error updating game code:', error);
    return {
      success: false,
      error: 'UPDATE_FAILED',
      message: '無法更新 Game Code',
    };
  }
}

/**
 * Phase 10: 檢查 Game Code 是否可用（前端即時檢查用）
 *
 * @param gameCode - 要檢查的 Game Code
 * @returns API 回應（isAvailable: true/false）
 */
export async function checkGameCodeAvailability(
  gameCode: string
): Promise<ApiResponse<{ isAvailable: boolean }>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // 驗證 Game Code 格式（6 位英數字）
    const gameCodeRegex = /^[A-Z0-9]{6}$/;
    const trimmedCode = gameCode.trim().toUpperCase();

    if (!gameCodeRegex.test(trimmedCode)) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Game Code 必須是 6 位英數字（例如：ABC123）',
      };
    }

    await dbConnect();

    // 檢查唯一性
    const isAvailable = await isGameCodeUnique(trimmedCode);

    return {
      success: true,
      data: { isAvailable },
    };
  } catch (error) {
    console.error('Error checking game code availability:', error);
    return {
      success: false,
      error: 'CHECK_FAILED',
      message: '無法檢查 Game Code 可用性',
    };
  }
}

