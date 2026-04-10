/**
 * E2E 專用 db-query route
 *
 * 提供 spec 直接查詢 DB 的能力，用於斷言 server action 後的資料庫狀態。
 *
 * Query params:
 * - `collection`: 允許的 collection 名稱（allowlist）
 * - `filter`: JSON string，自動轉換 `_id` 和 `*Id` 欄位的 24-char hex string 為 ObjectId
 *
 * 僅在 `process.env.E2E === '1'` 時可用。
 */

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_COLLECTIONS = new Set([
  'gm_users',
  'games',
  'characters',
  'game_runtime',
  'character_runtime',
  'pending_events',
  'logs',
  'magic_links',
]);

/** 24-char hex string → ObjectId */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/**
 * Schema 中以 String 儲存的 *Id 欄位（非 ObjectId ref）。
 * convertObjectIds 會跳過這些欄位，避免型別不匹配導致查詢失敗。
 */
const STRING_ID_FIELDS = new Set(['targetGameId', 'targetCharacterId']);

/**
 * 遞迴轉換 filter 物件中的 ObjectId 字串
 * - `_id` 和以 `Id` 結尾的 key：24-char hex → ObjectId
 * - STRING_ID_FIELDS 中的欄位保持字串不轉換
 */
function convertObjectIds(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === 'string' &&
      OBJECT_ID_RE.test(value) &&
      (key === '_id' || key.endsWith('Id')) &&
      !STRING_ID_FIELDS.has(key)
    ) {
      result[key] = new mongoose.Types.ObjectId(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = convertObjectIds(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function GET(request: Request): Promise<Response> {
  if (process.env.E2E !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const collection = url.searchParams.get('collection');
  const filterRaw = url.searchParams.get('filter');

  if (!collection || !ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json(
      { error: `Invalid collection. Allowed: ${[...ALLOWED_COLLECTIONS].join(', ')}` },
      { status: 400 },
    );
  }

  let filter: Record<string, unknown> = {};
  if (filterRaw) {
    try {
      filter = JSON.parse(filterRaw);
    } catch {
      return NextResponse.json({ error: 'Invalid filter JSON' }, { status: 400 });
    }
    filter = convertObjectIds(filter);
  }

  await connectDB();

  const db = mongoose.connection.db;
  if (!db) {
    return NextResponse.json({ error: 'DB not connected' }, { status: 500 });
  }

  const documents = await db.collection(collection).find(filter).toArray();

  // _id 轉為字串方便 spec 斷言
  const serialized = documents.map((doc) => ({
    ...doc,
    _id: doc._id.toString(),
  }));

  return NextResponse.json({ ok: true, documents: serialized });
}
