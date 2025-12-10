import Pusher from 'pusher';

let pusherServerInstance: Pusher | null = null;

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;

const isConfigured = Boolean(appId && key && secret && cluster);

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

export function isPusherEnabled(): boolean {
  return isConfigured;
}

