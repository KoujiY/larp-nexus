'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { Character, Game } from '@/lib/db/models';
import type { CharacterDocument } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';
import { emitSkillUsed, emitRoleUpdated, emitItemTransferred, emitInventoryUpdated, emitCharacterAffected } from '@/lib/websocket/events';

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
    statChangeTarget?: 'value' | 'maxValue';
    syncValue?: boolean;
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
    targetType?: 'self' | 'other' | 'any';
    requiresTarget?: boolean;
    targetStat?: string;
    value?: number;
    statChangeTarget?: 'value' | 'maxValue';
    syncValue?: boolean;
    targetItemId?: string;
    targetTaskId?: string;
    targetCharacterId?: string;
    description?: string;
    _id?: unknown;
  }>;
  _id?: unknown;
}

/**
 * 清理技能數據的輔助函數（移除 MongoDB _id）
 */
function cleanSkillData(skills: MongoSkill[] | undefined) {
  return (skills || [])
    .filter((skill): skill is MongoSkill => Boolean(skill && skill.id))
    .map((skill) => ({
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
      effects: (skill.effects || [])
        .filter((effect): effect is NonNullable<typeof effect> => Boolean(effect && effect.type))
        .map((effect) => ({
          type: effect.type,
          targetType: effect.targetType,
          requiresTarget: effect.requiresTarget,
          targetStat: effect.targetStat,
          value: effect.value,
          statChangeTarget: effect.statChangeTarget,
          syncValue: effect.syncValue,
          targetItemId: effect.targetItemId,
          targetTaskId: effect.targetTaskId,
          targetCharacterId: effect.targetCharacterId,
          description: effect.description,
        })),
    }));
}

/**
 * Character 驗證 Schema
 */
const characterSchema = z.object({
  name: z.string().min(1, '角色名稱不可為空').max(100, '角色名稱不可超過 100 字元'),
  description: z.string().optional(),
  hasPinLock: z.boolean(),
  pin: z.string().optional(),
});

/**
 * 取得角色的 PIN（僅限 GM）
 */
export async function getCharacterPin(
  characterId: string
): Promise<ApiResponse<{ pin: string }>> {
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
    const character = await Character.findById(characterId).lean();

    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權存取此角色',
      };
    }

    // 回傳 PIN（若未設定則回傳空字串）
    return {
      success: true,
      data: { pin: character.pin || '' },
    };
  } catch (error) {
    console.error('Error fetching character PIN:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得 PIN 資料',
    };
  }
}

/**
 * 取得特定劇本的所有角色
 */
export async function getCharactersByGameId(
  gameId: string
): Promise<ApiResponse<CharacterData[]>> {
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

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    const characters = await Character.find({ gameId })
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      data: characters.map((char) => {
        // 清理 secretInfo 中的 _id 以確保純物件可傳遞給 Client Component
        const cleanSecretInfo = char.secretInfo?.secrets
          ? {
              secrets: char.secretInfo.secrets.map((secret: MongoSecret) => ({
                id: secret.id,
                title: secret.title,
                content: secret.content,
                isRevealed: secret.isRevealed,
                revealCondition: secret.revealCondition,
                revealedAt: secret.revealedAt,
              })),
            }
          : undefined;

        // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
        const cleanTasks = (char.tasks || []).map((task: MongoTask) => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          isHidden: task.isHidden === true, // 確保是 boolean，預設 false
          isRevealed: task.isRevealed === true, // 確保是 boolean，預設 false
          revealedAt: task.revealedAt,
          status: task.status || 'pending',
          completedAt: task.completedAt,
          gmNotes: task.gmNotes || '',
          revealCondition: task.revealCondition || '',
          createdAt: task.createdAt || new Date(),
        }));

        // 清理 items 中的 _id
        const cleanItems = (char.items || []).map((item: MongoItem) => ({
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

        // 清理 stats 中的 _id
        const cleanStats = (char.stats || []).map((stat: MongoStat) => ({
          id: stat.id,
          name: stat.name,
          value: stat.value,
          maxValue: stat.maxValue,
        }));

        // 清理 skills 中的 _id
        const cleanSkills = cleanSkillData(char.skills);

        return {
          id: char._id.toString(),
          gameId: char.gameId.toString(),
          name: char.name,
          description: char.description,
          imageUrl: char.imageUrl,
          hasPinLock: char.hasPinLock,
          publicInfo: char.publicInfo,
          secretInfo: cleanSecretInfo,
          tasks: cleanTasks,
          items: cleanItems,
          stats: cleanStats,
          skills: cleanSkills,
          createdAt: char.createdAt,
          updatedAt: char.updatedAt,
        };
      }),
    };
  } catch (error) {
    console.error('Error fetching characters:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得角色列表',
    };
  }
}

/**
 * 根據 ID 取得角色
 */
export async function getCharacterById(
  characterId: string
): Promise<ApiResponse<CharacterData>> {
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
    const character = await Character.findById(characterId).lean();

    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權存取此角色',
      };
    }

    // 清理 secretInfo 中的 _id 以確保純物件可傳遞給 Client Component
    const cleanSecretInfo = character.secretInfo?.secrets
      ? {
          secrets: character.secretInfo.secrets.map((secret: MongoSecret) => ({
            id: secret.id,
            title: secret.title,
            content: secret.content,
            isRevealed: secret.isRevealed,
            revealCondition: secret.revealCondition,
            revealedAt: secret.revealedAt,
          })),
        }
      : undefined;

    // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
    const cleanTasks = (character.tasks || []).map((task: MongoTask) => ({
      id: task.id,
      title: task.title,
      description: task.description || '',
      isHidden: task.isHidden === true, // 確保是 boolean，預設 false
      isRevealed: task.isRevealed === true, // 確保是 boolean，預設 false
      revealedAt: task.revealedAt,
      status: task.status || 'pending',
      completedAt: task.completedAt,
      gmNotes: task.gmNotes || '',
      revealCondition: task.revealCondition || '',
      createdAt: task.createdAt || new Date(),
    }));

    // 清理 items 中的 _id
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

    // 清理 stats 中的 _id
    const cleanStats = (character.stats || []).map((stat: MongoStat) => ({
      id: stat.id,
      name: stat.name,
      value: stat.value,
      maxValue: stat.maxValue,
    }));

    // 清理 skills 中的 _id
    const cleanSkills = cleanSkillData(character.skills);

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
        secretInfo: cleanSecretInfo,
        tasks: cleanTasks,
        items: cleanItems,
        stats: cleanStats,
        skills: cleanSkills,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error fetching character:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得角色資料',
    };
  }
}

/**
 * 建立新角色
 */
