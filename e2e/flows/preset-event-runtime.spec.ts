/**
 * Flow #9 — 預設事件 runtime 執行
 *
 * 驗證預設事件在 runtime 階段的完整生命週期：
 * - Baseline → Runtime 複製 + 執行狀態追蹤（executionCount, executedAt）
 * - 4 種 action type：broadcast / stat_change / reveal_secret / reveal_task
 * - Best-effort 執行模型（部分失敗不阻斷）
 * - 預設事件 broadcast 不寫 PendingEvent（與 Flow #8 手動廣播的關鍵差異）
 *
 * @see docs/refactoring/E2E_FLOW_9_PRESET_EVENT_RUNTIME.md
 */

import { test, expect, E2E_BASE_URL } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';
import type { Browser } from '@playwright/test';

// ─── 共用 Helper ─────────────────────────────────────────

/**
 * 在控制台的事件選單中選擇並執行預設事件
 * 1. 打開 Select 下拉選單
 * 2. 選擇指定事件
 * 3. 點擊「執行」按鈕
 * 4. 在確認 Dialog 中點擊「確認執行」
 */
async function executePresetEvent(
  gmPage: import('@playwright/test').Page,
  eventName: string,
) {
  // 定位事件選單面板
  const quickPanel = gmPage.locator('.bg-card').filter({ hasText: '事件選單' });
  await expect(quickPanel).toBeVisible();

  // 選擇事件
  await quickPanel.getByRole('combobox').click();
  await gmPage.getByRole('option', { name: new RegExp(eventName) }).click();

  // 點擊執行
  await quickPanel.getByRole('button', { name: '執行' }).click();

  // 確認 Dialog
  const confirmDialog = gmPage.getByRole('dialog', { name: '確認執行事件' });
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  await confirmDialog.getByRole('button', { name: '確認執行' }).click();
  await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });
}

// ─── Tests ───────────────────────────────────────────────

