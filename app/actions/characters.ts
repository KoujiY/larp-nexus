'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';
import { cleanSkillData, cleanItemData, cleanStatData, cleanTaskData, cleanSecretData } from '@/lib/character-cleanup';

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
              secrets: cleanSecretData(char.secretInfo.secrets),
            }
          : undefined;

        // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
        const cleanTasks = cleanTaskData(char.tasks);

        // 清理 items 中的 _id
        const cleanItems = cleanItemData(char.items);

        // 清理 stats 中的 _id
        const cleanStats = cleanStatData(char.stats);

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
          secrets: cleanSecretData(character.secretInfo.secrets),
        }
      : undefined;

    // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
    const cleanTasks = cleanTaskData(character.tasks);

    // 清理 items 中的 _id
    const cleanItems = cleanItemData(character.items);

    // 清理 stats 中的 _id
    const cleanStats = cleanStatData(character.stats);

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
          message: '啟用 PIN 鎖必須設定 PIN 碼',
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
          secrets: cleanSecretData(characterObj.secretInfo.secrets),
        }
      : undefined;

    // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
    const cleanTasks = cleanTaskData(characterObj.tasks);

    // 清理 items 中的 _id
    const cleanItems = cleanItemData(characterObj.items);

    // 清理 stats 中的 _id
    const cleanStats = cleanStatData(characterObj.stats);

    // 清理 skills 中的 _id
    const cleanSkills = cleanSkillData(characterObj.skills);

    return {
      success: true,
      data: {
        id: characterObj._id.toString(),
        gameId: characterObj.gameId.toString(),
        name: characterObj.name,
        description: characterObj.description,
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

// 更新角色函數已移動到 character-update.ts

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

    // 處理檔案上傳
    const file = formData.get('image') as File;
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
        message: '檔案必須為圖片格式',
      };
    }

    // 驗證檔案大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: '圖片檔案大小不可超過 5MB',
      };
    }

    // 上傳到 Vercel Blob
    const blob = await put(`characters/${characterId}/${Date.now()}-${file.name}`, file, {
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
): Promise<ApiResponse<null>> {
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
  delta: number
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

    // 找到目標統計
    const statIndex = character.stats.findIndex((s: { id: string }) => s.id === statId);
    if (statIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此統計項目',
      };
    }

    const stat = character.stats[statIndex];
    const newValue = Math.max(0, stat.value + delta); // 確保不低於 0

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

    // 找到目標統計
    const statIndex = character.stats.findIndex((s: { id: string }) => s.id === statId);
    if (statIndex === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此統計項目',
      };
    }

    const stat = character.stats[statIndex];

    // 計算最終值
    let finalValue = Math.max(0, newValue); // 確保不低於 0
    if (stat.maxValue !== undefined && stat.maxValue !== null) {
      finalValue = Math.min(finalValue, stat.maxValue); // 確保不超過最大值
    }

    // 更新數值
    const updatePath = `stats.${statIndex}.value`;
    await Character.findByIdAndUpdate(characterId, {
      $set: { [updatePath]: finalValue },
    });

    revalidatePath(`/games/${character.gameId.toString()}`);

    // WebSocket 事件
    const statUpdatePayload = [
      {
        id: stat.id,
        name: stat.name,
        value: finalValue,
        maxValue: stat.maxValue,
        deltaValue: finalValue - stat.value,
      },
    ];

    // 使用 import 的 emitRoleUpdated 函數
    const { emitRoleUpdated } = await import('@/lib/websocket/events');
    emitRoleUpdated(characterId, {
      characterId,
      updates: {
        stats: statUpdatePayload,
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

// 使用道具和技能函數已移動到 item-use.ts 和 skill-use.ts
