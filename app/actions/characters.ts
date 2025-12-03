'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';

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
        secretInfo: character.secretInfo,
        tasks: character.tasks || [],
        items: character.items || [],
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
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
    if (data.items !== undefined) {
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
    }

    const updatedCharacter = await Character.findByIdAndUpdate(
      characterId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedCharacter) {
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: '更新失敗',
      };
    }

    revalidatePath(`/games/${character.gameId.toString()}`);

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
  itemId: string
): Promise<ApiResponse<{ itemUsed: boolean; effectApplied?: string }>> {
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
    const updates: Record<string, unknown> = {};
    let effectMessage = '';

    // 更新冷卻時間
    if (item.cooldown && item.cooldown > 0) {
      updates[`items.${itemIndex}.lastUsedAt`] = now;
    }

    // 處理使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      // 有使用次數限制：每次使用增加 usageCount
      const newUsageCount = (item.usageCount || 0) + 1;
      updates[`items.${itemIndex}.usageCount`] = newUsageCount;
      // 不刪除道具，讓它保留在清單中顯示為已用盡
    } else {
      // 沒有使用次數限制：消耗品每次使用減少數量
      if (item.type === 'consumable') {
        const newQuantity = Math.max(0, item.quantity - 1);
        updates[`items.${itemIndex}.quantity`] = newQuantity;
        // 不刪除道具，讓它保留在清單中顯示為數量 0
      }
    }

    // 執行效果
    if (item.effect) {
      if (item.effect.type === 'stat_change' && item.effect.targetStat && item.effect.value !== undefined) {
        // 找到目標數值
        const stats = character.stats || [];
        const statIndex = stats.findIndex((s: { name: string }) => s.name === item.effect.targetStat);
        if (statIndex !== -1) {
          let newValue = stats[statIndex].value + item.effect.value;
          const maxValue = stats[statIndex].maxValue;
          if (maxValue !== undefined && maxValue !== null) {
            newValue = Math.min(newValue, maxValue);
          }
          newValue = Math.max(0, newValue);
          updates[`stats.${statIndex}.value`] = newValue;
          effectMessage = `${item.effect.targetStat} ${item.effect.value > 0 ? '+' : ''}${item.effect.value}`;
        }
      } else if (item.effect.type === 'custom' && item.effect.description) {
        effectMessage = item.effect.description;
      }
    }

    // 執行更新
    if (Object.keys(updates).length > 0) {
      await Character.findByIdAndUpdate(characterId, { $set: updates });
    }

    revalidatePath(`/c/${characterId}`);

    return {
      success: true,
      data: { 
        itemUsed: true,
        effectApplied: effectMessage || undefined,
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
      id: `item-${Date.now()}`,
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

    // 加到目標角色
    // 檢查目標角色是否已有同名道具（可堆疊）
    const toItems = toCharacter.items || [];
    const existingItemIndex = toItems.findIndex(
      (i: { name: string; type: string }) => i.name === item.name && i.type === item.type
    );

    if (existingItemIndex !== -1 && item.type === 'consumable') {
      // 消耗品可堆疊
      await Character.findByIdAndUpdate(toCharacterId, {
        $inc: { [`items.${existingItemIndex}.quantity`]: quantity },
      });
    } else {
      // 新增道具
      await Character.findByIdAndUpdate(toCharacterId, {
        $push: { items: transferredItem },
      });
    }

    revalidatePath(`/c/${fromCharacterId}`);
    revalidatePath(`/c/${toCharacterId}`);

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

