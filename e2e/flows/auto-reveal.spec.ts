/**
 * Flow #10 — 自動揭露（Auto-Reveal）
 *
 * 驗證自動揭露系統的 runtime 行為：
 * - items_viewed 條件：展示道具 → secret 自動揭露（#10.1）
 * - items_acquired 條件：道具轉移 → task 自動揭露（#10.2）
 * - secrets_revealed 鏈式揭露：GM 手動揭露 secret → task 自動揭露（#10.3）
 * - AND/OR matchLogic：AND 需全部滿足、OR 任一即觸發（#10.4）
 * - 條件編輯器 UI：GM 設定/修改 auto-reveal 條件（#10.5）
 *
 * @see docs/refactoring/E2E_FLOW_10_AUTO_REVEAL.md
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { clickSaveBar } from '../helpers/click-save-bar';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';
import { setupDualPlayerContext } from '../helpers/setup-dual-player-context';

// ─── Tests ───────────────────────────────────────────────

test.describe('Flow #10 — Auto-Reveal', () => {

  // ─── #10.1 items_viewed → secret 自動揭露 ───
  test('#10.1 items_viewed — showcase triggers secret auto-reveal', async ({
    browser,
    seed,
    dbQuery,
  }) => {
    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '自動揭露測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色 A：有道具「藏寶圖」
    const charA = await seed.character({
      gameId,
      name: '探險家',
      items: [
        { id: 'item-map', name: '藏寶圖', description: '一張古老的藏寶圖', type: 'tool', quantity: 1 },
      ],
    });

    // 角色 B：有 secret，條件為 items_viewed（看到藏寶圖即揭露）
    const charB = await seed.character({
      gameId,
      name: '盜賊',
      secretInfo: {
        secrets: [{
          id: 'secret-treasure',
          title: '寶藏位置',
          content: '寶藏在北方森林',
          isRevealed: false,
          autoRevealCondition: {
            type: 'items_viewed',
            itemIds: ['item-map'],
            matchLogic: 'and',
          },
        }],
      },
    });

    // Runtime 層
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '探險家',
      items: [
        { id: 'item-map', name: '藏寶圖', description: '一張古老的藏寶圖', type: 'tool', quantity: 1 },
      ],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '盜賊',
      secretInfo: {
        secrets: [{
          id: 'secret-treasure',
          title: '寶藏位置',
          content: '寶藏在北方森林',
          isRevealed: false,
          autoRevealCondition: {
            type: 'items_viewed',
            itemIds: ['item-map'],
            matchLogic: 'and',
          },
        }],
      },
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
      await expect(pageB.getByRole('heading', { name: '盜賊' })).toBeVisible();

      // 設定 WS 監聽（secret.revealed）
      const wsRevealPromise = waitForWebSocketEvent(pageB, {
        event: 'secret.revealed',
      });

      // Player A 載入 + 切換到物品 tab
      await pageA.goto(`/c/${charA._id}`);
      await expect(pageA.getByRole('heading', { name: '探險家' })).toBeVisible();
      const navA = pageA.getByRole('navigation');
      await navA.getByRole('button', { name: '物品' }).click();

      // 打開道具詳情 → 選擇目標 → 展示
      await pageA.getByText('藏寶圖', { exact: true }).click();
      // 等待道具詳情 dialog 出現
      await expect(pageA.getByText('一張古老的藏寶圖', { exact: true })).toBeVisible();

      // 選擇目標角色
      await pageA.getByRole('combobox').click();
      await pageA.getByRole('option', { name: '盜賊' }).click();

      // 點擊展示
      await pageA.getByRole('button', { name: '展示' }).click();

      // ── 驗證 WS 事件 ──
      const revealEvent = await wsRevealPromise as Record<string, unknown>;
      const payload = revealEvent.payload as Record<string, unknown>;
      expect(payload.secretId).toBe('secret-treasure');
      expect(payload.secretTitle).toBe('寶藏位置');
      expect(payload.revealType).toBe('auto');
      expect(payload.triggerReason).toBe('滿足道具檢視條件');

      // ── DB 驗證：B 的 viewedItems 已記錄 ──
      const charRuntimes = await dbQuery('character_runtime', { refId: charB._id });
      const runtimeB = charRuntimes[0] as Record<string, unknown>;
      const viewedItems = runtimeB.viewedItems as Array<Record<string, unknown>>;
      const viewed = viewedItems.find(v => v.itemId === 'item-map');
      expect(viewed).toBeTruthy();

      // ── DB 驗證：B 的 secret 已揭露 ──
      const secretInfo = runtimeB.secretInfo as Record<string, unknown>;
      const secrets = secretInfo.secrets as Array<Record<string, unknown>>;
      const secret = secrets.find(s => s.id === 'secret-treasure');
      expect(secret!.isRevealed).toBe(true);
      expect(secret!.revealedAt).toBeTruthy();

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #10.3 secrets_revealed 鏈式揭露（secret → task） ───
  test('#10.3 secrets_revealed chain — GM manual reveal triggers task auto-reveal', async ({
    seed,
    asGmAndPlayer,
    dbQuery,
  }) => {
    // 雙 context + 多步驟 GM UI 操作需要較長時間
    test.setTimeout(60000);
    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '鏈式揭露測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色 A：有 secret（GM 手動揭露）+ hidden task（secrets_revealed 條件）
    const charA = await seed.character({
      gameId,
      name: '王子',
      secretInfo: {
        secrets: [{
          id: 'secret-identity',
          title: '真實身份',
          content: '你是失蹤的王子',
          isRevealed: false,
        }],
      },
      tasks: [{
        id: 'task-reclaim',
        title: '奪回王位',
        description: '知道身份後的使命',
        isHidden: true,
        isRevealed: false,
        autoRevealCondition: {
          type: 'secrets_revealed',
          secretIds: ['secret-identity'],
          matchLogic: 'and',
        },
      }],
    });

    // Runtime 層
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '王子',
      secretInfo: {
        secrets: [{
          id: 'secret-identity',
          title: '真實身份',
          content: '你是失蹤的王子',
          isRevealed: false,
        }],
      },
      tasks: [{
        id: 'task-reclaim',
        title: '奪回王位',
        description: '知道身份後的使命',
        isHidden: true,
        isRevealed: false,
        autoRevealCondition: {
          type: 'secrets_revealed',
          secretIds: ['secret-identity'],
          matchLogic: 'and',
        },
      }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── GM + Player dual context ──
    const { gmPage, playerPage } = await asGmAndPlayer({
      gmUserId: gm._id,
      characterId: charA._id,
    });

    // Player 先載入（準備接收 WS）
    await playerPage.goto(`/c/${charA._id}`);
    await expect(playerPage.getByRole('heading', { name: '王子' })).toBeVisible();

    // 設定 WS 監聽：task.revealed（鏈式自動揭露）
    // 注意：GM 手動揭露 secret 只會觸發 role.updated，不會發 secret.revealed 事件
    // 使用較長 timeout 因為 GM UI 操作（navigate + dialog + save）需要 ~20s
    const wsTaskPromise = waitForWebSocketEvent(playerPage, {
      event: 'task.revealed',
      timeout: 45000,
    });

    // ══════════════════════════════════════
    // GM 手動揭露 secret
    // ══════════════════════════════════════
    await gmPage.goto(`/games/${gameId}/characters/${charA._id}`);
    // 等待頁面載入
    await expect(gmPage.getByRole('heading', { name: '王子' })).toBeVisible();

    // 切換到「隱藏資訊」分頁
    await gmPage.getByRole('tab', { name: '隱藏資訊' }).click();

    // 找到「真實身份」的編輯按鈕
    await gmPage.getByRole('button', { name: '編輯' }).first().click();

    // Secret Edit Dialog 打開
    const secretDialog = gmPage.getByRole('dialog');
    await expect(secretDialog).toBeVisible();

    // 切換「已揭露」開關
    await secretDialog.getByRole('switch').click();
    // 確認開關已切換
    await expect(secretDialog.getByText('✓ 已揭露')).toBeVisible();

    // 確認 dialog
    await secretDialog.getByRole('button', { name: '確認' }).click();
    await expect(secretDialog).not.toBeVisible({ timeout: 3000 });

    // 等待 StickySaveBar 出現並點擊（evaluate retry loop — 方法 3）
    await clickSaveBar(gmPage);

    // 等待儲存成功 toast（規則 12：用專屬片段匹配聚合 toast）
    await waitForToast(gmPage, '個分頁的變更');

    // ── 驗證 WS 事件：鏈式自動揭露 ──
    const taskEvent = await wsTaskPromise as Record<string, unknown>;
    const taskPayload = taskEvent.payload as Record<string, unknown> ?? taskEvent;
    expect(taskPayload.taskId).toBe('task-reclaim');
    expect(taskPayload.taskTitle).toBe('奪回王位');
    expect(taskPayload.revealType).toBe('auto');
    expect(taskPayload.triggerReason).toBe('滿足隱藏資訊揭露條件');

    // ── DB 驗證 ──
    const charRuntimes = await dbQuery('character_runtime', { refId: charA._id });
    const runtime = charRuntimes[0] as Record<string, unknown>;

    // secret 已揭露（手動）
    const secretInfo = runtime.secretInfo as Record<string, unknown>;
    const secrets = secretInfo.secrets as Array<Record<string, unknown>>;
    const secret = secrets.find(s => s.id === 'secret-identity');
    expect(secret!.isRevealed).toBe(true);

    // task 已揭露（鏈式自動）
    const tasks = runtime.tasks as Array<Record<string, unknown>>;
    const task = tasks.find(t => t.id === 'task-reclaim');
    expect(task!.isRevealed).toBe(true);
    expect(task!.revealedAt).toBeTruthy();
    // task 的 isHidden 不變
    expect(task!.isHidden).toBe(true);
  });

  // ─── #10.2 items_acquired → task 自動揭露（道具轉移） ───
  test('#10.2 items_acquired — transfer triggers task auto-reveal', async ({
    browser,
    seed,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '道具轉移測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色 A：有可轉移道具「寶劍」
    const charA = await seed.character({
      gameId,
      name: '戰士',
      items: [
        { id: 'item-sword', name: '寶劍', description: '一把鋒利的寶劍', type: 'equipment', quantity: 1, isTransferable: true },
      ],
    });

    // 角色 B：有 hidden task，條件為 items_acquired（獲得寶劍即揭露）
    const charB = await seed.character({
      gameId,
      name: '學徒',
      tasks: [{
        id: 'task-train',
        title: '開始修煉',
        description: '獲得寶劍後的使命',
        isHidden: true,
        isRevealed: false,
        autoRevealCondition: {
          type: 'items_acquired',
          itemIds: ['item-sword'],
          matchLogic: 'and',
        },
      }],
    });

    // Runtime 層
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '戰士',
      items: [
        { id: 'item-sword', name: '寶劍', description: '一把鋒利的寶劍', type: 'equipment', quantity: 1, isTransferable: true },
      ],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '學徒',
      tasks: [{
        id: 'task-train',
        title: '開始修煉',
        description: '獲得寶劍後的使命',
        isHidden: true,
        isRevealed: false,
        autoRevealCondition: {
          type: 'items_acquired',
          itemIds: ['item-sword'],
          matchLogic: 'and',
        },
      }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── 雙 Player context ──
    const { pageA, pageB, ctxA, ctxB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // Player B 先載入頁面（準備接收 WS 事件）
      await pageB.goto(`/c/${charB._id}`);
      await expect(pageB.getByRole('heading', { name: '學徒' })).toBeVisible();

      // 設定 WS 監聽（task.revealed）
      const wsTaskPromise = waitForWebSocketEvent(pageB, {
        event: 'task.revealed',
        timeout: 30000,
      });

      // Player A 載入 + 切換到物品 tab
      await pageA.goto(`/c/${charA._id}`);
      await expect(pageA.getByRole('heading', { name: '戰士' })).toBeVisible();
      const navA = pageA.getByRole('navigation');
      await navA.getByRole('button', { name: '物品' }).click();

      // 打開道具詳情 → 選擇目標 → 轉移
      await pageA.getByText('寶劍', { exact: true }).click();
      await expect(pageA.getByText('一把鋒利的寶劍', { exact: true })).toBeVisible();

      // 選擇目標角色
      await pageA.getByRole('combobox').click();
      await pageA.getByRole('option', { name: '學徒' }).click();

      // 點擊轉移
      await pageA.getByRole('button', { name: '轉移' }).click();

      // ── 驗證 WS 事件 ──
      const taskEvent = await wsTaskPromise as Record<string, unknown>;
      const taskPayload = taskEvent.payload as Record<string, unknown> ?? taskEvent;
      expect(taskPayload.taskId).toBe('task-train');
      expect(taskPayload.taskTitle).toBe('開始修煉');
      expect(taskPayload.revealType).toBe('auto');
      expect(taskPayload.triggerReason).toBe('滿足道具取得條件');

      // ── DB 驗證：B 的 task 已揭露 ──
      const charRuntimes = await dbQuery('character_runtime', { refId: charB._id });
      const runtimeB = charRuntimes[0] as Record<string, unknown>;

      const tasks = runtimeB.tasks as Array<Record<string, unknown>>;
      const task = tasks.find(t => t.id === 'task-train');
      expect(task!.isRevealed).toBe(true);
      expect(task!.revealedAt).toBeTruthy();
      expect(task!.isHidden).toBe(true);

      // B 的 items 應包含寶劍
      const items = runtimeB.items as Array<Record<string, unknown>>;
      const sword = items.find(i => i.id === 'item-sword');
      expect(sword).toBeTruthy();

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #10.4 AND/OR matchLogic ───
  test('#10.4 AND/OR matchLogic — AND needs all items, OR needs any one', async ({
    browser,
    seed,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: 'AND/OR 測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色 A：有兩個道具
    const charA = await seed.character({
      gameId,
      name: '商人',
      items: [
        { id: 'item-key', name: '鑰匙', description: '一把古老的鑰匙', type: 'tool', quantity: 1 },
        { id: 'item-letter', name: '密信', description: '一封密封的信', type: 'consumable', quantity: 1 },
      ],
    });

    // 角色 B：兩個 secret — 一個 AND 條件、一個 OR 條件（都需要看到 item-key + item-letter）
    const charB = await seed.character({
      gameId,
      name: '守衛',
      secretInfo: {
        secrets: [
          {
            id: 'secret-and',
            title: 'AND 秘密',
            content: '需要看到兩個道具才揭露',
            isRevealed: false,
            autoRevealCondition: {
              type: 'items_viewed',
              itemIds: ['item-key', 'item-letter'],
              matchLogic: 'and',
            },
          },
          {
            id: 'secret-or',
            title: 'OR 秘密',
            content: '看到任一道具就揭露',
            isRevealed: false,
            autoRevealCondition: {
              type: 'items_viewed',
              itemIds: ['item-key', 'item-letter'],
              matchLogic: 'or',
            },
          },
        ],
      },
    });

    // Runtime 層
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '商人',
      items: [
        { id: 'item-key', name: '鑰匙', description: '一把古老的鑰匙', type: 'tool', quantity: 1 },
        { id: 'item-letter', name: '密信', description: '一封密封的信', type: 'consumable', quantity: 1 },
      ],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '守衛',
      secretInfo: {
        secrets: [
          {
            id: 'secret-and',
            title: 'AND 秘密',
            content: '需要看到兩個道具才揭露',
            isRevealed: false,
            autoRevealCondition: {
              type: 'items_viewed',
              itemIds: ['item-key', 'item-letter'],
              matchLogic: 'and',
            },
          },
          {
            id: 'secret-or',
            title: 'OR 秘密',
            content: '看到任一道具就揭露',
            isRevealed: false,
            autoRevealCondition: {
              type: 'items_viewed',
              itemIds: ['item-key', 'item-letter'],
              matchLogic: 'or',
            },
          },
        ],
      },
      viewedItems: [],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── 雙 Player context ──
    const { pageA, pageB, ctxA, ctxB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // Player B 先載入頁面
      await pageB.goto(`/c/${charB._id}`);
      await expect(pageB.getByRole('heading', { name: '守衛' })).toBeVisible();

      // 設定 WS 監聽（只有 OR 秘密會揭露）
      const wsRevealPromise = waitForWebSocketEvent(pageB, {
        event: 'secret.revealed',
        timeout: 30000,
      });

      // Player A 載入 + 切換到物品 tab
      await pageA.goto(`/c/${charA._id}`);
      await expect(pageA.getByRole('heading', { name: '商人' })).toBeVisible();
      const navA = pageA.getByRole('navigation');
      await navA.getByRole('button', { name: '物品' }).click();

      // ══════════════════════════════════════
      // 展示「鑰匙」（只展示一個道具）
      // → OR 條件滿足（任一即可），AND 條件不滿足（需要兩個）
      // ══════════════════════════════════════
      await pageA.getByText('鑰匙', { exact: true }).click();
      await expect(pageA.getByText('一把古老的鑰匙', { exact: true })).toBeVisible();

      await pageA.getByRole('combobox').click();
      await pageA.getByRole('option', { name: '守衛' }).click();
      await pageA.getByRole('button', { name: '展示' }).click();

      // ── 驗證：OR 秘密揭露 ──
      const revealEvent = await wsRevealPromise as Record<string, unknown>;
      const payload = revealEvent.payload as Record<string, unknown> ?? revealEvent;
      expect(payload.secretId).toBe('secret-or');
      expect(payload.secretTitle).toBe('OR 秘密');
      expect(payload.revealType).toBe('auto');

      // ── DB 驗證 ──
      const charRuntimes = await dbQuery('character_runtime', { refId: charB._id });
      const runtimeB = charRuntimes[0] as Record<string, unknown>;
      const secretInfo = runtimeB.secretInfo as Record<string, unknown>;
      const secrets = secretInfo.secrets as Array<Record<string, unknown>>;

      // OR 秘密：已揭露（只看了一個道具就滿足）
      const orSecret = secrets.find(s => s.id === 'secret-or');
      expect(orSecret!.isRevealed).toBe(true);
      expect(orSecret!.revealedAt).toBeTruthy();

      // AND 秘密：未揭露（還差一個道具未展示）
      const andSecret = secrets.find(s => s.id === 'secret-and');
      expect(andSecret!.isRevealed).toBe(false);

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #10.5 條件編輯器 UI ───
  test('#10.5 condition editor UI — GM sets auto-reveal condition on secret', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    test.setTimeout(60000);

    // ── Seed ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '條件編輯器測試',
      isActive: true,
    });
    const gameId = game._id;

    // 角色：有道具 + secret（無自動揭露條件）
    const char = await seed.character({
      gameId,
      name: '偵探',
      items: [
        { id: 'item-clue', name: '線索', description: '一條重要線索', type: 'tool', quantity: 1 },
      ],
      secretInfo: {
        secrets: [{
          id: 'secret-truth',
          title: '真相',
          content: '案件的真相',
          isRevealed: false,
        }],
      },
    });

    // Runtime 層
    await seed.characterRuntime({
      refId: char._id,
      gameId,
      name: '偵探',
      items: [
        { id: 'item-clue', name: '線索', description: '一條重要線索', type: 'tool', quantity: 1 },
      ],
      secretInfo: {
        secrets: [{
          id: 'secret-truth',
          title: '真相',
          content: '案件的真相',
          isRevealed: false,
        }],
      },
    });
    await seed.gameRuntime({ refId: gameId, gmUserId: gm._id });

    // ── GM 登入並導航 ──
    await asGm({ gmUserId: gm._id });
    await page.goto(`/games/${gameId}/characters/${char._id}`);
    await expect(page.getByRole('heading', { name: '偵探' })).toBeVisible();

    // 切換到「隱藏資訊」分頁
    await page.getByRole('tab', { name: '隱藏資訊' }).click();

    // 編輯「真相」
    await page.getByRole('button', { name: '編輯' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ══════════════════════════════════════
    // 條件編輯器操作
    // ══════════════════════════════════════

    // ── 所有 dialog 內操作改用 page.evaluate 避免 Playwright/React 時序問題 ──
    // Radix Select + Dialog + AnimatePresence 組合導致元素持續 detach/reattach，
    // Playwright 的 locator 方法（含 force: true）都可能在錯誤時機操作已 detach 的元素

    // Step 1: 選擇條件類型「檢視過某幾樣物品」
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: '檢視過某幾樣物品' }).click();
    // 驗證：條件類型已切換 + item picker 出現
    // dialog re-render 可能因 condition editor 狀態切換而延遲
    await expect(dialog.getByRole('button', { name: '添加' })).toBeVisible({ timeout: 10000 });

    // Step 2: 從道具選擇器添加道具
    //
    // Dialog 內元素會因 React re-render 而 detach/reattach，Playwright locator
    // 的 actionability check 會因 detach 而反覆 retry 直到 timeout。
    // → dialog 內操作（trigger、添加按鈕）用 evaluate retry loop
    //
    // Radix Select option 渲染在 portal 中，不受 dialog re-render 影響，
    // 但 SelectItem 用 onPointerUp 觸發選擇，evaluate .click() 不發射 pointer events。
    // → portal 中的 option 用 Playwright locator（發射完整事件鏈）

    // 2a: 點擊 item picker trigger（dialog 內，用 evaluate 避 detach）
    await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const dialogEl = document.querySelector('[role="dialog"]');
        const triggers = dialogEl?.querySelectorAll('[data-slot="select-trigger"]');
        if (triggers && triggers.length >= 2 && (triggers[1] as HTMLElement).isConnected) {
          (triggers[1] as HTMLElement).click();
          return;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('Item picker trigger not found after 5s');
    });

    // 2b: 選擇道具「線索」（portal 中，用 Playwright locator 發射 pointer events）
    await page.getByRole('option', { name: '線索' }).click({ timeout: 10000 });

    // 2c: 點擊「添加」按鈕（dialog 內，用 evaluate 避 detach）
    await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const dialogEl = document.querySelector('[role="dialog"]');
        const addBtn = [...(dialogEl?.querySelectorAll('button') || [])]
          .find(b => b.textContent?.trim() === '添加');
        if (addBtn && !addBtn.disabled && addBtn.isConnected) {
          (addBtn as HTMLElement).click();
          return;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('添加 button not found or disabled after 5s');
    });

    // 驗證：道具已添加（badge 出現）
    await expect(dialog.getByText('線索')).toBeVisible({ timeout: 3000 });

    // Step 3: 切換匹配邏輯為 OR（dialog 內，用 evaluate 避 detach）
    await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const dialogEl = document.querySelector('[role="dialog"]');
        const orBtn = [...(dialogEl?.querySelectorAll('button') || [])]
          .find(b => b.textContent?.trim() === '滿足其一');
        if (orBtn && orBtn.isConnected) {
          (orBtn as HTMLElement).click();
          return;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('滿足其一 button not found after 5s');
    });

    // Step 4: 確認 dialog（dialog 內，用 evaluate 避 detach）
    await page.evaluate(async () => {
      for (let i = 0; i < 30; i++) {
        const dialogEl = document.querySelector('[role="dialog"]');
        const confirmBtn = [...(dialogEl?.querySelectorAll('button') || [])]
          .find(b => b.textContent?.trim() === '確認');
        if (confirmBtn && confirmBtn.isConnected) {
          (confirmBtn as HTMLElement).click();
          return;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('確認 button not found after 3s');
    });
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // Step 5: 儲存（evaluate retry loop 避免 TOCTOU — 規則 32/33）
    // dialog close 後 dirty state 需透過多層 component propagation 才觸發 SaveBar，
    // 等待 AnimatePresence exit 動畫 + React 效果鏈完成
    await page.waitForTimeout(500);
    // evaluate retry loop 避免 AnimatePresence detach（方法 3）
    await clickSaveBar(page, { timeout: 15000 });

    // 等待儲存成功（StickySaveBar toast：「已儲存 N 個分頁的變更」，400ms delay）
    await waitForToast(page, '個分頁的變更', { timeout: 10000 });

    // ── DB 驗證：條件已寫入 ──
    const charRuntimes = await dbQuery('character_runtime', { refId: char._id });
    const runtime = charRuntimes[0] as Record<string, unknown>;
    const secretInfo = runtime.secretInfo as Record<string, unknown>;
    const secrets = secretInfo.secrets as Array<Record<string, unknown>>;
    const secret = secrets.find(s => s.id === 'secret-truth');
    expect(secret).toBeTruthy();

    const condition = secret!.autoRevealCondition as Record<string, unknown>;
    expect(condition).toBeTruthy();
    expect(condition.type).toBe('items_viewed');
    expect(condition.matchLogic).toBe('or');
    const itemIds = condition.itemIds as string[];
    expect(itemIds).toContain('item-clue');
  });

});
