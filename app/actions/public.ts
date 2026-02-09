'use server';

import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';
import type { GamePublicData } from '@/types/game';
import { cleanSkillData, cleanItemData, cleanStatData, cleanTaskData, cleanSecretData } from '@/lib/character-cleanup';

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

    // Phase 3.5: 過濾出已揭露的隱藏資訊（清理 _id）
    const allSecrets = cleanSecretData(character.secretInfo?.secrets);
    const revealedSecrets = allSecrets.filter((secret) => secret.isRevealed === true);

    // Phase 4.5: 過濾任務（一般任務 + 已揭露的隱藏任務），清理 _id 和 GM 專用欄位
    const visibleTasks = cleanTaskData(character.tasks)
      .filter((task) => {
        // 一般任務總是可見（isHidden 為 false 或 undefined）
        if (task.isHidden !== true) return true;
        // 隱藏任務只有在已揭露時才可見
        return task.isRevealed === true;
      })
      .map((task) => ({
        ...task,
        // 不包含 gmNotes 和 revealCondition（GM 專用欄位）
      }));

    // Phase 4.5: 清理道具的 _id
    const cleanItems = cleanItemData(character.items);

    // Phase 4: 清理數值的 _id
    const cleanStats = cleanStatData(character.stats);

    // Phase 5: 清理技能的 _id
    const cleanSkills = cleanSkillData(character.skills);

    // Phase 7.6: 獲取劇本的 randomContestMaxValue
    const game = await Game.findById(character.gameId).select('randomContestMaxValue').lean();
    const randomContestMaxValue = game?.randomContestMaxValue || 100;

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
        // 只有已揭露的秘密才會回傳給玩家
        secretInfo: revealedSecrets.length > 0
          ? { secrets: revealedSecrets }
          : undefined,
        tasks: visibleTasks,
        items: cleanItems,
        stats: cleanStats,
        skills: cleanSkills,
        randomContestMaxValue, // Phase 7.6: 隨機對抗檢定上限值
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

/**
 * Phase 4.5: 取得同劇本內的其他角色列表（用於道具轉移）
 * 只回傳基本資訊（id、name、imageUrl），排除當前角色
 */
export interface TransferTargetCharacter {
  id: string;
  name: string;
  imageUrl?: string;
}

export async function getTransferTargets(
  gameId: string,
  excludeCharacterId: string
): Promise<ApiResponse<TransferTargetCharacter[]>> {
  try {
    await dbConnect();

    // 取得同劇本內的所有角色（排除當前角色）
    const characters = await Character.find({
      gameId,
      _id: { $ne: excludeCharacterId },
    })
      .select('_id name imageUrl')
      .sort({ name: 1 })
      .lean();

    return {
      success: true,
      data: characters.map((char) => ({
        id: char._id.toString(),
        name: char.name,
        imageUrl: char.imageUrl,
      })),
    };
  } catch (error) {
    console.error('Error fetching transfer targets:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得角色列表',
    };
  }
}

/**
 * Phase 7: 取得目標角色的道具清單（用於 item_take 和 item_steal 效果）
 * 只回傳基本資訊（id、name、quantity），用於選擇目標道具
 */
export interface TargetItemInfo {
  id: string;
  name: string;
  quantity: number;
}

export async function getTargetCharacterItems(
  targetCharacterId: string
): Promise<ApiResponse<TargetItemInfo[]>> {
  try {
    await dbConnect();

    const character = await Character.findById(targetCharacterId)
      .select('items')
      .lean();

    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到目標角色',
      };
    }

    const items = character.items || [];
    const cleanItems = cleanItemData(items);

    return {
      success: true,
      data: cleanItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
      })),
    };
  } catch (error) {
    console.error('Error fetching target character items:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得目標角色的道具清單',
    };
  }
}

