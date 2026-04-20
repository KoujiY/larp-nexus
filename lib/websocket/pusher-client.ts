/**
 * Pusher 客戶端 lazy loader
 *
 * pusher-js 透過動態 `import()` 延後載入：原本 18 KB gzip 會進初始 bundle，
 * 改為首次呼叫 `getPusherClient()` 時才 fetch chunk，省下初始載入成本。
 *
 * Singleton：同一分頁內多次呼叫回傳同一個 Promise / 實例。
 * SSR 安全：server 端呼叫直接回 null 的 resolved Promise。
 *
 * 注意：此檔在 `E2E=1` 時會被 `next.config.ts` 的 webpack alias 替換為
 * `pusher-client.e2e.ts`，兩者的匯出簽名必須一致。
 */

// 使用 type-only import 取 Pusher 類型，避免在編譯期把 pusher-js 靜態納入
// 主 bundle；真正的值在下方的 `import('pusher-js')` 動態取得。
type PusherClient = import('pusher-js').default;

let cachedClient: PusherClient | null = null;
let loadPromise: Promise<PusherClient | null> | null = null;

export function getPusherClient(): Promise<PusherClient | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (cachedClient) return Promise.resolve(cachedClient);
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    console.warn(
      '[pusher] NEXT_PUBLIC_PUSHER_KEY 或 NEXT_PUBLIC_PUSHER_CLUSTER 未設定，客戶端 WebSocket 已停用',
    );
    return Promise.resolve(null);
  }

  loadPromise = import('pusher-js')
    .then((mod) => {
      const Pusher = mod.default;
      cachedClient = new Pusher(key, {
        cluster,
        forceTLS: true,
        authEndpoint: '/api/webhook/pusher-auth',
      });
      return cachedClient;
    })
    .catch((err) => {
      console.error('[pusher] 載入 pusher-js 失敗', err);
      // 重置 promise，讓下一次呼叫可以重試
      loadPromise = null;
      return null;
    });

  return loadPromise;
}
