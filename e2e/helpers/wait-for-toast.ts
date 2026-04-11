/**
 * 等待 Sonner toast 出現
 *
 * 使用 Sonner 的 DOM 結構 `[data-sonner-toast]` 加上 `hasText` 過濾。
 * 回傳 Locator 供後續斷言（例如確認 toast 類型、是否自動消失）。
 */

import type { Page, Locator } from '@playwright/test';

interface WaitForToastOptions {
  /** 等待超時（ms），預設 5000 */
  timeout?: number;
}

/**
 * 等待包含指定文字的 toast 出現
 *
 * @param page - Playwright Page
 * @param text - toast 內容文字（支援部分匹配）
 * @param options - 可選設定
 * @returns 匹配的 toast Locator
 */
export async function waitForToast(
  page: Page,
  text: string,
  options?: WaitForToastOptions,
): Promise<Locator> {
  const timeout = options?.timeout ?? 5000;
  const locator = page.locator('[data-sonner-toast]', { hasText: text });
  await locator.first().waitFor({ state: 'visible', timeout });
  return locator.first();
}
