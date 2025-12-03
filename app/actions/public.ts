'use server';

import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';
import type { GamePublicData } from '@/types/game';

// MongoDB lean() 返回的 secret 類型
interface MongoSecret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  revealedAt?: Date;
}

/**
 * 取得公開角色資料（玩家端使用）
 * Phase 4: 回傳完整資料（含 publicInfo、secretInfo、tasks、items、stats）
 * 不需要認證，但如果有 PIN 鎖會隱藏部分資訊
 * secretInfo 只回傳已揭露的隱藏資訊（isRevealed === true）
 */
export async function getPublicCharacter(
  characterId: string
): Promise<ApiResponse<CharacterData>> {
  try {
    await dbConnect();

    const character = await Character.findById(characterId).lean();

    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // Phase 3.5: 過濾出已揭露的隱藏資訊
    const revealedSecrets = character.secretInfo?.secrets?.filter(
      (secret: MongoSecret) => secret.isRevealed === true
    ).map((secret: MongoSecret) => ({
      id: secret.id,
      title: secret.title,
      content: secret.content,
      isRevealed: secret.isRevealed,
      revealCondition: secret.revealCondition,
      revealedAt: secret.revealedAt,
    })) || [];

    return {
      success: true,
      data: {
        id: character._id.toString(),
        gameId: character.gameId.toString(),
        name: character.name,
        description: character.description,
        imageUrl: character.imageUrl,
        hasPinLock: character.hasPinLock,
        publicInfo: character.publicInfo,
        // 只有已揭露的秘密才會回傳給玩家（清理 _id 確保純物件）
        secretInfo: revealedSecrets.length > 0
          ? { secrets: revealedSecrets }
          : undefined,
        tasks: character.tasks || [],
        items: character.items || [],
        stats: character.stats || [],
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error fetching public character:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得角色資料',
    };
  }
}

/**
 * 取得劇本公開資訊（玩家端使用）
 * Phase 3: 新增功能，用於世界觀公開頁
 */
export async function getPublicGame(
  gameId: string
): Promise<ApiResponse<GamePublicData>> {
  try {
    await dbConnect();

    const game = await Game.findById(gameId).lean();

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
        name: game.name,
        description: game.description,
        publicInfo: game.publicInfo,
      },
    };
  } catch (error) {
    console.error('Error fetching public game:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得劇本資料',
    };
  }
}

