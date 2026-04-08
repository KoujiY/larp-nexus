/**
 * Playwright global teardown
 *
 * 關閉 global-setup 啟動的 in-memory MongoDB instance。
 * 若 instance 不存在（例如 setup 失敗），安靜略過。
 */

import type { MongoMemoryServer } from 'mongodb-memory-server';

type GlobalWithMongo = typeof globalThis & {
  __LARP_E2E_MONGO__?: MongoMemoryServer;
};

async function globalTeardown(): Promise<void> {
  const mongod = (globalThis as GlobalWithMongo).__LARP_E2E_MONGO__;
  if (!mongod) {
    console.info('[e2e:global-teardown] no mongod instance to stop');
    return;
  }
  console.info('[e2e:global-teardown] stopping in-memory MongoDB…');
  await mongod.stop();
  delete (globalThis as GlobalWithMongo).__LARP_E2E_MONGO__;
}

export default globalTeardown;
