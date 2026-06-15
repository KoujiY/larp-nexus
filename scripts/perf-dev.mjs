#!/usr/bin/env node
/**
 * perf-dev —— 量測用 dev server 包裝器
 *
 * 一支指令同時做三件事，量測「免費搭車」在既有 dev 視窗裡：
 *   1. 以 PERF_LOG=1 啟動 `pnpm dev`（env 自動注入，跨平台，不依賴 shell 的 tee）
 *   2. 將子行程（Next.js）的 stdout/stderr 原樣轉印到終端
 *   3. 解析每一行 `[perf] action=<name>`，維護即時計數
 *
 * 場景邊界由「人為訊號」界定——只有操作者知道一個場景何時結束。
 * 在本視窗按 Enter（可順手打場景名稱）即拍一次快照，印出
 * 「上次標記到現在，每個 action 各被呼叫幾次」的表格，並追加到 perf-metrics.md。
 *
 * 互動指令（在本視窗輸入後按 Enter）：
 *   <任意文字>  以該文字為標籤，輸出自上次標記以來的 delta 並寫入 perf-metrics.md
 *   (空白) Enter 同上，自動以 scenario-N 命名
 *   reset       重設零點（不輸出表格），用於丟棄暖機期間的雜訊
 *   total       輸出本次啟動以來的累計計數（不重設零點）
 *   help        顯示指令說明
 *   q / Ctrl+C  結束（一併關閉 dev server）
 *
 * 為何數「完成行」而非「[perf:start]」：`\[perf\]` 不會匹配 `[perf:start]`
 * （perf 後緊接 `:`），因此計的是已完成的 action 執行次數，不會重複計數。
 *
 * 注意：本檔由人手動執行（node 環境），可自由使用時間戳記。
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** perf 完成行格式：`[perf] action=<name> reqId=...`，逐行抽出 action 名稱 */
const PERF_LINE = /\[perf\]\s+action=(\S+)/;

/** 量測結果輸出檔（已加入 .gitignore，不入版控） */
const METRICS_FILE = resolve(process.cwd(), 'perf-metrics.md');

/** 本次啟動以來各 action 的累計呼叫次數 */
const counts = new Map();

/** 上次標記時的計數快照（用於計算 delta） */
let lastMark = new Map();

/** 自動命名場景的序號 */
let scenarioSeq = 0;

/**
 * 累加一次 action 呼叫
 * @param {string} action
 */
function record(action) {
  counts.set(action, (counts.get(action) ?? 0) + 1);
}

/**
 * 計算自上次標記以來的 delta（僅含有變動的 action）
 * @returns {{ action: string, count: number }[]}
 */
function computeDelta() {
  const rows = [];
  for (const [action, total] of counts) {
    const delta = total - (lastMark.get(action) ?? 0);
    if (delta > 0) rows.push({ action, count: delta });
  }
  rows.sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
  return rows;
}

/**
 * 輸出一個場景的 delta 表格到終端並追加到 perf-metrics.md
 * @param {string} label
 */
function snapshot(label) {
  const rows = computeDelta();
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const stamp = new Date().toISOString();

  // 終端輸出
  console.log(`\n──── 場景：${label} ────`);
  if (rows.length === 0) {
    console.log('（無 action 呼叫）');
  } else {
    const width = Math.max(...rows.map((r) => r.action.length), 'action'.length);
    console.log(`${'action'.padEnd(width)}  count`);
    for (const r of rows) {
      console.log(`${r.action.padEnd(width)}  ${r.count}`);
    }
    console.log(`${'TOTAL'.padEnd(width)}  ${total}`);
  }
  console.log('─'.repeat(28) + '\n');

  // 寫入 perf-metrics.md
  const md = [
    `## ${label}`,
    ``,
    `- 時間：${stamp}`,
    `- 總呼叫數：${total}`,
    ``,
    `| action | count |`,
    `| --- | --- |`,
    ...rows.map((r) => `| ${r.action} | ${r.count} |`),
    ``,
    ``,
  ].join('\n');
  appendFileSync(METRICS_FILE, md, 'utf8');

  // 重設零點，供下一場景計算
  lastMark = new Map(counts);
}

/** 輸出本次啟動以來的累計計數（不重設零點） */
function printTotal() {
  console.log(`\n──── 累計（本次啟動以來） ────`);
  const rows = [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
  if (rows.length === 0) {
    console.log('（尚無 action 呼叫）');
  } else {
    const width = Math.max(...rows.map((r) => r.action.length), 'action'.length);
    for (const r of rows) console.log(`${r.action.padEnd(width)}  ${r.count}`);
  }
  console.log('─'.repeat(28) + '\n');
}

const HELP = `
perf-dev 指令：
  <文字> Enter  以該文字為標籤輸出 delta 表格並寫入 perf-metrics.md
  (空白) Enter  同上，自動命名 scenario-N
  reset         重設零點（丟棄暖機雜訊）
  total         輸出累計計數（不重設零點）
  help          顯示本說明
  q / Ctrl+C    結束
`;

// ── 啟動 dev server（注入 PERF_LOG=1） ──────────────────────────────
console.log('[perf-dev] 啟動 pnpm dev（PERF_LOG=1）…按 Enter 拍快照，help 看指令\n');

const child = spawn('pnpm dev', {
  shell: true,
  // 子行程不接收 stdin（保留給本視窗的 readline）；stdout/stderr 以 pipe 取得後轉印
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PERF_LOG: '1' },
});

/**
 * 處理子行程輸出：原樣轉印 + 逐行抽出 perf 計數
 * 跨 chunk 的不完整行以 remainder 緩衝，確保不漏行
 */
let remainder = '';
/**
 * @param {Buffer} chunk
 * @param {NodeJS.WriteStream} out
 */
function handleOutput(chunk, out) {
  out.write(chunk);
  remainder += chunk.toString();
  const lines = remainder.split(/\r?\n/);
  remainder = lines.pop() ?? '';
  for (const line of lines) {
    const match = line.match(PERF_LINE);
    if (match) record(match[1]);
  }
}

child.stdout.on('data', (chunk) => handleOutput(chunk, process.stdout));
child.stderr.on('data', (chunk) => handleOutput(chunk, process.stderr));

child.on('exit', (code) => {
  console.log(`\n[perf-dev] dev server 已結束（code=${code ?? 0}）`);
  process.exit(code ?? 0);
});

// ── 鍵盤互動：標記場景邊界 ──────────────────────────────────────────
const rl = createInterface({ input: process.stdin });

rl.on('line', (input) => {
  const cmd = input.trim();
  switch (cmd.toLowerCase()) {
    case 'q':
    case 'quit':
    case 'exit':
      child.kill('SIGINT');
      rl.close();
      return;
    case 'help':
      console.log(HELP);
      return;
    case 'reset':
      lastMark = new Map(counts);
      console.log('[perf-dev] 已重設零點');
      return;
    case 'total':
      printTotal();
      return;
    default: {
      const label = cmd || `scenario-${++scenarioSeq}`;
      snapshot(label);
    }
  }
});

// 轉送 Ctrl+C 到子行程，乾淨關閉
process.on('SIGINT', () => {
  child.kill('SIGINT');
  rl.close();
});
