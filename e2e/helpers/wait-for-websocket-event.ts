/**
 * 等待 E2E WebSocket（SSE）事件
 *
 * 在 browser 端建立 EventSource listener，監聯 `/api/test/events` SSE stream，
 * 匹配指定的 event name（可選 channel 和結構化 filter）。
 *
 * ⚠️ 使用模式（避免 race condition）：
 * ```ts
 * const p = waitForWebSocketEvent(page, { event: 'role.updated' });
 * await triggerAction();
 * const data = await p;
 * ```
 * 先建立 listener，再觸發動作，最後 await。
 */

import type { Page } from '@playwright/test';

/**
 * 結構化 filter matcher
 *
 * 用 dot-notation path 指定要檢查的 nested property，配合 value 做相等比對。
 * 例如 `{ path: 'payload.subType', value: 'request' }` 等效於
 * `data?.payload?.subType === 'request'`。
 */
interface FilterMatcher {
  /** 以 dot 分隔的屬性路徑，例如 'payload.subType' */
  path: string;
  /** 預期的值（嚴格相等比對） */
  value: unknown;
}

interface WaitForWebSocketEventOptions {
  /** 要匹配的 event name */
  event: string;
  /** 可選：要匹配的 channel */
  channel?: string;
  /**
   * 可選：結構化 filter matcher
   * 使用 dot-notation path + value 做 nested property 匹配
   */
  filter?: FilterMatcher;
  /** 等待超時（ms），預設 10000 */
  timeout?: number;
}

/**
 * 等待指定的 WebSocket event 從 SSE stream 傳入
 *
 * @param page - Playwright Page
 * @param options - 匹配條件
 * @returns 匹配的 event payload
 */
export function waitForWebSocketEvent(
  page: Page,
  options: WaitForWebSocketEventOptions,
): Promise<unknown> {
  const { event, channel, filter, timeout = 10000 } = options;

  return page.evaluate<unknown, {
    event: string;
    channel?: string;
    filterPath?: string;
    filterValue?: unknown;
    timeout: number;
  }>(
    ({ event: ev, channel: ch, filterPath, filterValue, timeout: ms }) =>
      new Promise((resolve, reject) => {
        const es = new EventSource('/api/test/events');
        const timer = setTimeout(() => {
          es.close();
          reject(new Error(`Timeout waiting for WS event "${ev}" (${ms}ms)`));
        }, ms);

        es.addEventListener('message', (e) => {
          try {
            const parsed = JSON.parse(e.data) as {
              event: string;
              channel: string;
              data: unknown;
            };
            if (parsed.event !== ev) return;
            if (ch && parsed.channel !== ch) return;
            if (filterPath !== undefined) {
              // 沿 dot path 取值做嚴格相等比對
              let current: unknown = parsed.data;
              for (const key of filterPath.split('.')) {
                if (current == null || typeof current !== 'object') {
                  current = undefined;
                  break;
                }
                current = (current as Record<string, unknown>)[key];
              }
              if (current !== filterValue) return;
            }
            clearTimeout(timer);
            es.close();
            resolve(parsed.data);
          } catch {
            // 忽略非 JSON 格式的 SSE 訊息（如 heartbeat comment）
          }
        });

        es.onerror = () => {
          // EventSource 規格中 reconnectable error 也會觸發 onerror，
          // 只在連線永久關閉時 reject，讓 auto-reconnect 正常運作
          if (es.readyState === EventSource.CLOSED) {
            clearTimeout(timer);
            reject(new Error('EventSource connection permanently closed'));
          }
        };
      }),
    {
      event,
      channel,
      filterPath: filter?.path,
      filterValue: filter?.value,
      timeout,
    },
  );
}
