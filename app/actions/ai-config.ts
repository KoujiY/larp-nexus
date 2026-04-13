'use server';

import { z } from 'zod';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import GMUser from '@/lib/db/models/GMUser';
import { encrypt, decrypt } from '@/lib/crypto';
import { testAiConnection } from '@/lib/ai/provider';
import { revalidatePath } from 'next/cache';
import type { ApiResponse } from '@/types/api';

/** getAiConfig 回傳型別 */
type AiConfigResponse = {
  hasApiKey: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  /** key 儲存時的 provider，用於前端顯示 provider 不符提示 */
  keyProvider?: string;
};

/** saveAiConfig 輸入驗證 */
const saveAiConfigSchema = z.object({
  provider: z.string().min(1, 'Provider 不可為空'),
  apiKey: z.string().min(1, 'API Key 不可為空').transform((s) => s.trim()),
  baseUrl: z.string().url('Base URL 格式不正確'),
  model: z.string().min(1, 'Model 不可為空'),
});

type SaveAiConfigInput = z.infer<typeof saveAiConfigSchema>;

/**
 * 取得當前使用者的 AI 設定（不含 API Key 明文）
 */
export async function getAiConfig(): Promise<ApiResponse<AiConfigResponse>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  await dbConnect();
  const user = await GMUser.findById(userId).lean();

  if (!user?.aiConfig) {
    return { success: true, data: { hasApiKey: false } };
  }

  return {
    success: true,
    data: {
      hasApiKey: true,
      provider: user.aiConfig.provider,
      baseUrl: user.aiConfig.baseUrl,
      model: user.aiConfig.model,
      // 向下相容：舊資料沒有 keyProvider 時，fallback 到 provider
      keyProvider: user.aiConfig.keyProvider || user.aiConfig.provider,
    },
  };
}

/**
 * 儲存 API Key（不驗證連線，同時寫入 provider/baseUrl/model）
 */
export async function saveAiConfig(
  input: SaveAiConfigInput
): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  const parsed = saveAiConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message || '輸入驗證失敗',
    };
  }

  const { provider, apiKey, baseUrl, model } = parsed.data;

  await dbConnect();
  const encryptedApiKey = encrypt(apiKey);

  await GMUser.findByIdAndUpdate(userId, {
    $set: {
      aiConfig: {
        provider,
        baseUrl,
        model,
        encryptedApiKey,
      },
    },
  });

  revalidatePath('/profile');
  return { success: true };
}

/** updateAiSettings 輸入驗證（不含 API Key） */
const updateAiSettingsSchema = z.object({
  provider: z.string().min(1, 'Provider 不可為空'),
  baseUrl: z.string().url('Base URL 格式不正確'),
  model: z.string().min(1, 'Model 不可為空'),
});

/**
 * 更新 AI 設定（Provider / Base URL / Model），不變更 API Key
 */
export async function updateAiSettings(
  input: z.infer<typeof updateAiSettingsSchema>
): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  const parsed = updateAiSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message || '輸入驗證失敗',
    };
  }

  await dbConnect();
  const user = await GMUser.findById(userId).lean();

  if (!user?.aiConfig?.encryptedApiKey) {
    return { success: false, error: 'INVALID_INPUT', message: '請先設定 API Key' };
  }

  const { provider, baseUrl, model } = parsed.data;

  await GMUser.findByIdAndUpdate(userId, {
    $set: {
      'aiConfig.provider': provider,
      'aiConfig.baseUrl': baseUrl,
      'aiConfig.model': model,
    },
  });

  revalidatePath('/profile');
  return { success: true };
}

/**
 * 使用已儲存的 API Key 驗證目前的 AI 設定是否可用
 */
export async function testAiConfig(): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  await dbConnect();
  const user = await GMUser.findById(userId).lean();

  if (!user?.aiConfig) {
    return { success: false, error: 'INVALID_INPUT', message: '尚未設定 AI 服務' };
  }

  const { baseUrl, model, encryptedApiKey } = user.aiConfig;
  const apiKey = decrypt(encryptedApiKey);

  try {
    await testAiConnection(apiKey, baseUrl, model);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const detail = `baseUrl=${baseUrl} model=${model} error=${raw}`;
    console.error('[testAiConfig] 驗證失敗:', detail);

    if (raw.includes('401') || raw.includes('Incorrect API key')) {
      return { success: false, error: 'INVALID_INPUT', message: `API Key 驗證失敗（${model}）` };
    }
    if (raw.includes('429') || raw.includes('quota')) {
      return { success: false, error: 'INVALID_INPUT', message: `API 額度不足或請求過於頻繁（${model}）` };
    }
    if (raw.includes('404')) {
      return { success: false, error: 'INVALID_INPUT', message: `模型 ${model} 不存在，請確認模型名稱` };
    }
    if (raw.includes('ECONNREFUSED') || raw.includes('fetch failed')) {
      return { success: false, error: 'INVALID_INPUT', message: `無法連線至 ${baseUrl}` };
    }
    return { success: false, error: 'INVALID_INPUT', message: `驗證失敗：${raw}` };
  }

  // 驗證成功，記錄此 key 對應的 provider
  await GMUser.findByIdAndUpdate(userId, {
    $set: { 'aiConfig.keyProvider': user.aiConfig.provider },
  });

  revalidatePath('/profile');
  return { success: true };
}

/**
 * 刪除 AI 設定
 */
export async function deleteAiConfig(): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  await dbConnect();
  await GMUser.findByIdAndUpdate(userId, {
    $unset: { aiConfig: 1 },
  });

  revalidatePath('/profile');
  return { success: true };
}
