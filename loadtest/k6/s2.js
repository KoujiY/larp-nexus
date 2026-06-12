/**
 * S2 — 尖峰負載（主測項：重現事故的關鍵情境）
 *
 * 13 VU 以 wall-clock 對齊在 1–2 秒窗口內齊發「完整對抗」
 * （useSkill 發起 → respondToContest 結算，攻防環狀配對），
 * 每 30 秒一輪、共 5 輪。
 *
 * 量測點：
 * - use-skill-contest / respond-contest 的 http_req_duration（p95）
 * - 伺服器端 [perf] log（Vercel function logs）
 * - 同時跑 s4-subscriber.mjs 量端到端通知延遲
 *
 * 執行：.\loadtest\run-k6.ps1 s2
 */

import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { STATE, loginPlayer, callAction, syncToSlot, myPair } from './common.js';

const contestSettleTime = new Trend('contest_settle_time', true);
const contestFailures = new Counter('contest_failures');

const ROUNDS = 5;
const PERIOD_SEC = 30;

export const options = {
  scenarios: {
    burst: {
      executor: 'per-vu-iterations',
      vus: Math.min(13, STATE.characterIds.length),
      iterations: ROUNDS,
      maxDuration: `${(ROUNDS + 2) * PERIOD_SEC}s`,
    },
  },
  thresholds: {
    // 門檻對應計畫 5.2：單一 contest-respond p95 < 2000ms（改後才需達標，
    // 改前基準預期超標 — 此處不設 abort，只記錄）
    'http_req_duration{name:respond-contest}': ['p(95)<10000'],
  },
};

let loggedIn = false;

export default function () {
  const { attackerId, defenderId } = myPair();

  if (!loggedIn) {
    loggedIn = loginPlayer([attackerId, defenderId]);
  }

  // 全 VU 對齊到下一個 30 秒邊界 → 齊發
  syncToSlot(PERIOD_SEC);

  const t0 = Date.now();

  // 階段 1：攻擊方發起對抗（checkResult 傳 null — contest 類型不需要）
  const r1 = callAction(
    'use-skill',
    [attackerId, 'skill-strike', null, defenderId],
    'use-skill-contest',
  );
  const contestId = r1.status === 200 ? r1.json('data.contestId') : null;
  const started = check(r1, {
    'attack 200': (r) => r.status === 200,
    'contestId returned': () => Boolean(contestId),
  });

  if (!started) {
    contestFailures.add(1);
    console.error(`[s2] attack failed: HTTP ${r1.status} ${String(r1.body).slice(0, 200)}`);
    return;
  }

  // 階段 2：防守方以基礎數值回應 → 觸發完整結算 fan-out
  const r2 = callAction('respond-contest', [contestId, defenderId], 'respond-contest');
  const settled = check(r2, {
    'respond 200': (r) => r.status === 200,
    'respond success': (r) => r.json('success') === true,
  });

  if (settled) {
    contestSettleTime.add(Date.now() - t0);
  } else {
    contestFailures.add(1);
    console.error(`[s2] respond failed: HTTP ${r2.status} ${String(r2.body).slice(0, 200)}`);
  }
}
