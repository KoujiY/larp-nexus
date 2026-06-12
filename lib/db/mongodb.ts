import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { isPerfLogEnabled } from '@/lib/perf/perf-context';
import { installDbTiming } from '@/lib/perf/db-timing';
import { scheduleIndexCheck } from '@/lib/db/index-check';

type MongooseConnection = typeof mongoose;

declare global {
  // 避免在開發模式下重複連線
  var mongoose: {
    conn: MongooseConnection | null;
    promise: Promise<MongooseConnection> | null;
  };
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * E2E 模式下從 temp file 讀取 MongoMemoryServer URI
 *
 * Next.js 的 loadEnvConfig 會從 .env.local 載入 MONGODB_URI，
 * 覆蓋 Playwright global-setup 透過 process.env 傳入的 MongoMemoryServer URI。
 * 因此 E2E=1 時改從 global-setup 寫入的 temp file 讀取，確保連到正確的 DB。
 */
function resolveMongoUri(): string {
  if (process.env.E2E === '1') {
    const tempFile = path.join(process.cwd(), '.e2e-mongo-uri');
    try {
      const uri = fs.readFileSync(tempFile, 'utf-8').trim();
      if (uri) {
        return uri;
      }
    } catch {
      // temp file 不存在 → fallback 到 process.env
    }
  }
  return process.env.MONGODB_URI ?? '';
}

async function connectDB() {
  // 效能埋點（PERF_INCIDENT_2026-06 Step 2.1）：PERF_LOG=1 時安裝查詢計時
  if (isPerfLogEnabled()) {
    installDbTiming();
  }

  const MONGODB_URI = resolveMongoUri();

  if (!MONGODB_URI) {
    throw new Error('請在 .env.local 中設定 MONGODB_URI');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // 冷啟動瘦身（PERF_INCIDENT_2026-06 批 2）：
      // - maxPoolSize：Vercel Fluid 實測同 instance 併發 ~5-6，10 已足夠；
      //   壓低池上限避免 burst 時對 M0 開出過多 socket
      // - minPoolSize：保留一條暖連線，降低 idle 後重握手機率
      maxPoolSize: 10,
      minPoolSize: 1,
      // - autoIndex：production/loadtest 關閉（index 已建在 Atlas，省去每次
      //   冷啟動逐 model 發 createIndex 的往返）。E2E 必須保持 true ——
      //   E2E 以 NODE_ENV=production 跑 next start，但 MongoMemoryServer
      //   是全新空 DB，關掉會導致 index / unique 約束完全不存在。
      //   ⚠️ 維運注意：schema 新增 index 後需手動 sync（見知識庫 architecture/）
      autoIndex: process.env.E2E === '1' || process.env.NODE_ENV !== 'production',
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((conn) => {
      const host = conn.connection.host;
      const dbName = conn.connection.db?.databaseName;
      console.info(`[MongoDB] Connected successfully → ${host}/${dbName}`);
      // 背景比對 schema 宣告與 DB 實際 index（延後執行，不與冷啟動
      // 首請求搶 M0 連線池）。autoIndex 開啟的環境（本機 dev）也要跑：
      // mongoose 建 index 失敗（如 IndexOptionsConflict）不會丟錯，
      // 此檢查是唯一偵測點。E2E 為全新 MongoMemoryServer + autoIndex，
      // index 必然一致，跳過以省成本
      if (process.env.E2E !== '1') {
        scheduleIndexCheck({ autoIndexEnabled: opts.autoIndex });
      }
      return conn;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('❌ MongoDB 連線失敗:', e);
    throw e;
  }

  return cached.conn;
}

export default connectDB;
