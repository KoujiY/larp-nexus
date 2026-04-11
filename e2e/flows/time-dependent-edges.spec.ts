/**
 * Flow #12 — 時間依賴 edge case
 *
 * 集中處理跨 Flow 共通的時間依賴項目：
 * - TemporaryEffect 過期 stat rollback（server-side cron）
 * - Skill / Item cooldown 過期後可再使用（方案 A：seed lastUsedAt 為過去時間）
 * - PendingEvent TTL 過期清除（server-side cron）
 *
 * 時間策略：server-side timer → seed 過去時間 + 呼叫 Cron endpoint
 *          client-side cooldown → seed lastUsedAt 為過去時間繞過 server 驗證
 *
 * @see docs/refactoring/E2E_FLOW_12_TIME_DEPENDENT_EDGE_CASES.md
 */

import { test, expect } from '../fixtures';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';
import { waitForDbState } from '../helpers/wait-for-db-state';

// ─── 共用常數 ───────────────────────────────────────────────

const CRON_SECRET = 'e2e-cron-secret';

// ─── Tests ──────────────────────────────────────────────────

test.describe('Flow #12 — Time-Dependent Edge Cases', () => {

  // ─── #12.1 TemporaryEffect 過期 stat rollback + effect.expired 事件 ──
  test('#12.1 expired temporary effect — stat rollback via Cron + DB + Log', async ({
    page,
    seed,
    request,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '時效效果測試',
      isActive: true,
    });

    const character = await seed.character({
      gameId: game._id,
      name: '時效角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
    });

    // CharacterRuntime：HP=100（80 base + 20 effect delta），含一個已過期未處理的效果
    const now = Date.now();
    await seed.characterRuntime({
      refId: character._id,
      gameId: game._id,
      name: '時效角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      temporaryEffects: [
        {
          id: 'teff-expired-hp',
          sourceType: 'skill',
          sourceId: 'skill-slash-id',
          sourceCharacterId: character._id,
          sourceCharacterName: '時效角色',
          sourceName: '斬擊',
          effectType: 'stat_change',
          targetStat: '生命值',
          deltaValue: 20,
          statChangeTarget: 'value',
          duration: 60,
          appliedAt: new Date(now - 120_000).toISOString(),
          expiresAt: new Date(now - 60_000).toISOString(),
          isExpired: false,
        },
      ],
    });

    await seed.gameRuntime({
      refId: game._id,
      gmUserId: gm._id,
      name: '時效效果測試',
      isActive: true,
    });

    // ── 先呼叫 Cron（不先載入頁面，避免 auto-expiry race） ──
    // character-card-view.tsx 有 useEffect 會在頁面載入時偵測
    // expiresAt <= now 的效果並自動呼叫 checkExpiredEffects()，
    // 導致 HP 在 assertion 前就被回滾。改為 cron-first 策略。
    const cronResponse = await request.get('/api/cron/check-expired-effects', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cronResponse.ok()).toBeTruthy();

    // ── DB 斷言：effect 標記 expired + stat 回滾 ──
    const runtimes = await dbQuery('character_runtime', { refId: character._id });
    expect(runtimes).toHaveLength(1);
    const effects = runtimes[0].temporaryEffects as Array<{ id: string; isExpired: boolean }>;
    const expiredEffect = effects.find((e) => e.id === 'teff-expired-hp');
    expect(expiredEffect?.isExpired).toBe(true);
    const rtStats = runtimes[0].stats as Array<{ value: number }>;
    expect(rtStats[0].value).toBe(80);

    // ── Log 斷言 ──
    const logs = await dbQuery('logs', { action: 'effect_expired' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const expiredLog = logs.find(
      (l) => (l.details as { effectId?: string })?.effectId === 'teff-expired-hp'
    );
    expect(expiredLog).toBeTruthy();

    // ── UI 斷言：載入頁面確認 HP 已回滾為 80 ──
    await asPlayer({ characterId: character._id, readOnly: false });
    await page.goto(`/c/${character._id}`);
    await page.getByRole('button', { name: '數值' }).click();
    const hpCard = page.locator('.bg-card').filter({ hasText: '生命值' }).first();
    await expect(hpCard.locator('span.font-mono.font-bold').first()).toHaveText('80', { timeout: 15000 });
  });

  // ─── #12.2 多 TemporaryEffect 累疊與逐步過期 ─────────────
  test('#12.2 multi-effect stacking — selective rollback (A/C expired, B alive)', async ({
    page,
    seed,
    request,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '多效果測試',
      isActive: true,
    });

    const character = await seed.character({
      gameId: game._id,
      name: '多效果角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
    });

    const now = Date.now();
    // Runtime stats: value=95 (80+10+5), maxValue=97 (100-3)
    await seed.characterRuntime({
      refId: character._id,
      gameId: game._id,
      name: '多效果角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 95, maxValue: 97 },
      ],
      temporaryEffects: [
        {
          id: 'teff-A',
          sourceType: 'skill',
          sourceId: 'src-A',
          sourceCharacterId: character._id,
          sourceCharacterName: '多效果角色',
          sourceName: '效果A',
          effectType: 'stat_change',
          targetStat: '生命值',
          deltaValue: 10,
          statChangeTarget: 'value',
          duration: 60,
          appliedAt: new Date(now - 120_000).toISOString(),
          expiresAt: new Date(now - 60_000).toISOString(),
          isExpired: false,
        },
        {
          id: 'teff-B',
          sourceType: 'skill',
          sourceId: 'src-B',
          sourceCharacterId: character._id,
          sourceCharacterName: '多效果角色',
          sourceName: '效果B',
          effectType: 'stat_change',
          targetStat: '生命值',
          deltaValue: 5,
          statChangeTarget: 'value',
          duration: 300,
          appliedAt: new Date(now - 120_000).toISOString(),
          expiresAt: new Date(now + 180_000).toISOString(), // 3 分鐘後（未過期）
          isExpired: false,
        },
        {
          id: 'teff-C',
          sourceType: 'skill',
          sourceId: 'src-C',
          sourceCharacterId: character._id,
          sourceCharacterName: '多效果角色',
          sourceName: '效果C',
          effectType: 'stat_change',
          targetStat: '生命值',
          deltaMax: -3,
          statChangeTarget: 'maxValue',
          duration: 60,
          appliedAt: new Date(now - 120_000).toISOString(),
          expiresAt: new Date(now - 60_000).toISOString(),
          isExpired: false,
        },
      ],
    });

    await seed.gameRuntime({
      refId: game._id,
      gmUserId: gm._id,
      name: '多效果測試',
      isActive: true,
    });

    // ── 先呼叫 Cron（避免頁面 auto-expiry race） ──
    const cronResponse = await request.get('/api/cron/check-expired-effects', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cronResponse.ok()).toBeTruthy();

    // ── 等待 DB 狀態更新（A 和 C 都標記為 expired） ──
    await waitForDbState(request, {
      collection: 'character_runtime',
      filter: { refId: character._id },
      predicate: (docs) => {
        if (docs.length === 0) return false;
        const effects = docs[0].temporaryEffects as Array<{ id: string; isExpired: boolean }>;
        const a = effects.find((e) => e.id === 'teff-A');
        const c = effects.find((e) => e.id === 'teff-C');
        return a?.isExpired === true && c?.isExpired === true;
      },
      timeout: 10000,
    });

    // ── DB 斷言：A/C expired, B alive ──
    const runtimes = await dbQuery('character_runtime', { refId: character._id });
    const effects = runtimes[0].temporaryEffects as Array<{ id: string; isExpired: boolean }>;
    expect(effects.find((e) => e.id === 'teff-A')?.isExpired).toBe(true);
    expect(effects.find((e) => e.id === 'teff-B')?.isExpired).toBe(false);
    expect(effects.find((e) => e.id === 'teff-C')?.isExpired).toBe(true);

    // HP: 95 - 10 (A rollback) = 85, maxValue: 97 - (-3) (C rollback) = 100
    const stats = runtimes[0].stats as Array<{ value: number; maxValue?: number }>;
    expect(stats[0].value).toBe(85);
    expect(stats[0].maxValue).toBe(100);

    // ── UI 斷言：載入頁面確認 HP=85 ──
    await asPlayer({ characterId: character._id, readOnly: false });
    await page.goto(`/c/${character._id}`);
    await page.getByRole('button', { name: '數值' }).click();
    const hpCard = page.locator('.bg-card').filter({ hasText: '生命值' }).first();
    await expect(hpCard.locator('span.font-mono.font-bold').first()).toHaveText('85', { timeout: 15000 });
  });

  // ─── #12.3 Skill cooldown — 方案 A（seed lastUsedAt 為過去時間） ──
  test('#12.3 skill cooldown — expired cooldown allows reuse, new cooldown starts after', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：技能 cooldown=300s，lastUsedAt=301 秒前（已過期） ──
    // cooldown 設為 300s（遠大於測試執行時間），確保使用後 cooldown 不會在測試中途過期
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '技能冷卻測試',
      isActive: true,
    });

    const character = await seed.character({
      gameId: game._id,
      name: '冷卻角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-slash',
          name: '斬擊',
          cooldown: 300,
          usageLimit: 10,
          usageCount: 1,
          lastUsedAt: new Date(Date.now() - 301_000).toISOString(),
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '生命值',
            value: 5,
            statChangeTarget: 'value',
          }],
        },
      ],
    });

    await seed.characterRuntime({
      refId: character._id,
      gameId: game._id,
      name: '冷卻角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-slash',
          name: '斬擊',
          cooldown: 300,
          usageLimit: 10,
          usageCount: 1,
          lastUsedAt: new Date(Date.now() - 301_000).toISOString(),
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '生命值',
            value: 5,
            statChangeTarget: 'value',
          }],
        },
      ],
    });

    await seed.gameRuntime({
      refId: game._id,
      gmUserId: gm._id,
      name: '技能冷卻測試',
      isActive: true,
    });

    // ── Player 進入頁面 ──
    await asPlayer({ characterId: character._id, readOnly: false });
    await page.goto(`/c/${character._id}`);

    // 切換到技能 tab
    await page.getByRole('button', { name: '技能' }).click();
    await page.getByText('斬擊', { exact: true }).first().click();

    // ── 斷言 1：cooldown 已過期 → 使用按鈕可用（不含「冷卻中」） ──
    const useBtn = page.getByRole('button', { name: '使用技能', exact: true });
    await expect(useBtn).toBeVisible({ timeout: 5000 });
    await expect(useBtn).toBeEnabled();

    // ── 使用技能 ──
    const wsPromise = waitForWebSocketEvent(page, { event: 'skill.used' });
    await useBtn.click();
    await wsPromise;

    // 使用成功後 dialog 會自動關閉（useSkillUsage onCloseDialog），
    // 且 router.refresh() 會重新載入頁面資料。
    // 完全重新導航以確保拿到 server 最新資料。
    await page.goto(`/c/${character._id}`);
    await page.getByRole('button', { name: '技能' }).click();

    // ── 斷言 2：使用後新 cooldown 開始 → 技能卡顯示 cooldown overlay ──
    // cooldown 中的技能卡片會覆蓋一個半透明 overlay 顯示「冷卻 XM YS」，
    // 此 overlay 攔截點擊事件（無法開啟 detail dialog），
    // 因此改為斷言 overlay 上的冷卻文字。
    // formatCooldown 輸出小寫（4m 49s），CSS uppercase 僅影響顯示，
    // Playwright getByText 匹配的是 DOM 原始文字。
    const cooldownOverlay = page.getByText(/冷卻 \d+m/);
    await expect(cooldownOverlay).toBeVisible({ timeout: 10000 });

    // ── DB 斷言：lastUsedAt 更新、usageCount 遞增 ──
    const runtimes = await dbQuery('character_runtime', { refId: character._id });
    const skills = runtimes[0].skills as Array<{ id: string; lastUsedAt: string; usageCount: number }>;
    const slash = skills.find((s) => s.id === 'skill-slash');
    expect(slash).toBeTruthy();
    expect(slash!.usageCount).toBe(2);
    expect(slash!.lastUsedAt).toBeTruthy();
    // lastUsedAt 應該在最近 30 秒內
    const lastUsed = new Date(slash!.lastUsedAt).getTime();
    expect(Date.now() - lastUsed).toBeLessThan(30_000);
  });

  // ─── #12.4 Item cooldown — 方案 A（seed lastUsedAt 為過去時間） ──
  test('#12.4 item cooldown — expired cooldown allows reuse, new cooldown starts after', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：道具 cooldown=300s，lastUsedAt=301 秒前（已過期） ──
    // cooldown 設為 300s（遠大於測試執行時間），確保使用後 cooldown 不會在測試中途過期
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '道具冷卻測試',
      isActive: true,
    });

    const character = await seed.character({
      gameId: game._id,
      name: '道具角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-potion',
          name: '治療藥水',
          type: 'consumable',
          quantity: 3,
          cooldown: 300,
          usageLimit: 10,
          usageCount: 1,
          lastUsedAt: new Date(Date.now() - 301_000).toISOString(),
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '生命值',
            value: 10,
            statChangeTarget: 'value',
          }],
        },
      ],
    });

    await seed.characterRuntime({
      refId: character._id,
      gameId: game._id,
      name: '道具角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-potion',
          name: '治療藥水',
          type: 'consumable',
          quantity: 3,
          cooldown: 300,
          usageLimit: 10,
          usageCount: 1,
          lastUsedAt: new Date(Date.now() - 301_000).toISOString(),
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '生命值',
            value: 10,
            statChangeTarget: 'value',
          }],
        },
      ],
    });

    await seed.gameRuntime({
      refId: game._id,
      gmUserId: gm._id,
      name: '道具冷卻測試',
      isActive: true,
    });

    // ── Player 進入頁面 ──
    await asPlayer({ characterId: character._id, readOnly: false });
    await page.goto(`/c/${character._id}`);

    // 切換到物品 tab
    await page.getByRole('button', { name: '物品' }).click();
    await page.getByText('治療藥水', { exact: true }).first().click();

    // ── 斷言 1：cooldown 已過期 → 使用按鈕可用 ──
    const useBtn = page.getByRole('button', { name: '使用物品', exact: true });
    await expect(useBtn).toBeVisible({ timeout: 5000 });
    await expect(useBtn).toBeEnabled();

    // ── 使用道具 ──
    const wsPromise = waitForWebSocketEvent(page, { event: 'item.used' });
    await useBtn.click();
    await wsPromise;

    // 使用成功後 dialog 會自動關閉，router.refresh() 會重新載入頁面資料。
    // 完全重新導航以確保拿到 server 最新資料。
    await page.goto(`/c/${character._id}`);
    await page.getByRole('button', { name: '物品' }).click();
    await page.getByText('治療藥水', { exact: true }).first().click();

    // ── 斷言 2：使用後新 cooldown 開始 → 按鈕顯示「冷卻中」且 disabled ──
    // useButtonLabel 格式：`使用物品 (冷卻中 (Ns))`
    const cooldownBtn = page.getByRole('button', { name: /使用物品 \(冷卻中/ });
    await expect(cooldownBtn).toBeVisible({ timeout: 10000 });
    await expect(cooldownBtn).toBeDisabled();

    // ── DB 斷言：lastUsedAt 更新、usageCount 遞增、quantity 遞減 ──
    const runtimes = await dbQuery('character_runtime', { refId: character._id });
    const items = runtimes[0].items as Array<{ id: string; lastUsedAt: string; usageCount: number; quantity: number }>;
    const potion = items.find((i) => i.id === 'item-potion');
    expect(potion).toBeTruthy();
    expect(potion!.usageCount).toBe(2);
    // 有 usageLimit 時，item-use.ts 走 usageCount 路徑，quantity 不變
    expect(potion!.quantity).toBe(3);
    expect(potion!.lastUsedAt).toBeTruthy();
    const lastUsed = new Date(potion!.lastUsedAt).getTime();
    expect(Date.now() - lastUsed).toBeLessThan(30_000);
  });

  // ─── #12.5 PendingEvent TTL 過期清除 ──────────────────────
  test('#12.5 pending event TTL — expired/delivered events cleaned, fresh kept', async ({
    seed,
    request,
    dbQuery,
  }) => {
    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: 'PendingEvent 清理測試',
      isActive: true,
    });

    const character = await seed.character({
      gameId: game._id,
      name: '清理角色',
    });

    const now = Date.now();

    // 3 筆 PendingEvent：1 已過期、1 已送達舊、1 新鮮
    await seed.pendingEvent({
      id: 'pevt-expired',
      targetCharacterId: character._id,
      targetGameId: game._id,
      eventType: 'role.updated',
      eventPayload: { characterId: character._id },
      createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now - 60 * 60 * 1000).toISOString(), // 1 小時前過期
      isDelivered: false,
    });

    await seed.pendingEvent({
      id: 'pevt-delivered-old',
      targetCharacterId: character._id,
      targetGameId: game._id,
      eventType: 'character.affected',
      eventPayload: { characterId: character._id },
      createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now + 21 * 60 * 60 * 1000).toISOString(), // 未過期
      isDelivered: true,
      deliveredAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 小時前送達（> 1h）
    });

    await seed.pendingEvent({
      id: 'pevt-fresh',
      targetCharacterId: character._id,
      targetGameId: game._id,
      eventType: 'game.broadcast',
      eventPayload: { message: 'fresh event' },
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      expiresAt: new Date(now + 23 * 60 * 60 * 1000).toISOString(), // 未過期
      isDelivered: false,
    });

    // 確認 seed 成功 — 3 筆都在
    const beforeEvents = await dbQuery('pending_events', { targetCharacterId: character._id });
    expect(beforeEvents).toHaveLength(3);

    // ── 呼叫 Cron endpoint ──
    const cronResponse = await request.get('/api/cron/check-expired-effects', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cronResponse.ok()).toBeTruthy();

    const cronData = await cronResponse.json() as { data: { pendingEventsDeleted: number } };
    expect(cronData.data.pendingEventsDeleted).toBeGreaterThanOrEqual(2);

    // ── DB 斷言 ──
    const afterEvents = await dbQuery('pending_events', { targetCharacterId: character._id });

    // pevt-expired 已刪除（expiresAt < now）
    const expired = afterEvents.find((e) => (e.id as string) === 'pevt-expired');
    expect(expired).toBeUndefined();

    // pevt-delivered-old 已刪除（isDelivered=true && deliveredAt < 1h ago）
    const deliveredOld = afterEvents.find((e) => (e.id as string) === 'pevt-delivered-old');
    expect(deliveredOld).toBeUndefined();

    // pevt-fresh 仍存在
    const fresh = afterEvents.find((e) => (e.id as string) === 'pevt-fresh');
    expect(fresh).toBeTruthy();
  });
});
