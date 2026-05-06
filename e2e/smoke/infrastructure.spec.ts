/**
 * 基礎建設 smoke test
 *
 * 驗證 E2E pipeline 能正常運作：
 * - Playwright 可啟動 Next.js `next build --webpack && next start`
 * - `E2E=1` env 有正確傳遞（`/api/test/events` 不會 404）
 * - in-memory MongoDB 有被 webServer 讀到（透過 test-login route）
 * - Pusher stub 的 SSE route 可成功建立連線
 * - reset / seed / dbQuery fixture 正常運作
 *
 * 這個檔案「刻意」只測 infra 層，不依賴任何業務頁面。
 *
 * 注意：SSE 是長連線，不能用 `request.get()`（會等整個 body 讀完而 timeout）。
 * 改用 browser 的 `EventSource` 並等 `onopen`—這也是 pusher-client.e2e.ts 的
 * 真實使用路徑。
 */

import { test, expect } from '../fixtures';

test.describe('e2e infrastructure smoke', () => {
  test('test/events SSE route opens EventSource successfully', async ({
    page,
  }) => {
    // 任何 Next.js 路徑都可以，只要 page context 允許 same-origin EventSource
    await page.goto('/');

    const opened = await page.evaluate<boolean>(
      () =>
        new Promise<boolean>((resolve) => {
          const es = new EventSource('/api/test/events');
          const timer = setTimeout(() => {
            es.close();
            resolve(false);
          }, 5000);
          es.onopen = () => {
            clearTimeout(timer);
            es.close();
            resolve(true);
          };
          es.onerror = () => {
            clearTimeout(timer);
            es.close();
            resolve(false);
          };
        }),
    );

    expect(opened).toBe(true);
  });

  test('test/login route accepts GM login payload', async ({ request }) => {
    const response = await request.post('/api/test/login', {
      data: {
        mode: 'gm',
        gmUserId: 'e2e-gm-1',
        email: 'e2e-gm@example.com',
      },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok: boolean; mode: string };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('gm');
  });

  test('reset endpoint returns 200', async ({ request }) => {
    // 僅驗證 endpoint 可達且回應正確格式（不實際清空，避免破壞並行 worker 資料）
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBe(true);
  });

  test('seed + dbQuery round-trip', async ({ seed, dbQuery }) => {
    // 使用便利方法建立 GM + Game + Character
    const { gmUserId, gameId, characterId } =
      await seed.gmWithGameAndCharacter();

    // 驗證 GM user（用 _id filter 確保只查自己 seed 的資料）
    const gmDocs = await dbQuery('gm_users', { _id: gmUserId });
    expect(gmDocs.length).toBe(1);
    expect(gmDocs[0]._id).toBe(gmUserId);

    // 驗證 Game
    const gameDocs = await dbQuery('games', { gmUserId });
    expect(gameDocs.length).toBe(1);
    expect(gameDocs[0]._id).toBe(gameId);

    // 驗證 Character
    const charDocs = await dbQuery('characters', { gameId });
    expect(charDocs.length).toBe(1);
    expect(charDocs[0]._id).toBe(characterId);
  });
});
