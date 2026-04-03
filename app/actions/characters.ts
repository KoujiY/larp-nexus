'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { Character, CharacterRuntime, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { getCharacterData } from '@/lib/game/get-character-data'; // Phase 10: 統一讀取
import { serializePublicInfo } from '@/lib/character/normalize-background';
import type { ApiResponse } from '@/types/api';
import type { CharacterData } from '@/types/character';
import { cleanSkillData, cleanItemData, cleanStatData, cleanTaskData, cleanSecretData } from '@/lib/character-cleanup';
import { processExpiredEffects, cleanupOldExpiredEffects } from '@/lib/effects/check-expired-effects';

/**
 * 將原始角色文件序列化為可傳遞給 Client Component 的 CharacterData
 *
 * 統一清理 _id、序列化 publicInfo、確保 boolean 預設值等。
 * 被 getCharactersByGameId、getCharacterById、createCharacter 共用。
 */
function serializeCharacterDoc(
  raw: Record<string, unknown>,
  overrides?: { id?: string; gameId?: string },
): CharacterData {
  const cleanSecretInfo = (raw.secretInfo as Record<string, unknown> | undefined)?.secrets
    ? { secrets: cleanSecretData((raw.secretInfo as { secrets: unknown[] }).secrets as Parameters<typeof cleanSecretData>[0]) }
    : undefined;

  return {
    id: overrides?.id ?? String(raw._id ?? raw.id),
    gameId: overrides?.gameId ?? String(raw.gameId),
    name: raw.name as string,
    description: raw.description as string,
    imageUrl: raw.imageUrl as string | undefined,
    hasPinLock: raw.hasPinLock as boolean,
    publicInfo: serializePublicInfo(raw.publicInfo as Record<string, unknown>),
    secretInfo: cleanSecretInfo,
    tasks: cleanTaskData(raw.tasks as Parameters<typeof cleanTaskData>[0]),
    items: cleanItemData(raw.items as Parameters<typeof cleanItemData>[0]),
    stats: cleanStatData(raw.stats as Parameters<typeof cleanStatData>[0]),
    skills: cleanSkillData(raw.skills as Parameters<typeof cleanSkillData>[0]),
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  } as CharacterData;
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

    // 永遠需要 Baseline Characters（ID、排序依據、fallback）
    const baselineCharacters = await Character.find({ gameId })
      .sort({ createdAt: -1 })
      .lean();

    // 遊戲進行中時，用 Runtime 資料覆蓋 Baseline
    // Runtime 的 refId 對應 Baseline 的 _id
    let runtimeMap: Map<string, typeof baselineCharacters[number]> | null = null;
    if (game.isActive) {
      const runtimeCharacters = await CharacterRuntime.find({
        gameId,
        type: 'runtime',
      }).lean();

      runtimeMap = new Map(
        runtimeCharacters.map((rc) => [rc.refId.toString(), rc as unknown as typeof baselineCharacters[number]])
      );
    }

    return {
      success: true,
      data: baselineCharacters.map((baseline) => {
        // 遊戲進行中：優先使用 Runtime 資料，找不到則 fallback 至 Baseline
        const char = runtimeMap?.get(baseline._id.toString()) ?? baseline;

        return serializeCharacterDoc(char, {
          id: baseline._id.toString(),
          gameId: baseline.gameId.toString(),
        });
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
 * Phase 10: 使用 getCharacterData() 自動判斷 Baseline/Runtime
 * 遊戲進行中回傳 Runtime 資料，否則回傳 Baseline 資料
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

    // 先驗證 Baseline Character 是否存在（用於權限檢查）
    const baselineCharacter = await Character.findById(characterId).lean();
    if (!baselineCharacter) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: baselineCharacter.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權存取此角色',
      };
    }

    // Phase 10: 使用統一讀取函數（遊戲進行中自動回傳 Runtime）
    const characterDoc = await getCharacterData(characterId);
    const character = JSON.parse(JSON.stringify(characterDoc));

    // Phase 8: 處理過期的時效性效果並恢復數值
    // processExpiredEffects 同時查詢 Character + CharacterRuntime，
    // 並透過 document.constructor 自動寫入正確的 collection
    // 寫入失敗不應阻斷讀取，因此獨立 try-catch
    let characterWithUpdates = character;
    try {
      await processExpiredEffects(characterId);
      await cleanupOldExpiredEffects(characterId);

      // 重新讀取以取得過期檢查後的最新資料
      const updatedDoc = await getCharacterData(characterId);
      const updatedCharacter = JSON.parse(JSON.stringify(updatedDoc));
      characterWithUpdates = {
        ...character,
        stats: updatedCharacter.stats,
        temporaryEffects: updatedCharacter.temporaryEffects,
      };
    } catch (expiredError) {
      console.error('Failed to process expired effects, returning stale data:', expiredError);
    }

    return {
      success: true,
      data: serializeCharacterDoc(characterWithUpdates, {
        id: characterId,
        gameId: baselineCharacter.gameId.toString(),
      }),
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
      if (!/^\d{4}$/.test(validated.pin)) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'PIN 碼必須為 4 位數字',
        };
      }
    }

    await dbConnect();

    // Phase 10.9.2: 檢查 PIN 在同遊戲內的唯一性
    if (validated.hasPinLock && validated.pin) {
      const existingCharacter = await Character.findOne({
        gameId: data.gameId,
        pin: validated.pin,
      });

      if (existingCharacter) {
        return {
          success: false,
          error: 'DUPLICATE_ERROR',
          message: '此 PIN 在本遊戲中已被使用，請選擇其他 PIN',
        };
      }
    }

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

    return {
      success: true,
      data: serializeCharacterDoc(characterObj),
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

    // 上傳到 Vercel Blob（消毒檔名，防止路徑注入）
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = await put(`characters/${characterId}/${Date.now()}-${safeName}`, file, {
      access: 'public',
    });

    // 更新角色圖片 URL（使用 findByIdAndUpdate 避免 mutation）
    await Character.findByIdAndUpdate(characterId, { imageUrl: blob.url });

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
 * Phase 10.9.2: 檢查 PIN 是否可用（前端即時檢查用）
 *
 * @param gameId - 遊戲 ID
 * @param pin - 要檢查的 PIN
 * @param excludeCharacterId - 要排除的角色 ID（編輯時使用，排除自己）
 * @returns API 回應（isAvailable: true/false）
 */
export async function checkPinAvailability(
  gameId: string,
  pin: string,
  excludeCharacterId?: string
): Promise<ApiResponse<{ isAvailable: boolean }>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // 驗證 PIN 格式（4 位數字）
    const pinRegex = /^\d{4}$/;
    const trimmedPin = pin.trim();

    if (!pinRegex.test(trimmedPin)) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'PIN 碼必須為 4 位數字',
      };
    }

    await dbConnect();

    // 驗證 Game 所有權
    const game = await Game.findOne({ _id: gameId, gmUserId });
    if (!game) {
      return { success: false, error: 'UNAUTHORIZED', message: '無權存取此遊戲' };
    }

    // 建立查詢條件
    const query: Record<string, unknown> = {
      gameId,
      pin: trimmedPin,
    };

    // 如果有 excludeCharacterId，排除該角色（編輯時使用）
    if (excludeCharacterId) {
      query._id = { $ne: excludeCharacterId };
    }

    // 檢查唯一性
    const existingCharacter = await Character.findOne(query);
    const isAvailable = !existingCharacter;

    return {
      success: true,
      data: { isAvailable },
    };
  } catch (error) {
    console.error('Error checking PIN availability:', error);
    return {
      success: false,
      error: 'CHECK_FAILED',
      message: '無法檢查 PIN 可用性',
    };
  }
}
