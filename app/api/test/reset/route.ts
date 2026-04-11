/**
 * E2E 專用 reset route
 *
 * 清空 DB 所有 collection + contest-tracker in-memory Map + E2E bus listeners。
 * 每個 test 開始前呼叫，確保乾淨的初始狀態。
 *
 * 僅在 `process.env.E2E === '1'` 時可用。
 */

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import { __testResetAll } from '@/lib/contest-tracker';
import { getE2EBus } from '@/lib/websocket/__e2e__/event-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  if (process.env.E2E !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }

  await connectDB();

  const db = mongoose.connection.db;
  if (!db) {
    return NextResponse.json({ error: 'DB not connected' }, { status: 500 });
  }

  // 安全防護：只允許清空 E2E 專用資料庫，防止意外操作正式 DB
  const dbName = db.databaseName;
  if (!dbName.includes('e2e') && !dbName.includes('test')) {
    return NextResponse.json(
      { error: `Refusing to reset non-test database: "${dbName}"` },
      { status: 403 },
    );
  }

  // 清空所有 collection（保留 index 結構，避免 dropDatabase 的 index 重建問題）
  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections.map((col) => db.collection(col.name).deleteMany({})),
  );

  // 清空 contest-tracker in-memory 狀態
  __testResetAll();

  // 移除所有 E2E bus listeners，防止跨 test 的 stale event handler
  getE2EBus().removeAllListeners();

  return NextResponse.json({ ok: true });
}
