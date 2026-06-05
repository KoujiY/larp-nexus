/**
 * Flow — 一鍵清除通知顯示（不刪 DB）
 *
 * 驗證 GM 控制台「歷史紀錄」面板的「清除顯示」一鍵清兩端：
 * - 玩家端：收到 notifications.cleared（game channel）→ 通知面板即時清空
 * - GM 端：歷史紀錄套用前端水位線隱藏既有紀錄
 * - **核心：DB Log collection 完整保留**（清除是前端水位線，非 DELETE）
 *
 * 注意：玩家面板清空斷言必須驗「app 實際行為」而非僅 SSE 事件流 —— SSE 測試流
 * （waitForWebSocketEvent）只證明 server 有發，不經過 client 的 Pusher 綁定；
 * 唯有面板真的清空，才能涵蓋「事件名稱未被 client bind」這類執行期漏接。
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';

test.describe('Flow — Clear Notifications Display (front-end only, no DB delete)', () => {
  test('GM clear → player panel empties + GM log watermark + DB Log intact', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // ── Seed ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({ gameId, name: '冒險者' });
    await seed.characterRuntime({ refId: charA._id, gameId, name: '冒險者' });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    const { gmPage, playerPage } = await asGmAndPlayer({ gmUserId, characterId: charA._id });

    // ── Player 載入 ──
    await playerPage.goto(`/c/${charA._id}`);
    await playerPage.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

    // ── GM 進控制台，先發一則廣播：填充玩家通知 + 寫入 DB Log + 顯示於 GM 歷史紀錄 ──
    await gmPage.goto(`/games/${gameId}`);
    await gmPage.getByRole('tab', { name: '控制台' }).click();

    const broadcastPanel = gmPage.locator('.bg-card').filter({ hasText: '快速廣播' }).first();
    await broadcastPanel.locator('input[placeholder="輸入廣播標題..."]').fill('Boss 出現');
    await broadcastPanel.locator('textarea[placeholder*="傳送給玩家"]').fill('全員警戒');

    const wsBroadcast = waitForWebSocketEvent(playerPage, {
      event: 'game.broadcast',
      channel: `private-game-${gameId}`,
    });
    await broadcastPanel.getByRole('button', { name: '發送廣播' }).click();
    await waitForToast(gmPage, '已推送');
    await wsBroadcast;

    // ── 玩家通知面板：開啟並確認收到通知（保持開啟，後續驗證即時清空） ──
    const bell = playerPage.locator('button[aria-label*="通知"]').first();
    await bell.click();
    await expect(playerPage.getByText('Boss 出現')).toBeVisible();

    // ── GM 歷史紀錄：確認廣播紀錄已顯示 ──
    const eventLogPanel = gmPage.locator('.bg-card').filter({ hasText: '歷史紀錄' }).first();
    await expect(eventLogPanel.getByText('Boss 出現')).toBeVisible();

    // ── DB：清除前的 Log 筆數（廣播至少寫 1 筆） ──
    const logsBefore = await dbQuery('logs', { gameId });
    expect(logsBefore.length).toBeGreaterThanOrEqual(1);

    // ── GM 一鍵清除：歷史紀錄面板「清除顯示」→「確認清除」 ──
    const wsCleared = waitForWebSocketEvent(playerPage, {
      event: 'notifications.cleared',
      channel: `private-game-${gameId}`,
    });
    await eventLogPanel.getByRole('button', { name: '清除顯示' }).click();
    await eventLogPanel.getByRole('button', { name: '確認清除' }).click();

    // ── server 確實發出 notifications.cleared（診斷用；不足以證明 client 已處理） ──
    const clearedEvent = await wsCleared as Record<string, unknown>;
    const clearedPayload = clearedEvent.payload as Record<string, unknown>;
    expect(clearedPayload.gameId).toBe(gameId);

    // ── 核心斷言 1：玩家通知面板即時清空（驗 app 實際行為 → 涵蓋 Pusher bind 漏接） ──
    await expect(playerPage.getByText('Boss 出現')).not.toBeVisible();

    // ── 核心斷言 2：GM 歷史紀錄套用水位線，既有紀錄被隱藏 ──
    await expect(eventLogPanel.getByText('Boss 出現')).not.toBeVisible();

    // ── 核心斷言 3：DB Log 完整保留（清除是前端水位線，非 DELETE） ──
    const logsAfter = await dbQuery('logs', { gameId });
    expect(logsAfter.length).toBe(logsBefore.length);
  });
});
