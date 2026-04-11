/**
 * Playwright global setup
 *
 * 在所有測試啟動前：
 * 1. 啟動 `mongodb-memory-server`（首次會下載 mongod binary，之後 cache）
 * 2. 把 `MONGODB_URI` 寫入 temp file + process.env，確保 Next.js webServer 讀取正確的 URI
 * 3. 設定 `SESSION_SECRET`（iron-session 需要）
 * 4. 把 `MongoMemoryServer` instance 掛在 `globalThis` 供 teardown 使用
 *
 * 注意：Next.js 的 `loadEnvConfig` 會從 `.env.local` 載入環境變數，
 * 可能覆蓋 `process.env.MONGODB_URI`。因此改用 temp file 傳遞 URI，
 * 在 `lib/db/mongodb.ts` 中 `E2E=1` 時優先讀取 temp file。
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as path from 'path';

/** temp file 路徑（專案根目錄下，已在 .gitignore） */
export const E2E_MONGO_URI_FILE = path.join(
  process.cwd(),
  '.e2e-mongo-uri',
);

type GlobalWithMongo = typeof globalThis & {
  __LARP_E2E_MONGO__?: MongoMemoryServer;
};

async function globalSetup(): Promise<void> {
  console.info('[e2e:global-setup] starting in-memory MongoDB…');
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'larp-nexus-e2e',
    },
  });
  const uri = mongod.getUri();

  // 雙重寫入：process.env + temp file
  process.env.MONGODB_URI = uri;
  fs.writeFileSync(E2E_MONGO_URI_FILE, uri, 'utf-8');

  // iron-session 要求至少 32 字元的 password
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET =
      'e2e-only-session-secret-do-not-use-in-production-please';
  }

  (globalThis as GlobalWithMongo).__LARP_E2E_MONGO__ = mongod;
  console.info('[e2e:global-setup] ready', { uri });
}

export default globalSetup;
