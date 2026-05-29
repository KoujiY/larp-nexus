/**
 * Flow #11 — 隱藏技能 / 物品系統
 *
 * 驗證 GM 側隱藏技能與物品功能的完整生命週期：
 * - 隱藏技能在玩家端不顯示（#11.1）
 * - GM 手動揭露後玩家端即時顯示（#11.2）
 * - GM 手動隱藏後玩家端即時消失（#11.3）
 *
 * @see docs/specs/hidden-skills-items.md
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';

// ─── Tests ───────────────────────────────────────────────

test.describe('Flow #11 — Hidden Skills / Items', () => {

  // ─── #11.1 GM 設定隱藏技能後，玩家端不顯示 ───
  test('#11.1 hidden skill is not visible to player', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed：active game + 角色（一個隱藏技能 + 一個可見技能） ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({
      gameId,
      name: '魔法師',
      skills: [
        {
          id: 'skill-hidden',
          name: '暗黑魔法',
          description: '隱藏的黑魔法技能',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: true,
        },
        {
          id: 'skill-visible',
          name: '火球術',
          description: '可見的火球術',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: false,
        },
      ],
    });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '魔法師',
      skills: [
        {
          id: 'skill-hidden',
          name: '暗黑魔法',
          description: '隱藏的黑魔法技能',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: true,
        },
        {
          id: 'skill-visible',
          name: '火球術',
          description: '可見的火球術',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: false,
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Dual context ──
    const { playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // ── Player 載入角色頁面 ──
    await playerPage.goto(`/c/${charA._id}`);
    await expect(playerPage.getByRole('heading', { name: '魔法師' })).toBeVisible();

    // 切換到技能 tab
    const nav = playerPage.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();

    // 隱藏技能不可見，可見技能可見
    // 用 heading role 精準定位技能名稱，避免與描述文字（如「可見的火球術」）的子字串衝突
    await expect(playerPage.getByRole('heading', { name: '火球術' })).toBeVisible();
    await expect(playerPage.getByRole('heading', { name: '暗黑魔法' })).not.toBeVisible();

    // ── DB 驗證：characterRuntime 中技能 isHidden 為 true ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const charRuntime = charRuntimes[0] as Record<string, unknown>;
    const skills = charRuntime.skills as Array<Record<string, unknown>>;
    const hiddenSkill = skills.find(s => s.id === 'skill-hidden');
    expect(hiddenSkill!.isHidden).toBe(true);
  });

  // ─── #11.2 GM 手動揭露後，玩家端即時顯示 ───
  test('#11.2 GM reveal skill — player sees it in real-time', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed：active game + 角色（一個隱藏技能） ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({
      gameId,
      name: '刺客',
      skills: [{
        id: 'skill-shadow-step',
        name: '暗影步',
        description: '隱藏的刺客技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        isHidden: true,
      }],
    });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '刺客',
      skills: [{
        id: 'skill-shadow-step',
        name: '暗影步',
        description: '隱藏的刺客技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        isHidden: true,
      }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // Player 先載入頁面（規則 30：WS listener 之前完成頁面載入）
    await playerPage.goto(`/c/${charA._id}`);
    await expect(playerPage.getByRole('heading', { name: '刺客' })).toBeVisible();

    // 設定 WS listener（在 GM 操作之前）
    const wsPromise = waitForWebSocketEvent(playerPage, {
      event: 'skill.revealed',
      channel: `private-character-${charA._id}`,
      timeout: 30000,
    });

    // ── GM 前往角色編輯頁，切到技能 tab ──
    await gmPage.goto(`/games/${gameId}/characters/${charA._id}`);
    await expect(gmPage.getByRole('heading', { name: '刺客' })).toBeVisible();

    // 切換到技能 tab
    await gmPage.getByRole('tab', { name: '技能' }).click();

    // 找到隱藏技能卡片（含「隱藏中」badge），點擊「揭露」按鈕
    const hiddenCard = gmPage.locator('.bg-card').filter({ hasText: '暗影步' }).first();
    await expect(hiddenCard).toBeVisible();
    await expect(hiddenCard.getByText('隱藏中')).toBeVisible();

    // 點擊「揭露」按鈕（Eye icon，aria-label='揭露'）
    await hiddenCard.getByRole('button', { name: '揭露' }).click();

    // ── GM toast 驗證 ──
    await waitForToast(gmPage, '技能已揭露');

    // ── Player WS 事件驗證 ──
    const wsEvent = await wsPromise as Record<string, unknown>;
    const payload = wsEvent.payload as Record<string, unknown>;
    expect(payload.skillId).toBe('skill-shadow-step');
    expect(payload.skillName).toBe('暗影步');
    expect(payload.revealType).toBe('manual');

    // ── DB 驗證：isHidden 現為 false ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const charRuntime = charRuntimes[0] as Record<string, unknown>;
    const skills = charRuntime.skills as Array<Record<string, unknown>>;
    const skill = skills.find(s => s.id === 'skill-shadow-step');
    expect(skill!.isHidden).toBe(false);
  });

  // ─── #11.3 GM 手動隱藏後，玩家端即時消失 ───
  test('#11.3 GM hide skill — player loses visibility in real-time', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed：active game + 角色（一個可見技能） ──
    const { gmUserId, gameId } = await seed.gmWithGame({
      gameOverrides: { isActive: true },
    });
    const charA = await seed.character({
      gameId,
      name: '戰士',
      skills: [{
        id: 'skill-battle-cry',
        name: '戰吼',
        description: '可見的戰士技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        isHidden: false,
      }],
    });
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '戰士',
      skills: [{
        id: 'skill-battle-cry',
        name: '戰吼',
        description: '可見的戰士技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        isHidden: false,
      }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId,
      characterId: charA._id,
    });

    // Player 先載入頁面（規則 30：WS listener 之前完成頁面載入）
    await playerPage.goto(`/c/${charA._id}`);
    await expect(playerPage.getByRole('heading', { name: '戰士' })).toBeVisible();

    // 設定 WS listener（在 GM 操作之前）
    const wsPromise = waitForWebSocketEvent(playerPage, {
      event: 'skill.hidden',
      channel: `private-character-${charA._id}`,
      timeout: 30000,
    });

    // ── GM 前往角色編輯頁，切到技能 tab ──
    await gmPage.goto(`/games/${gameId}/characters/${charA._id}`);
    await expect(gmPage.getByRole('heading', { name: '戰士' })).toBeVisible();

    // 切換到技能 tab
    await gmPage.getByRole('tab', { name: '技能' }).click();

    // 找到可見技能卡片，點擊「隱藏」按鈕
    const visibleCard = gmPage.locator('.bg-card').filter({ hasText: '戰吼' }).first();
    await expect(visibleCard).toBeVisible();

    // 點擊「隱藏」按鈕（EyeOff icon，aria-label='隱藏'）
    await visibleCard.getByRole('button', { name: '隱藏' }).click();

    // ── GM toast 驗證 ──
    await waitForToast(gmPage, '技能已隱藏');

    // ── Player WS 事件驗證 ──
    const wsEvent = await wsPromise as Record<string, unknown>;
    const payload = wsEvent.payload as Record<string, unknown>;
    expect(payload.skillId).toBe('skill-battle-cry');
    expect(payload.skillName).toBe('戰吼');
    expect(payload.hideType).toBe('manual');

    // ── DB 驗證：isHidden 現為 true ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const charRuntime = charRuntimes[0] as Record<string, unknown>;
    const skills = charRuntime.skills as Array<Record<string, unknown>>;
    const skill = skills.find(s => s.id === 'skill-battle-cry');
    expect(skill!.isHidden).toBe(true);
  });

});
