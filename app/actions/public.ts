'use server';

import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';
import type { GamePublicData } from '@/types/game';

// MongoDB lean() 返回的類型（可能包含 _id）
interface MongoSecret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  revealedAt?: Date;
  _id?: unknown;
}

interface MongoTask {
  id: string;
  title: string;
  description: string;
  isHidden: boolean;
  isRevealed: boolean;
  revealedAt?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  completedAt?: Date;
  gmNotes?: string;
  revealCondition?: string;
  createdAt: Date;
  _id?: unknown;
}

interface MongoItem {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity: number;
  effect?: {
    type: 'stat_change' | 'buff' | 'custom';
    targetStat?: string;
    value?: number;
    duration?: number;
    description?: string;
  };
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  isTransferable: boolean;
  acquiredAt: Date;
  _id?: unknown;
}

interface MongoStat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  _id?: unknown;
}

interface MongoSkill {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  checkType: 'none' | 'contest' | 'random';
  contestConfig?: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  };
  randomConfig?: {
    maxValue: number;
    threshold: number;
  };
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  effects?: Array<{
    type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' | 
          'task_reveal' | 'task_complete' | 'custom';
    targetStat?: string;
    value?: number;
    targetItemId?: string;
    targetTaskId?: string;
    targetCharacterId?: string;
    description?: string;
    _id?: unknown;
  }>;
  _id?: unknown;
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

    // Phase 3.5: 過濾出已揭露的隱藏資訊（清理 _id）
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

    // Phase 4.5: 過濾任務（一般任務 + 已揭露的隱藏任務），清理 _id 和 GM 專用欄位
    const visibleTasks = (character.tasks || [])
      .filter((task: MongoTask) => {
        // 一般任務總是可見（isHidden 為 false 或 undefined）
        if (task.isHidden !== true) return true;
        // 隱藏任務只有在已揭露時才可見
        return task.isRevealed === true;
      })
      .map((task: MongoTask) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        isHidden: task.isHidden === true, // 確保是 boolean
        isRevealed: task.isRevealed === true, // 確保是 boolean
        revealedAt: task.revealedAt,
        status: task.status || 'pending',
        completedAt: task.completedAt,
        // 不包含 gmNotes 和 revealCondition（GM 專用欄位）
        createdAt: task.createdAt || new Date(),
      }));

    // Phase 4.5: 清理道具的 _id
    const cleanItems = (character.items || []).map((item: MongoItem) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      type: item.type,
      quantity: item.quantity,
      effect: item.effect,
      usageLimit: item.usageLimit,
      usageCount: item.usageCount,
      cooldown: item.cooldown,
      lastUsedAt: item.lastUsedAt,
      isTransferable: item.isTransferable,
      acquiredAt: item.acquiredAt,
    }));

    // Phase 4: 清理數值的 _id
    const cleanStats = (character.stats || []).map((stat: MongoStat) => ({
      id: stat.id,
      name: stat.name,
      value: stat.value,
      maxValue: stat.maxValue,
    }));

    // Phase 5: 清理技能的 _id
    const cleanSkills = (character.skills || []).map((skill: MongoSkill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      iconUrl: skill.iconUrl,
      checkType: skill.checkType,
      contestConfig: skill.contestConfig,
      randomConfig: skill.randomConfig,
      usageLimit: skill.usageLimit,
      usageCount: skill.usageCount || 0,
      cooldown: skill.cooldown,
      lastUsedAt: skill.lastUsedAt,
      effects: (skill.effects || []).map((effect) => ({
        type: effect.type,
        targetStat: effect.targetStat,
        value: effect.value,
        targetItemId: effect.targetItemId,
        targetTaskId: effect.targetTaskId,
        targetCharacterId: effect.targetCharacterId,
        description: effect.description,
      })),
    }));

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

