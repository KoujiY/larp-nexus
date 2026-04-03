import Pusher from 'pusher';

let pusherServerInstance: Pusher | null = null;

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;

const isConfigured = Boolean(appId && key && secret && cluster);

/**
 * 取得 Pusher 伺服器端實例（singleton）
 *
 * 缺少環境變數時回傳 null，所有 WebSocket 推送將靜默跳過。
 */
export function getPusherServer(): Pusher | null {
  if (!isConfigured) return null;
  if (!pusherServerInstance) {
    pusherServerInstance = new Pusher({
      appId: appId as string,
      key: key as string,
      secret: secret as string,
      cluster: cluster as string,
      useTLS: true,
    });
  }
  return pusherServerInstance;
}

/** 檢查 Pusher 環境變數是否已完整設定 */
export function isPusherEnabled(): boolean {
  return isConfigured;
}

