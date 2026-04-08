/**
 * E2E 專用 SSE route
 *
 * 僅在 `process.env.E2E === '1'` 時可用；正式環境回 404。
 *
 * 此 route 把 `lib/websocket/__e2e__/event-bus.ts` 的 EventEmitter
 * 橋接到 browser 端的 `pusher-client.e2e.ts`（透過 EventSource）：
 *
 *   pusher-server.e2e.ts.trigger()
 *     └─ publishE2EEvent()
 *         └─ EventEmitter.emit('message', payload)
 *             └─ this route 的 listener
 *                 └─ SSE `data: <json>\n\n`
 *                     └─ EventSource.onmessage
 *                         └─ pusher-client.e2e.ts 分派到 channel/event callback
 *
 * 為何用 Node runtime 而非 Edge：
 * - 需要 `EventEmitter`（node:events）— Edge runtime 不支援
 * - 需要與 `pusher-server.e2e.ts` 共享同一 process 的 module instance
 */

import type { E2EBusPayload } from '@/lib/websocket/__e2e__/event-bus';
import { getE2EBus } from '@/lib/websocket/__e2e__/event-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (process.env.E2E !== '1') {
    return new Response('Not Found', { status: 404 });
  }

  const bus = getE2EBus();
  const encoder = new TextEncoder();

  // 共享 closure：start 註冊、cancel 清理
  let listener: ((payload: E2EBusPayload) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // 起始 comment 讓 EventSource 確認連線
      controller.enqueue(encoder.encode(': connected\n\n'));

      listener = (payload: E2EBusPayload): void => {
        try {
          const line = `data: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch (err) {
          console.error('[test/events] failed to enqueue payload', err);
        }
      };
      bus.on('message', listener);

      // heartbeat 每 15s 送一次 comment，避免 idle 被 proxy 切斷
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // controller 已 close — cancel() 會處理清理
        }
      }, 15_000);
    },
    cancel(reason) {
      if (listener) {
        bus.off('message', listener);
        listener = null;
      }
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (reason) {
        console.info('[test/events] SSE stream cancelled', reason);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
