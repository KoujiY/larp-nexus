/**
 * E2E 專用 seed route
 *
 * 批次建立測試資料，透過 Mongoose model `.create()` 觸發 schema 驗證，
 * 確保 seed 資料與正式流程一致。
 *
 * 依序建立：gmUsers → games → characters → gameRuntimes → characterRuntimes → pendingEvents → logs
 * 對每個 input 中的 `_id` / `*Id` 欄位自動做 string → ObjectId 轉換。
 *
 * 僅在 `process.env.E2E === '1'` 時可用。
 */

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import {
  GMUser,
  Game,
  Character,
  GameRuntime,
  CharacterRuntime,
  PendingEvent,
  Log,
} from '@/lib/db/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 24-char hex string → ObjectId */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/**
 * 遞迴轉換物件中的 ObjectId 字串
 * - `_id` 和以 `Id` 結尾的 key：24-char hex → ObjectId
 * - 陣列中的物件也會遞迴處理
 */
function convertObjectIds(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === 'string' &&
      OBJECT_ID_RE.test(value) &&
      (key === '_id' || key.endsWith('Id'))
    ) {
      result[key] = new mongoose.Types.ObjectId(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? convertObjectIds(item as Record<string, unknown>)
          : item,
      );
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = convertObjectIds(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

type SeedInput = Record<string, unknown>;

interface SeedBody {
  gmUsers?: SeedInput[];
  games?: SeedInput[];
  characters?: SeedInput[];
  gameRuntimes?: SeedInput[];
  characterRuntimes?: SeedInput[];
  pendingEvents?: SeedInput[];
  logs?: SeedInput[];
}

/**
 * 建立一批文件並回傳 _id 字串陣列
 */
async function createDocs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Model: mongoose.Model<any>,
  inputs: SeedInput[],
): Promise<string[]> {
  const converted = inputs.map((input) => convertObjectIds(input));
  const docs = await Model.create(converted);
  return (Array.isArray(docs) ? docs : [docs]).map((d) => d._id.toString());
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.E2E !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }

  let body: SeedBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  await connectDB();

  const result: Record<string, string[]> = {};

  try {
    // 依序建立，確保 reference 關係成立
    if (body.gmUsers?.length) {
      result.gmUsers = await createDocs(GMUser, body.gmUsers);
    }
    if (body.games?.length) {
      result.games = await createDocs(Game, body.games);
    }
    if (body.characters?.length) {
      result.characters = await createDocs(Character, body.characters);
    }
    if (body.gameRuntimes?.length) {
      result.gameRuntimes = await createDocs(GameRuntime, body.gameRuntimes);
    }
    if (body.characterRuntimes?.length) {
      result.characterRuntimes = await createDocs(CharacterRuntime, body.characterRuntimes);
    }
    if (body.pendingEvents?.length) {
      result.pendingEvents = await createDocs(PendingEvent, body.pendingEvents);
    }
    if (body.logs?.length) {
      result.logs = await createDocs(Log, body.logs);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown seed error';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ids: result });
}
