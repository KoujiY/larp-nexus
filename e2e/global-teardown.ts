/**
 * Playwright global teardown
 *
 * 關閉 global-setup 啟動的 in-memory MongoDB instance。
 * 若 instance 不存在（例如 setup 失敗），安靜略過。
 */

import type { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import { E2E_MONGO_URI_FILE } from './global-setup';

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

  // 清理 temp file
  try {
    fs.unlinkSync(E2E_MONGO_URI_FILE);
  } catch {
    // 檔案不存在也無所謂
  }
}

export default globalTeardown;
