/**
 * S4 — 端到端通知延遲訂閱端（PERF_INCIDENT_2026-06 Step 2.3）
 *
 * 以 pusher-js 訂閱前 13 個壓測角色的私有頻道，記錄每個事件的
 * 「伺服器 emit 時間（event.timestamp）→ 本機收到」延遲。
 * 在 k6 S2/S3 執行期間保持本腳本運行，Ctrl+C 結束時印出統計摘要。
 *
 * 延遲語意拆解（對照計畫 5.2「端到端通知延遲」）：
 *   使用者感受延遲 ≈ action 處理時間（k6 的 http_req_duration）
 *                  + emit→送達延遲（本腳本量測）
 * 注意：依賴本機時鐘與伺服器 NTP 同步，誤差通常 <100ms，
 * 對「秒級 vs 分鐘級」的判讀足夠。
 *
 * 用法：node loadtest/s4-subscriber.mjs（先跑過 seed.mjs）
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Pusher from 'pusher-js';
import { loadEnv, LOADTEST_DIR } from './env.mjs';

const env = loadEnv();
if (!env.PUSHER_KEY) {
  console.error('[s4] PUSHER_KEY missing in loadtest/.env (copy from NEXT_PUBLIC_PUSHER_KEY)');
  process.exit(1);
}

const state = JSON.parse(readFileSync(join(LOADTEST_DIR, 'state.json'), 'utf8'));
const targets = state.characterIds.slice(0, 13);

/** @type {Array<{event: string, latencyMs: number, at: number}>} */
const samples = [];

const pusher = new Pusher(env.PUSHER_KEY, {
  cluster: env.PUSHER_CLUSTER || 'ap3',
  channelAuthorization: {
    endpoint: `${env.STAGING_URL}/api/webhook/pusher-auth`,
    transport: 'ajax',
    headers: { 'x-vercel-protection-bypass': env.VERCEL_BYPASS },
  },
});

pusher.connection.bind('state_change', ({ previous, current }) => {
  console.log(`[s4] connection: ${previous} -> ${current}`);
});

for (const characterId of targets) {
  const channelName = `private-character-${characterId}`;
  const channel = pusher.subscribe(channelName);
  channel.bind('pusher:subscription_error', (err) => {
    console.error(`[s4] subscription_error ${channelName}:`, err?.status ?? err);
  });
  channel.bind_global((event, data) => {
    if (event.startsWith('pusher:')) return;
    const emitTs = data?.timestamp;
    const now = Date.now();
    const latencyMs = typeof emitTs === 'number' ? now - emitTs : NaN;
    samples.push({ event, latencyMs, at: now });
    console.log(`${new Date(now).toISOString()},${channelName},${event},${latencyMs}`);
  });
}

console.log(`[s4] subscribing ${targets.length} character channels via ${env.PUSHER_CLUSTER || 'ap3'} ...`);
console.log('[s4] CSV columns: receivedAt,channel,event,latencyMs');
console.log('[s4] press Ctrl+C to stop and print summary');

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

process.on('SIGINT', () => {
  console.log('\n[s4] ── summary ──');
  const byEvent = new Map();
  for (const s of samples) {
    if (Number.isNaN(s.latencyMs)) continue;
    if (!byEvent.has(s.event)) byEvent.set(s.event, []);
    byEvent.get(s.event).push(s.latencyMs);
  }
  if (byEvent.size === 0) {
    console.log('[s4] no events received');
  }
  for (const [event, arr] of byEvent) {
    arr.sort((a, b) => a - b);
    console.log(
      `[s4] ${event}: n=${arr.length} p50=${percentile(arr, 50)}ms p95=${percentile(arr, 95)}ms max=${arr[arr.length - 1]}ms`,
    );
  }
  process.exit(0);
});
