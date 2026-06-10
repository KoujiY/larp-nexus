/**
 * Per-request 快取：game.isActive 路由決策
 *
 * 用獨立的 AsyncLocalStorage 在單一 server action 的 async context 內
 * 快取 gameId → isActive 與 characterId → gameId 的對應關係。
 *
 * getCharacterData / updateCharacterData 每次呼叫都需要查 Character+Game
 * 來決定讀寫 Baseline 或 Runtime。同一請求內這些值不會改變
 * （isActive 只在 GM 端 startGame/endGame 時切換），快取可省下大量冗餘查詢。
 *
 * 效果：getCharacterData 首次 3 ops → 後續 1 op；
 *       updateCharacterData 每次省 2 ops（跳過 Character.findById + Game.findById）。
 *
 * 與 perf-context.ts 同模式但始終啟用（不受 PERF_LOG 控制）。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

type GameRequestCacheStore = {
  /** gameId (string) → isActive */
  gameActive: Map<string, boolean>;
  /** characterId (baseline string) → gameId (string) */
  charToGame: Map<string, string>;
};

declare global {
  // dev HMR / 多編譯單元可能產生多個模組實例；寫入端（action 入口的
  // runWithGameCache）與讀取端（get/update-character-data）必須共用
  // 同一個 ALS 實例，否則快取靜默失效。與 perf-context.ts 同一模式。
  var __gameRequestCacheStorage: AsyncLocalStorage<GameRequestCacheStore> | undefined;
}

const storage: AsyncLocalStorage<GameRequestCacheStore> =
  globalThis.__gameRequestCacheStorage ??
  (globalThis.__gameRequestCacheStorage = new AsyncLocalStorage<GameRequestCacheStore>());

/**
 * 在 per-request cache context 內執行 fn
 *
 * 若已在 cache context 內（巢狀呼叫），直接執行不建新 store，
 * 避免內層覆蓋外層快取。
 */
export async function runWithGameCache<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) {
    return fn();
  }
  return storage.run(
    { gameActive: new Map(), charToGame: new Map() },
    fn,
  );
}

/** 查詢快取的 isActive（未快取時回傳 undefined） */
export function getCachedIsActive(gameId: string): boolean | undefined {
  return storage.getStore()?.gameActive.get(gameId);
}

/** 寫入 isActive 快取 */
export function setCachedIsActive(gameId: string, isActive: boolean): void {
  storage.getStore()?.gameActive.set(gameId, isActive);
}

/** 查詢快取的 gameId（未快取時回傳 undefined） */
export function getCachedGameId(characterId: string): string | undefined {
  return storage.getStore()?.charToGame.get(characterId);
}

/** 寫入 characterId → gameId 對應 */
export function setCachedCharGameId(characterId: string, gameId: string): void {
  storage.getStore()?.charToGame.set(characterId, gameId);
}
