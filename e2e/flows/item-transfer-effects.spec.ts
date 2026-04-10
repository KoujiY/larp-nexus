/**
 * Flow #6b — 物品轉移效果（item_take / item_steal 延遲選擇）
 *
 * 驗證「延遲物品選擇」的完整閉環：
 * - 對抗路徑：contest result → needsTargetItemSelection → TargetItemSelectionDialog → selectTargetItemForContest
 * - 非對抗路徑：skill-use → needsTargetItemSelection → TargetItemSelectionDialog → selectTargetItemAfterUse
 * - item_take（銷毀式）vs item_steal（轉移式）DB 差異
 *
 * @see docs/refactoring/E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md
 */

import { test, expect } from '../fixtures';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';
import type { Browser } from '@playwright/test';

// ─── 共用 Helper ─────────────────────────────────────────

/**
 * 建立雙 BrowserContext（攻擊方 A + 防守方 B），各自有獨立 cookie jar + localStorage
 */
async function setupDualPlayerContext(
  browser: Browser,
  seed: { gmUser: Function; game: Function; character: Function; characterRuntime: Function; gameRuntime: Function },
  opts: { gameId: string; attackerId: string; defenderId: string },
) {
  const baseURL = 'http://127.0.0.1:3100';

  const ctxA = await browser.newContext({ baseURL });
  const pageA = await ctxA.newPage();
  // 攻擊方 login
  await pageA.request.post('/api/test/login', {
    data: { mode: 'player', characterIds: [opts.attackerId] },
  });
  await pageA.addInitScript(
    (id: string) => {
      localStorage.setItem(`character-${id}-unlocked`, 'true');
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    },
    opts.attackerId,
  );

  const ctxB = await browser.newContext({ baseURL });
  const pageB = await ctxB.newPage();
  // 防守方 login
  await pageB.request.post('/api/test/login', {
    data: { mode: 'player', characterIds: [opts.defenderId] },
  });
  await pageB.addInitScript(
    (id: string) => {
      localStorage.setItem(`character-${id}-unlocked`, 'true');
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    },
    opts.defenderId,
  );

  return { ctxA, pageA, ctxB, pageB };
}

// ─── Tests ───────────────────────────────────────────────

