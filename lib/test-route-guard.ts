/**
 * Test-only API route（/api/test/*）的共用存取守門
 *
 * 兩種放行模式（PERF_INCIDENT_2026-06 Step 2.2）：
 *
 * 1. 本機 E2E 模式：`E2E=1` 且未設 `LOADTEST_TOKEN` → 一律放行。
 *    與既有行為完全相同，Playwright 測試不受影響。
 *
 * 2. staging 壓測模式：設定 `LOADTEST_TOKEN`（不設 E2E）→ 僅放行帶有
 *    相符 `x-loadtest-token` header 的請求。
 *    為什麼不能用 E2E=1 開 staging：`E2E=1` 會觸發 next.config.ts 的
 *    build-time webpack alias，把 pusher-server/client 換成 in-process stub，
 *    壓測就量不到真實的 Pusher 跨區延遲。token 模式讓 test 路由在
 *    「真實 Pusher + 真實 Atlas」的 build 下仍可受控開啟。
 *
 * 兩者皆未設定（production 常態）→ 一律 404。
 * 若兩者同時設定，token 檢查優先（E2E build 也要求帶 token）。
 *
 * 注意：seed/reset/db-query 另有「DB 名稱必須含 e2e/test」的第二道防線
 * （staging 資料庫命名須配合，如 `larp-loadtest`），與本守門互補，不可移除。
 */
export function isTestRouteAllowed(request?: Request): boolean {
  const token = process.env.LOADTEST_TOKEN;
  if (token) {
    return request?.headers.get('x-loadtest-token') === token;
  }

  return process.env.E2E === '1';
}
