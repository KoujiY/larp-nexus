'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';

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

        return {
          id: char._id.toString(),
          gameId: char.gameId.toString(),
          name: char.name,
          description: char.description,
          imageUrl: char.imageUrl,
          hasPinLock: char.hasPinLock,
          publicInfo: char.publicInfo,
          secretInfo: cleanSecretInfo,
          tasks: char.tasks || [],
          items: char.items || [],
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
        tasks: character.tasks || [],
        items: character.items || [],
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
 * Phase 3.5: 支援更新 publicInfo 和 secretInfo
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
        secretInfo: updatedCharacter.secretInfo,
        tasks: updatedCharacter.tasks || [],
        items: updatedCharacter.items || [],
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

