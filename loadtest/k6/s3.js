/**
 * S3 — 階梯找天花板（量出系統可承載的「同時動作數」上限）
 *
 * 同時齊發的對抗數階梯式上拉：13 → 20 → 30（各 2 輪、每輪 30 秒），
 * 直到出現 timeout / 失敗率飆升。VU 數超過角色數時環狀重複使用角色。
 *
 * 判讀：哪一階開始出現 HTTP 失敗 / k6 timeout / Vercel
 * FUNCTION_INVOCATION_TIMEOUT → 該階即為天花板（填入計畫 5.2 表）。
 *
 * 執行：.\loadtest\run-k6.ps1 s3
 */

import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { loginPlayer, callAction, syncToSlot, myPair } from './common.js';

const contestFailures = new Counter('contest_failures');

const PERIOD_SEC = 30;

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 13,
      stages: [
        { duration: '60s', target: 13 }, // 第 1 階：13 同時對抗 × 2 輪
        { duration: '60s', target: 20 }, // 第 2 階：20
        { duration: '60s', target: 30 }, // 第 3 階：30
      ],
      gracefulRampDown: '0s',
    },
  },
};

let loggedIn = false;

export default function () {
  const { attackerId, defenderId } = myPair();

  if (!loggedIn) {
    loggedIn = loginPlayer([attackerId, defenderId]);
  }

  syncToSlot(PERIOD_SEC);

  const r1 = callAction(
    'use-skill',
    [attackerId, 'skill-strike', null, defenderId],
    'use-skill-contest',
  );
  const contestId = r1.status === 200 ? r1.json('data.contestId') : null;

  if (!contestId) {
    contestFailures.add(1);
    return;
  }

  const r2 = callAction('respond-contest', [contestId, defenderId], 'respond-contest');
  const ok = check(r2, {
    'respond 200': (r) => r.status === 200,
    'respond success': (r) => r.json('success') === true,
  });
  if (!ok) contestFailures.add(1);
}
