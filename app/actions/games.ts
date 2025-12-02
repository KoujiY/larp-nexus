'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';
import type { GameData } from '@/types/game';

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

    return {
      success: true,
      data: games.map((game) => ({
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        isActive: game.isActive,
        publicInfo: game.publicInfo,
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
        isActive: game.isActive,
        publicInfo: game.publicInfo,
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
 */
export async function createGame(data: {
  name: string;
  description?: string;
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
    const game = await Game.create({
      gmUserId,
      name: validated.name,
      description: validated.description || '',
      isActive: true,
    });

    revalidatePath('/games');

    return {
      success: true,
      data: {
        id: game._id.toString(),
        gmUserId: game.gmUserId.toString(),
        name: game.name,
        description: game.description,
        isActive: game.isActive,
        publicInfo: game.publicInfo,
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
      intro?: string;
      worldSetting?: string;
      chapters?: Array<{
        title: string;
        content: string;
        order: number;
      }>;
    };
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
    
    // Phase 3: 處理 publicInfo 更新
    if (data.publicInfo !== undefined) {
      const currentGame = await Game.findOne({ _id: gameId, gmUserId });
      const currentPublicInfo = currentGame?.publicInfo || {};
      updateData.publicInfo = {
        intro: data.publicInfo.intro ?? currentPublicInfo.intro ?? '',
        worldSetting: data.publicInfo.worldSetting ?? currentPublicInfo.worldSetting ?? '',
        chapters: data.publicInfo.chapters ?? currentPublicInfo.chapters ?? [],
      };
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
        isActive: game.isActive,
        publicInfo: game.publicInfo,
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

