/**
 * 點擊 StickySaveBar 的「全部儲存」按鈕（AnimatePresence 安全版）
 *
 * StickySaveBar 使用 Framer Motion AnimatePresence + spring 動畫，
 * DOM 節點會在 mount/unmount 期間 detach/reattach。
 * Playwright locator 的 actionability check 在 detached 節點上會 timeout。
 *
 * 此 helper 使用 `page.evaluate()` 內建 retry loop，
 * 在同一個 microtask 中檢查 `isConnected` 並 click，
 * 避免 waitForFunction + evaluate 分開呼叫的 TOCTOU 風險。
 */

import type { Page } from '@playwright/test';

interface ClickSaveBarOptions {
  /** 等待超時（ms），預設 10000 */
  timeout?: number;
  /** 輪詢間隔（ms），預設 200 */
  interval?: number;
}

/**
 * 等待「全部儲存」按鈕出現在 DOM 中且 isConnected，然後 click
 *
 * @param page - Playwright Page（或任何有 evaluate 方法的 Page-like 物件）
 * @param options - 可選設定
 */
export async function clickSaveBar(
  page: Page,
  options?: ClickSaveBarOptions,
): Promise<void> {
  const timeout = options?.timeout ?? 10000;
  const interval = options?.interval ?? 200;

  await page.evaluate(
    async ({ timeout: t, interval: i }) => {
      const maxAttempts = Math.ceil(t / i);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const btn = [...document.querySelectorAll('button')]
          .find(b => b.textContent?.includes('全部儲存'));
        if (btn && btn.isConnected) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return;
        }
        await new Promise(r => setTimeout(r, i));
      }
      throw new Error(`全部儲存 button not found or not connected after ${t}ms`);
    },
    { timeout, interval },
  );
}