test.describe('Flow #6b — Item Transfer Effects (item_take / item_steal)', () => {

  // ─── #6b.1 item_take 延遲物品選擇（attacker_wins → 道具銷毀）───
  test('#6b.1 item_take: contest + delayed selection → item destroyed (not transferred)', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=80，技能「繳械」— item_take 效果，opponentMax=0/0（不允許防禦）
    const charA = await seed.character({
      gameId,
      name: '繳械攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 80, maxValue: 100 }],
      skills: [{
        id: 'skill-disarm',
        name: '繳械',
        description: '移除對方道具',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{ type: 'item_take', targetType: 'other' }],
        tags: [],
      }],
      items: [],
    });

    // 防守方：str=30，持有長劍 + 藥水
    const charB = await seed.character({
      gameId,
      name: '持械防守者',
      stats: [{ id: 'stat-str', name: '力量', value: 30, maxValue: 100 }],
      items: [
        { id: 'item-sword', name: '長劍', description: '武器', type: 'tool', tags: [], quantity: 1 },
        { id: 'item-potion', name: '藥水', description: '回復', type: 'consumable', tags: [], quantity: 3 },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '繳械攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 80, maxValue: 100 }],
      skills: [{
        id: 'skill-disarm',
        name: '繳械',
        description: '移除對方道具',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{ type: 'item_take', targetType: 'other' }],
        tags: [],
      }],
      items: [],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '持械防守者',
      stats: [{ id: 'stat-str', name: '力量', value: 30, maxValue: 100 }],
      items: [
        { id: 'item-sword', name: '長劍', description: '武器', type: 'tool', tags: [], quantity: 1 },
        { id: 'item-potion', name: '藥水', description: '回復', type: 'consumable', tags: [], quantity: 3 },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, seed, { gameId, attackerId: charA._id, defenderId: charB._id },
    );

    try {
      // ── Phase A — 雙方頁面載入（在 EventSource timer 之前完成，避免 page load 佔用 timeout） ──
      await pageA.goto(`/c/${charA._id}`);
      await pageA.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

      // ── Phase B — 設定 WS listener → 攻擊方使用技能（頁面已載入，只做 UI 互動） ──
      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: `(data) => data && data.payload && data.payload.subType === 'request'`,
      });

      // 攻擊方：頁面已載入 → 切到技能 tab → 使用繳械
      const navA = pageA.getByRole('navigation');
      await navA.getByRole('button', { name: '技能' }).click();
      await pageA.getByText('繳械', { exact: true }).click();
      const skillDialog = pageA.getByRole('dialog', { name: '繳械' });
      await expect(skillDialog).toBeVisible({ timeout: 5000 });
      await skillDialog.locator('[role="combobox"]').click();
      await pageA.getByRole('option', { name: '持械防守者' }).click();
      await skillDialog.getByRole('button', { name: '使用技能' }).click();
      await expect(skillDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — 防守方收到請求 → 直接回應（opponentMax=0/0） ──
      await requestPromise;

      // 攻擊方預先監聽 result 事件（必須在 click 之前建立 EventSource，
      // 因為 needsTargetItemSelection 路徑的 result 事件在 server action 中會立即發送，
      // 不像一般路徑會先執行效果再發送，留給 EventSource 連線的時間極短）
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: `(data) => data && data.payload && data.payload.subType === 'result'`,
      });

      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // opponentMax=0/0 → 只能基礎數值
      await expect(contestDialog.getByRole('button', { name: '使用基礎數值回應' })).toBeVisible();

      await contestDialog.getByRole('button', { name: '使用基礎數值回應' }).click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase D — 結果 → attacker_wins + needsTargetItemSelection ──
      const resultEvent = await resultPromiseA as { payload: Record<string, unknown> };
      expect(resultEvent.payload.result).toBe('attacker_wins');
      expect(resultEvent.payload.needsTargetItemSelection).toBe(true);

      // 效果尚未執行：B 的 items 仍完整
      const preItems = await dbQuery('character_runtime', { refId: charB._id });
      const preItemList = preItems[0].items as Array<{ id: string; quantity: number }>;
      expect(preItemList.length).toBe(2);

      // ── Phase E — 攻擊方選擇目標道具 ──
      const itemSelectionDialog = pageA.getByRole('dialog', { name: '選擇目標道具' });
      await expect(itemSelectionDialog).toBeVisible({ timeout: 10000 });

      // 斷言：B 的道具列表可見
      await expect(itemSelectionDialog.getByText('長劍')).toBeVisible();
      await expect(itemSelectionDialog.getByText('藥水')).toBeVisible();

      // 選擇「長劍」（radio）
      await itemSelectionDialog.getByText('長劍').click();
      // 確認選擇
      await itemSelectionDialog.getByRole('button', { name: '確認選擇' }).click();
      await expect(itemSelectionDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase F — DB 最終狀態驗證 ──
      // 等待效果執行完成（polling 取代固定 timeout — 方法 2）
      await expect.poll(async () => {
        const rt = await dbQuery('character_runtime', { refId: charB._id });
        const items = rt[0]?.items as Array<{ id: string }> | undefined;
        return items?.find(i => i.id === 'item-sword');
      }, { timeout: 10000 }).toBeUndefined();

      // B 的 items：長劍已移除，藥水仍存在
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      const bItems = runtimeB[0].items as Array<{ id: string; name: string; quantity: number }>;
      expect(bItems.find(i => i.id === 'item-sword')).toBeUndefined();
      expect(bItems.find(i => i.id === 'item-potion')).toBeDefined();
      expect(bItems.find(i => i.id === 'item-potion')!.quantity).toBe(3);

      // A 的 items：仍為空（item_take 只銷毀，不轉移）
      const runtimeA = await dbQuery('character_runtime', { refId: charA._id });
      const aItems = runtimeA[0].items as Array<{ id: string }>;
      expect(aItems.length).toBe(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6b.2 item_steal 延遲物品選擇（attacker_wins → 道具轉移）───
  test('#6b.2 item_steal: contest + delayed selection → item transferred to attacker', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=80，技能「偷竊」— item_steal 效果
    const charA = await seed.character({
      gameId,
      name: '偷竊攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 80, maxValue: 100 }],
      skills: [{
        id: 'skill-steal',
        name: '偷竊',
        description: '偷走對方道具',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{ type: 'item_steal', targetType: 'other' }],
        tags: [],
      }],
      items: [],
    });

    // 防守方：str=30，持有寶石（quantity=2）
    const charB = await seed.character({
      gameId,
      name: '寶石持有者',
      stats: [{ id: 'stat-str', name: '力量', value: 30, maxValue: 100 }],
      items: [
        { id: 'item-gem', name: '寶石', description: '珍貴寶石', type: 'tool', tags: [], quantity: 2 },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '偷竊攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 80, maxValue: 100 }],
      skills: [{
        id: 'skill-steal',
        name: '偷竊',
        description: '偷走對方道具',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{ type: 'item_steal', targetType: 'other' }],
        tags: [],
      }],
      items: [],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '寶石持有者',
      stats: [{ id: 'stat-str', name: '力量', value: 30, maxValue: 100 }],
      items: [
        { id: 'item-gem', name: '寶石', description: '珍貴寶石', type: 'tool', tags: [], quantity: 2 },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, seed, { gameId, attackerId: charA._id, defenderId: charB._id },
    );

    try {
      // ── Phase A — 雙方頁面載入（在 EventSource timer 之前完成，避免 page load 佔用 timeout） ──
      await pageA.goto(`/c/${charA._id}`);
      await pageA.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

      // ── Phase B — 設定 WS listener → 攻擊方使用技能（頁面已載入，只做 UI 互動） ──
      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: `(data) => data && data.payload && data.payload.subType === 'request'`,
      });

      // 攻擊方：頁面已載入 → 切到技能 tab → 使用偷竊
      const navA = pageA.getByRole('navigation');
      await navA.getByRole('button', { name: '技能' }).click();
      await pageA.getByText('偷竊', { exact: true }).click();
      const skillDialog = pageA.getByRole('dialog', { name: '偷竊' });
      await expect(skillDialog).toBeVisible({ timeout: 5000 });
      await skillDialog.locator('[role="combobox"]').click();
      await pageA.getByRole('option', { name: '寶石持有者' }).click();
      await skillDialog.getByRole('button', { name: '使用技能' }).click();
      await expect(skillDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — 防守方回應 ──
      await requestPromise;

      // 攻擊方預先監聽 result 事件（needsTargetItemSelection 路徑的 result 事件會立即發送）
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: `(data) => data && data.payload && data.payload.subType === 'result'`,
      });

      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      await contestDialog.getByRole('button', { name: '使用基礎數值回應' }).click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase D — 結果 → attacker_wins + needsTargetItemSelection ──
      const resultEvent = await resultPromiseA as { payload: Record<string, unknown> };
      expect(resultEvent.payload.result).toBe('attacker_wins');
      expect(resultEvent.payload.needsTargetItemSelection).toBe(true);

      // ── Phase E — 攻擊方選擇目標道具 ──
      const itemSelectionDialog = pageA.getByRole('dialog', { name: '選擇目標道具' });
      await expect(itemSelectionDialog).toBeVisible({ timeout: 10000 });

      // 寶石可見（quantity 顯示 x2）
      await expect(itemSelectionDialog.getByText('寶石')).toBeVisible();

      // 選擇寶石 → 確認
      await itemSelectionDialog.getByText('寶石').click();
      await itemSelectionDialog.getByRole('button', { name: '確認選擇' }).click();
      await expect(itemSelectionDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase F — DB 最終狀態驗證（item_steal 轉移） ──
      // 等待效果執行完成（polling 取代固定 timeout — 方法 2）
      await expect.poll(async () => {
        const rt = await dbQuery('character_runtime', { refId: charB._id });
        const items = rt[0]?.items as Array<{ id: string; quantity: number }> | undefined;
        return items?.find(i => i.id === 'item-gem')?.quantity;
      }, { timeout: 10000 }).toBe(1);

      // B 的寶石 quantity: 2 → 1（steal 只取 1 個）
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      const bItems = runtimeB[0].items as Array<{ id: string; name: string; quantity: number }>;
      const bGem = bItems.find(i => i.id === 'item-gem');
      expect(bGem).toBeDefined();
      expect(bGem!.quantity).toBe(1);

      // A 獲得寶石（item_steal 轉移式），quantity=1
      const runtimeA = await dbQuery('character_runtime', { refId: charA._id });
      const aItems = runtimeA[0].items as Array<{ id: string; name: string; quantity: number; equipped?: boolean }>;
      const aGem = aItems.find(i => i.name === '寶石');
      expect(aGem).toBeDefined();
      expect(aGem!.quantity).toBe(1);
      // 轉移時自動卸除裝備狀態
      expect(aGem!.equipped).toBeFalsy();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6b.3 item_steal 非對抗延遲物品選擇（checkType='none' → 直接成功 → 道具轉移）───
  test('#6b.3 item_steal: non-contest + delayed selection → item transferred', async ({
    page,
    seed,
    dbQuery,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：技能「竊取術」— checkType='none', item_steal, targetType='other'
    const charA = await seed.character({
      gameId,
      name: '竊取者',
      stats: [{ id: 'stat-dex', name: '敏捷', value: 70, maxValue: 100 }],
      skills: [{
        id: 'skill-pickpocket',
        name: '竊取術',
        description: '無聲偷走對方道具',
        checkType: 'none',
        effects: [{ type: 'item_steal', targetType: 'other' }],
        tags: [],
      }],
      items: [],
    });

    // 防守方：持有盾牌（quantity=1）+ 金幣（quantity=5）
    const charB = await seed.character({
      gameId,
      name: '富商',
      stats: [{ id: 'stat-dex', name: '敏捷', value: 40, maxValue: 100 }],
      items: [
        { id: 'item-shield', name: '盾牌', description: '防禦用', type: 'equipment', tags: [], quantity: 1 },
        { id: 'item-gold', name: '金幣', description: '貨幣', type: 'tool', tags: [], quantity: 5 },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '竊取者',
      stats: [{ id: 'stat-dex', name: '敏捷', value: 70, maxValue: 100 }],
      skills: [{
        id: 'skill-pickpocket',
        name: '竊取術',
        description: '無聲偷走對方道具',
        checkType: 'none',
        effects: [{ type: 'item_steal', targetType: 'other' }],
        tags: [],
      }],
      items: [],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '富商',
      stats: [{ id: 'stat-dex', name: '敏捷', value: 40, maxValue: 100 }],
      items: [
        { id: 'item-shield', name: '盾牌', description: '防禦用', type: 'equipment', tags: [], quantity: 1 },
        { id: 'item-gold', name: '金幣', description: '貨幣', type: 'tool', tags: [], quantity: 5 },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 攻擊方 login ──
    await page.request.post('/api/test/login', {
      data: { mode: 'player', characterIds: [charA._id] },
    });
    await page.addInitScript(
      (id: string) => {
        localStorage.setItem(`character-${id}-unlocked`, 'true');
        localStorage.setItem(`character-${id}-fullAccess`, 'true');
      },
      charA._id,
    );

    // ── Phase A — 載入攻擊方頁面 ──
    await page.goto(`/c/${charA._id}`);
    await page.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

    // ── Phase B — 使用技能（checkType='none' → 直接成功，回傳 needsTargetItemSelection） ──
    const navA = page.getByRole('navigation');
    await navA.getByRole('button', { name: '技能' }).click();
    await page.getByText('竊取術', { exact: true }).click();
    const skillDialog = page.getByRole('dialog', { name: '竊取術' });
    await expect(skillDialog).toBeVisible({ timeout: 5000 });

    // 選擇目標角色
    await skillDialog.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: '富商' }).click();

    // 使用技能（非對抗路徑：技能 dialog 不會關閉，TargetItemSelectionDialog 覆蓋在上方）
    await skillDialog.getByRole('button', { name: '使用技能' }).click();

    // ── Phase C — TargetItemSelectionDialog 出現（mode='post-use'）──
    const itemSelectionDialog = page.getByRole('dialog', { name: '選擇目標道具' });
    await expect(itemSelectionDialog).toBeVisible({ timeout: 10000 });

    // 防守方道具列表可見
    await expect(itemSelectionDialog.getByText('盾牌')).toBeVisible();
    await expect(itemSelectionDialog.getByText('金幣')).toBeVisible();

    // 選擇「盾牌」→ 確認
    await itemSelectionDialog.getByText('盾牌').click();
    await itemSelectionDialog.getByRole('button', { name: '確認選擇' }).click();
    await expect(itemSelectionDialog).not.toBeVisible({ timeout: 10000 });

    // ── Phase D — DB 最終狀態驗證（item_steal 轉移） ──
    // 等待效果執行完成（polling 取代固定 timeout — 方法 2）
    await expect.poll(async () => {
      const rt = await dbQuery('character_runtime', { refId: charB._id });
      const items = rt[0]?.items as Array<{ id: string }> | undefined;
      return items?.find(i => i.id === 'item-shield');
    }, { timeout: 10000 }).toBeUndefined();

    // B 的盾牌已移除（quantity=1 → 完全移除），金幣不受影響
    const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
    const bItems = runtimeB[0].items as Array<{ id: string; name: string; quantity: number }>;
    expect(bItems.find(i => i.id === 'item-shield')).toBeUndefined();
    const bGold = bItems.find(i => i.id === 'item-gold');
    expect(bGold).toBeDefined();
    expect(bGold!.quantity).toBe(5);

    // A 獲得盾牌（item_steal 轉移式），quantity=1，自動卸除裝備
    const runtimeA = await dbQuery('character_runtime', { refId: charA._id });
    const aItems = runtimeA[0].items as Array<{ id: string; name: string; quantity: number; equipped?: boolean }>;
    const aShield = aItems.find(i => i.name === '盾牌');
    expect(aShield).toBeDefined();
    expect(aShield!.quantity).toBe(1);
    expect(aShield!.equipped).toBeFalsy();
  });

});
