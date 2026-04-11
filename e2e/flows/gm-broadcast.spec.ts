/**
 * Flow #8 — GM 廣播與單角色訊息
 *
 * 驗證 GM → Player 反向資訊流：
 * - broadcast 模式：Pusher `private-game-{gameId}` + PendingEvent + Log
 * - character 模式：Pusher `private-character-{characterId}` + Log（不寫 PendingEvent）
 *
 * @see docs/refactoring/E2E_FLOW_8_GM_BROADCAST.md
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';

test.describe('Flow #8 — GM Broadcast & Character Message', () => {
  // ─── #8.1 Broadcast 全體廣播（happy path） ─────────────

  test('#8.1 broadcast happy path: GM sends → Player receives notification + PendingEvent + Log', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // ── Seed ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({ gameId, name: '測試角色A' });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '測試角色A',
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Dual context setup ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // ── Phase A — GM 發送全體廣播 ──
    // GM: 進入 game 頁面，切換到控制台 tab
    await gmPage.goto(`/games/${gameId}`);
    await gmPage.getByRole('tab', { name: '控制台' }).click();

    // 確認廣播面板可見（「快速廣播」標題）
    const broadcastPanel = gmPage.locator('.bg-card').filter({ hasText: '快速廣播' }).first();
    await expect(broadcastPanel).toBeVisible();

    // 確認預設為全體廣播模式
    const broadcastToggle = broadcastPanel.getByRole('button', { name: '全體廣播' });
    await expect(broadcastToggle).toBeVisible();

    // 填入標題與訊息
    const titleInput = broadcastPanel.locator('input[placeholder="輸入廣播標題..."]');
    const messageTextarea = broadcastPanel.locator('textarea[placeholder*="傳送給玩家"]');
    await titleInput.fill('Boss 出現');
    await messageTextarea.fill('全員警戒');

    // Player: 進入角色頁面，等待角色卡載入完成
    await playerPage.goto(`/c/${charA._id}`);
    await playerPage.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

    // 先建立 WS listener，再觸發動作（避免 race condition）
    const wsPromise = waitForWebSocketEvent(playerPage, {
      event: 'game.broadcast',
      channel: `private-game-${gameId}`,
    });

    // GM: 點擊發送
    const sendButton = broadcastPanel.getByRole('button', { name: '發送廣播' });
    await sendButton.click();

    // ── Phase B — GM 端驗證 ──
    // Toast 成功
    await waitForToast(gmPage, '已推送');

    // 表單重置
    await expect(titleInput).toHaveValue('');
    await expect(messageTextarea).toHaveValue('');

    // ── Phase C — Player 端接收驗證 ──
    // WebSocket 事件：broadcast 走 BaseEvent 包裝 { type, timestamp, payload: {...} }
    const broadcastEvent = await wsPromise as Record<string, unknown>;
    const broadcastPayload = broadcastEvent.payload as Record<string, unknown>;
    expect(broadcastPayload).toMatchObject({
      title: 'Boss 出現',
      message: '全員警戒',
      priority: 'normal',
    });

    // Player UI 通知：打開通知面板確認
    const bellButton = playerPage.locator('button[aria-label*="通知"]').first();
    await bellButton.click();
    await expect(playerPage.getByText('Boss 出現')).toBeVisible();
    await expect(playerPage.getByText('全員警戒')).toBeVisible();

    // ── Phase D — DB 驗證 ──
    // PendingEvent：broadcast 應寫入
    const pendingEvents = await dbQuery('pending_events', {
      targetGameId: gameId,
      eventType: 'game.broadcast',
    });
    expect(pendingEvents.length).toBeGreaterThanOrEqual(1);
    const pending = pendingEvents[0] as Record<string, unknown>;
    const pendingPayload = pending.eventPayload as Record<string, unknown>;
    expect(pendingPayload).toMatchObject({
      title: 'Boss 出現',
      message: '全員警戒',
    });

    // Log：action='broadcast'，game-level（無 characterId）
    const logs = await dbQuery('logs', { gameId, action: 'broadcast' });
    expect(logs.length).toBe(1);
    const log = logs[0] as Record<string, unknown>;
    expect(log.actorType).toBe('gm');
    const logDetails = log.details as Record<string, unknown>;
    expect(logDetails.title).toBe('Boss 出現');
    expect(logDetails.message).toBe('全員警戒');
    // broadcast 是 game-level，不應含 characterId
    expect(log.characterId).toBeUndefined();
  });

  // ─── #8.2 Character 指定角色訊息（happy path + PendingEvent 反向驗證） ──

  test('#8.2 character message: GM sends to specific character → Player receives + Log + NO PendingEvent', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // ── Seed ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({ gameId, name: '勇者' });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '勇者',
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Dual context setup ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // ── Phase A — GM 切換至指定角色模式並發送 ──
    await gmPage.goto(`/games/${gameId}`);
    await gmPage.getByRole('tab', { name: '控制台' }).click();

    const broadcastPanel = gmPage.locator('.bg-card').filter({ hasText: '快速廣播' }).first();
    await expect(broadcastPanel).toBeVisible();

    // 切換到指定角色模式
    const characterToggle = broadcastPanel.getByRole('button', { name: '指定角色' });
    await characterToggle.click();

    // 角色選擇下拉應出現
    const characterSelect = broadcastPanel.getByRole('combobox');
    await expect(characterSelect).toBeVisible();

    // 選擇目標角色
    await characterSelect.click();
    await gmPage.getByRole('option', { name: '勇者' }).click();

    // 填入標題與訊息
    const titleInput = broadcastPanel.locator('input[placeholder="輸入廣播標題..."]');
    const messageTextarea = broadcastPanel.locator('textarea[placeholder*="傳送給玩家"]');
    await titleInput.fill('密令');
    await messageTextarea.fill('前往地下城');

    // Player: 進入角色頁面，等待角色卡載入完成
    await playerPage.goto(`/c/${charA._id}`);
    await playerPage.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

    // 先建立 WS listener，再觸發動作（避免 race condition）
    const wsPromise = waitForWebSocketEvent(playerPage, {
      event: 'role.message',
      channel: `private-character-${charA._id}`,
    });

    // GM: 點擊發送
    const sendButton = broadcastPanel.getByRole('button', { name: '發送廣播' });
    await sendButton.click();

    // ── Phase B — GM 端驗證 ──
    await waitForToast(gmPage, '已推送');

    // 表單重置：title、message 清空
    await expect(titleInput).toHaveValue('');
    await expect(messageTextarea).toHaveValue('');

    // 角色選擇清空（回到 placeholder 狀態）
    await expect(characterSelect).toHaveText('選擇角色');

    // ── Phase C — Player 端接收驗證 ──
    // waitForWebSocketEvent 返回 parsed.data = BaseEvent { type, timestamp, payload }
    // payload 一定存在（events.ts:62-73 手動包裝 BaseEvent 格式）
    const msgEvent = await wsPromise as Record<string, unknown>;
    const payload = msgEvent.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      characterId: charA._id,
      from: 'GM',
      title: '密令',
      message: '前往地下城',
      style: 'info',
    });

    // Player UI 通知
    const bellButton = playerPage.locator('button[aria-label*="通知"]').first();
    await bellButton.click();
    await expect(playerPage.getByText('密令')).toBeVisible();
    await expect(playerPage.getByText('前往地下城')).toBeVisible();

    // ── Phase D — DB 驗證（含反向斷言） ──
    // Log：action='character_message'，character-level 含 characterId
    const logs = await dbQuery('logs', { gameId, action: 'character_message' });
    expect(logs.length).toBe(1);
    const log = logs[0] as Record<string, unknown>;
    expect(log.actorType).toBe('gm');
    expect(log.characterId).toBeDefined();
    const logDetails = log.details as Record<string, unknown>;
    expect(logDetails.title).toBe('密令');
    expect(logDetails.message).toBe('前往地下城');

    // PendingEvent 反向驗證（本 case 核心價值）
    // character 模式 **不寫** PendingEvent，這是刻意設計
    const pendingEvents = await dbQuery('pending_events', {
      targetGameId: gameId,
    });
    expect(pendingEvents.length).toBe(0);
  });

  // ─── #8.3 表單驗證 + 模式切換 ────────────────────────

  test('#8.3 form validation + mode toggle: PillToggle switches, required field guards', async ({
    seed,
    asGm,
    page,
  }) => {
    // ── Seed ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({ gameId, name: '戰士' });
    const charB = await seed.character({ gameId, name: '法師' });
    await seed.characterRuntime({ refId: charA._id, gameId, name: '戰士' });
    await seed.characterRuntime({ refId: charB._id, gameId, name: '法師' });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    await asGm({ gmUserId });
    await page.goto(`/games/${gameId}`);
    await page.getByRole('tab', { name: '控制台' }).click();

    const broadcastPanel = page.locator('.bg-card').filter({ hasText: '快速廣播' }).first();
    await expect(broadcastPanel).toBeVisible();

    // ── Phase A — PillToggle 模式切換 ──
    const broadcastToggle = broadcastPanel.getByRole('button', { name: '全體廣播' });
    const characterToggle = broadcastPanel.getByRole('button', { name: '指定角色' });
    const characterSelect = broadcastPanel.getByRole('combobox');

    // 預設為 broadcast 模式，角色下拉隱藏
    await expect(broadcastToggle).toBeVisible();
    await expect(characterSelect).not.toBeVisible();

    // 切換到指定角色 → 下拉出現
    await characterToggle.click();
    await expect(characterSelect).toBeVisible();

    // 切回全體廣播 → 下拉再次隱藏
    await broadcastToggle.click();
    await expect(characterSelect).not.toBeVisible();

    // ── Phase B — Broadcast 模式必填守門 ──
    const titleInput = broadcastPanel.locator('input[placeholder="輸入廣播標題..."]');
    const sendButton = broadcastPanel.getByRole('button', { name: '發送廣播' });

    // title 為空 → 按鈕 disabled（canSubmit = title.trim()）
    await expect(titleInput).toHaveValue('');
    await expect(sendButton).toBeDisabled();

    // 填入 title → 按鈕啟用
    await titleInput.fill('測試標題');
    await expect(sendButton).toBeEnabled();

    // 清空 title → 按鈕再次 disabled
    await titleInput.fill('');
    await expect(sendButton).toBeDisabled();

    // ── Phase C — Character 模式必填守門 ──
    await characterToggle.click();
    await titleInput.fill('測試');
    // 有 title 但沒選角色 → 按鈕 disabled
    await expect(sendButton).toBeDisabled();

    // 選擇角色 → 按鈕啟用
    await characterSelect.click();
    await page.getByRole('option', { name: '戰士' }).click();
    await expect(sendButton).toBeEnabled();

    // ── Phase D — 角色下拉列表內容 ──
    // 重新打開下拉，確認顯示所有角色
    await characterSelect.click();
    await expect(page.getByRole('option', { name: '戰士' })).toBeVisible();
    await expect(page.getByRole('option', { name: '法師' })).toBeVisible();
  });

  // ─── #8.4 Authorization guard（非 GM session） ─────────

  test('#8.4 authorization guard: Player session accessing GM page → redirect to login', async ({
    seed,
    asPlayer,
    page,
    dbQuery,
  }) => {
    // ── Seed ──
    const { gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({ gameId, name: '入侵者' });
    await seed.characterRuntime({ refId: charA._id, gameId, name: '入侵者' });
    await seed.gameRuntime({ refId: gameId, gmUserId: (await seed.gmUser({ email: 'other@test.com' }))._id });

    // 僅設定 Player session，不設定 GM session
    await asPlayer({ characterId: charA._id });

    // ── Phase A — Player 嘗試存取 GM 頁面 ──
    // GM game page 的 getGameById() 會檢查 GM session，
    // 無 GM session → UNAUTHORIZED → redirect('/auth/login')
    await page.goto(`/games/${gameId}`);

    // ── Phase B — 驗證被 redirect 至登入頁 ──
    await page.waitForURL('**/auth/login**', { timeout: 10000 });
    expect(page.url()).toContain('/auth/login');

    // ── Phase C — DB 反向驗證 ──
    // 確保沒有任何 broadcast 或 character_message 被寫入
    const logs = await dbQuery('logs', { action: 'broadcast' });
    expect(logs.length).toBe(0);

    const charMsgLogs = await dbQuery('logs', { action: 'character_message' });
    expect(charMsgLogs.length).toBe(0);

    const allPendingEvents = await dbQuery('pending_events', {});
    expect(allPendingEvents.length).toBe(0);
  });
});