export async function createCharacter(data: {
  gameId: string;
  name: string;
  description?: string;
  hasPinLock: boolean;
  pin?: string;
}): Promise<ApiResponse<CharacterData>> {
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
    const validated = characterSchema.parse(data);

    // 如果啟用 PIN 鎖，驗證 PIN 格式
    if (validated.hasPinLock) {
      if (!validated.pin) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: '啟用 PIN 鎖時必須設定 PIN 碼',
        };
      }
      if (!/^\d{4,6}$/.test(validated.pin)) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'PIN 碼必須為 4-6 位數字',
        };
      }
    }

    await dbConnect();

    // 驗證 Game 存在且屬於當前 GM
    const game = await Game.findOne({ _id: data.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    // 建立角色
    const characterData: Record<string, unknown> = {
      gameId: data.gameId,
      name: validated.name,
      description: validated.description || '',
      hasPinLock: validated.hasPinLock,
    };

    // 如果有 PIN，直接儲存明文
    if (validated.hasPinLock && validated.pin) {
      characterData.pin = validated.pin;
    }

    const character = await Character.create(characterData);

    revalidatePath(`/games/${data.gameId}`);

    // 轉換為純 JavaScript 物件，避免循環引用
    const characterObj = character.toObject();

    // 清理 secretInfo 中的 _id 以確保純物件可傳遞給 Client Component
    const cleanSecretInfo = characterObj.secretInfo?.secrets
      ? {
          secrets: characterObj.secretInfo.secrets.map((secret: MongoSecret) => ({
            id: secret.id,
            title: secret.title,
            content: secret.content,
            isRevealed: secret.isRevealed,
            revealCondition: secret.revealCondition,
            revealedAt: secret.revealedAt,
          })),
        }
      : undefined;

    // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
    const cleanTasks = (characterObj.tasks || []).map((task: MongoTask) => ({
      id: task.id,
      title: task.title,
      description: task.description || '',
      isHidden: task.isHidden === true,
      isRevealed: task.isRevealed === true,
      revealedAt: task.revealedAt,
      status: task.status || 'pending',
      completedAt: task.completedAt,
      gmNotes: task.gmNotes || '',
      revealCondition: task.revealCondition || '',
      createdAt: task.createdAt || new Date(),
    }));

    // 清理 items 中的 _id
    const cleanItems = (characterObj.items || []).map((item: MongoItem) => ({
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

    // 清理 stats 中的 _id
    const cleanStats = (characterObj.stats || []).map((stat: MongoStat) => ({
      id: stat.id,
      name: stat.name,
      value: stat.value,
      maxValue: stat.maxValue,
    }));

    // 清理 skills 中的 _id
    const cleanSkills = cleanSkillData(characterObj.skills);

    return {
      success: true,
      data: {
        id: characterObj._id.toString(),
        gameId: characterObj.gameId.toString(),
        name: characterObj.name,
        description: characterObj.description || '',
        imageUrl: characterObj.imageUrl,
        hasPinLock: characterObj.hasPinLock,
        publicInfo: characterObj.publicInfo,
        secretInfo: cleanSecretInfo,
        tasks: cleanTasks,
        items: cleanItems,
        stats: cleanStats,
        skills: cleanSkills,
        createdAt: characterObj.createdAt,
        updatedAt: characterObj.updatedAt,
      },
      message: '角色建立成功',
    };
  } catch (error) {
    console.error('Error creating character:', error);

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
      message: '無法建立角色',
    };
  }
}

/**
 * 更新角色
 * Phase 4: 支援更新 publicInfo、secretInfo 和 stats
 */
export async function updateCharacter(
  characterId: string,
  data: {
    name?: string;
    description?: string;
    hasPinLock?: boolean;
    pin?: string;
    publicInfo?: {
      background?: string;
      personality?: string;
      relationships?: Array<{
        targetName: string;
        description: string;
      }>;
    };
    secretInfo?: {
      secrets: Array<{
        id: string;
        title: string;
        content: string;
        isRevealed: boolean;
        revealCondition?: string;
        revealedAt?: Date;
      }>;
    };
    stats?: Array<{
      id: string;
      name: string;
      value: number;
      maxValue?: number;
    }>;
    // Phase 4.5: 任務系統
    tasks?: Array<{
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
    }>;
    // Phase 4.5: 道具系統
    items?: Array<{
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
    }>;
    // Phase 5: 技能系統
    skills?: Array<{
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
        statChangeTarget?: 'value' | 'maxValue';
        syncValue?: boolean;
        targetItemId?: string;
        targetTaskId?: string;
        targetCharacterId?: string;
        description?: string;
      }>;
    }>;
  }
): Promise<ApiResponse<CharacterData>> {
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

    // 驗證角色存在
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權編輯此角色',
      };
    }

    // 更新資料
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      characterSchema.shape.name.parse(data.name);
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.hasPinLock !== undefined) {
      updateData.hasPinLock = data.hasPinLock;
    }

    // 處理 PIN 更新
    if (data.pin) {
      if (!/^\d{4,6}$/.test(data.pin)) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'PIN 碼必須為 4-6 位數字',
        };
      }
      updateData.pin = data.pin;
    }

    // Phase 3: 處理 publicInfo 更新
    if (data.publicInfo !== undefined) {
      const currentPublicInfo = character.publicInfo || {};
      updateData.publicInfo = {
        background: data.publicInfo.background ?? currentPublicInfo.background ?? '',
        personality: data.publicInfo.personality ?? currentPublicInfo.personality ?? '',
        relationships: data.publicInfo.relationships ?? currentPublicInfo.relationships ?? [],
      };
    }

    // Phase 3.5: 處理 secretInfo 更新
    if (data.secretInfo !== undefined) {
      const currentSecrets: MongoSecret[] = character.secretInfo?.secrets || [];
      
      // 處理每個 secret 的更新
      const updatedSecrets = data.secretInfo.secrets.map((newSecret) => {
        const oldSecret = currentSecrets.find((s: MongoSecret) => s.id === newSecret.id);
        
        // 建立乾淨的 secret 物件（不包含任何額外欄位如 _id）
        const cleanSecret = {
          id: newSecret.id,
          title: newSecret.title,
          content: newSecret.content,
          isRevealed: newSecret.isRevealed,
          revealCondition: newSecret.revealCondition || '',
          revealedAt: undefined as Date | undefined,
        };
        
        // 如果從未揭露變為已揭露，設定揭露時間
        if (newSecret.isRevealed && (!oldSecret || !oldSecret.isRevealed)) {
          cleanSecret.revealedAt = new Date();
        } else if (oldSecret?.revealedAt) {
          // 保留原有的揭露時間
          cleanSecret.revealedAt = oldSecret.revealedAt;
        }
        
        return cleanSecret;
      });
      
      updateData.secretInfo = { secrets: updatedSecrets };
    }

    // Phase 4: 處理 stats 更新
    if (data.stats !== undefined) {
      updateData.stats = data.stats.map((stat) => ({
        id: stat.id,
        name: stat.name,
        value: stat.value,
        maxValue: stat.maxValue,
      }));
    }

    // Phase 4.5: 處理 tasks 更新
    if (data.tasks !== undefined) {
      const currentTasks = character.tasks || [];
      
      updateData.tasks = data.tasks.map((newTask) => {
        const oldTask = currentTasks.find((t: { id: string }) => t.id === newTask.id);
        
        const cleanTask = {
          id: newTask.id,
          title: newTask.title,
          description: newTask.description,
          isHidden: newTask.isHidden,
          isRevealed: newTask.isRevealed,
          revealedAt: newTask.revealedAt,
          status: newTask.status,
          completedAt: newTask.completedAt,
          gmNotes: newTask.gmNotes || '',
          revealCondition: newTask.revealCondition || '',
          createdAt: newTask.createdAt || new Date(),
        };
        
        // 如果隱藏目標從未揭露變為已揭露，設定揭露時間
        if (newTask.isHidden && newTask.isRevealed && (!oldTask || !oldTask.isRevealed)) {
          cleanTask.revealedAt = new Date();
        } else if (oldTask?.revealedAt) {
          cleanTask.revealedAt = oldTask.revealedAt;
        }
        
        // 如果狀態變為已完成/失敗，設定完成時間
        if ((newTask.status === 'completed' || newTask.status === 'failed') && 
            (!oldTask || (oldTask.status !== 'completed' && oldTask.status !== 'failed'))) {
          cleanTask.completedAt = new Date();
        } else if (oldTask?.completedAt) {
          cleanTask.completedAt = oldTask.completedAt;
        }
        
        return cleanTask;
      });
    }

    // Phase 4.5: 處理 items 更新
    const inventoryDiffs: Array<{
      action: 'added' | 'updated' | 'deleted';
      item: {
        id: string;
        name: string;
        description: string;
        imageUrl?: string;
        acquiredAt?: string;
      };
    }> = [];
    if (data.items !== undefined) {
      const currentItems: MongoItem[] = character.items || [];
      updateData.items = data.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        type: item.type,
        quantity: item.quantity,
        effect: item.effect,
        usageLimit: item.usageLimit,
        usageCount: item.usageCount || 0,
        cooldown: item.cooldown,
        lastUsedAt: item.lastUsedAt,
        isTransferable: item.isTransferable,
        acquiredAt: item.acquiredAt || new Date(),
      }));

      const newItems = updateData.items as Array<{
        id: string;
        name: string;
        description: string;
        imageUrl?: string;
        type: string;
        quantity: number;
        acquiredAt?: string | Date;
      }>;

      // 比對新增/更新
      newItems.forEach((newItem) => {
        const oldItem = currentItems.find((i) => i.id === newItem.id);
        if (!oldItem) {
          inventoryDiffs.push({
            action: 'added',
            item: {
              id: newItem.id,
              name: newItem.name,
              description: newItem.description || '',
              imageUrl: newItem.imageUrl,
              acquiredAt: newItem.acquiredAt ? new Date(newItem.acquiredAt).toISOString() : undefined,
            },
          });
        } else if (
          oldItem.name !== newItem.name ||
          oldItem.description !== newItem.description ||
          oldItem.imageUrl !== newItem.imageUrl ||
          oldItem.quantity !== newItem.quantity
        ) {
          inventoryDiffs.push({
            action: 'updated',
            item: {
              id: newItem.id,
              name: newItem.name,
              description: newItem.description || '',
              imageUrl: newItem.imageUrl,
              acquiredAt: newItem.acquiredAt ? new Date(newItem.acquiredAt).toISOString() : undefined,
            },
          });
        }
      });

      // 刪除
      currentItems.forEach((oldItem) => {
        const exist = data.items!.some((i) => i.id === oldItem.id);
        if (!exist) {
          inventoryDiffs.push({
            action: 'deleted',
            item: {
              id: oldItem.id,
              name: oldItem.name,
              description: oldItem.description || '',
              imageUrl: oldItem.imageUrl,
              acquiredAt: oldItem.acquiredAt ? new Date(oldItem.acquiredAt).toISOString() : undefined,
            },
          });
        }
      });
    }

    // Phase 5: 處理 skills 更新
    if (data.skills !== undefined) {
      const normalizedSkills = (data.skills || []).filter((s) => s && s.id);
      updateData.skills = normalizedSkills.map((skill) => {
        const skillData: Record<string, unknown> = {
          id: skill.id,
          name: skill.name,
          description: skill.description || '',
          checkType: skill.checkType,
          usageCount: skill.usageCount || 0,
        };
        
        if (skill.iconUrl !== undefined) skillData.iconUrl = skill.iconUrl;
        if (skill.usageLimit !== undefined) skillData.usageLimit = skill.usageLimit;
        if (skill.cooldown !== undefined) skillData.cooldown = skill.cooldown;
        if (skill.lastUsedAt !== undefined) skillData.lastUsedAt = skill.lastUsedAt;
        
        skillData.effects = (skill.effects || [])
          .filter((effect) => effect && effect.type)
          .map((effect) => {
          // 建立完整的 effectData，明確包含所有欄位（即使是 undefined）
          // 但要注意：MongoDB 會忽略 undefined，所以我們只包含有值的欄位
          const effectData: Record<string, unknown> = {
            type: effect.type,
          };

          // Phase 6.5: 目標設定
          const effectAny = effect as Record<string, unknown>;
          const normalizedTargetType = (effectAny.targetType as 'self' | 'other' | 'any' | undefined) ?? 'self';
          effectData.targetType = normalizedTargetType;
          const normalizedRequiresTarget =
            effectAny.requiresTarget !== undefined && effectAny.requiresTarget !== null
              ? Boolean(effectAny.requiresTarget)
              : normalizedTargetType !== 'self';
          effectData.requiresTarget = normalizedRequiresTarget;
          
          // 明確設定所有可能的欄位，確保它們被正確儲存
          if (effect.targetStat !== undefined && effect.targetStat !== null) {
            effectData.targetStat = String(effect.targetStat);
          }
          if (effect.value !== undefined && effect.value !== null) {
            effectData.value = Number(effect.value);
          }
          
          // 關鍵：statChangeTarget 和 syncValue 必須明確設定，即使值可能是 undefined
          // 但我們只在有值時才設定，因為 MongoDB 會忽略 undefined
          if (effect.statChangeTarget !== undefined && effect.statChangeTarget !== null) {
            effectData.statChangeTarget = String(effect.statChangeTarget);
          }
          if (effect.syncValue !== undefined && effect.syncValue !== null) {
            effectData.syncValue = Boolean(effect.syncValue);
          }
          
          if (effect.targetItemId !== undefined && effect.targetItemId !== null) {
            effectData.targetItemId = String(effect.targetItemId);
          }
          if (effect.targetTaskId !== undefined && effect.targetTaskId !== null) {
            effectData.targetTaskId = String(effect.targetTaskId);
          }
          if (effect.targetCharacterId !== undefined && effect.targetCharacterId !== null) {
            effectData.targetCharacterId = String(effect.targetCharacterId);
          }
          if (effect.description !== undefined && effect.description !== null) {
            effectData.description = String(effect.description);
          }
          
          return effectData;
        });
        
        // 根據檢定類型設定對應的配置
        if (skill.checkType === 'contest') {
          if (skill.contestConfig) {
            skillData.contestConfig = skill.contestConfig;
          } else {
            console.warn(`技能 ${skill.name} 設定為對抗檢定但沒有 contestConfig`);
          }
          // 清除 randomConfig（使用 $unset 或直接不設定）
          // 注意：不要設定為 undefined，而是直接不包含在 skillData 中
          delete skillData.randomConfig;
        } else if (skill.checkType === 'random') {
          // 確保 randomConfig 存在且有完整的值
          const maxValue = skill.randomConfig?.maxValue;
          const threshold = skill.randomConfig?.threshold;
          
          if (!maxValue || threshold === undefined || threshold === null) {
            console.warn(`技能 ${skill.name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`);
            skillData.randomConfig = {
              maxValue: maxValue && maxValue > 0 ? maxValue : 100,
              threshold: threshold !== undefined && threshold !== null && threshold > 0 ? threshold : 50,
            };
          } else {
            // 確保 threshold 不超過 maxValue
            skillData.randomConfig = {
              maxValue,
              threshold: Math.min(threshold, maxValue),
            };
          }
          // 清除 contestConfig（使用 $unset 或直接不設定）
          // 注意：不要設定為 undefined，而是直接不包含在 skillData 中
          delete skillData.contestConfig;
        } else {
          // checkType === 'none'，清除所有配置
          // 注意：不要設定為 undefined，而是直接不包含在 skillData 中
          delete skillData.randomConfig;
          delete skillData.contestConfig;
        }
        
        return skillData;
      });
      
    }

    // 使用 findById 取得文件，手動更新後再 save，確保所有欄位都被正確保存
    const characterDoc = await Character.findById(characterId);
    
    if (!characterDoc) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }
    
    // 手動更新所有欄位
    Object.keys(updateData).forEach((key) => {
      if (key === 'skills' && updateData.skills) {
        // 對於 skills 陣列，需要逐個建立 Mongoose 子文檔
        // 這樣 Mongoose 才能正確處理嵌套欄位
        const skillsArray = (updateData.skills as Array<Record<string, unknown>>)
          .filter((skillData) => skillData && skillData.id)
          .map((skillData) => {
          // 建立新的技能物件，確保所有欄位都被包含
          const skillObj: Record<string, unknown> = {
            id: skillData.id,
            name: skillData.name,
            description: skillData.description || '',
            checkType: skillData.checkType,
          };
          
          if (skillData.iconUrl !== undefined) skillObj.iconUrl = skillData.iconUrl;
          if (skillData.usageLimit !== undefined) skillObj.usageLimit = skillData.usageLimit;
          if (skillData.usageCount !== undefined) skillObj.usageCount = skillData.usageCount;
          if (skillData.cooldown !== undefined) skillObj.cooldown = skillData.cooldown;
          if (skillData.lastUsedAt !== undefined) skillObj.lastUsedAt = skillData.lastUsedAt;
          
          // 處理 effects，確保所有欄位都被包含
          if (skillData.effects && Array.isArray(skillData.effects)) {
            skillObj.effects = skillData.effects
              .filter((effect: Record<string, unknown>) => effect && effect.type)
              .map((effect: Record<string, unknown>) => {
                const effectObj: Record<string, unknown> = {
                  type: effect.type,
                };
                
                // Phase 6.5: 目標設定
                if (effect.targetType !== undefined && effect.targetType !== null) {
                  effectObj.targetType = String(effect.targetType);
                }
                if (effect.requiresTarget !== undefined && effect.requiresTarget !== null) {
                  effectObj.requiresTarget = Boolean(effect.requiresTarget);
                }
                
                // 明確設定所有欄位，包括 statChangeTarget 和 syncValue
                if (effect.targetStat !== undefined && effect.targetStat !== null) {
                  effectObj.targetStat = String(effect.targetStat);
                }
                if (effect.value !== undefined && effect.value !== null) {
                  effectObj.value = Number(effect.value);
                }
                // 關鍵：確保 statChangeTarget 和 syncValue 被正確設定
                if (effect.statChangeTarget !== undefined && effect.statChangeTarget !== null) {
                  effectObj.statChangeTarget = String(effect.statChangeTarget);
                }
                if (effect.syncValue !== undefined && effect.syncValue !== null) {
                  effectObj.syncValue = Boolean(effect.syncValue);
                }
                if (effect.targetItemId !== undefined && effect.targetItemId !== null) {
                  effectObj.targetItemId = String(effect.targetItemId);
                }
                if (effect.targetTaskId !== undefined && effect.targetTaskId !== null) {
                  effectObj.targetTaskId = String(effect.targetTaskId);
                }
                if (effect.targetCharacterId !== undefined && effect.targetCharacterId !== null) {
                  effectObj.targetCharacterId = String(effect.targetCharacterId);
                }
                if (effect.description !== undefined && effect.description !== null) {
                  effectObj.description = String(effect.description);
                }
                
                return effectObj;
              });
          }

          // 處理檢定配置
          if (skillData.checkType === 'contest' && skillData.contestConfig) {
            skillObj.contestConfig = skillData.contestConfig;
          } else if (skillData.checkType === 'random' && skillData.randomConfig) {
            skillObj.randomConfig = skillData.randomConfig;
          }
          
          return skillObj;
        });
        
        // 先清空現有的 skills 陣列，然後完全替換
        // 這樣可以避免 Mongoose 根據 id 匹配並合併舊資料的問題
        characterDoc.skills = [];
        characterDoc.markModified('skills');
        
        // 然後設定新的 skills 陣列
        characterDoc.set('skills', skillsArray);
        characterDoc.markModified('skills');
      } else {
        characterDoc.set(key, updateData[key]);
      }
    });
    
    // 儲存文件
    await characterDoc.save();
    
    // 轉換為 lean 物件以便後續處理
    const updatedCharacter = characterDoc.toObject();

    if (!updatedCharacter) {
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: '更新失敗',
      };
    }

    revalidatePath(`/games/${updatedCharacter.gameId.toString()}`);
    
    // 清理 secretInfo 中的 _id 以確保純物件可傳遞給 Client Component
    const cleanSecretInfo = updatedCharacter.secretInfo?.secrets
      ? {
          secrets: updatedCharacter.secretInfo.secrets.map((secret: MongoSecret) => ({
            id: secret.id,
            title: secret.title,
            content: secret.content,
            isRevealed: secret.isRevealed,
            revealCondition: secret.revealCondition,
            revealedAt: secret.revealedAt,
          })),
        }
      : undefined;

    // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
    const cleanTasks = (updatedCharacter.tasks || []).map((task: MongoTask) => ({
      id: task.id,
      title: task.title,
      description: task.description || '',
      isHidden: task.isHidden === true, // 確保是 boolean，預設 false
      isRevealed: task.isRevealed === true, // 確保是 boolean，預設 false
      revealedAt: task.revealedAt,
      status: task.status || 'pending',
      completedAt: task.completedAt,
      gmNotes: task.gmNotes || '',
      revealCondition: task.revealCondition || '',
      createdAt: task.createdAt || new Date(),
    }));

    // 清理 items 中的 _id
    const cleanItems = (updatedCharacter.items || []).map((item: MongoItem) => ({
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

    // 清理 stats 中的 _id
    const cleanStats = (updatedCharacter.stats || []).map((stat: MongoStat) => ({
      id: stat.id,
      name: stat.name,
      value: stat.value,
      maxValue: stat.maxValue,
    }));

    // 清理 skills 中的 _id
    const cleanSkills = cleanSkillData(updatedCharacter.skills);

    // WebSocket 事件：角色更新（只推送有變動的數值）
    const changedStats = cleanStats
      .map((stat: MongoStat) => {
        const before = (character.stats || []).find((s: { id: string }) => s.id === stat.id);
        const newValue = stat.value ?? before?.value;
        const newMax = stat.maxValue ?? before?.maxValue;

        const valueChanged = before ? newValue !== before.value : true;
        const hasBeforeMax = before?.maxValue !== undefined && before?.maxValue !== null;
        const hasNewMax = newMax !== undefined && newMax !== null;
        const maxChanged = hasBeforeMax && hasNewMax ? newMax !== before!.maxValue : (!hasBeforeMax && hasNewMax);

        if (valueChanged || maxChanged) {
          return {
            ...stat,
            value: newValue,
            maxValue: hasNewMax ? newMax : undefined,
            deltaValue: valueChanged && before && newValue !== undefined ? newValue - before.value : undefined,
            deltaMax: maxChanged && hasBeforeMax && hasNewMax ? (newMax as number) - (before!.maxValue as number) : undefined,
          };
        }
        return null;
      })
      .filter(
        (
          s:
            | MongoStat
            | (MongoStat & { deltaValue?: number; deltaMax?: number })
            | null
        ): s is MongoStat & { deltaValue?: number; deltaMax?: number } => Boolean(s)
      );

    const basicChanged =
      (data.name !== undefined && data.name !== character.name) ||
      (data.description !== undefined && data.description !== character.description) ||
      (data.hasPinLock !== undefined && data.hasPinLock !== character.hasPinLock) ||
      (data.publicInfo !== undefined &&
        JSON.stringify(data.publicInfo) !== JSON.stringify(character.publicInfo || {})) ||
      (data.secretInfo !== undefined &&
        JSON.stringify(data.secretInfo) !== JSON.stringify(character.secretInfo || {}));

    const statsChanged = changedStats.length > 0;
    const skillsOrTasksChanged = 
      (data.skills !== undefined &&
        JSON.stringify(data.skills) !== JSON.stringify(character.skills || [])) ||
      (data.tasks !== undefined &&
        JSON.stringify(data.tasks) !== JSON.stringify(character.tasks || []));

    // WebSocket：角色更新（不包含單純的道具變動）
    if (basicChanged || statsChanged || skillsOrTasksChanged) {
      emitRoleUpdated(characterId, {
        characterId,
        updates: {
          name: updatedCharacter.name,
          avatar: updatedCharacter.imageUrl,
          publicInfo: updatedCharacter.publicInfo,
          items: cleanItems,
          stats: statsChanged ? changedStats : undefined,
          skills: cleanSkills,
        },
      }).catch((error) => console.error('Failed to emit role.updated', error));
    }

    // WebSocket：道具事件
    if (inventoryDiffs.length > 0) {
      inventoryDiffs.forEach((diff) => {
        emitInventoryUpdated(characterId, {
          characterId,
          item: diff.item,
          action: diff.action,
        }).catch((error) => console.error('Failed to emit role.inventoryUpdated', error));
      });
    }

    return {
      success: true,
      data: {
        id: updatedCharacter._id.toString(),
        gameId: updatedCharacter.gameId.toString(),
        name: updatedCharacter.name,
        description: updatedCharacter.description,
        imageUrl: updatedCharacter.imageUrl,
        hasPinLock: updatedCharacter.hasPinLock,
        publicInfo: updatedCharacter.publicInfo,
        secretInfo: cleanSecretInfo,
        tasks: cleanTasks,
        items: cleanItems,
        stats: cleanStats,
        skills: cleanSkills,
        createdAt: updatedCharacter.createdAt,
        updatedAt: updatedCharacter.updatedAt,
      },
      message: '角色更新成功',
    };
  } catch (error) {
    console.error('Error updating character:', error);

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
      message: '無法更新角色',
    };
  }
}

