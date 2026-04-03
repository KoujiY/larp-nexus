import Pusher from 'pusher-js';

let cachedClient: Pusher | null = null;

/**
 * 取得 Pusher 客戶端實例（singleton）
 *
 * 僅在瀏覽器環境有效；缺少環境變數時回傳 null 並停用 WebSocket。
 */
export function getPusherClient(): Pusher | null {
  if (typeof window === 'undefined') return null;
  if (cachedClient) return cachedClient;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    console.warn('[pusher] NEXT_PUBLIC_PUSHER_KEY 或 NEXT_PUBLIC_PUSHER_CLUSTER 未設定，客戶端 WebSocket 已停用');
    return null;
  }

  cachedClient = new Pusher(key, {
    cluster,
    forceTLS: true,
    authEndpoint: '/api/webhook/pusher-auth',
  });

  return cachedClient;
}

