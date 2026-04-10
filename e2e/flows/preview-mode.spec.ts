/**
 * Flow #11 — 預覽模式 baseline 讀取分流
 *
 * 驗證 PIN-only 解鎖（預覽模式）下，玩家端顯示的是 Baseline 資料而非 Runtime 資料，
 * 以及 preview→full-access 切換後正確顯示 Runtime 資料。
 *
 * 5 個分歧點驗證：HP value, items list, skill usageCount, secrets, tasks
 *
 * @see docs/refactoring/E2E_FLOW_11_PREVIEW_MODE_BASELINE.md
 */

import { test, expect } from '../fixtures';

// ─── 共用 Seed Helper ──────────────────────────────────────

/**
 * 建立預覽模式測試所需的完整 seed：
 * GM + active game + character(hasPinLock) + characterRuntime（含 5 個分歧點）
 *
 * Baseline: HP=100, 1 item(劍), 1 skill(usageCount=0), 1 secret, 1 task
 * Runtime:  HP=60,  2 items(劍+藥水), 1 skill(usageCount=2), 2 secrets, 2 tasks
 */
async function seedPreviewData(seed: Parameters<Parameters<typeof test>[2]>[0]['seed']) {
  const gm = await seed.gmUser();
  const game = await seed.game({
    gmUserId: gm._id,
    name: '預覽模式測試',
    isActive: true,
    gameCode: 'PREV11',
  });

  // Baseline character（hasPinLock 是 readOnly 的前提 — 規則 24）
  const character = await seed.character({
    gameId: game._id,
    name: '預覽角色',
    hasPinLock: true,
    pin: '1234',
    stats: [
      { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
    ],
    items: [
      { id: 'item-sword', name: '長劍', type: 'consumable', quantity: 1 },
    ],
    skills: [
      { id: 'skill-fireball', name: '火球術', usageLimit: 5, usageCount: 0 },
    ],
    secretInfo: {
      secrets: [
        { id: 'secret-A', title: '基礎秘密', content: ['Baseline secret content'], isRevealed: true },
      ],
    },
    tasks: [
      { id: 'task-A', title: '基礎任務', description: '這是 Baseline 任務', isHidden: false },
    ],
  });

  // CharacterRuntime：5 個分歧值（規則 16）
  await seed.characterRuntime({
    refId: character._id,
    gameId: game._id,
    name: '預覽角色',
    hasPinLock: true,
    pin: '1234',
    stats: [
      { id: 'stat-hp', name: '生命值', value: 60, maxValue: 100 },
    ],
    items: [
      { id: 'item-sword', name: '長劍', type: 'consumable', quantity: 1 },
      { id: 'item-potion', name: '治療藥水', type: 'consumable', quantity: 3 },
    ],
    skills: [
      { id: 'skill-fireball', name: '火球術', usageLimit: 5, usageCount: 2 },
    ],
    secretInfo: {
      secrets: [
        { id: 'secret-A', title: '基礎秘密', content: ['Baseline secret content'], isRevealed: true },
        { id: 'secret-B', title: 'Runtime 秘密', content: ['Runtime revealed content'], isRevealed: true },
      ],
    },
    tasks: [
      { id: 'task-A', title: '基礎任務', description: '這是 Baseline 任務', isHidden: false },
      { id: 'task-B', title: 'Runtime 任務', description: '這是 Runtime 任務', isHidden: false },
    ],
  });

  // GameRuntime（active game 需要 — 規則 16）
  await seed.gameRuntime({
    refId: game._id,
    gmUserId: gm._id,
    name: '預覽模式測試',
    isActive: true,
  });

  return { gmUserId: gm._id, gameId: game._id, characterId: character._id };
}

// ─── Tests ──────────────────────────────────────────────────

test.describe('Flow #11 — Preview Mode Baseline', () => {

  // ─── #11.1 Preview mode 顯示 baseline 資料 ───────────────
  test('#11.1 preview mode displays baseline data, not runtime', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    const { characterId } = await seedPreviewData(seed);

    // readOnly: true → 只設 localStorage unlocked，不設 fullAccess
    await asPlayer({ characterId, readOnly: true });
    await page.goto(`/c/${characterId}`);

    // 等待橫幅出現（頁面載入完成指標）
    await expect(
      page.getByText('遊戲準備中 — 預覽模式', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    // ── UI 斷言：Stats — HP 顯示 100（baseline），不是 60 ──
    // 先切換到數值 tab
    await page.getByRole('button', { name: '數值' }).click();
    // StatsDisplay 中 stat value 使用 font-mono span
    const hpCard = page.locator('.bg-card').filter({ hasText: '生命值' });
    await expect(hpCard).toBeVisible();
    // value 100 顯示為大數字，maxValue 100 在其後
    await expect(hpCard.locator('span.font-mono.font-bold').first()).toHaveText('100');

    // ── UI 斷言：Items — 只有長劍，不出現治療藥水 ──
    await page.getByRole('button', { name: '物品' }).click();
    await expect(page.getByText('長劍', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('治療藥水', { exact: true })).not.toBeVisible();

    // ── UI 斷言：Skills — 火球術 usageCount=0 → 剩餘 5/5 ──
    await page.getByRole('button', { name: '技能' }).click();
    await expect(page.getByText('火球術', { exact: true }).first()).toBeVisible();
    // 點擊技能卡打開 detail dialog
    await page.getByText('火球術', { exact: true }).first().click();
    // 等待 BottomSheet 展開，找到「剩餘 / 總次數」標籤旁的值
    await expect(page.getByText('剩餘 / 總次數')).toBeVisible({ timeout: 5000 });
    // usageLimit=5, usageCount=0 → "5 / 5"
    await expect(page.getByText('5 / 5', { exact: true })).toBeVisible();
    // 關閉 dialog
    await page.keyboard.press('Escape');

    // ── UI 斷言：Secrets — 只有基礎秘密，不出現 Runtime 秘密 ──
    await page.getByRole('button', { name: '資訊' }).click();
    // 切換到「額外資訊」子分頁
    await page.getByRole('button', { name: '額外資訊', exact: true }).click();
    await expect(page.getByText('基礎秘密', { exact: true })).toBeVisible();
    await expect(page.getByText('Runtime 秘密', { exact: true })).not.toBeVisible();

    // ── UI 斷言：Tasks — 只有基礎任務，不出現 Runtime 任務 ──
    await page.getByRole('button', { name: '任務' }).click();
    await expect(page.getByText('基礎任務', { exact: true })).toBeVisible();
    await expect(page.getByText('Runtime 任務', { exact: true })).not.toBeVisible();

    // ── DB 層斷言：確認 Baseline 和 Runtime 值確實不同 ──
    const baselineChars = await dbQuery('characters', { _id: characterId });
    expect(baselineChars).toHaveLength(1);
    const blStats = baselineChars[0].stats as Array<{ value: number }>;
    expect(blStats[0].value).toBe(100);

    const runtimeChars = await dbQuery('character_runtime', { refId: characterId });
    expect(runtimeChars).toHaveLength(1);
    const rtStats = runtimeChars[0].stats as Array<{ value: number }>;
    expect(rtStats[0].value).toBe(60);
  });

  // ─── #11.2 Preview → Full access 切換後顯示 runtime 資料 ──
  test('#11.2 preview → full access switch shows runtime data', async ({
    page,
    seed,
    asPlayer,
  }) => {
    const { characterId } = await seedPreviewData(seed);

    await asPlayer({ characterId, readOnly: true });
    await page.goto(`/c/${characterId}`);

    // 確認初始為預覽模式
    await expect(
      page.getByText('遊戲準備中 — 預覽模式', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    // 切換到數值 tab 確認初始 HP=100
    await page.getByRole('button', { name: '數值' }).click();
    const hpCard = page.locator('.bg-card').filter({ hasText: '生命值' });
    await expect(hpCard.locator('span.font-mono.font-bold').first()).toHaveText('100');

    // ── 點擊「重新解鎖」→ PIN 解鎖畫面 ──
    await page.getByRole('button', { name: '重新解鎖' }).click();

    // 等待 PIN 輸入出現
    const pinInput = page.getByLabel('PIN 輸入');
    await expect(pinInput).toBeVisible({ timeout: 5000 });

    // 輸入 PIN + Game Code
    await pinInput.fill('1234');
    const gameCodeInput = page.getByLabel('遊戲代碼輸入');
    await gameCodeInput.fill('PREV11');

    // 提交（有 Game Code 時按鈕文字為「進入完整互動模式」）
    await page.getByRole('button', { name: '進入完整互動模式' }).click();

    // ── 等待模式切換完成 ──
    await expect(
      page.getByText('遊戲進行中 — Runtime 模式', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    // ── UI 斷言：Stats — HP 現在顯示 60（runtime） ──
    await page.getByRole('button', { name: '數值' }).click();
    const hpCardAfter = page.locator('.bg-card').filter({ hasText: '生命值' });
    await expect(hpCardAfter.locator('span.font-mono.font-bold').first()).toHaveText('60');

    // ── UI 斷言：Items — 出現長劍和治療藥水 ──
    await page.getByRole('button', { name: '物品' }).click();
    await expect(page.getByText('長劍', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('治療藥水', { exact: true }).first()).toBeVisible();

    // ── UI 斷言：Skills — usageCount=2 → 剩餘 3/5 ──
    await page.getByRole('button', { name: '技能' }).click();
    await page.getByText('火球術', { exact: true }).first().click();
    await expect(page.getByText('剩餘 / 總次數')).toBeVisible({ timeout: 5000 });
    // usageLimit=5, usageCount=2 → "3 / 5"
    await expect(page.getByText('3 / 5', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // ── UI 斷言：Secrets — 出現兩個 secrets ──
    await page.getByRole('button', { name: '資訊' }).click();
    await page.getByRole('button', { name: '額外資訊', exact: true }).click();
    await expect(page.getByText('基礎秘密', { exact: true })).toBeVisible();
    await expect(page.getByText('Runtime 秘密', { exact: true })).toBeVisible();

    // ── UI 斷言：Tasks — 出現兩個 tasks ──
    await page.getByRole('button', { name: '任務' }).click();
    await expect(page.getByText('基礎任務', { exact: true })).toBeVisible();
    await expect(page.getByText('Runtime 任務', { exact: true })).toBeVisible();

    // ── localStorage 斷言 ──
    const fullAccess = await page.evaluate(
      (id) => localStorage.getItem(`character-${id}-fullAccess`),
      characterId,
    );
    expect(fullAccess).toBe('true');
  });

  // ─── #11.3 預覽模式互動鎖定 ──────────────────────────────
  test('#11.3 preview mode disables item/skill use buttons', async ({
    page,
    seed,
    asPlayer,
  }) => {
    const { characterId } = await seedPreviewData(seed);

    await asPlayer({ characterId, readOnly: true });
    await page.goto(`/c/${characterId}`);

    await expect(
      page.getByText('遊戲準備中 — 預覽模式', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    // ── Item 互動鎖定 ──
    await page.getByRole('button', { name: '物品' }).click();
    await page.getByText('長劍', { exact: true }).first().click();

    // 等待 BottomSheet 開啟 — 使用按鈕顯示「預覽模式」且 disabled
    const itemUseBtn = page.getByRole('button', { name: '預覽模式' }).first();
    await expect(itemUseBtn).toBeVisible({ timeout: 5000 });
    await expect(itemUseBtn).toBeDisabled();

    // 關閉 item dialog
    await page.keyboard.press('Escape');
    await expect(itemUseBtn).not.toBeVisible({ timeout: 5000 });

    // ── Skill 互動鎖定 ──
    await page.getByRole('button', { name: '技能' }).click();
    await page.getByText('火球術', { exact: true }).first().click();

    // 使用按鈕顯示「預覽模式」且 disabled
    const skillUseBtn = page.getByRole('button', { name: '預覽模式' }).first();
    await expect(skillUseBtn).toBeVisible({ timeout: 5000 });
    await expect(skillUseBtn).toBeDisabled();

    await page.keyboard.press('Escape');
  });

  // ─── #11.4 Game 未啟動時 baselineData 不填充 ─────────────
  test('#11.4 inactive game — baselineData undefined, fallback works', async ({
    page,
    seed,
    asPlayer,
  }) => {
    // 獨立 seed：game isActive=false，無 CharacterRuntime
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '未啟動遊戲',
      isActive: false,
    });

    const character = await seed.character({
      gameId: game._id,
      name: '未啟動角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      items: [
        { id: 'item-shield', name: '盾牌', type: 'equipment', quantity: 1 },
      ],
    });

    await asPlayer({ characterId: character._id, readOnly: true });
    await page.goto(`/c/${character._id}`);

    // 橫幅仍顯示預覽模式（因為 isReadOnly=true，沒有 fullAccess）
    await expect(
      page.getByText('遊戲準備中 — 預覽模式', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    // ── Stats 正常顯示（fallback ?? 路徑，baselineData=undefined → 用 top-level） ──
    await page.getByRole('button', { name: '數值' }).click();
    const hpCard = page.locator('.bg-card').filter({ hasText: '生命值' });
    await expect(hpCard).toBeVisible();
    await expect(hpCard.locator('span.font-mono.font-bold').first()).toHaveText('100');

    // ── Items 正常顯示 ──
    await page.getByRole('button', { name: '物品' }).click();
    await expect(page.getByText('盾牌', { exact: true }).first()).toBeVisible();

    // ── 頁面沒有 JS 錯誤（不崩潰） ──
    // 上方的斷言已隱含「頁面正常渲染」。額外確認無 console error：
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    // 切換幾個 tab 確認不會 crash
    await page.getByRole('button', { name: '技能' }).click();
    await page.getByRole('button', { name: '任務' }).click();
    await page.getByRole('button', { name: '資訊' }).click();
    // 等待一小段時間讓任何延遲錯誤浮現
    await page.waitForTimeout(500);
    expect(consoleErrors).toHaveLength(0);
  });
});
