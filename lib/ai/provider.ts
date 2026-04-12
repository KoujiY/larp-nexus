import OpenAI from 'openai';
import dbConnect from '@/lib/db/mongodb';
import GMUser from '@/lib/db/models/GMUser';
import { decrypt } from '@/lib/crypto';
import { CHARACTER_IMPORT_SYSTEM_PROMPT } from '@/lib/ai/prompts/character-import';
import {
  characterImportJsonSchema,
  characterImportSchema,
  type CharacterImportResult,
} from '@/lib/ai/schemas/character-import';

/**
 * 從 DB 讀取使用者 AI 設定，解密 API Key，建立 OpenAI client
 */
async function createClientForUser(
  userId: string
): Promise<{ client: OpenAI; model: string }> {
  await dbConnect();
  const user = await GMUser.findById(userId).lean();

  if (!user?.aiConfig) {
    throw new Error('尚未設定 AI 服務，請先至個人設定頁完成 AI 設定');
  }

  const { baseUrl, model, encryptedApiKey } = user.aiConfig;
  const apiKey = decrypt(encryptedApiKey);

  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    maxRetries: 0,
  });

  return { client, model };
}

/**
 * 呼叫 AI 解析角色文字資料
 *
 * 使用 OpenAI SDK 的 chat.completions.create 搭配 json_schema response_format，
 * 取得 JSON 回應後以 Zod schema 驗證。
 */
export async function callAiForCharacterImport(
  userId: string,
  text: string
): Promise<CharacterImportResult> {
  const { client, model } = await createClientForUser(userId);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHARACTER_IMPORT_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'character_import',
        strict: true,
        schema: characterImportJsonSchema,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI 回傳格式異常，請稍後重試');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI 回傳內容非有效 JSON，請稍後重試');
  }

  return characterImportSchema.parse(parsed);
}

/**
 * 發送最小測試請求驗證 AI 設定是否有效
 */
export async function testAiConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<void> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl, maxRetries: 0 });

  await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
  });
}
