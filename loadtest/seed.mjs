/**
 * 壓測 seed 腳本（PERF_INCIDENT_2026-06 Step 2.3）
 *
 * 對 staging（loadtest DB）執行：reset → seed 一個 isActive 遊戲 +
 * N 個角色（Baseline + Runtime 成對）→ 寫出 loadtest/state.json 供
 * k6 / S4 訂閱腳本使用。
 *
 * 角色設計（對齊壓測情境）：
 * - 力量 80（全員相同 → 對抗永遠平手 → tieResolution attacker_wins，結果確定）
 * - 生命值 500000/1000000（-1 效果打不完，長跑不會觸發資源耗盡分支）
 * - skill-strike「重擊」：contest/力量、opponentMax 0/0、效果對方生命值 -1
 *   （S2/S3 主測項：完整對抗結算 fan-out）
 * - skill-focus「凝神」：checkType none、效果自身生命值 -1（S1 稀疏負載用）
 *
 * 用法：node loadtest/seed.mjs [角色數，預設 30]
 *（預設 30：S1/S2 只用前 13 個重現事故規模；S3 階梯撐到 30 VU 時
 *  每個 VU 仍有專屬攻防配對，避免同角色並發對抗的雜訊）
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, gateHeaders, LOADTEST_DIR } from './env.mjs';

const N = Number(process.argv[2] ?? 30);
const env = loadEnv();
const headers = gateHeaders(env);

/** 產生 MongoDB ObjectId 格式的 24-hex 字串（seed route 會自動轉 ObjectId） */
const oid = () => randomBytes(12).toString('hex');

/** 產生符合 /^[A-Z0-9]{6}$/ 的 gameCode，LT 前綴方便辨識 */
const gameCode = () =>
  'LT' + Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

function buildSkills() {
  return [
    {
      id: 'skill-strike',
      name: '重擊',
      description: '壓測用對抗技能',
      checkType: 'contest',
      contestConfig: {
        relatedStat: '力量',
        opponentMaxItems: 0,
        opponentMaxSkills: 0,
        tieResolution: 'attacker_wins',
      },
      effects: [{ type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -1 }],
      tags: [],
    },
    {
      id: 'skill-focus',
      name: '凝神',
      description: '壓測用自身技能',
      checkType: 'none',
      effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: -1 }],
      tags: [],
    },
  ];
}

function buildStats() {
  return [
    { id: 'stat-str', name: '力量', value: 80, maxValue: 100 },
    { id: 'stat-hp', name: '生命值', value: 500000, maxValue: 1000000 },
  ];
}

async function post(path, body) {
  const res = await fetch(`${env.STAGING_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

const gmUserId = oid();
const gameId = oid();
const characterIds = Array.from({ length: N }, () => oid());

console.log(`target: ${env.STAGING_URL}`);
console.log(`[1/3] reset loadtest database ...`);
await post('/api/test/reset');

console.log(`[2/3] seed 1 game + ${N} characters (baseline + runtime) ...`);
await post('/api/test/seed', {
  gmUsers: [{ _id: gmUserId, email: 'loadtest-gm@test.com', displayName: 'Loadtest GM' }],
  games: [{ _id: gameId, gmUserId, name: 'Loadtest Game', gameCode: gameCode(), isActive: true }],
  characters: characterIds.map((id, i) => ({
    _id: id,
    gameId,
    name: `LT角色${String(i + 1).padStart(2, '0')}`,
    stats: buildStats(),
    skills: buildSkills(),
  })),
  gameRuntimes: [{ refId: gameId, gmUserId, type: 'runtime', name: 'Loadtest Game', gameCode: gameCode() }],
  characterRuntimes: characterIds.map((id, i) => ({
    refId: id,
    gameId,
    type: 'runtime',
    name: `LT角色${String(i + 1).padStart(2, '0')}`,
    stats: buildStats(),
    skills: buildSkills(),
  })),
});

const state = {
  seededAt: new Date().toISOString(),
  stagingUrl: env.STAGING_URL,
  gmUserId,
  gameId,
  characterIds,
};
const statePath = join(LOADTEST_DIR, 'state.json');
writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(`[3/3] wrote ${statePath}`);
console.log(`done. game=${gameId} characters=${N}`);
