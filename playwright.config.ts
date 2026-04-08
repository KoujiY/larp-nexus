import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 設定
 *
 * 關鍵設計：
 * - `webServer` 用 `next build && next start`，不是 `next dev`：
 *    * dev 模式會觸發 HMR / on-demand compile，造成首次 navigate 超時
 *    * build + start 更接近 production，webpack alias（pusher stub）也只在 build 階段生效
 * - `reuseExistingServer` 本地開發時 true，CI 上 false（確保乾淨環境）
 * - `globalSetup` 啟動 mongodb-memory-server 並把 URI 塞進環境變數
 * - Node runtime 需要 `E2E=1` 才能啟用 pusher stub alias 與 `/api/test/*` routes
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // 測試共享同一個 in-memory DB，避免競態
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // global-setup 會把 MONGODB_URI / SESSION_SECRET 等寫入 process.env，
    // Playwright spawn webServer 時會繼承這些變數。
    // Next.js 16 預設走 Turbopack，但我們的 pusher stub 依賴 webpack alias，
    // 因此 E2E build / start 都顯式加 `--webpack` 強制走 webpack pipeline。
    command:
      'pnpm exec next build --webpack && pnpm exec next start -p 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E: '1',
      NODE_ENV: 'production',
    },
  },
});
