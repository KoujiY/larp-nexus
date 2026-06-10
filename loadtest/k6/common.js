/**
 * k6 共用 helper（PERF_INCIDENT_2026-06 Step 2.3）
 *
 * 注意：此檔由 k6 runtime 執行（非 Node），只能用 k6 API 與 ES 標準語法。
 * 環境值由 run-k6.ps1 從 loadtest/.env 讀出後以 -e 旗標注入（__ENV）。
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

/** seed.mjs 產出的狀態（gameId / characterIds），k6 init 階段載入 */
export const STATE = JSON.parse(open('../state.json'));

const BASE = __ENV.STAGING_URL;

/** 兩道閘門 header：所有請求都帶（test 路由吃 token、整個部署吃 bypass） */
export const HEADERS = {
  'x-loadtest-token': __ENV.LOADTEST_TOKEN,
  'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS,
  'Content-Type': 'application/json',
};

/**
 * 以 player 身分登入（可一次解鎖多個角色）。
 * k6 每個 VU 有獨立 cookie jar，session cookie 自動沿用到後續請求。
 */
export function loginPlayer(characterIds) {
  const res = http.post(
    `${BASE}/api/test/login`,
    JSON.stringify({ mode: 'player', characterIds }),
    { headers: HEADERS, tags: { name: 'test-login' } },
  );
  check(res, { 'login ok': (r) => r.status === 200 });
  return res.status === 200;
}

/**
 * 透過 /api/test/action 呼叫 server action
 * @param {string} action - 'use-skill' | 'use-item' | 'respond-contest' | ...
 * @param {Array} args - 依該 action 的函數簽名
 * @param {string} tagName - http_req_duration 的分組 tag
 */
export function callAction(action, args, tagName) {
  return http.post(
    `${BASE}/api/test/action`,
    JSON.stringify({ action, args }),
    { headers: HEADERS, tags: { name: tagName || action }, timeout: '60s' },
  );
}

/**
 * 睡到下一個 wall-clock 整數時段邊界（所有 VU 對齊 → 真正的齊發 burst）。
 * 例：periodSec=30 → 所有 VU 都在 :00 / :30 同時醒來，誤差毫秒級。
 */
export function syncToSlot(periodSec) {
  const periodMs = periodSec * 1000;
  const next = Math.ceil((Date.now() + 1) / periodMs) * periodMs;
  sleep((next - Date.now()) / 1000);
}

/**
 * 本 VU 的攻防配對：攻擊方 = 自己的角色、防守方 = 下一位（環狀）。
 * VU 編號超過角色數時取模重複使用角色。
 */
export function myPair() {
  const n = STATE.characterIds.length;
  const i = (__VU - 1) % n;
  return {
    attackerId: STATE.characterIds[i],
    defenderId: STATE.characterIds[(i + 1) % n],
  };
}
