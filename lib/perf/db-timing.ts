/**
 * 效能埋點：Mongoose 查詢計時包裝層（PERF_INCIDENT_2026-06 Step 2.1）
 *
 * 在 PERF_LOG=1 時包裝一次 Mongoose 的四個執行入口，
 * 將每次 DB 操作的耗時累加到目前請求的 perf context：
 * - Query.prototype.exec     → find / findOne / findOneAndUpdate / updateOne 等
 *                              （await Query 時 thenable 內部也是呼叫 exec）
 * - Aggregate.prototype.exec → aggregate
 * - Model.prototype.save     → doc.save()、Model.create()（內部逐筆 save）
 * - Model.insertMany         → 批次寫入（如 pending events）
 *
 * 為什麼包 exec 而不用 MongoDB driver 的 command monitoring：
 * monitoring 事件在 client 全域 listener 觸發，脫離發起請求的 async context，
 * AsyncLocalStorage 無法歸因到正確的請求；exec 包裝層則在呼叫端的
 * async context 內執行，歸因天然正確。
 *
 * 安裝點：lib/db/mongodb.ts 的 connectDB()，以 globalThis 旗標確保
 * 即使 dev HMR 重新評估模組也只包一次（避免重複計時）。
 */

import mongoose from 'mongoose';
import { addDbTime } from './perf-context';

declare global {
  // 避免 dev HMR 重複包裝導致 double-count
  var __perfDbTimingInstalled: boolean | undefined;
}

type AnyAsyncFn = (...args: unknown[]) => Promise<unknown>;

/**
 * 包裝一個 async 函數：計時後累加到 perf context（保留 this 與回傳值）
 */
function wrapTimed(fn: AnyAsyncFn): AnyAsyncFn {
  return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    const start = performance.now();
    try {
      return await fn.apply(this, args);
    } finally {
      addDbTime(performance.now() - start);
    }
  };
}

/**
 * 安裝 Mongoose 計時包裝層（idempotent，全程只安裝一次）
 *
 * 注意：純觀測、不改變任何查詢行為；錯誤原樣傳遞（finally 計時）。
 */
export function installDbTiming(): void {
  if (globalThis.__perfDbTimingInstalled) return;
  globalThis.__perfDbTimingInstalled = true;

  const queryProto = mongoose.Query.prototype as unknown as { exec: AnyAsyncFn };
  queryProto.exec = wrapTimed(queryProto.exec);

  const aggregateProto = mongoose.Aggregate.prototype as unknown as { exec: AnyAsyncFn };
  aggregateProto.exec = wrapTimed(aggregateProto.exec);

  // Model.prototype.save 涵蓋 doc.save() 與 Model.create()；
  // 編譯後的 model 透過 prototype chain 繼承，事後安裝一樣生效
  const modelProto = mongoose.Model.prototype as unknown as { save: AnyAsyncFn };
  modelProto.save = wrapTimed(modelProto.save);

  const modelStatics = mongoose.Model as unknown as { insertMany: AnyAsyncFn };
  modelStatics.insertMany = wrapTimed(modelStatics.insertMany);

  console.info('[perf] Mongoose db-timing installed');
}
