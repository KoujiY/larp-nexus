/**
 * HMR-safe 的全域 AsyncLocalStorage 取得器
 *
 * dev HMR / 多編譯單元會重新評估模組並產生新的 ALS 實例，但持有舊模組
 * 閉包的程式（如 db-timing 的 mongoose 包裝層、action 入口的 run 包裝）
 * 仍指向舊實例——寫入端與讀取端必須共用同一個 ALS，否則 context 靜默失效。
 *
 * 本模組以 `Symbol.for`（跨模組實例共享的全域 symbol registry）在
 * globalThis 上維護單一 registry，依名稱回傳同一個 ALS 實例，
 * 取代各使用端自行宣告 `declare global` + `globalThis.__x ??=` 的樣板。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const REGISTRY_KEY = Symbol.for('larp-nexus.global-als-registry');

type AlsRegistry = Map<string, AsyncLocalStorage<unknown>>;

function getRegistry(): AlsRegistry {
  const holder = globalThis as Record<symbol, AlsRegistry | undefined>;
  return (holder[REGISTRY_KEY] ??= new Map());
}

/**
 * 依名稱取得（或建立）全域唯一的 AsyncLocalStorage 實例
 *
 * 同名呼叫永遠回傳同一實例（跨 HMR 重新評估、跨編譯單元）。
 * 呼叫端自行保證同名實例的 T 一致（名稱即契約）。
 *
 * @param name - 實例名稱（建議用模組名，如 'perf-context'）
 */
export function getGlobalAls<T>(name: string): AsyncLocalStorage<T> {
  const registry = getRegistry();
  let als = registry.get(name);
  if (!als) {
    als = new AsyncLocalStorage<unknown>();
    registry.set(name, als);
  }
  return als as AsyncLocalStorage<T>;
}
