/**
 * 角色背景 Block 正規化工具
 *
 * 資料庫中舊資料為 string，新資料為 BackgroundBlock[]。
 * 此函式統一轉為 BackgroundBlock[]，確保向後相容。
 */

import type { BackgroundBlock } from '@/types/character';

/**
 * 將背景資料正規化為 BackgroundBlock[]
 *
 * - string → [{ type: 'body', content: str }]
 * - BackgroundBlock[] → 原樣回傳
 * - 其他 → []
 */
export function normalizeBackground(
  raw: unknown
): BackgroundBlock[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (block): block is BackgroundBlock =>
        typeof block === 'object' &&
        block !== null &&
        (block.type === 'title' || block.type === 'body') &&
        typeof block.content === 'string'
    );
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    return [{ type: 'body', content: raw }];
  }

  return [];
}

/**
 * 序列化 publicInfo，確保 background 為 BackgroundBlock[]
 *
 * 用於 server action 回傳 CharacterData 時，
 * 將 Mongoose subdoc 轉為乾淨的 PublicInfo 型別。
 */
export function serializePublicInfo(
  raw?: { background?: unknown; personality?: string; relationships?: Array<{ targetName: string; description: string }> }
): { background: BackgroundBlock[]; personality: string; relationships: Array<{ targetName: string; description: string }> } | undefined {
  if (!raw) return undefined;

  return {
    background: normalizeBackground(raw.background),
    personality: raw.personality ?? '',
    relationships: raw.relationships ?? [],
  };
}
