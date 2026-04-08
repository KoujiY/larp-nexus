/**
 * Playwright global setup
 *
 * 在所有測試啟動前：
 * 1. 啟動 `mongodb-memory-server`（首次會下載 mongod binary，之後 cache）
 * 2. 把 `MONGODB_URI` 塞進 `process.env`，讓 Next.js webServer spawn 時繼承
 * 3. 設定 `SESSION_SECRET`（iron-session 需要）
 * 4. 把 `MongoMemoryServer` instance 掛在 `globalThis` 供 teardown 使用
 *
 * 注意：這支檔案在 Playwright runner 的 Node process 跑，不是在 Next.js 裡。
 * `lib/db/mongodb.ts` 是 lazy connect，因此 webServer 啟動時不會立刻碰 DB，
 * 等到第一個測試呼叫 DB 時才連線到 in-memory instance。
 */

import { MongoMemoryServer } from 'mongodb-memory-server';

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
  process.env.MONGODB_URI = uri;

  // iron-session 要求至少 32 字元的 password
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET =
      'e2e-only-session-secret-do-not-use-in-production-please';
  }

  (globalThis as GlobalWithMongo).__LARP_E2E_MONGO__ = mongod;
  console.info('[e2e:global-setup] ready', { uri });
}

export default globalSetup;
