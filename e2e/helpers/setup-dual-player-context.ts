/**
 * 建立雙 Player BrowserContext（Player A + Player B）
 *
 * 各自有獨立 cookie jar 與 localStorage，用於對抗、物品轉移等雙人互動測試。
 *
 * 使用方式：
 * ```ts
 * const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(browser, charA._id, charB._id);
 * try {
 *   // ... test logic
 * } finally {
 *   await ctxA.close();
 *   await ctxB.close();
 * }
 * ```
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_BASE_URL } from '../fixtures';

interface DualPlayerContextResult {
  ctxA: BrowserContext;
  pageA: Page;
  ctxB: BrowserContext;
  pageB: Page;
}

export async function setupDualPlayerContext(
  browser: Browser,
  charAId: string,
  charBId: string,
): Promise<DualPlayerContextResult> {
  // Player A context
  const ctxA = await browser.newContext({ baseURL: E2E_BASE_URL });
  const pageA = await ctxA.newPage();
  const loginA = await ctxA.request.post('/api/test/login', {
    data: { mode: 'player', characterIds: [charAId] },
  });
  if (!loginA.ok()) {
    throw new Error(`Player A login failed (${loginA.status()}): ${await loginA.text()}`);
  }
  await pageA.addInitScript(
    ({ id }: { id: string }) => {
      localStorage.setItem(`character-${id}-unlocked`, 'true');
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    },
    { id: charAId },
  );

  // Player B context
  const ctxB = await browser.newContext({ baseURL: E2E_BASE_URL });
  const pageB = await ctxB.newPage();
  const loginB = await ctxB.request.post('/api/test/login', {
    data: { mode: 'player', characterIds: [charBId] },
  });
  if (!loginB.ok()) {
    throw new Error(`Player B login failed (${loginB.status()}): ${await loginB.text()}`);
  }
  await pageB.addInitScript(
    ({ id }: { id: string }) => {
      localStorage.setItem(`character-${id}-unlocked`, 'true');
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    },
    { id: charBId },
  );

  return { ctxA, pageA, ctxB, pageB };
}
