/**
 * Pusher client stub（E2E 專用）
 *
 * 透過 `next.config.ts` 的 webpack alias 在 `E2E=1` 時替換 `pusher-client.ts`。
 * 此 stub 不連真 Pusher cluster，而是透過 SSE 長連線（`/api/test/events`）
 * 從 Next.js server 接收事件，再派發給對應 channel 的 subscribers。
 *
 * 方法簽名需與 `pusher-js` 的呼叫端相容：
 * - `getPusherClient()` → 回傳具 `subscribe() / unsubscribe() / disconnect()` 的物件
 * - `channel.bind(event, cb)` / `channel.unbind(event, cb?)` 匹配 `pusher-js` 語義
 *
 * 未實作的 API（目前 codebase 未使用）：
 * - `pusher.connection.bind(...)`
 * - `pusher.allChannels()`
 * - presence channel 的 member events
 */

type Callback = (data: unknown) => void;

interface StubChannel {
  bind(event: string, callback: Callback): void;
  unbind(event: string, callback?: Callback): void;
}

interface StubPusherClient {
  subscribe(channelName: string): StubChannel;
  unsubscribe(channelName: string): void;
  disconnect(): void;
}

interface SsePayload {
  channel: string;
  event: string;
  data: unknown;
}

// channel → event → Set<callback>
const channelBindings = new Map<string, Map<string, Set<Callback>>>();
let eventSource: EventSource | null = null;

function ensureSseConnected(): void {
  if (eventSource) return;
  if (typeof window === 'undefined') return;

  eventSource = new EventSource('/api/test/events');
  eventSource.onmessage = (ev) => {
    let payload: SsePayload;
    try {
      payload = JSON.parse(ev.data) as SsePayload;
    } catch (err) {
      console.error('[pusher-stub] SSE payload parse failed', err);
      return;
    }
    const eventMap = channelBindings.get(payload.channel);
    if (!eventMap) return;
    const callbacks = eventMap.get(payload.event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        cb(payload.data);
      } catch (err) {
        console.error('[pusher-stub] subscriber callback threw', err);
      }
    }
  };
  eventSource.onerror = (err) => {
    // EventSource 會自動重連；僅紀錄
    console.warn('[pusher-stub] SSE connection error (auto-reconnecting)', err);
  };
}

function getOrCreateChannel(channelName: string): StubChannel {
  if (!channelBindings.has(channelName)) {
    channelBindings.set(channelName, new Map());
  }
  const eventMap = channelBindings.get(channelName)!;

  return {
    bind(event, callback) {
      if (!eventMap.has(event)) {
        eventMap.set(event, new Set());
      }
      eventMap.get(event)!.add(callback);
    },
    unbind(event, callback) {
      const callbacks = eventMap.get(event);
      if (!callbacks) return;
      if (callback) {
        callbacks.delete(callback);
      } else {
        callbacks.clear();
      }
    },
  };
}

let cachedInstance: StubPusherClient | null = null;

/**
 * 回傳 Promise 以符合 `pusher-client.ts` 的簽名（pusher-js 改為 lazy load 後
 * `getPusherClient` 變為 async）。此 stub 不需真的 dynamic import，直接同步
 * resolve 即可。
 */
export function getPusherClient(): Promise<StubPusherClient | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  ensureSseConnected();

  if (!cachedInstance) {
    cachedInstance = {
      subscribe(channelName) {
        return getOrCreateChannel(channelName);
      },
      unsubscribe(channelName) {
        channelBindings.delete(channelName);
      },
      disconnect() {
        eventSource?.close();
        eventSource = null;
        channelBindings.clear();
        cachedInstance = null;
      },
    };
  }
  return Promise.resolve(cachedInstance);
}
