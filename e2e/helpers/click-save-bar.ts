/**
 * 點擊 StickySaveBar 的「全部儲存」按鈕
 *
 * 自 2026-04-19 起 StickySaveBar 改為 CSS transition 實作（移除 framer-motion），
 * DOM 節點 always-mounted，不再 detach/reattach。Playwright 內建的 actionability
 * wait 已足夠處理 enabled state 與滑入/滑出期間的視覺穩定檢查。
 *
 * 此 helper 保留以維持既有 spec 呼叫介面；內部改為呼叫 Playwright locator API。
 */

import type { Page } from '@playwright/test';

interface ClickSaveBarOptions {
  /** 等待超時（ms），預設 10000 */
  timeout?: number;
}

/**
 * 等待「全部儲存」按鈕可點擊後 click
 *
 * @param page - Playwright Page
 * @param options - 可選設定
 */
export async function clickSaveBar(
  page: Page,
  options?: ClickSaveBarOptions,
): Promise<void> {
  const timeout = options?.timeout ?? 10000;

  // Playwright auto-waits：visible + enabled + pointer-events + 位置穩定
  await page
    .getByRole('button', { name: '全部儲存' })
    .click({ timeout });
}
