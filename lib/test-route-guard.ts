/**
 * Test-only API route（/api/test/*）的共用存取守門
 *
 * 兩種放行模式（PERF_INCIDENT_2026-06 Step 2.2）：
 *
 * 1. 本機 E2E 模式：`E2E=1` 且未設 `LOADTEST_TOKEN` → 一律放行。
 *    與既有行為完全相同，Playwright 測試不受影響。
 *
 * 2. staging 壓測模式：設定 `LOADTEST_TOKEN`（不設 E2E）→ 僅放行帶有
 *    相符 `x-loadtest-token` header 的請求（常數時間比對）。
 *    為什麼不能用 E2E=1 開 staging：`E2E=1` 會觸發 next.config.ts 的
 *    build-time webpack alias，把 pusher-server/client 換成 in-process stub，
 *    壓測就量不到真實的 Pusher 跨區延遲。token 模式讓 test 路由在
 *    「真實 Pusher + 真實 Atlas」的 build 下仍可受控開啟。
 *
 * 兩者皆未設定（production 常態）→ 一律 404。
 * 若兩者同時設定，token 檢查優先（E2E build 也要求帶 token）。
 *
 * 正式部署硬封鎖：`VERCEL_ENV === 'production'` 時無條件拒絕——即使
 * LOADTEST_TOKEN / E2E 被誤設到正式環境，test 路由（含可偽造 session 的
 * /api/test/login）也不會開啟。此判斷不可改用 NODE_ENV：Vercel 的
 * preview 部署（壓測環境）同樣以 production build 執行，NODE_ENV 無法
 * 區分 preview 與正式部署。
 *
 * 注意：seed/reset/db-query 另有「DB 名稱必須含 e2e/test」的第二道防線
 * （staging 資料庫命名須配合，如 `larp-loadtest`），與本守門互補，不可移除。
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * 常數時間字串比較，防止 timing side-channel 逐字元恢復 token。
 * 長度不同直接拒絕（長度洩漏對高熵 token 無實際利用價值）。
 */
function safeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isTestRouteAllowed(request?: Request): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;

  const token = process.env.LOADTEST_TOKEN;
  if (token) {
    const provided = request?.headers.get('x-loadtest-token');
    return typeof provided === 'string' && safeTokenEqual(provided, token);
  }

  return process.env.E2E === '1';
}