test.describe('Flow #9 — Preset Event Runtime Execution', () => {

  // ─── #9.1 Baseline → Runtime 複製 + 執行狀態追蹤 ───
  test('#9.1 baseline copy + execute + executionCount tracking', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // ── Seed：GM + Game（含 presetEvent，isActive=false）+ 角色 ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '預設事件測試',
      presetEvents: [{
        id: 'pe-welcome',
        name: '歡迎廣播',
        description: '遊戲開始時的歡迎訊息',
        showName: true,
        actions: [{
          id: 'act-welcome-broadcast',
          type: 'broadcast',
          broadcastTargets: 'all',
          broadcastTitle: '遊戲開始',
          broadcastMessage: '歡迎來到冒險世界',
        }],
      }],
    });
    const charA = await seed.character({
      gameId: game._id,
      name: '冒險者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
    });

    // ── Dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId: gm._id,
      characterId: charA._id,
    });

    // ══════════════════════════════════════
    // Phase A — 開始遊戲（觸發 Baseline → Runtime 複製）
    // ══════════════════════════════════════
    await gmPage.goto(`/games/${game._id}`);
    await expect(gmPage.getByRole('heading', { level: 1, name: '預設事件測試' })).toBeVisible();

    // 點擊「開始遊戲」→ 確認
    await gmPage.getByRole('button', { name: '開始遊戲' }).click();
    const startDialog = gmPage.getByRole('dialog');
    await expect(startDialog).toBeVisible();
    await startDialog.getByRole('button', { name: '確認開始' }).click();
    await waitForToast(gmPage, '遊戲已成功開始', { timeout: 10000 });

    // 等待 UI 切換到 Runtime 模式
    await expect(gmPage.locator('main').getByText('進行中', { exact: true })).toBeVisible({ timeout: 5000 });

    // ── DB 驗證：GameRuntime 已建立，presetEvents 正確複製 ──
    const runtimes = await dbQuery('game_runtime', { refId: game._id });
    const runtime = runtimes.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    expect(runtime).toBeTruthy();
    const runtimeEvents = runtime.presetEvents as Array<Record<string, unknown>>;
    expect(runtimeEvents).toHaveLength(1);
    expect(runtimeEvents[0].id).toBe('pe-welcome');
    expect(runtimeEvents[0].name).toBe('歡迎廣播');
    expect(runtimeEvents[0].executionCount).toBe(0);
    expect(runtimeEvents[0].executedAt).toBeFalsy();
    expect(runtimeEvents[0].runtimeOnly).toBeFalsy();

    // Baseline 不受影響（無 executionCount 欄位）
    const baselines = await dbQuery('games', { _id: game._id });
    const baselineEvents = baselines[0].presetEvents as Array<Record<string, unknown>>;
    expect(baselineEvents[0].executionCount).toBeUndefined();
    expect(baselineEvents[0].executedAt).toBeUndefined();

    // ══════════════════════════════════════
    // Phase B — GM 執行預設事件（第一次）
    // ══════════════════════════════════════

    // Player 先載入頁面（規則 30：在 WS listener 之前完成頁面載入）
    await playerPage.goto(`/c/${charA._id}`);
    await playerPage.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

    // 切換到控制台 tab
    await gmPage.getByRole('tab', { name: '控制台' }).click();

    // 設定 WS listener → 執行事件
    const wsPromise = waitForWebSocketEvent(playerPage, {
      event: 'game.broadcast',
      channel: `private-game-${game._id}`,
    });

    await executePresetEvent(gmPage, '歡迎廣播');

    // ── GM toast ──
    await waitForToast(gmPage, '已執行');

    // ── Player WS 驗證 ──
    const broadcastEvent = await wsPromise as Record<string, unknown>;
    const payload = broadcastEvent.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      title: '遊戲開始',
      message: '歡迎來到冒險世界',
      priority: 'normal',
    });

    // ── DB — executionCount 遞增 ──
    const runtimesAfter1 = await dbQuery('game_runtime', { refId: game._id });
    const runtimeAfter1 = runtimesAfter1.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const eventsAfter1 = runtimeAfter1.presetEvents as Array<Record<string, unknown>>;
    expect(eventsAfter1[0].executionCount).toBe(1);
    expect(eventsAfter1[0].executedAt).toBeTruthy();

    // Baseline 仍不受影響
    const baselinesAfter1 = await dbQuery('games', { _id: game._id });
    const baseEventsAfter1 = baselinesAfter1[0].presetEvents as Array<Record<string, unknown>>;
    expect(baseEventsAfter1[0].executionCount).toBeUndefined();

    // ══════════════════════════════════════
    // Phase C — 再次執行（executionCount 累加）
    // ══════════════════════════════════════

    // 規則 19：等待第一次 toast 全部消失，避免第二次 waitForToast 誤匹配殘留 toast
    await expect(gmPage.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });

    const wsPromise2 = waitForWebSocketEvent(playerPage, {
      event: 'game.broadcast',
      channel: `private-game-${game._id}`,
    });

    await executePresetEvent(gmPage, '歡迎廣播');
    await waitForToast(gmPage, '已執行');
    await wsPromise2;

    // ── DB — executionCount = 2 ──
    const runtimesAfter2 = await dbQuery('game_runtime', { refId: game._id });
    const runtimeAfter2 = runtimesAfter2.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const eventsAfter2 = runtimeAfter2.presetEvents as Array<Record<string, unknown>>;
    expect(eventsAfter2[0].executionCount).toBe(2);
  });

  // ─── #9.4 執行 stat_change 動作 ───
  test('#9.4 stat_change execution: value decreases + role.updated + Log', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // ── Seed：直接建立 active game + runtime ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({
      gameId,
      name: '冒險者',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
        { id: 'stat-mp', name: '魔力', value: 50, maxValue: 50 },
      ],
    });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '冒險者',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
        { id: 'stat-mp', name: '魔力', value: 50, maxValue: 50 },
      ],
    });
    await seed.gameRuntime({
      refId: gameId,
      gmUserId,
      presetEvents: [{
        id: 'pe-poison',
        name: '毒霧',
        showName: true,
        actions: [{
          id: 'act-poison',
          type: 'stat_change',
          statTargets: 'all',
          statName: '生命值',
          statChangeTarget: 'value',
          statChangeValue: -20,
        }],
        executionCount: 0,
      }],
    });

    // ── Dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // Player 先載入（規則 30）
    await playerPage.goto(`/c/${charA._id}`);
    await playerPage.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

    // GM 進入控制台
    await gmPage.goto(`/games/${gameId}`);
    await gmPage.getByRole('tab', { name: '控制台' }).click();

    // ── 設定 WS listener → 執行毒霧事件 ──
    const wsPromise = waitForWebSocketEvent(playerPage, {
      event: 'role.updated',
      channel: `private-character-${charA._id}`,
    });

    await executePresetEvent(gmPage, '毒霧');

    // ── GM toast ──
    await waitForToast(gmPage, '已執行');

    // ── Player WS 驗證：role.updated 含 stats 更新 ──
    const updateEvent = await wsPromise as Record<string, unknown>;
    const updatePayload = updateEvent.payload as Record<string, unknown>;
    const updates = updatePayload.updates as Record<string, unknown>;
    const wsStats = updates.stats as Array<Record<string, unknown>>;
    const hpStat = wsStats.find(s => s.name === '生命值');
    expect(hpStat).toBeTruthy();
    expect(hpStat!.value).toBe(60); // 80 - 20 = 60

    // ── DB 驗證：CharacterRuntime stats ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const charRuntime = charRuntimes[0] as Record<string, unknown>;
    const dbStats = charRuntime.stats as Array<Record<string, unknown>>;
    const dbHp = dbStats.find(s => s.name === '生命值');
    const dbMp = dbStats.find(s => s.name === '魔力');
    expect(dbHp!.value).toBe(60);      // 80 - 20 = 60
    expect(dbHp!.maxValue).toBe(100);  // maxValue 不變
    expect(dbMp!.value).toBe(50);      // 魔力不受影響

    // ── DB 驗證：Log 記錄 ──
    const logs = await dbQuery('logs', { gameId, action: 'stat_change' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const statLog = logs[0] as Record<string, unknown>;
    expect(statLog.actorType).toBe('gm');
    const logDetails = statLog.details as Record<string, unknown>;
    expect(logDetails.statName).toBe('生命值');
    expect(logDetails.oldValue).toBe(80);
    expect(logDetails.newValue).toBe(60);

    // ── DB 驗證：executionCount 遞增 ──
    const gameRuntimes = await dbQuery('game_runtime', { refId: gameId });
    const gameRuntime = gameRuntimes.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const presetEvents = gameRuntime.presetEvents as Array<Record<string, unknown>>;
    const poisonEvent = presetEvents.find(e => e.id === 'pe-poison');
    expect(poisonEvent!.executionCount).toBe(1);
  });

  // ─── #9.3 broadcast all + 指定角色 + PendingEvent 反向驗證 ───
  test('#9.3 broadcast: all → game.broadcast + specific → role.message + NO PendingEvent', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed：active game + 2 角色 + 雙重廣播事件 ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({ gameId, name: '戰士' });
    const charB = await seed.character({ gameId, name: '法師' });
    await seed.characterRuntime({ refId: charA._id, gameId, name: '戰士' });
    await seed.characterRuntime({ refId: charB._id, gameId, name: '法師' });
    await seed.gameRuntime({
      refId: gameId,
      gmUserId,
      presetEvents: [{
        id: 'pe-dual-broadcast',
        name: '雙重廣播',
        showName: false,
        actions: [
          {
            id: 'act-all',
            type: 'broadcast',
            broadcastTargets: 'all',
            broadcastTitle: '全體通知',
            broadcastMessage: '所有人注意',
          },
          {
            id: 'act-specific',
            type: 'broadcast',
            broadcastTargets: [charB._id],
            broadcastTitle: '密令',
            broadcastMessage: '只有你收到',
          },
        ],
        executionCount: 0,
      }],
    });

    // ── 建立 3 個 context（GM + Player A + Player B） ──
    const gmCtx = await (browser as Browser).newContext({ baseURL: E2E_BASE_URL });
    const gmPage = await gmCtx.newPage();
    await gmCtx.request.post('/api/test/login', {
      data: { mode: 'gm', gmUserId, email: 'e2e-gm@test.com' },
    });

    const ctxA = await (browser as Browser).newContext({ baseURL: E2E_BASE_URL });
    const pageA = await ctxA.newPage();
    await ctxA.request.post('/api/test/login', {
      data: { mode: 'player', characterIds: [charA._id] },
    });
    await pageA.addInitScript((id: string) => {
      localStorage.setItem(`character-${id}-unlocked`, 'true');
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    }, charA._id);

    const ctxB = await (browser as Browser).newContext({ baseURL: E2E_BASE_URL });
    const pageB = await ctxB.newPage();
    await ctxB.request.post('/api/test/login', {
      data: { mode: 'player', characterIds: [charB._id] },
    });
    await pageB.addInitScript((id: string) => {
      localStorage.setItem(`character-${id}-unlocked`, 'true');
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    }, charB._id);

    try {
      // Player A/B 先載入頁面（規則 30）
      await pageA.goto(`/c/${charA._id}`);
      await pageA.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });
      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

      // GM 進入控制台
      await gmPage.goto(`/games/${gameId}`);
      await gmPage.getByRole('tab', { name: '控制台' }).click();

      // ── WS listeners：Player A 監聽 game.broadcast，Player B 同時監聽 game.broadcast + role.message ──
      const wsBroadcastA = waitForWebSocketEvent(pageA, {
        event: 'game.broadcast',
        channel: `private-game-${gameId}`,
      });
      const wsBroadcastB = waitForWebSocketEvent(pageB, {
        event: 'game.broadcast',
        channel: `private-game-${gameId}`,
      });
      const wsMessageB = waitForWebSocketEvent(pageB, {
        event: 'role.message',
        channel: `private-character-${charB._id}`,
      });

      // ── 執行雙重廣播事件 ──
      await executePresetEvent(gmPage, '雙重廣播');
      await waitForToast(gmPage, '已執行');

      // ── 全體廣播驗證：A 和 B 都收到 game.broadcast ──
      const broadcastA = await wsBroadcastA as Record<string, unknown>;
      const payloadA = broadcastA.payload as Record<string, unknown>;
      expect(payloadA.title).toBe('全體通知');
      expect(payloadA.message).toBe('所有人注意');

      const broadcastB = await wsBroadcastB as Record<string, unknown>;
      const payloadBBroadcast = broadcastB.payload as Record<string, unknown>;
      expect(payloadBBroadcast.title).toBe('全體通知');

      // ── 指定角色廣播驗證：只有 B 收到 role.message ──
      const messageB = await wsMessageB as Record<string, unknown>;
      const payloadBMessage = messageB.payload as Record<string, unknown>;
      expect(payloadBMessage.title).toBe('密令');
      expect(payloadBMessage.message).toBe('只有你收到');
      expect(payloadBMessage.from).toBe('GM');
      expect(payloadBMessage.style).toBe('info');

      // ── PendingEvent 反向驗證（核心差異：預設事件 broadcast 不寫 PendingEvent） ──
      const pendingEvents = await dbQuery('pending_events', { targetGameId: gameId });
      expect(pendingEvents).toHaveLength(0);

      // ── Log 驗證 ──
      // broadcast (all) → action='broadcast'
      const broadcastLogs = await dbQuery('logs', { gameId, action: 'broadcast' });
      expect(broadcastLogs.length).toBeGreaterThanOrEqual(1);
      const allLog = broadcastLogs.find(l => {
        const d = l.details as Record<string, unknown>;
        return d.title === '全體通知';
      });
      expect(allLog).toBeTruthy();
      expect(allLog!.actorType).toBe('gm');

      // broadcast (specific) → action='character_message'
      const charMsgLogs = await dbQuery('logs', { gameId, action: 'character_message' });
      const specificLog = charMsgLogs.find(l => {
        const d = l.details as Record<string, unknown>;
        return d.title === '密令';
      });
      expect(specificLog).toBeTruthy();
    } finally {
      await gmCtx.close();
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #9.5 reveal_secret + reveal_task 動作 ───
  test('#9.5 reveal_secret + reveal_task: hidden items revealed + WS events + Log', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 角色（含 hidden secret + hidden task） ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({
      gameId,
      name: '王子',
      secretInfo: {
        secrets: [{
          id: 'secret-1',
          title: '隱藏身份',
          content: ['你其實是王子'],
          isRevealed: false,
        }],
      },
      tasks: [{
        id: 'task-1',
        title: '暗殺任務',
        description: '消滅目標',
        isHidden: true,
        isRevealed: false,
        status: 'pending',
      }],
    });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '王子',
      secretInfo: {
        secrets: [{
          id: 'secret-1',
          title: '隱藏身份',
          content: ['你其實是王子'],
          isRevealed: false,
        }],
      },
      tasks: [{
        id: 'task-1',
        title: '暗殺任務',
        description: '消滅目標',
        isHidden: true,
        isRevealed: false,
        status: 'pending',
      }],
    });
    await seed.gameRuntime({
      refId: gameId,
      gmUserId,
      presetEvents: [{
        id: 'pe-reveal-all',
        name: '真相大白',
        showName: true,
        actions: [
          {
            id: 'act-reveal-secret',
            type: 'reveal_secret',
            revealCharacterId: charA._id,
            revealTargetId: 'secret-1',
          },
          {
            id: 'act-reveal-task',
            type: 'reveal_task',
            revealCharacterId: charA._id,
            revealTargetId: 'task-1',
          },
        ],
        executionCount: 0,
      }],
    });

    // ── Dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // Player 先載入（規則 30）
    await playerPage.goto(`/c/${charA._id}`);
    await playerPage.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

    // GM 進入控制台
    await gmPage.goto(`/games/${gameId}`);
    await gmPage.getByRole('tab', { name: '控制台' }).click();

    // ── WS listeners：監聽 secret.revealed 和 task.revealed ──
    const wsSecretPromise = waitForWebSocketEvent(playerPage, {
      event: 'secret.revealed',
      channel: `private-character-${charA._id}`,
    });
    const wsTaskPromise = waitForWebSocketEvent(playerPage, {
      event: 'task.revealed',
      channel: `private-character-${charA._id}`,
    });

    // ── 執行真相大白事件 ──
    await executePresetEvent(gmPage, '真相大白');
    await waitForToast(gmPage, '已執行');

    // ── WS 驗證 ──
    const secretEvent = await wsSecretPromise as Record<string, unknown>;
    const secretPayload = secretEvent.payload as Record<string, unknown>;
    expect(secretPayload.secretId).toBe('secret-1');
    expect(secretPayload.secretTitle).toBe('隱藏身份');
    expect(secretPayload.revealType).toBe('manual');
    expect(secretPayload.triggerReason).toBe('預設事件觸發');

    const taskEvent = await wsTaskPromise as Record<string, unknown>;
    const taskPayload = taskEvent.payload as Record<string, unknown>;
    expect(taskPayload.taskId).toBe('task-1');
    expect(taskPayload.taskTitle).toBe('暗殺任務');

    // ── DB 驗證：CharacterRuntime secret 揭露 ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const charRuntime = charRuntimes[0] as Record<string, unknown>;
    const secretInfo = charRuntime.secretInfo as Record<string, unknown>;
    const secrets = secretInfo.secrets as Array<Record<string, unknown>>;
    const secret = secrets.find(s => s.id === 'secret-1');
    expect(secret!.isRevealed).toBe(true);
    expect(secret!.revealedAt).toBeTruthy();

    // ── DB 驗證：CharacterRuntime task 揭露 ──
    const tasks = charRuntime.tasks as Array<Record<string, unknown>>;
    const task = tasks.find(t => t.id === 'task-1');
    expect(task!.isRevealed).toBe(true);
    expect(task!.revealedAt).toBeTruthy();

    // ── DB 驗證：Log 記錄 ──
    const secretLogs = await dbQuery('logs', { gameId, action: 'secret_reveal' });
    expect(secretLogs.length).toBeGreaterThanOrEqual(1);
    const secretLog = secretLogs[0] as Record<string, unknown>;
    const secretLogDetails = secretLog.details as Record<string, unknown>;
    expect(secretLogDetails.secretTitle).toBe('隱藏身份');

    const taskLogs = await dbQuery('logs', { gameId, action: 'task_reveal' });
    expect(taskLogs.length).toBeGreaterThanOrEqual(1);
    const taskLog = taskLogs[0] as Record<string, unknown>;
    const taskLogDetails = taskLog.details as Record<string, unknown>;
    expect(taskLogDetails.taskTitle).toBe('暗殺任務');

    // ── DB 驗證：executionCount ──
    const gameRuntimes = await dbQuery('game_runtime', { refId: gameId });
    const gameRuntime = gameRuntimes.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const presetEvents = gameRuntime.presetEvents as Array<Record<string, unknown>>;
    const revealEvent = presetEvents.find(e => e.id === 'pe-reveal-all');
    expect(revealEvent!.executionCount).toBe(1);
  });

  // ─── #9.6 部分失敗 / 跳過（best-effort） ───
  test('#9.6 partial failure/skip — mixed results toast', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + Game（isActive=true）+ GameRuntime + 角色 ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '混合結果測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色 A：有已揭露的 secret + HP 100
    const charA = await seed.character({
      gameId,
      name: '戰士',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
      secretInfo: {
        secrets: [{
          id: 'secret-already',
          title: '已知身份',
          content: '身份早已揭露',
          isRevealed: true,
          revealedAt: new Date().toISOString(),
        }],
      },
    });

    // GameRuntime with preset event containing 3 actions:
    // 1. stat_change (valid → success)
    // 2. reveal_secret (already revealed → skip)
    // 3. reveal_task (nonexistent character → skip)
    await seed.gameRuntime({
      refId: gameId,
      gmUserId: gm._id,
      presetEvents: [{
        id: 'pe-mixed',
        name: '混合事件',
        showName: false,
        actions: [
          {
            id: 'act-stat',
            type: 'stat_change',
            statTargets: [charA._id],
            statName: '生命值',
            statChangeValue: -10,
            statChangeTarget: 'value',
            syncValue: false,
          },
          {
            id: 'act-secret-skip',
            type: 'reveal_secret',
            revealCharacterId: charA._id,
            revealTargetId: 'secret-already',
          },
          {
            id: 'act-task-skip',
            type: 'reveal_task',
            revealCharacterId: 'nonexistent-char-id',
            revealTargetId: 'task-whatever',
          },
        ],
      }],
    });

    // CharacterRuntime 必須與 seed 一致
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
      secretInfo: {
        secrets: [{
          id: 'secret-already',
          title: '已知身份',
          content: '身份早已揭露',
          isRevealed: true,
          revealedAt: new Date().toISOString(),
        }],
      },
    });

    // ── GM 登入 + 控制台 ──
    await asGm({ gmUserId: gm._id });
    await page.goto(`/games/${gameId}`);
    await expect(page.getByRole('heading', { level: 1, name: '混合結果測試' })).toBeVisible();

    // ── 執行混合事件 ──
    await executePresetEvent(page, '混合事件');

    // ── 驗證 toast.warning 格式 ──
    // 預期格式：「混合事件」：1 成功、2 跳過
    const toastEl = await waitForToast(page, '1 成功');
    await expect(toastEl).toContainText('2 跳過');

    // ── DB 驗證：stat_change 生效（HP 100→90） ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const charRuntime = charRuntimes[0] as Record<string, unknown>;
    const stats = charRuntime.stats as Array<Record<string, unknown>>;
    const hpStat = stats.find(s => s.name === '生命值');
    expect(hpStat!.value).toBe(90);

    // ── DB 驗證：executionCount 仍正常遞增 ──
    const gameRuntimes = await dbQuery('game_runtime', { refId: gameId });
    const gameRuntime = gameRuntimes.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const presetEvents = gameRuntime.presetEvents as Array<Record<string, unknown>>;
    const mixedEvent = presetEvents.find(e => e.id === 'pe-mixed');
    expect(mixedEvent!.executionCount).toBe(1);

    // ── DB 驗證：Log 只有 stat_change（skip 的不寫 log） ──
    const statLogs = await dbQuery('logs', { gameId, action: 'stat_change' });
    expect(statLogs.length).toBe(1);
    const secretLogs = await dbQuery('logs', { gameId, action: 'secret_reveal' });
    expect(secretLogs.length).toBe(0);
    const taskLogs = await dbQuery('logs', { gameId, action: 'task_reveal' });
    expect(taskLogs.length).toBe(0);
  });

  // ─── #9.2 Runtime CRUD（預設事件 新增/編輯/刪除） ───
  test('#9.2 Runtime CRUD — create, edit, delete preset events', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + Game（已 active）+ GameRuntime（空 presetEvents）──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: 'CRUD 測試',
      isActive: true,
    });
    const gameId = game._id;

    // Baseline 有一筆事件，確認 Runtime CRUD 不影響 Baseline
    await seed.gameRuntime({
      refId: gameId,
      gmUserId: gm._id,
      presetEvents: [{
        id: 'pe-baseline-copy',
        name: '基線事件',
        showName: false,
        actions: [{
          id: 'act-baseline',
          type: 'broadcast',
          broadcastTargets: 'all',
          broadcastTitle: '測試',
          broadcastMessage: '測試內容',
        }],
      }],
    });

    // 角色（用於 editor 的角色選擇下拉）
    await seed.character({ gameId, name: '測試角色' });

    // ── GM 登入 + 前往遊戲頁面 ──
    await asGm({ gmUserId: gm._id });
    await page.goto(`/games/${gameId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'CRUD 測試' })).toBeVisible();

    // ── 切換到「預設事件」分頁 ──
    await page.getByRole('tab', { name: '預設事件' }).click();

    // 應看到基線事件的卡片 + 新增事件按鈕
    await expect(page.getByText('基線事件', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '新增事件' })).toBeVisible();

    // ══════════════════════════════════════
    // Phase A — 新增 Runtime-only 事件
    // ══════════════════════════════════════
    await page.getByRole('button', { name: '新增事件' }).click();

    // Editor dialog 應打開
    const editorDialog = page.getByRole('dialog', { name: '建立預設事件' });
    await expect(editorDialog).toBeVisible();

    // 填寫事件名稱
    await editorDialog.locator('input').first().fill('臨時公告');
    // 備註說明
    await editorDialog.locator('input').nth(1).fill('測試用臨時事件');

    // 預設已有一個空白 broadcast action，填寫標題和內容
    // 右側 panel 的 action editor 應該可見
    // broadcast 類型的欄位：標題 + 內容
    const broadcastTitleInput = editorDialog.getByPlaceholder('廣播標題');
    if (await broadcastTitleInput.isVisible()) {
      await broadcastTitleInput.fill('臨時公告標題');
    }

    // 儲存
    await editorDialog.getByRole('button', { name: '建立事件' }).click();
    await expect(editorDialog).not.toBeVisible({ timeout: 5000 });

    // 驗證 toast
    await waitForToast(page, '預設事件已建立');

    // 頁面應顯示新事件卡片 + 「僅本場次」badge
    const createdCard = page.locator('.bg-card').filter({ hasText: '臨時公告' });
    await expect(createdCard).toBeVisible();
    await expect(createdCard.getByText('僅本場次')).toBeVisible();

    // ── DB 驗證：Runtime 層有新事件 ──
    const runtimes1 = await dbQuery('game_runtime', { refId: gameId });
    const runtime1 = runtimes1.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const events1 = runtime1.presetEvents as Array<Record<string, unknown>>;
    const newEvent = events1.find(e => e.name === '臨時公告');
    expect(newEvent).toBeTruthy();
    expect(newEvent!.runtimeOnly).toBe(true);

    // ── DB 驗證：Baseline 不受影響 ──
    const games = await dbQuery('games', { _id: gameId });
    const baseline = games[0] as Record<string, unknown>;
    const baselineEvents = (baseline.presetEvents || []) as Array<Record<string, unknown>>;
    const foundInBaseline = baselineEvents.find(e => e.name === '臨時公告');
    expect(foundInBaseline).toBeFalsy();

    // 等 toast 消失
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });

    // ══════════════════════════════════════
    // Phase B — 編輯 Runtime-only 事件
    // ══════════════════════════════════════
    // 找到臨時公告的卡片，點擊編輯
    const newCard = page.locator('.bg-card').filter({ hasText: '臨時公告' });
    await newCard.getByRole('button', { name: '編輯' }).click();

    const editDialog = page.getByRole('dialog', { name: '編輯預設事件' });
    await expect(editDialog).toBeVisible();

    // 修改名稱
    const nameInput = editDialog.locator('input').first();
    await nameInput.clear();
    await nameInput.fill('緊急公告');

    // 儲存
    await editDialog.getByRole('button', { name: '更新事件' }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 5000 });

    // 驗證 toast
    await waitForToast(page, '預設事件已更新');

    // 頁面應顯示更新後的名稱
    await expect(page.getByText('緊急公告', { exact: true })).toBeVisible();
    // 舊名稱不再顯示
    await expect(page.getByText('臨時公告', { exact: true })).not.toBeVisible();

    // ── DB 驗證 ──
    const runtimes2 = await dbQuery('game_runtime', { refId: gameId });
    const runtime2 = runtimes2.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const events2 = runtime2.presetEvents as Array<Record<string, unknown>>;
    const updatedEvent = events2.find(e => e.name === '緊急公告');
    expect(updatedEvent).toBeTruthy();
    expect(updatedEvent!.runtimeOnly).toBe(true);

    // 等 toast 消失
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });

    // ══════════════════════════════════════
    // Phase C — 刪除 Runtime-only 事件
    // ══════════════════════════════════════
    const updatedCard = page.locator('.bg-card').filter({ hasText: '緊急公告' });
    await updatedCard.getByRole('button', { name: '刪除' }).click();

    // 確認刪除 Dialog
    const deleteDialog = page.getByRole('dialog', { name: '確認刪除事件' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: '確認刪除' }).click();
    await expect(deleteDialog).not.toBeVisible({ timeout: 5000 });

    // 驗證 toast
    await waitForToast(page, '預設事件已刪除');

    // 事件卡片消失
    await expect(page.getByText('緊急公告', { exact: true })).not.toBeVisible();

    // 基線事件仍存在
    await expect(page.getByText('基線事件', { exact: true })).toBeVisible();

    // ── DB 驗證：Runtime 只剩基線複製的事件 ──
    const runtimes3 = await dbQuery('game_runtime', { refId: gameId });
    const runtime3 = runtimes3.find((r: Record<string, unknown>) => r.type === 'runtime') as Record<string, unknown>;
    const events3 = runtime3.presetEvents as Array<Record<string, unknown>>;
    const deletedEvent = events3.find(e => e.name === '緊急公告');
    expect(deletedEvent).toBeFalsy();
    // 基線事件仍在 Runtime
    const baselineCopy = events3.find(e => e.name === '基線事件');
    expect(baselineCopy).toBeTruthy();
  });

});
