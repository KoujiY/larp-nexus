/**
 * 等待 DB 狀態滿足條件（Polling）
 *
 * 每隔 `interval` ms 呼叫 `/api/test/db-query`，
 * 直到 `predicate(docs)` 回傳 true 或超時。
 *
 * 用途：等待 server action 完成後的 DB side-effect（例如 stat 變更、log 寫入）。
 */

import type { APIRequestContext } from '@playwright/test';

interface WaitForDbStateOptions {
  /** collection 名稱 */
  collection: string;
  /** 查詢 filter（與 `/api/test/db-query` 的 filter 格式相同） */
  filter?: Record<string, unknown>;
  /** 判斷條件：接收查詢結果，回傳 true 表示滿足 */
  predicate?: (docs: Record<string, unknown>[]) => boolean;
  /** 等待超時（ms），預設 10000 */
  timeout?: number;
  /** 輪詢間隔（ms），預設 200 */
  interval?: number;
}

/**
 * 等待 DB 查詢結果滿足 predicate
 *
 * @param request - Playwright APIRequestContext
 * @param options - 查詢條件和判斷邏輯
 * @returns 最終滿足條件時的文件陣列
 */
export async function waitForDbState(
  request: APIRequestContext,
  options: WaitForDbStateOptions,
): Promise<Record<string, unknown>[]> {
  const {
    collection,
    filter = {},
    predicate = (docs) => docs.length > 0,
    timeout = 10000,
    interval = 200,
  } = options;

  const params = new URLSearchParams({
    collection,
    filter: JSON.stringify(filter),
  });
  const url = `/api/test/db-query?${params.toString()}`;
  const deadline = Date.now() + timeout;
  let lastDocs: Record<string, unknown>[] = [];

  while (Date.now() < deadline) {
    const response = await request.get(url);
    if (!response.ok()) {
      throw new Error(
        `waitForDbState: dbQuery failed (${response.status()}): ${await response.text()}`,
      );
    }
    const json = await response.json() as { documents: Record<string, unknown>[] };
    lastDocs = json.documents;
    if (predicate(lastDocs)) {
      return lastDocs;
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(
    `waitForDbState timeout (${timeout}ms) for collection "${collection}".\n` +
    `Filter: ${JSON.stringify(filter)}\n` +
    `Last result (${lastDocs.length} docs): ${JSON.stringify(lastDocs, null, 2).slice(0, 500)}`,
  );
}
