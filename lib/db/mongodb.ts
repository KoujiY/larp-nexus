import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

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
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((conn) => {
      const host = conn.connection.host;
      const dbName = conn.connection.db?.databaseName;
      console.info(`[MongoDB] Connected successfully → ${host}/${dbName}`);
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
