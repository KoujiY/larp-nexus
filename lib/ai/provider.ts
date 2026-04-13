import OpenAI from 'openai';
import dbConnect from '@/lib/db/mongodb';
import GMUser from '@/lib/db/models/GMUser';
import { decrypt } from '@/lib/crypto';
import { buildCharacterImportPrompt } from '@/lib/ai/prompts/character-import';
import {
  characterImportIndexJsonSchema,
  characterImportIndexSchema,
} from '@/lib/ai/schemas/character-import-index';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';
import {
  splitIntoParagraphs,
  formatForAi,
  assembleResult,
} from '@/lib/ai/processors/paragraph-indexer';

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
 * 呼叫 AI 解析角色文字資料（段落索引法）
 *
 * 流程：
 * 1. 將原文拆成帶編號的段落
 * 2. AI 回傳段落索引（不複製原文）
 * 3. 程式碼根據索引從原文組裝最終結果
 */
export async function callAiForCharacterImport(
  userId: string,
  text: string,
  includeSecret: boolean,
  allowAiFill: boolean,
  customPrompt = ''
): Promise<CharacterImportResult> {
  const { client, model } = await createClientForUser(userId);

  // Step 1: 前處理 — 拆段落、編號
  const paragraphs = splitIntoParagraphs(text);
  const numberedText = formatForAi(paragraphs);

  // Step 2: 呼叫 AI — 回傳段落索引
  const systemPrompt = buildCharacterImportPrompt(includeSecret, allowAiFill, customPrompt);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: numberedText },
    ],
    max_tokens: 65536,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'character_import_index',
        strict: true,
        schema: characterImportIndexJsonSchema,
      },
    },
  });

  const finishReason = response.choices[0]?.finish_reason;

  if (finishReason === 'length') {
    throw new Error('AI 回應被截斷（輸出 token 不足），請縮短輸入內容後重試');
  }

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

  const indexResult = characterImportIndexSchema.parse(parsed);

  // Step 3: 後處理 — 根據索引從原文組裝結果
  return assembleResult(indexResult, paragraphs, allowAiFill);
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
