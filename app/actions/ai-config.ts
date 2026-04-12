'use server';

import { z } from 'zod';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import GMUser from '@/lib/db/models/GMUser';
import { encrypt } from '@/lib/crypto';
import { testAiConnection } from '@/lib/ai/provider';
import { revalidatePath } from 'next/cache';
import type { ApiResponse } from '@/types/api';

/** getAiConfig 回傳型別 */
type AiConfigResponse = {
  hasApiKey: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
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
    },
  };
}

/**
 * 儲存 AI 設定（含驗證測試呼叫）
 */
export async function saveAiConfig(
  input: SaveAiConfigInput
): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  // 驗證輸入
  const parsed = saveAiConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message || '輸入驗證失敗',
    };
  }

  const { provider, apiKey, baseUrl, model } = parsed.data;

  // 測試 AI 連線
  try {
    await testAiConnection(apiKey, baseUrl, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 根據 OpenAI SDK 錯誤訊息分類
    if (message.includes('401') || message.includes('Incorrect API key')) {
      return { success: false, error: 'INVALID_INPUT', message: 'API Key 驗證失敗，請檢查設定' };
    }
    if (message.includes('429') || message.includes('quota')) {
      return { success: false, error: 'INVALID_INPUT', message: 'API 額度不足，請檢查您的帳戶' };
    }
    if (message.includes('model')) {
      return { success: false, error: 'INVALID_INPUT', message: '指定的模型不可用，請檢查設定' };
    }
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, error: 'INVALID_INPUT', message: '無法連線至 AI 服務，請檢查 Base URL' };
    }
    return { success: false, error: 'INVALID_INPUT', message: 'AI 服務回傳錯誤，請檢查您的 API 設定' };
  }

  // 加密 API Key 並儲存
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
