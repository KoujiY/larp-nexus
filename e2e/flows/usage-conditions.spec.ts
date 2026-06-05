/**
 * Feature 3 — 使用條件（成本型前置條件）
 *
 * 聚焦 happy-path + 條件守門，驗證跨層接線（GM 設定 → 玩家端顯示/停用 → 提交扣除）：
 * - 條件達標：可使用 → 成本（MP）在 runtime 被扣除
 * - 條件未達：詳情可開啟、「使用」按鈕停用且顯示「未滿足使用條件」
 * - 「使用條件」區塊以直覺寫法呈現（消耗型 `8MP`，無「消耗」標籤）
 *
 * 純邏輯（扣除計算、欄位保留、依名加總）已由單元測試覆蓋；此處驗證整合接線。
 *
 * 注意：全程 active game，需 seed characterRuntime + gameRuntime；URL 為 /c/{characterId}。
 */

import { test, expect } from '../fixtures';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';

const COST_SKILL = {
  id: 'skill-firebolt',
  name: '火焰彈',
  description: '消耗魔力施放',
  checkType: 'none' as const,
  effects: [],
  // 成本：MP ≥ 8 且使用後扣 8
  usageConditions: [{ type: 'stat' as const, statName: '魔力值', value: 8, consume: true }],
};

test.describe('Feature 3 — Usage Conditions', () => {
  // ────────────────────────────────────────────────────────────
  // Happy path：條件達標 → 使用成功 → MP 成本被扣除
  // ────────────────────────────────────────────────────────────
  test('condition met: skill usable and MP cost is deducted', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    const stats = [{ id: 'stat-mp', name: '魔力值', value: 10, maxValue: 100 }];
    const character = await seed.character({
      gameId,
      name: 'E2E 條件角色',
      stats,
      skills: [COST_SKILL],
    });
    const characterId = character._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId,
      name: 'E2E 條件角色',
      stats,
      skills: [COST_SKILL],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);

    // 進入技能 tab → 開啟詳情
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();
    await page.getByText('火焰彈').first().click();

    const dialog = page.getByRole('dialog', { name: '火焰彈' });
    await expect(dialog).toBeVisible();

    // 「使用條件」區塊以直覺寫法呈現（消耗型 = 值+名稱，無「消耗」標籤）
    await expect(dialog.getByText('使用條件')).toBeVisible();
    await expect(dialog.getByText('8魔力值')).toBeVisible();
    await expect(dialog.getByText('消耗', { exact: true })).not.toBeVisible();

    // MP 10 ≥ 8 → 按鈕可用
    const useBtn = dialog.getByRole('button', { name: '使用技能', exact: true });
    await expect(useBtn).toBeEnabled();

    const wsPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${characterId}`,
    });
    await useBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await wsPromise;

    // Runtime：MP 由 10 扣為 2
    const runtimeDocs = await dbQuery('character_runtime', { refId: characterId });
    expect(runtimeDocs.length).toBe(1);
    const mp = (runtimeDocs[0].stats as Array<{ name: string; value: number }>)
      .find((s) => s.name === '魔力值');
    expect(mp!.value).toBe(2);

    // Baseline 不受影響（隔離）
    const baselineDocs = await dbQuery('characters', { _id: characterId });
    const baselineMp = (baselineDocs[0].stats as Array<{ name: string; value: number }>)
      .find((s) => s.name === '魔力值');
    expect(baselineMp!.value).toBe(10);
  });

  // ────────────────────────────────────────────────────────────
  // 條件未達：卡片仍可開啟，但「使用」按鈕停用並顯示原因
  // ────────────────────────────────────────────────────────────
  test('condition unmet: card opens but use button is disabled with reason', async ({
    page,
    seed,
    asPlayer,
  }) => {
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // MP 僅 5 < 8 → 不滿足
    const stats = [{ id: 'stat-mp', name: '魔力值', value: 5, maxValue: 100 }];
    const character = await seed.character({
      gameId,
      name: 'E2E 不足角色',
      stats,
      skills: [COST_SKILL],
    });
    const characterId = character._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId,
      name: 'E2E 不足角色',
      stats,
      skills: [COST_SKILL],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);

    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();

    // 卡片仍可點開（條件不足不應阻止開啟詳情）
    await page.getByText('火焰彈').first().click();
    const dialog = page.getByRole('dialog', { name: '火焰彈' });
    await expect(dialog).toBeVisible();

    // 使用按鈕停用，且文字含「未滿足使用條件」（精簡提示，不列完整條件）
    const useBtn = dialog.getByRole('button', { name: /使用技能/ });
    await expect(useBtn).toBeDisabled();
    await expect(useBtn).toContainText('未滿足使用條件');
  });
});
