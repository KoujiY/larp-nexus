/**
 * 效能埋點：per-request 計時累加器（PERF_INCIDENT_2026-06 Step 2.1）
 *
 * 用 AsyncLocalStorage 在單一 server action 的 async context 內持有一個
 * 累加器，讓深層的 DB 查詢（lib/perf/db-timing.ts）、Pusher emit
 * （lib/websocket/events.ts）、getCharacterData 呼叫不需改函數簽名即可回報耗時。
 *
 * 輸出格式（固定，供 grep / 解析）：
 *   [perf] action=<name> reqId=<id> total=<ms> db=<ms> dbOps=<n> pusher=<ms> getChar=<n> emits=<n> result=<ok|error>
 *
 * 語意注意：
 * - log 行在 action「回傳時」快照 —— 量的是「阻塞使用者回應的耗時」。
 *   detached（fire-and-forget）的 emit / autoReveal 在回傳後仍會累加 store，
 *   但不會出現在已印出的行裡；其端到端延遲由壓測 S4 另行量測。
 * - function 被 Vercel timeout 砍掉時 [perf] 行印不出來，因此入口先印
 *   [perf:start]，事後以「有 start 無 end」配對找出被砍的請求。
 *
 * 開關：PERF_LOG=1 時啟用；未設定時 runWithPerf 直通、累加函數 no-op。
 */

import type { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getGlobalAls } from '@/lib/utils/global-als';

/** per-request 效能累加器 */
export type PerfStore = {
  action: string;
  reqId: string;
  startedAt: number;
  dbMs: number;
  dbOps: number;
  pusherMs: number;
  pusherCalls: number;
  getCharCalls: number;
};

// HMR 後 mongoose 包裝層（db-timing.ts，閉包持有舊模組的 addDbTime）
// 仍須與新模組共用同一個 storage，否則 dbOps 歸零——由 getGlobalAls 保證
const storage: AsyncLocalStorage<PerfStore> = getGlobalAls<PerfStore>('perf-context');

/**
 * 埋點是否啟用（由 PERF_LOG 環境變數控制）
 */
export function isPerfLogEnabled(): boolean {
  return process.env.PERF_LOG === '1';
}

/**
 * 取得目前 async context 的累加器（無 context 時回傳 undefined）
 *
 * 提供給測試與進階情境使用；一般呼叫端應使用下方的累加函數。
 */
export function getPerfStore(): PerfStore | undefined {
  return storage.getStore();
}

/**
 * 累加一次 DB 操作的耗時（由 db-timing 的 exec/save/insertMany 包裝層呼叫）
 */
export function addDbTime(ms: number): void {
  const store = storage.getStore();
  if (!store) return;
  store.dbMs += ms;
  store.dbOps += 1;
}

/**
 * 累加一次 Pusher trigger 的耗時與次數（由 events.ts 的 trigger() 呼叫）
 */
export function addPusherTime(ms: number): void {
  const store = storage.getStore();
  if (!store) return;
  store.pusherMs += ms;
  store.pusherCalls += 1;
}

/**
 * 包裝一個 Pusher trigger promise，計時並累加至 perf context。
 *
 * 與 events.ts 的 trigger() 不同，本函數**不吞錯誤**——原樣回傳/拋出，
 * 供 contest-event-emitter 等需要 rethrow 語意的呼叫端使用，
 * 確保 [perf] 的 pusher= 欄位涵蓋所有發送路徑。
 */
export async function timePusher<T>(promise: Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await promise;
  } finally {
    addPusherTime(performance.now() - start);
  }
}

/**
 * 累加一次 getCharacterData 呼叫
 */
export function incrGetChar(): void {
  const store = storage.getStore();
  if (!store) return;
  store.getCharCalls += 1;
}

/**
 * 組出固定格式的 [perf] log 行（抽出便於單元測試）
 */
export function formatPerfLine(store: PerfStore, totalMs: number, result: 'ok' | 'error'): string {
  return (
    `[perf] action=${store.action} reqId=${store.reqId} total=${Math.round(totalMs)} ` +
    `db=${Math.round(store.dbMs)} dbOps=${store.dbOps} ` +
    `pusher=${Math.round(store.pusherMs)} getChar=${store.getCharCalls} ` +
    `emits=${store.pusherCalls} result=${result}`
  );
}

/**
 * 在 perf context 內執行一個 server action 並輸出 [perf] log 行
 *
 * PERF_LOG 未啟用時直通執行 fn，零額外開銷。
 * fn throw 時標記 result=error 並原樣重拋（不吞錯）。
 *
 * @param action - action 名稱（kebab-case，如 'contest-respond'）
 * @param fn - 原 action 業務邏輯
 */
export async function runWithPerf<T>(action: string, fn: () => Promise<T>): Promise<T> {
  if (!isPerfLogEnabled()) {
    return fn();
  }

  const store: PerfStore = {
    action,
    reqId: randomUUID().slice(0, 8),
    startedAt: performance.now(),
    dbMs: 0,
    dbOps: 0,
    pusherMs: 0,
    pusherCalls: 0,
    getCharCalls: 0,
  };

  // 入口行：與 [perf] 行配對可找出被 timeout 砍掉的請求（有 start 無 end）
  console.info(`[perf:start] action=${action} reqId=${store.reqId}`);

  return storage.run(store, async () => {
    let result: 'ok' | 'error' = 'ok';
    try {
      return await fn();
    } catch (error) {
      result = 'error';
      throw error;
    } finally {
      console.info(formatPerfLine(store, performance.now() - store.startedAt, result));
    }
  });
}
