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
import { setupDualPlayerContext } from '../helpers/setup-dual-player-context';

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

  // ─── #11.4 items_viewed via showcase → 隱藏技能自動揭露 ───
  test('#11.4 items_viewed — showcase triggers hidden skill auto-reveal', async ({
    browser,
    seed,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '技能自動揭露測試（items_viewed）',
      isActive: true,
    });
    const gameId = game._id;

    // 角色 A（探員）：有道具「線索」可供展示
    const charA = await seed.character({
      gameId,
      name: '探員',
      items: [
        { id: 'item-clue', name: '線索', description: '一條線索', type: 'tool', quantity: 1 },
      ],
    });

    // 角色 B（線人）：有隱藏技能，條件為看到「線索」即自動揭露
    const charB = await seed.character({
      gameId,
      name: '線人',
      skills: [{
        id: 'skill-insight',
        name: '洞察',
        description: '隱藏技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        isHidden: true,
        autoRevealCondition: {
          type: 'items_viewed',
          itemIds: ['item-clue'],
          matchLogic: 'and',
        },
      }],
    });

    // Runtime 層（active game 必須同時 seed baseline + runtime）
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '探員',
      items: [
        { id: 'item-clue', name: '線索', description: '一條線索', type: 'tool', quantity: 1 },
      ],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '線人',
      skills: [{
        id: 'skill-insight',
        name: '洞察',
        description: '隱藏技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        isHidden: true,
        autoRevealCondition: {
          type: 'items_viewed',
          itemIds: ['item-clue'],
          matchLogic: 'and',
        },
      }],
      viewedItems: [],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── 雙 Player context ──
    const { pageA, pageB, ctxA, ctxB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // Player B 先載入頁面（準備接收 WS 事件）
      await pageB.goto(`/c/${charB._id}`);
      await expect(pageB.getByRole('heading', { name: '線人' })).toBeVisible();

      // 設定 WS 監聽（在 Player A 操作之前，filter by skillId 避免並行測試干擾）
      const wsRevealPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.revealed',
        filter: { path: 'payload.skillId', value: 'skill-insight' },
        timeout: 30000,
      });

      // Player A 載入 + 切換到物品 tab
      await pageA.goto(`/c/${charA._id}`);
      await expect(pageA.getByRole('heading', { name: '探員' })).toBeVisible();
      const navA = pageA.getByRole('navigation');
      await navA.getByRole('button', { name: '物品' }).click();

      // 打開道具詳情 → 選擇目標 → 展示
      await pageA.getByText('線索', { exact: true }).click();
      // 等待道具詳情 dialog 出現
      await expect(pageA.getByText('一條線索', { exact: true })).toBeVisible();

      // 選擇目標角色
      await pageA.getByRole('combobox').click();
      await pageA.getByRole('option', { name: '線人' }).click();

      // 點擊展示
      await pageA.getByRole('button', { name: '展示' }).click();

      // ── 驗證 WS 事件（skill.revealed，revealType=auto）──
      const revealEvent = await wsRevealPromise as Record<string, unknown>;
      const payload = revealEvent.payload as Record<string, unknown>;
      expect(payload.skillId).toBe('skill-insight');
      expect(payload.revealType).toBe('auto');

      // ── DB 驗證：B 的技能 isHidden 已變為 false ──
      const charRuntimes = await dbQuery('character_runtime', { refId: charB._id });
      const runtimeB = charRuntimes[0] as Record<string, unknown>;
      const skills = runtimeB.skills as Array<Record<string, unknown>>;
      const insightSkill = skills.find(s => s.id === 'skill-insight');
      expect(insightSkill!.isHidden).toBe(false);

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #11.5 skill_used → 揭露同角色自身的隱藏物品 ───
  test('#11.5 skill_used — using a skill auto-reveals a hidden item on the same character', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '技能使用自動揭露物品測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色：法師，帶一個觸發用技能 + 一個隱藏物品（條件 skill_used）
    const character = await seed.character({
      gameId,
      name: '法師',
      skills: [{
        id: 'skill-trigger',
        name: '引動術',
        description: '觸發用技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        effects: [],
      }],
      items: [{
        id: 'item-secret',
        name: '密匣',
        description: '隱藏物品',
        type: 'tool',
        quantity: 1,
        isTransferable: false,
        isHidden: true,
        autoRevealCondition: {
          type: 'skill_used',
          skillIds: ['skill-trigger'],
          matchLogic: 'and',
        },
      }],
    });
    const characterId = character._id;

    // Runtime 層（skills + items 含隱藏物品的 autoRevealCondition）
    await seed.characterRuntime({
      refId: characterId,
      gameId,
      name: '法師',
      skills: [{
        id: 'skill-trigger',
        name: '引動術',
        description: '觸發用技能',
        checkType: 'none',
        usageCount: 0,
        usageLimit: 0,
        cooldown: 0,
        tags: [],
        effects: [],
      }],
      items: [{
        id: 'item-secret',
        name: '密匣',
        description: '隱藏物品',
        type: 'tool',
        quantity: 1,
        isTransferable: false,
        isHidden: true,
        autoRevealCondition: {
          type: 'skill_used',
          skillIds: ['skill-trigger'],
          matchLogic: 'and',
        },
      }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── Player 登入並導航 ──
    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);
    await expect(page.getByRole('heading', { name: '法師' })).toBeVisible();

    // 設定 WS 監聽（在觸發動作之前建立，避免 race condition）
    const wsRevealPromise = waitForWebSocketEvent(page, {
      event: 'item.revealed',
      filter: { path: 'payload.itemId', value: 'item-secret' },
      timeout: 30000,
    });

    // 切換到技能 tab → 點擊「引動術」卡片 → 確認 dialog → 使用技能
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();

    await page.getByText('引動術').first().click();
    const skillDialog = page.getByRole('dialog', { name: '引動術' });
    await expect(skillDialog).toBeVisible();

    await skillDialog.getByRole('button', { name: '使用技能' }).click();

    // ── 驗證 WS 事件（item.revealed，revealType=auto）──
    const revealEvent = await wsRevealPromise as Record<string, unknown>;
    const payload = revealEvent.payload as Record<string, unknown>;
    expect(payload.itemId).toBe('item-secret');
    expect(payload.revealType).toBe('auto');

    // ── DB 驗證：物品 isHidden 已變為 false ──
    const charRuntimes = await dbQuery('character_runtime', { refId: characterId });
    const runtime = charRuntimes[0] as Record<string, unknown>;
    const items = runtime.items as Array<Record<string, unknown>>;
    const secretItem = items.find(i => i.id === 'item-secret');
    expect(secretItem!.isHidden).toBe(false);
  });

  // ─── #11.6 skills_revealed 同層連鎖：GM 揭露技能 A → 技能 B 連鎖揭露 ───
  test('#11.6 skills_revealed chain — GM reveals skill A triggers skill B auto-reveal', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '技能連鎖揭露測試（skills_revealed）',
      isActive: true,
    });
    const gameId = game._id;

    // 角色（影者）：技能 A（前置）+ 技能 B（條件：A 已揭露則自動揭露）
    const charA = await seed.character({
      gameId,
      name: '影者',
      skills: [
        {
          id: 'skill-a',
          name: '甲術',
          description: '前置技能',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: true,
        },
        {
          id: 'skill-b',
          name: '乙術',
          description: '連鎖技能',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: true,
          autoRevealCondition: {
            type: 'skills_revealed',
            skillIds: ['skill-a'],
            matchLogic: 'and',
          },
        },
      ],
    });

    // Runtime 層（兩個技能皆含 isHidden + 技能 B 含 autoRevealCondition）
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '影者',
      skills: [
        {
          id: 'skill-a',
          name: '甲術',
          description: '前置技能',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: true,
        },
        {
          id: 'skill-b',
          name: '乙術',
          description: '連鎖技能',
          checkType: 'none',
          usageCount: 0,
          usageLimit: 0,
          cooldown: 0,
          tags: [],
          isHidden: true,
          autoRevealCondition: {
            type: 'skills_revealed',
            skillIds: ['skill-a'],
            matchLogic: 'and',
          },
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── GM + Player dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId: gm._id,
      characterId: charA._id,
    });

    // Player 先載入頁面（準備接收 WS 事件）
    await playerPage.goto(`/c/${charA._id}`);
    await expect(playerPage.getByRole('heading', { name: '影者' })).toBeVisible();

    // 設定 WS 監聽（連鎖揭露的技能 B，在 GM 操作之前設定）
    const wsChainPromise = waitForWebSocketEvent(playerPage, {
      event: 'skill.revealed',
      filter: { path: 'payload.skillId', value: 'skill-b' },
      timeout: 30000,
    });

    // ── GM 前往角色編輯頁，切到技能 tab，手動揭露技能 A ──
    await gmPage.goto(`/games/${gameId}/characters/${charA._id}`);
    await expect(gmPage.getByRole('heading', { name: '影者' })).toBeVisible();

    // 切換到技能 tab
    await gmPage.getByRole('tab', { name: '技能' }).click();

    // 找到技能 A 卡片並點擊「揭露」按鈕
    const skillACard = gmPage.locator('.bg-card').filter({ hasText: '甲術' }).first();
    await expect(skillACard).toBeVisible();
    await skillACard.getByRole('button', { name: '揭露' }).click();

    // ── 驗證 WS 連鎖事件（技能 B 被自動揭露）──
    const chainEvent = await wsChainPromise as Record<string, unknown>;
    const payload = chainEvent.payload as Record<string, unknown>;
    expect(payload.skillId).toBe('skill-b');
    expect(payload.revealType).toBe('auto');

    // ── DB 驗證：技能 A 與技能 B 的 isHidden 均已變為 false ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const runtime = charRuntimes[0] as Record<string, unknown>;
    const skills = runtime.skills as Array<Record<string, unknown>>;

    const skillA = skills.find(s => s.id === 'skill-a');
    expect(skillA!.isHidden).toBe(false);

    const skillB = skills.find(s => s.id === 'skill-b');
    expect(skillB!.isHidden).toBe(false);
  });

});
