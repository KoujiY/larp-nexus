/**
 * 等待 E2E WebSocket（SSE）事件
 *
 * 在 browser 端建立 EventSource listener，監聽 `/api/test/events` SSE stream，
 * 匹配指定的 event name（可選 channel 和自訂 filter）。
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

interface WaitForWebSocketEventOptions {
  /** 要匹配的 event name */
  event: string;
  /** 可選：要匹配的 channel */
  channel?: string;
  /**
   * 可選：自訂 filter predicate（在 browser context 中執行）
   * 接收 event payload，回傳 boolean
   */
  filter?: string;
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
    filter?: string;
    timeout: number;
  }>(
    ({ event: ev, channel: ch, filter: fn, timeout: ms }) =>
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
            if (fn) {
              // eslint-disable-next-line no-eval
              const predicate = eval(`(${fn})`) as (data: unknown) => boolean;
              if (!predicate(parsed.data)) return;
            }
            clearTimeout(timer);
            es.close();
            resolve(parsed.data);
          } catch {
            // 忽略非 JSON 或解析錯誤
          }
        });

        es.onerror = () => {
          clearTimeout(timer);
          es.close();
          reject(new Error('EventSource connection error'));
        };
      }),
    { event, channel, filter, timeout },
  );
}
