/**
 * Pusher server stub（E2E 專用）
 *
 * 透過 `next.config.ts` 的 webpack alias 在 `E2E=1` 時替換 `pusher-server.ts`。
 * 此 stub 不連真 Pusher cluster，而是把所有 `trigger()` 寫入 in-process event bus，
 * 由 SSE route 轉發給 browser 端的 `pusher-client.e2e.ts`。
 *
 * 方法簽名需與原始 `pusher-server.ts` 的呼叫端相容：
 * - `getPusherServer()` → 回傳具 `trigger()` 的物件（或 null）
 * - `isPusherEnabled()` → 回傳 boolean
 */

import { publishE2EEvent } from './__e2e__/event-bus';

interface StubTriggerResult {
  status: number;
}

interface StubPusherServer {
  trigger(
    channels: string | string[],
    event: string,
    data: unknown,
  ): Promise<StubTriggerResult>;
}

let cachedInstance: StubPusherServer | null = null;

export function getPusherServer(): StubPusherServer | null {
  if (!cachedInstance) {
    cachedInstance = {
      async trigger(channels, event, data) {
        const list = Array.isArray(channels) ? channels : [channels];
        for (const channel of list) {
          publishE2EEvent({ channel, event, data });
        }
        return { status: 200 };
      },
    };
  }
  return cachedInstance;
}

/**
 * E2E 環境永遠視 Pusher 為「已啟用」——所有 `if (!isPusherEnabled()) return` 分支
 * 會被走過，事件流完整執行。
 */
export function isPusherEnabled(): boolean {
  return true;
}
