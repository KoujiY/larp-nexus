'use server';

import { getCurrentGMUserId } from '@/lib/auth/session';
import { callAiForCharacterImport } from '@/lib/ai/provider';
import { parseDocx } from '@/lib/ai/parsers/docx';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';
import type { ApiResponse } from '@/types/api';

const MAX_TEXT_LENGTH = 50_000;
const MAX_DOCX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * 從純文字解析角色資料
 */
export async function parseCharacterFromText(
  text: string
): Promise<ApiResponse<CharacterImportResult>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  if (!text || text.trim().length === 0) {
    return { success: false, error: 'INVALID_INPUT', message: '請輸入角色資料文字' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return { success: false, error: 'INVALID_INPUT', message: `文字長度超過上限 (${MAX_TEXT_LENGTH} 字)` };
  }

  try {
    const result = await callAiForCharacterImport(userId, text.trim());
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[parseCharacterFromText] AI 呼叫失敗:', message);

    if (message.includes('尚未設定 AI 服務')) {
      return { success: false, error: 'INVALID_INPUT', message };
    }
    if (message.includes('AI 回傳格式異常')) {
      return { success: false, error: 'INVALID_INPUT', message: '解析失敗，請稍後重試或調整輸入內容' };
    }
    return { success: false, error: 'INVALID_INPUT', message: 'AI 服務呼叫失敗，請稍後重試' };
  }
}

/**
 * 從 .docx 檔案解析角色資料
 */
export async function parseCharacterFromDocx(
  formData: FormData
): Promise<ApiResponse<CharacterImportResult>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return { success: false, error: 'INVALID_INPUT', message: '請選擇 .docx 檔案' };
  }

  if (file.size > MAX_DOCX_SIZE) {
    return { success: false, error: 'INVALID_INPUT', message: '檔案大小超過上限 (5MB)' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await parseDocx(buffer);

    if (!text || text.trim().length === 0) {
      return { success: false, error: 'INVALID_INPUT', message: '文件內容為空，請確認文件是否正確' };
    }

    const result = await callAiForCharacterImport(userId, text.trim());
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[parseCharacterFromDocx] 解析失敗:', message);

    if (message.includes('文件格式無法解析')) {
      return { success: false, error: 'INVALID_INPUT', message: '文件格式無法解析，請改用貼上文字' };
    }
    return { success: false, error: 'INVALID_INPUT', message: 'AI 服務呼叫失敗，請稍後重試' };
  }
}
