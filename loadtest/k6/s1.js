/**
 * S1 — 持續稀疏負載（改前基準的「平時」對照組）
 *
 * 13 VU，各自每 20–40 秒使用一次自身技能（skill-focus），持續 5 分鐘。
 * 預期：負載極低、單動作延遲即為系統的「無競爭基準」。
 *
 * 執行：.\loadtest\run-k6.ps1 s1
 */

import { sleep, check } from 'k6';
import { STATE, loginPlayer, callAction, myPair } from './common.js';

export const options = {
  scenarios: {
    sparse: {
      executor: 'constant-vus',
      vus: Math.min(13, STATE.characterIds.length),
      duration: '5m',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
  },
};

let loggedIn = false;

export default function () {
  const { attackerId } = myPair();

  if (!loggedIn) {
    loggedIn = loginPlayer([attackerId]);
  }

  const res = callAction('use-skill', [attackerId, 'skill-focus'], 'use-skill-self');
  check(res, {
    'use-skill 200': (r) => r.status === 200,
    'use-skill success': (r) => r.json('success') === true,
  });

  sleep(20 + Math.random() * 20);
}
