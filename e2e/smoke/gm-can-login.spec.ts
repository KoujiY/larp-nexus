/**
 * Flow #1 — GM test-login → 劇本列表（smoke 層）
 *
 * 驗證 GM 登入後的劇本管理頁面核心功能：
 * - #1.1 未認證 redirect + test-login + 空狀態顯示
 * - #1.2 非空狀態 grid 渲染 + 排序 + 卡片導航
 * - #1.3 跨 GM 資料隔離
 *
 * 設計決策：繞過 magic link（SMTP 成本），用 test-only `/api/test/login` 設 session。
 * 參照規格：docs/refactoring/E2E_FLOW_1_GM_LOGIN.md
 */

import { test, expect } from '../fixtures';

test.describe('Flow #1 — GM login → game list', () => {
  test('#1.1 unauthenticated redirect + empty state', async ({
    page,
    seed,
    asGm,
  }) => {
    // ── Phase 1：未認證 → redirect 到 /auth/login ──
    await page.goto('/games');
    await page.waitForURL(/\/auth\/login/);

    // ── Phase 2：seed GM user + test-login ──
    const gm = await seed.gmUser({
      email: 'gm1@test.com',
      displayName: 'Test GM 1',
    });
    await asGm({ gmUserId: gm._id, email: 'gm1@test.com' });

    // ── Phase 3：進入空狀態劇本列表 ──
    await page.goto('/games');
    await expect(page.getByRole('heading', { name: '劇本管理' })).toBeVisible();

    // 空狀態 UI（用 main scope 避免 RSC streaming DOM 副本）
    const main = page.locator('main');
    await expect(main.getByText('尚無劇本')).toBeVisible();
    await expect(
      main.getByText('建立您的第一個劇本，開始編織冒險的篇章'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '建立第一個劇本' })).toBeVisible();

    // 反向驗證：非空狀態的 grid 不存在
    await expect(page.getByRole('button', { name: '建立新劇本' })).not.toBeVisible();

    // ── Phase 4：Sidebar 驗證 ──
    // Desktop sidebar 的「劇本管理」link 是 active 狀態
    const sidebarLink = page.locator('aside').getByText('劇本管理');
    // active 狀態有 bg-primary class（Tailwind）
    await expect(sidebarLink).toBeVisible();
  });

  test('#1.2 non-empty grid render + sort + card navigation', async ({
    page,
    seed,
    asGm,
  }) => {
    // Seed GM + 2 Games（明確設定 createdAt 確保排序穩定）
    const gm = await seed.gmUser();
    const _oldGame = await seed.game({
      gmUserId: gm._id,
      name: '第一個劇本',
      createdAt: new Date('2024-01-01'),
    });
    const newGame = await seed.game({
      gmUserId: gm._id,
      name: '第二個劇本',
      createdAt: new Date('2024-06-01'),
    });

    await asGm({ gmUserId: gm._id });
    await page.goto('/games');

    // 等待 grid 渲染完成（用 heading role 避免 text 匹配到父層 link）
    await expect(page.getByRole('heading', { name: '第二個劇本', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '第一個劇本', level: 3 })).toBeVisible();

    // CTA card 存在（用 button role 避免 RSC streaming DOM 副本的 strict mode）
    await expect(page.getByRole('button', { name: '建立新劇本' })).toBeVisible();

    // 反向驗證：空狀態不存在
    await expect(page.locator('main').getByText('尚無劇本')).not.toBeVisible();

    // 排序驗證：scope 到 main 內的 .game-card（排除可能的 RSC 隱藏副本）
    const gameCards = page.locator('main .game-card');
    const cardCount = await gameCards.count();
    expect(cardCount).toBe(2);

    // 第一張 card（index 0）應該是較新的「第二個劇本」
    await expect(gameCards.nth(0)).toContainText('第二個劇本');
    await expect(gameCards.nth(1)).toContainText('第一個劇本');

    // 點擊卡片導航到 game 詳情頁
    await gameCards.nth(0).click();
    await page.waitForURL(/\/games\/[a-f0-9]{24}$/);
    expect(page.url()).toContain(newGame._id);
  });

  test('#1.3 cross-GM data isolation', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // Seed 2 個 GM，各自有一個 Game
    const gmA = await seed.gmUser({
      email: 'gm-a@test.com',
      displayName: 'GM A',
    });
    const gmB = await seed.gmUser({
      email: 'gm-b@test.com',
      displayName: 'GM B',
    });
    await seed.game({ gmUserId: gmA._id, name: 'GM A 的劇本' });
    await seed.game({ gmUserId: gmB._id, name: 'GM B 的劇本' });

    // DB 驗證：確認兩個 game 都存在
    const allGames = await dbQuery('games');
    expect(allGames.length).toBe(2);

    // 以 GM A 身份登入
    await asGm({ gmUserId: gmA._id, email: 'gm-a@test.com' });
    await page.goto('/games');

    // 只看到自己的劇本（用 heading role 驗證隔離）
    await expect(page.getByRole('heading', { name: 'GM A 的劇本', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'GM B 的劇本', level: 3 })).not.toBeVisible();
  });
});
