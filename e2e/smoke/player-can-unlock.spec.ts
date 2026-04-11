/**
 * Flow #2 — 玩家真實 PIN 解鎖 → 角色卡預覽模式（smoke 層）
 *
 * 驗證玩家 PIN 解鎖的真實路徑（不走 asPlayer fixture 繞過）：
 * - #2.1 PIN 正確 → 預覽模式（banner、read-only、localStorage 雙 key）
 * - #2.2 PIN 錯誤 → error path（不洩漏狀態）
 * - #2.3 hasPinLock:false → 入口頁面「直接進入」→ 預覽模式
 *
 * 設計決策：刻意走真實 PIN input，不用 asPlayer() fixture。
 * 參照規格：docs/refactoring/E2E_FLOW_2_PLAYER_PIN.md
 */

import { test, expect } from '../fixtures';

test.describe('Flow #2 — Player PIN unlock → character card', () => {
  test('#2.1 PIN unlock success → preview mode', async ({ page, seed }) => {
    // Seed：GM + Game (isActive:false) + Character (hasPinLock + PIN)
    const { gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: false },
    });
    const character = await seed.character({
      gameId,
      name: 'E2E Test Character',
      hasPinLock: true,
      pin: '1234',
      stats: [{ id: 'stat-hp', name: 'HP', value: 10, maxValue: 100 }],
      items: [
        {
          id: 'item-potion',
          name: '測試藥水',
          type: 'consumable',
          description: '測試用',
          quantity: 1,
        },
      ],
    });

    // ── Phase 1：未認證進入 → PinUnlock 畫面 ──
    await page.goto(`/c/${character._id}`);
    const pinInput = page.locator('input[aria-label="PIN 輸入"]').first();
    await expect(pinInput).toBeVisible();
    await expect(page.getByText('輸入角色 PIN').first()).toBeVisible();

    // ── Phase 2：輸入正確 PIN（不填 game code → 預覽模式）──
    await pinInput.fill('1234');
    await page.getByText('以 PIN 預覽角色').first().click();

    // ── Phase 3：等待解鎖完成 → CharacterCardView 掛載 ──
    // PinUnlock 消失
    await expect(pinInput).not.toBeVisible({ timeout: 10000 });
    // 角色名稱出現（banner span + hero h1 兩處，用 heading 定位）
    await expect(page.getByRole('heading', { name: 'E2E Test Character' })).toBeVisible();
    // 預設 tab 是「資訊」（exact:true 避免匹配「額外資訊」）
    await expect(page.getByRole('button', { name: '資訊', exact: true })).toBeVisible();

    // ── Phase 4：預覽模式 banner + read-only 驗證 ──
    await expect(page.getByText('遊戲準備中 — 預覽模式')).toBeVisible();
    await expect(page.getByText('重新解鎖')).toBeVisible();

    // 切到「物品」tab 驗證 read-only（用 role+exact 避免匹配 bottom nav icon）
    await page.getByRole('button', { name: '物品', exact: true }).click();
    await expect(page.getByText('測試藥水')).toBeVisible();

    // ── Phase 5：localStorage 雙 key 驗證 ──
    const unlocked = await page.evaluate(
      (id: string) => localStorage.getItem(`character-${id}-unlocked`),
      character._id,
    );
    expect(unlocked).toBe('true');

    const fullAccess = await page.evaluate(
      (id: string) => localStorage.getItem(`character-${id}-fullAccess`),
      character._id,
    );
    // 預覽模式不應設 fullAccess
    expect(fullAccess).toBeNull();
  });

  test('#2.2 PIN error path — no state leakage', async ({ page, seed }) => {
    const { gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: false },
    });
    const character = await seed.character({
      gameId,
      name: 'E2E Test Character #2.2',
      hasPinLock: true,
      pin: '1234',
    });

    await page.goto(`/c/${character._id}`);
    const pinInput = page.locator('input[aria-label="PIN 輸入"]').first();
    await expect(pinInput).toBeVisible();

    // 輸入錯誤 PIN
    await pinInput.fill('9999');
    await page.getByText('以 PIN 預覽角色').first().click();

    // 等待 error feedback 出現（錯誤訊息文字）
    await expect(page.getByText('PIN 或遊戲代碼錯誤')).toBeVisible({ timeout: 5000 });

    // PinUnlock 仍然存在（沒有被 dismiss）
    await expect(pinInput).toBeVisible();
    await expect(page.getByText('輸入角色 PIN').first()).toBeVisible();

    // CharacterCardView 不應該掛載（用 tab bar 作為存在性指標）
    // 注意：PinUnlock 本身會顯示角色名，所以不能用角色名來斷言
    await expect(page.getByText('物品')).not.toBeVisible();
    await expect(page.getByText('遊戲準備中 — 預覽模式')).not.toBeVisible();

    // localStorage 完全乾淨（error path 不應留下任何 dirty state）
    const unlocked = await page.evaluate(
      (id: string) => localStorage.getItem(`character-${id}-unlocked`),
      character._id,
    );
    expect(unlocked).toBeNull();

    const fullAccess = await page.evaluate(
      (id: string) => localStorage.getItem(`character-${id}-fullAccess`),
      character._id,
    );
    expect(fullAccess).toBeNull();
  });

  test('#2.3 no-PIN character → entry page → direct entry (preview)', async ({
    page,
    seed,
  }) => {
    const { gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: false },
    });
    const character = await seed.character({
      gameId,
      name: 'E2E Test Character #2.3',
      hasPinLock: false,
      stats: [{ id: 'stat-hp', name: 'HP', value: 10, maxValue: 100 }],
      items: [
        {
          id: 'item-potion',
          name: '測試藥水',
          type: 'consumable',
          description: '測試用',
          quantity: 1,
        },
      ],
    });

    // ── Phase 1：無 PIN 角色也經過入口頁面 ──
    await page.goto(`/c/${character._id}`);

    // 入口頁面：無 PIN 輸入區，有「直接進入」按鈕和 Game Code 輸入區
    await expect(page.locator('input[aria-label="PIN 輸入"]')).toHaveCount(0);
    const directEntryBtn = page.getByRole('button', { name: '直接進入', exact: true });
    await expect(directEntryBtn).toBeVisible();
    await expect(page.locator('input[aria-label="遊戲代碼輸入"]').first()).toBeVisible();

    // ── Phase 2：點「直接進入」→ 進入角色卡（預覽模式）──
    await directEntryBtn.click();

    await expect(page.getByRole('heading', { name: 'E2E Test Character #2.3' })).toBeVisible();
    await expect(page.getByRole('button', { name: '資訊', exact: true })).toBeVisible();

    // 預覽模式 banner 應顯示（所有角色統一流程）
    await expect(
      page.getByText('遊戲準備中 — 預覽模式'),
    ).toBeVisible();

    // ── Phase 3：localStorage 記錄 unlocked（不含 fullAccess）──
    const unlocked = await page.evaluate(
      (id: string) => localStorage.getItem(`character-${id}-unlocked`),
      character._id,
    );
    expect(unlocked).toBe('true');

    const fullAccess = await page.evaluate(
      (id: string) => localStorage.getItem(`character-${id}-fullAccess`),
      character._id,
    );
    expect(fullAccess).toBeNull();
  });
});