/**
 * 上傳角色圖片
 */
export async function uploadCharacterImage(
  characterId: string,
  formData: FormData
): Promise<ApiResponse<{ imageUrl: string }>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '請先登入',
      };
    }

    // 檢查 BLOB_READ_WRITE_TOKEN
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '圖片上傳服務尚未配置，請先設定 BLOB_READ_WRITE_TOKEN 環境變數',
      };
    }

    const file = formData.get('file') as File;
    if (!file) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請選擇圖片檔案',
      };
    }

    // 驗證檔案類型
    if (!file.type.startsWith('image/')) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: '只能上傳圖片檔案',
      };
    }

    // 驗證檔案大小（5MB 限制）
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: '圖片大小不可超過 5MB',
      };
    }

    await dbConnect();

    // 驗證角色存在
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權編輯此角色',
      };
    }

    // 上傳到 Vercel Blob
    const blob = await put(`characters/${characterId}-${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    // 更新角色圖片 URL
    character.imageUrl = blob.url;
    await character.save();

    revalidatePath(`/games/${character.gameId.toString()}`);

    return {
      success: true,
      data: { imageUrl: blob.url },
      message: '圖片上傳成功',
    };
  } catch (error) {
    console.error('Error uploading character image:', error);
    return {
      success: false,
      error: 'UPLOAD_FAILED',
      message: '無法上傳圖片',
    };
  }
}

/**
 * 刪除角色
 */
export async function deleteCharacter(
  characterId: string
): Promise<ApiResponse<undefined>> {
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

    // 查詢角色
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權刪除此角色',
      };
    }

    const gameId = character.gameId.toString();

    // 刪除角色
    await Character.findByIdAndDelete(characterId);

    // TODO: 刪除 Vercel Blob 上的圖片（如果有）

    revalidatePath(`/games/${gameId}`);

    return {
      success: true,
      message: '角色刪除成功',
    };
  } catch (error) {
    console.error('Error deleting character:', error);
    return {
      success: false,
      error: 'DELETE_FAILED',
      message: '無法刪除角色',
    };
  }
}

/**
 * Phase 4: 調整角色數值
 * 用於快速增減單一數值（不需要重新儲存整個 stats 陣列）
 */
export async function adjustCharacterStat(
  characterId: string,
  statId: string,
  adjustment: number
): Promise<ApiResponse<{ newValue: number }>> {
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

    // 取得角色並驗證擁有權
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權編輯此角色',
      };
    }

    // 找到目標數值
    const stats = character.stats || [];
    const statIndex = stats.findIndex((s: { id: string }) => s.id === statId);
    if (statIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此數值欄位',
      };
    }

    // 計算新數值
    const currentStat = stats[statIndex];
    let newValue = currentStat.value + adjustment;

    // 如果有最大值，確保不超過
    if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
      newValue = Math.min(newValue, currentStat.maxValue);
    }

    // 確保不低於 0
    newValue = Math.max(0, newValue);

    // 更新數值
    const updatePath = `stats.${statIndex}.value`;
    await Character.findByIdAndUpdate(characterId, {
      $set: { [updatePath]: newValue },
    });

    revalidatePath(`/games/${character.gameId.toString()}`);

    return {
      success: true,
      data: { newValue },
      message: `數值已調整為 ${newValue}`,
    };
  } catch (error) {
    console.error('Error adjusting character stat:', error);
    return {
      success: false,
      error: 'UPDATE_FAILED',
      message: '無法調整數值',
    };
  }
}

/**
 * Phase 4: 設定角色數值為特定值
 */
export async function setCharacterStat(
  characterId: string,
  statId: string,
  newValue: number
): Promise<ApiResponse<{ newValue: number }>> {
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

    // 取得角色並驗證擁有權
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權編輯此角色',
      };
    }

    // 找到目標數值
    const stats = character.stats || [];
    const statIndex = stats.findIndex((s: { id: string }) => s.id === statId);
    if (statIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此數值欄位',
      };
    }

    // 驗證新數值
    const currentStat = stats[statIndex];
    let finalValue = newValue;
    const beforeValue = currentStat.value;

    // 如果有最大值，確保不超過
    if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
      finalValue = Math.min(finalValue, currentStat.maxValue);
    }

    // 確保不低於 0
    finalValue = Math.max(0, finalValue);

    // 更新數值
    const updatePath = `stats.${statIndex}.value`;
    await Character.findByIdAndUpdate(characterId, {
      $set: { [updatePath]: finalValue },
    });

    revalidatePath(`/games/${character.gameId.toString()}`);

    emitRoleUpdated(characterId, {
      characterId,
      updates: {
        stats: [
          {
            id: statId,
            name: currentStat.name,
            value: finalValue,
            maxValue: currentStat.maxValue,
            delta: finalValue - beforeValue,
          },
        ],
      },
    }).catch((error) => console.error('Failed to emit role.updated (stat)', error));

    return {
      success: true,
      data: { newValue: finalValue },
      message: `數值已設定為 ${finalValue}`,
    };
  } catch (error) {
    console.error('Error setting character stat:', error);
    return {
      success: false,
      error: 'UPDATE_FAILED',
      message: '無法設定數值',
    };
  }
}

/**
 * Phase 4.5: 使用道具
 * 檢查冷卻時間、使用次數限制，執行效果並更新狀態
 */
export async function useItem(
  characterId: string,
  itemId: string,
  targetCharacterId?: string
): Promise<ApiResponse<{ itemUsed: boolean; effectApplied?: string; targetCharacterName?: string }>> {
  try {
    await dbConnect();

    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 找到目標道具
    const items = character.items || [];
    const itemIndex = items.findIndex((i: { id: string }) => i.id === itemId);
    if (itemIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此道具',
      };
    }

    const item = items[itemIndex];
    const now = new Date();

    // Phase 6.5: 判斷是否影響他人並驗證目標
    const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;
    let targetCharacter: CharacterDocument | null = null;
    if (isAffectingOthers) {
      targetCharacter = await Character.findById(targetCharacterId);
      if (!targetCharacter || targetCharacter.gameId.toString() !== character.gameId.toString()) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '目標角色不存在或不在同一劇本內',
        };
      }
    }

    // 檢查消耗品數量
    if (item.type === 'consumable' && item.quantity <= 0) {
      return {
        success: false,
        error: 'ITEM_DEPLETED',
        message: '道具數量不足',
      };
    }

    // 檢查使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      if ((item.usageCount || 0) >= item.usageLimit) {
        return {
          success: false,
          error: 'USAGE_LIMIT_REACHED',
          message: '已達使用次數上限',
        };
      }
    }

    // 檢查冷卻時間
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      const cooldownMs = item.cooldown * 1000;
      if (now.getTime() - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now.getTime() - lastUsed)) / 1000);
        return {
          success: false,
          error: 'ON_COOLDOWN',
          message: `冷卻中，剩餘 ${remainingSeconds} 秒`,
        };
      }
    }

    // 準備更新
    const usageUpdates: Record<string, unknown> = {};
    const targetStatUpdates: Record<string, unknown> = {};
    let effectMessage = '';

    // 更新冷卻時間
    if (item.cooldown && item.cooldown > 0) {
      usageUpdates[`items.${itemIndex}.lastUsedAt`] = now;
    }

    // 處理使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      // 有使用次數限制：每次使用增加 usageCount
      const newUsageCount = (item.usageCount || 0) + 1;
      usageUpdates[`items.${itemIndex}.usageCount`] = newUsageCount;
      // 不刪除道具，讓它保留在清單中顯示為已用盡
    } else {
      // 沒有使用次數限制：消耗品每次使用減少數量
      if (item.type === 'consumable') {
        const newQuantity = Math.max(0, item.quantity - 1);
        usageUpdates[`items.${itemIndex}.quantity`] = newQuantity;
        // 不刪除道具，讓它保留在清單中顯示為數量 0
      }
    }

    // 執行效果
    let statUpdatePayload: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> | undefined;
    const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];
    if (item.effect) {
      if (
        item.effect.type === 'stat_change' &&
        item.effect.targetStat &&
        typeof item.effect.value === 'number'
      ) {
        const effectTarget = targetCharacter || character;
        const stats = effectTarget.stats || [];
        const statIndex = stats.findIndex((s: { name: string }) => s.name === item.effect.targetStat);
        
        if (statIndex !== -1) {
          // 使用 type assertion 處理可能缺少的欄位（向下兼容舊資料）
          interface ItemEffectExtended {
            type: string;
            targetStat?: string;
            value?: number;
            statChangeTarget?: 'value' | 'maxValue';
            syncValue?: boolean;
            description?: string;
          }
          const effectWithTarget = item.effect as ItemEffectExtended;
          const target = effectWithTarget.statChangeTarget || 'value';
          const delta = item.effect.value;
          const beforeValue = stats[statIndex].value;
          const beforeMax = stats[statIndex].maxValue ?? null;
          const syncValue = effectWithTarget.syncValue;

          // 若目標無 maxValue，但要求改 maxValue，退回改 value
          const effectiveTarget =
            target === 'maxValue' && beforeMax === null ? 'value' : target;

          let newValue = beforeValue;
          let newMax = beforeMax;
          let deltaValue = 0;
          let deltaMax = 0;

          if (effectiveTarget === 'maxValue') {
            // 修改最大值（參考技能實作）
            if (beforeMax !== null) {
              newMax = Math.max(1, beforeMax + delta);
              deltaMax = newMax - beforeMax;
              targetStatUpdates[`stats.${statIndex}.maxValue`] = newMax;

              if (syncValue) {
                // 同步修改目前值
                newValue = Math.max(0, beforeValue + delta);
                newValue = Math.min(newValue, newMax);
                deltaValue = newValue - beforeValue;
                targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                effectMessage = `${item.effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}，目前值同步調整`;
              } else {
                // 只修改最大值，確保目前值不超過新最大值
                newValue = Math.min(beforeValue, newMax);
                deltaValue = newValue - beforeValue;
                targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                effectMessage = `${item.effect.targetStat} 最大值 ${delta > 0 ? '+' : ''}${delta}`;
              }
            }
          } else {
            // 修改目前值
            newValue = Math.max(0, beforeValue + delta);
            if (beforeMax !== null) newValue = Math.min(newValue, beforeMax);
            deltaValue = newValue - beforeValue;
            targetStatUpdates[`stats.${statIndex}.value`] = newValue;
            effectMessage = `${item.effect.targetStat} ${delta > 0 ? '+' : ''}${delta}`;
          }

          statUpdatePayload = [
            {
              id: stats[statIndex].id,
              name: stats[statIndex].name,
              value: newValue,
              maxValue: newMax ?? undefined,
              deltaValue: deltaValue !== 0 ? deltaValue : undefined,
              deltaMax: deltaMax !== 0 ? deltaMax : undefined,
            },
          ];
          if (isAffectingOthers) {
            crossCharacterChanges.push({
              name: stats[statIndex].name,
              deltaValue: deltaValue !== 0 ? deltaValue : undefined,
              deltaMax: deltaMax !== 0 ? deltaMax : undefined,
              newValue,
              newMax: newMax ?? undefined,
            });
          }
        }
      } else if (item.effect.type === 'custom' && item.effect.description) {
        effectMessage = item.effect.description;
      }
    }

    // 執行更新：施放者（使用記錄 + 若非跨角色則包含自身的數值變更）
    const selfUpdates: Record<string, unknown> = { ...usageUpdates };
    if (!isAffectingOthers) {
      Object.assign(selfUpdates, targetStatUpdates);
    }
    if (Object.keys(selfUpdates).length > 0) {
      await Character.findByIdAndUpdate(characterId, { $set: selfUpdates });
    }
    revalidatePath(`/c/${characterId}`);

    // 若跨角色，寫入目標角色的數值變更
    if (isAffectingOthers && Object.keys(targetStatUpdates).length > 0) {
      await Character.findByIdAndUpdate(targetCharacterId, { $set: targetStatUpdates });
      revalidatePath(`/c/${targetCharacterId}`);
    }

    // WebSocket：數值更新（若有）
    if (statUpdatePayload) {
      const targetId = isAffectingOthers ? targetCharacterId! : characterId;
      emitRoleUpdated(targetId, {
        characterId: targetId,
        updates: {
          stats: statUpdatePayload,
        },
      }).catch((error) => console.error('Failed to emit role.updated (item stat)', error));

      if (isAffectingOthers && crossCharacterChanges.length > 0) {
        emitCharacterAffected(targetId, {
          targetCharacterId: targetId,
          sourceCharacterId: characterId,
          sourceCharacterName: character.name,
          sourceType: 'item',
          sourceName: item.name,
          effectType: 'stat_change',
          changes: { stats: crossCharacterChanges },
        }).catch((error) => console.error('Failed to emit character.affected (item)', error));
      }
    }

    return {
      success: true,
      data: { 
        itemUsed: true,
        effectApplied: effectMessage || undefined,
        targetCharacterName: isAffectingOthers ? targetCharacter?.name : undefined,
      },
      message: effectMessage ? `使用成功：${effectMessage}` : '道具使用成功',
    };
  } catch (error) {
    console.error('Error using item:', error);
    return {
      success: false,
      error: 'USE_FAILED',
      message: '無法使用道具',
    };
  }
}

/**
 * Phase 4.5: 轉移道具給其他角色
 */
export async function transferItem(
  fromCharacterId: string,
  toCharacterId: string,
  itemId: string,
  quantity: number = 1
): Promise<ApiResponse<{ transferred: boolean }>> {
  try {
    await dbConnect();

    // 取得來源角色
    const fromCharacter = await Character.findById(fromCharacterId);
    if (!fromCharacter) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到來源角色',
      };
    }

    // 取得目標角色
    const toCharacter = await Character.findById(toCharacterId);
    if (!toCharacter) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到目標角色',
      };
    }

    // 確認兩個角色在同一個遊戲中
    if (fromCharacter.gameId.toString() !== toCharacter.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TRANSFER',
        message: '只能在同一個劇本內轉移道具',
      };
    }

    // 找到要轉移的道具
    const fromItems = fromCharacter.items || [];
    const itemIndex = fromItems.findIndex((i: { id: string }) => i.id === itemId);
    if (itemIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到要轉移的道具',
      };
    }

    const item = fromItems[itemIndex];

    // 檢查是否可轉移
    if (!item.isTransferable) {
      return {
        success: false,
        error: 'NOT_TRANSFERABLE',
        message: '此道具無法轉移',
      };
    }

    // 檢查數量
    if (item.quantity < quantity) {
      return {
        success: false,
        error: 'INSUFFICIENT_QUANTITY',
        message: '道具數量不足',
      };
    }

    // 建立轉移的道具副本（重置使用次數和冷卻）
    const transferredItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      type: item.type,
      quantity: quantity,
      effect: item.effect,
      usageLimit: item.usageLimit,
      usageCount: 0, // 重置使用次數
      cooldown: item.cooldown,
      lastUsedAt: undefined, // 重置冷卻
      isTransferable: item.isTransferable,
      acquiredAt: new Date(),
    };

    // 從來源角色扣除
    if (item.quantity === quantity) {
      // 完全移除
      await Character.findByIdAndUpdate(fromCharacterId, {
        $pull: { items: { id: itemId } },
      });
    } else {
      // 減少數量
      await Character.findByIdAndUpdate(fromCharacterId, {
        $set: { [`items.${itemIndex}.quantity`]: item.quantity - quantity },
      });
    }

    // 加到目標角色：保持獨立個體，不再堆疊
    await Character.findByIdAndUpdate(toCharacterId, {
      $push: { items: transferredItem },
    });

    revalidatePath(`/c/${fromCharacterId}`);
    revalidatePath(`/c/${toCharacterId}`);

    // WebSocket：道具轉移事件
    emitItemTransferred(fromCharacterId, toCharacterId, {
      fromCharacterId,
      fromCharacterName: fromCharacter.name,
      toCharacterId,
      toCharacterName: toCharacter.name,
      itemId: item.id,
      itemName: item.name,
      quantity,
      transferType: 'give',
    }).catch((error) => console.error('Failed to emit item.transferred', error));

    return {
      success: true,
      data: { transferred: true },
      message: `成功轉移 ${quantity} 個 ${item.name}`,
    };
  } catch (error) {
    console.error('Error transferring item:', error);
    return {
      success: false,
      error: 'TRANSFER_FAILED',
      message: '無法轉移道具',
    };
  }
}

/**
 * Phase 5: 使用技能
 * 包含檢定流程、冷卻檢查、使用次數限制、效果執行
 */
export async function useSkill(
  characterId: string,
  skillId: string,
  checkResult?: number, // 檢定結果（由前端傳入，如果是 random 類型）
  targetCharacterId?: string // Phase 6.5: 目標角色 ID（跨角色效果用）
): Promise<ApiResponse<{ skillUsed: boolean; checkPassed?: boolean; checkResult?: number; effectsApplied?: string[]; targetCharacterName?: string }>> {
  try {
    await dbConnect();

    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 找到目標技能
    const skills = character.skills || [];
    const skillIndex = skills.findIndex((s: { id: string }) => s.id === skillId);
    if (skillIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此技能',
      };
    }

    const skill = skills[skillIndex];
    const now = new Date();

    // Phase 6.5: 驗證目標角色（如果需要）
    let targetCharacter = null;
    const requiresTarget = skill.effects?.some((effect: Record<string, unknown>) => effect.requiresTarget);
    
    if (requiresTarget) {
      if (!targetCharacterId) {
        return {
          success: false,
          error: 'TARGET_REQUIRED',
          message: '此技能需要選擇目標角色',
        };
      }
      
      // 獲取目標角色（驗證在同一劇本內）
      targetCharacter = await Character.findById(targetCharacterId);
      if (!targetCharacter || targetCharacter.gameId.toString() !== character.gameId.toString()) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '目標角色不存在或不在同一劇本內',
        };
      }
      
      // 驗證目標類型匹配
      const effectWithTarget = skill.effects?.find((e: Record<string, unknown>) => e.requiresTarget);
      const targetType = effectWithTarget?.targetType as string | undefined;
      
      if (targetType === 'self' && targetCharacterId !== characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此技能只能對自己使用',
        };
      }
      
      if (targetType === 'other' && targetCharacterId === characterId) {
        return {
          success: false,
          error: 'INVALID_TARGET',
          message: '此技能不能對自己使用',
        };
      }
    }

    // 檢查使用次數限制
    if (skill.usageLimit && skill.usageLimit > 0) {
      if ((skill.usageCount || 0) >= skill.usageLimit) {
        return {
          success: false,
          error: 'USAGE_LIMIT_REACHED',
          message: '已達使用次數上限',
        };
      }
    }

    // 檢查冷卻時間
    if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
      const lastUsed = new Date(skill.lastUsedAt).getTime();
      const cooldownMs = skill.cooldown * 1000;
      if (now.getTime() - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now.getTime() - lastUsed)) / 1000);
        return {
          success: false,
          error: 'ON_COOLDOWN',
          message: `冷卻中，剩餘 ${remainingSeconds} 秒`,
        };
      }
    }

    // 執行檢定
    let checkPassed = true;
    let finalCheckResult: number | undefined;

    if (skill.checkType === 'contest') {
      // 對抗檢定（暫時返回錯誤，待後續實作）
      return {
        success: false,
        error: 'NOT_IMPLEMENTED',
        message: '對抗檢定功能開發中',
      };
    } else if (skill.checkType === 'random') {
      // 隨機檢定（由前端傳入結果）
      // 處理舊資料格式：如果沒有 randomConfig，嘗試使用舊的 checkThreshold
      if (!skill.randomConfig) {
        // 檢查是否有舊格式的資料
        const oldThreshold = (skill as { checkThreshold?: number }).checkThreshold;
        const oldMaxValue = 100; // 舊格式預設上限為 100
        
        if (oldThreshold !== undefined) {
          // 使用舊格式的資料，但建議用戶更新
          if (checkResult === undefined) {
            return {
              success: false,
              error: 'CHECK_RESULT_REQUIRED',
              message: '需要檢定結果',
            };
          }
          console.warn('使用舊格式的隨機檢定設定，建議在 GM 端重新編輯技能');
          finalCheckResult = checkResult;
          // 驗證檢定結果在有效範圍內（舊格式預設上限為 100）
          if (checkResult < 1 || checkResult > oldMaxValue) {
            return {
              success: false,
              error: 'INVALID_CHECK_RESULT',
              message: `檢定結果必須在 1-${oldMaxValue} 之間`,
            };
          }
          checkPassed = checkResult >= oldThreshold;
        } else {
          console.error('隨機檢定設定不完整:', skill);
          return {
            success: false,
            error: 'INVALID_CHECK',
            message: '技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，設定上限值和門檻值。',
          };
        }
      } else if (!skill.randomConfig.maxValue || skill.randomConfig.threshold === undefined) {
        console.error('隨機檢定設定不完整:', skill.randomConfig);
        return {
          success: false,
          error: 'INVALID_CHECK',
          message: '技能隨機檢定設定不完整。請在 GM 端重新編輯此技能，確保設定了上限值和門檻值。',
        };
      } else {
        // 正常的新格式
        if (checkResult === undefined) {
          return {
            success: false,
            error: 'CHECK_RESULT_REQUIRED',
            message: '需要檢定結果',
          };
        }

        // 驗證檢定結果在有效範圍內
        if (checkResult < 1 || checkResult > skill.randomConfig.maxValue) {
          return {
            success: false,
            error: 'INVALID_CHECK_RESULT',
            message: `檢定結果必須在 1-${skill.randomConfig.maxValue} 之間`,
          };
        }

        finalCheckResult = checkResult;
        checkPassed = checkResult >= skill.randomConfig.threshold;
      }
    }
    // checkType === 'none' 時，checkPassed 保持為 true

    // Phase 6.5: 判斷是否影響他人
    const isAffectingOthers = targetCharacterId && targetCharacterId !== characterId;
    
    // 分離更新：技能使用記錄 vs. 數值變更
    const usageUpdates: Record<string, unknown> = {};
    const targetStatUpdates: Record<string, unknown> = {};
    const effectsApplied: string[] = [];

    // 技能使用記錄（作用在施放者）
    usageUpdates[`skills.${skillIndex}.lastUsedAt`] = now;
    if (skill.usageLimit && skill.usageLimit > 0) {
      const newUsageCount = (skill.usageCount || 0) + 1;
      usageUpdates[`skills.${skillIndex}.usageCount`] = newUsageCount;
    }

    // 執行技能效果（只有在檢定成功時才執行）
    if (checkPassed && skill.effects && skill.effects.length > 0) {
      // Phase 6.5: 決定效果作用對象
      const effectTarget = targetCharacter || character;
      const effectTargetId = targetCharacterId || characterId;
      
      const stats = effectTarget.stats || [];
      const tasks = effectTarget.tasks || []; // tasks 仍作用於目標
      const statUpdates: Array<{ id: string; name: string; value: number; maxValue?: number; delta?: number; deltaValue?: number; deltaMax?: number }> = [];

      // Phase 6.5: 用於記錄跨角色影響的變化
      const crossCharacterChanges: Array<{ name: string; deltaValue?: number; deltaMax?: number; newValue: number; newMax?: number }> = [];

      for (const effect of skill.effects) {
        if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
          // 數值變化
          const statIndex = stats.findIndex((s: { name: string }) => s.name === effect.targetStat);
          if (statIndex !== -1) {
            const statChangeTarget = effect.statChangeTarget || 'value';
            const currentStat = stats[statIndex];
            const beforeValue = currentStat.value;
            const beforeMax = currentStat.maxValue;
            
            let newValue = beforeValue;
            let newMaxValue = beforeMax;
            let deltaValue = 0;
            let deltaMax = 0;
            
            if (statChangeTarget === 'maxValue') {
              // 修改最大值
              if (currentStat.maxValue !== undefined && currentStat.maxValue !== null) {
                newMaxValue = currentStat.maxValue + effect.value;
                newMaxValue = Math.max(1, newMaxValue); // 最大值至少為 1
                deltaMax = newMaxValue - currentStat.maxValue;
                targetStatUpdates[`stats.${statIndex}.maxValue`] = newMaxValue;
                
                // 如果同步修改目前值
                if (effect.syncValue) {
                  newValue = currentStat.value + effect.value;
                  newValue = Math.min(newValue, newMaxValue); // 不超過新最大值
                  newValue = Math.max(0, newValue);
                  deltaValue = newValue - beforeValue;
                  targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                  effectsApplied.push(`${effect.targetStat} 最大值 ${effect.value > 0 ? '+' : ''}${effect.value}，目前值同步調整`);
                } else {
                  // 只修改最大值，但確保目前值不超過新最大值
                  newValue = Math.min(currentStat.value, newMaxValue);
                  deltaValue = newValue - beforeValue;
                  targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                  effectsApplied.push(`${effect.targetStat} 最大值 ${effect.value > 0 ? '+' : ''}${effect.value}`);
                }
              } else {
                // 該數值沒有最大值，改為修改目前值
                newValue = currentStat.value + effect.value;
                newValue = Math.max(0, newValue);
                deltaValue = newValue - beforeValue;
                targetStatUpdates[`stats.${statIndex}.value`] = newValue;
                effectsApplied.push(`${effect.targetStat} ${effect.value > 0 ? '+' : ''}${effect.value}（該數值無最大值，改為修改目前值）`);
              }
            } else {
              // 修改目前值（預設行為）
              newValue = currentStat.value + effect.value;
              const maxValue = currentStat.maxValue;
              if (maxValue !== undefined && maxValue !== null) {
                newValue = Math.min(newValue, maxValue);
              }
              newValue = Math.max(0, newValue);
              deltaValue = newValue - beforeValue;
              targetStatUpdates[`stats.${statIndex}.value`] = newValue;
              effectsApplied.push(`${effect.targetStat} ${effect.value > 0 ? '+' : ''}${effect.value}`);
            }
            
            statUpdates.push({
              id: currentStat.id,
              name: currentStat.name,
              value: newValue,
              maxValue: newMaxValue ?? undefined,
              delta: deltaValue,
              deltaValue: deltaValue !== 0 ? deltaValue : undefined,
              deltaMax: deltaMax !== 0 ? deltaMax : undefined,
            });
            
            // Phase 6.5: 記錄跨角色影響
            if (isAffectingOthers) {
              crossCharacterChanges.push({
                name: currentStat.name,
                deltaValue: deltaValue !== 0 ? deltaValue : undefined,
                deltaMax: deltaMax !== 0 ? deltaMax : undefined,
                newValue,
                newMax: newMaxValue ?? undefined,
              });
            }
          }
        } else if (effect.type === 'task_reveal' && effect.targetTaskId) {
          // 揭露任務
          const taskIndex = tasks.findIndex((t: { id: string }) => t.id === effect.targetTaskId);
          if (taskIndex !== -1 && tasks[taskIndex].isHidden && !tasks[taskIndex].isRevealed) {
            targetStatUpdates[`tasks.${taskIndex}.isRevealed`] = true;
            targetStatUpdates[`tasks.${taskIndex}.revealedAt`] = now;
            effectsApplied.push(`任務「${tasks[taskIndex].title}」已揭露`);
          }
        } else if (effect.type === 'task_complete' && effect.targetTaskId) {
          // 完成任務
          const taskIndex = tasks.findIndex((t: { id: string }) => t.id === effect.targetTaskId);
          if (taskIndex !== -1) {
            targetStatUpdates[`tasks.${taskIndex}.status`] = 'completed';
            targetStatUpdates[`tasks.${taskIndex}.completedAt`] = now;
            effectsApplied.push(`任務「${tasks[taskIndex].title}」已完成`);
          }
        } else if (effect.type === 'custom' && effect.description) {
          // 自訂效果
          effectsApplied.push(effect.description);
        }
      }
      
      // Phase 6.5: 如果影響他人，更新目標角色並發送事件
      const hasTargetStatUpdates = Object.keys(targetStatUpdates).some((k) => k.startsWith('stats.'));
      if (isAffectingOthers && hasTargetStatUpdates) {
        await Character.findByIdAndUpdate(effectTargetId, { $set: targetStatUpdates }, { new: true });
        revalidatePath(`/c/${effectTargetId}`);
        
        // 發送 character.affected 事件到目標角色
        if (crossCharacterChanges.length > 0) {
          await emitCharacterAffected(effectTargetId, {
            targetCharacterId: effectTargetId,
            sourceCharacterId: characterId,
            sourceCharacterName: character.name,
            sourceType: 'skill',
            sourceName: skill.name,
            effectType: 'stat_change',
            changes: {
              stats: crossCharacterChanges,
            },
          });
        }
        
        // 發送 role.updated 到目標角色（觸發即時更新）
        if (statUpdates.length > 0) {
          await emitRoleUpdated(effectTargetId, {
            characterId: effectTargetId,
            updates: {
              stats: statUpdates,
            },
          });
        }
      }
    }

    // 執行更新：施放者（技能使用記錄 + 若非跨角色則包含自身的數值更新）
    const selfUpdates: Record<string, unknown> = { ...usageUpdates };
    if (!isAffectingOthers) {
      Object.assign(selfUpdates, targetStatUpdates);
    }

    const updateResult = await Character.findByIdAndUpdate(characterId, { $set: selfUpdates }, { new: true });
    if (!updateResult) {
      console.error('Failed to update character:', characterId);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: '無法更新角色資料',
      };
    }

    revalidatePath(`/c/${characterId}`);

    // WebSocket：若有數值變更，推送 role.updated stats
    if (checkPassed && skill.effects && skill.effects.length > 0) {
      const stats = character.stats || [];
      const statUpdates: Array<{ id: string; name: string; value: number; maxValue?: number; deltaValue?: number; deltaMax?: number }> = [];
      for (const effect of skill.effects) {
        if (effect.type === 'stat_change' && effect.targetStat && effect.value !== undefined) {
          const statIndex = stats.findIndex((s: { name: string }) => s.name === effect.targetStat);
          if (statIndex !== -1) {
            const currentStat = stats[statIndex];
            const maxValue = currentStat.maxValue;
            const updatedValue = (!isAffectingOthers ? targetStatUpdates[`stats.${statIndex}.value`] : undefined) as number | undefined;
            const updatedMax = (!isAffectingOthers ? targetStatUpdates[`stats.${statIndex}.maxValue`] : undefined) as number | undefined;
            if (updatedValue !== undefined || updatedMax !== undefined) {
              statUpdates.push({
                id: currentStat.id,
                name: currentStat.name,
                value: updatedValue ?? currentStat.value,
                maxValue: updatedMax ?? maxValue,
                deltaValue: updatedValue !== undefined ? updatedValue - currentStat.value : undefined,
                deltaMax: updatedMax !== undefined && maxValue !== undefined ? updatedMax - maxValue : undefined,
              });
            }
          }
        }
      }
      if (statUpdates.length > 0) {
        emitRoleUpdated(characterId, {
          characterId,
          updates: {
            stats: statUpdates,
          },
        }).catch((error) => console.error('Failed to emit role.updated (skill stat)', error));
      }
    }

    // WebSocket 事件：技能使用（非阻斷，若未配置 Pusher 則安全跳過）
    emitSkillUsed(characterId, {
      characterId,
      skillId: skill.id,
      skillName: skill.name,
      checkType: skill.checkType,
      checkPassed,
      checkResult: finalCheckResult,
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
    }).catch((error) => {
      console.error('Failed to emit skill.used event', error);
    });

    const messageParts: string[] = [];
    if (!checkPassed) {
      messageParts.push('檢定失敗');
    } else {
      messageParts.push('技能使用成功');
      if (isAffectingOthers && targetCharacter) {
        messageParts.push(`對象：${targetCharacter.name}`);
      }
      if (effectsApplied.length > 0) {
        messageParts.push(`效果：${effectsApplied.join('、')}`);
      }
    }

    return {
      success: true,
      data: {
        skillUsed: true,
        checkPassed,
        checkResult: finalCheckResult,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        targetCharacterName: targetCharacter?.name,
      },
      message: messageParts.join('，'),
    };
  } catch (error) {
    console.error('Error using skill:', error);
    return {
      success: false,
      error: 'USE_FAILED',
      message: `無法使用技能：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

