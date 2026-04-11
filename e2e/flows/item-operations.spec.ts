/**
 * E2E Flow #7 — 道具操作（use / equip / showcase / transfer）
 *
 * 驗證玩家在 active game 中操作道具的完整閉環：
 * - #7.1 Item Use self-target happy path + quantity 遞減 + baseline/runtime 隔離
 * - #7.2 Item Use cross-target + random check pass/fail 雙分支
 * - #7.3 Equip/Unequip toggle + stat boost apply/revert
 * - #7.4 Showcase + receiver readonly dialog
 * - #7.5 Transfer + isTransferable + partial quantity + equipment auto-unequip
 * - #7.6 Usage limit + cooldown + readOnly + error 拒絕
 */
import { test, expect, E2E_BASE_URL } from '../fixtures';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';

test.describe('Flow #7 — Item Operations', () => {
  // ────────────────────────────────────────────────────────────
  // #7.1 Item Use happy path: consumable self-target + quantity 遞減 + baseline/runtime 隔離
  // ────────────────────────────────────────────────────────────
  test('#7.1 happy path: consumable self-target stat_change + quantity decrement + isolation', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 1 角色 + 1 消耗品 ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    const char = await seed.character({
      gameId,
      name: 'E2E 道具玩家',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-potion',
          name: '治療藥水',
          description: '恢復 20 HP',
          type: 'consumable',
          quantity: 2,
          checkType: 'none',
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 20 },
          ],
        },
      ],
    });
    const characterId = char._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId,
      name: 'E2E 道具玩家',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-potion',
          name: '治療藥水',
          description: '恢復 20 HP',
          type: 'consumable',
          quantity: 2,
          checkType: 'none',
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 20 },
          ],
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Phase A：進入物品 tab + 開啟道具 dialog ──
    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);

    const navItems = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems.click();

    // 點擊治療藥水卡片
    const potionCard = page.getByText('治療藥水');
    await expect(potionCard).toBeVisible();
    await potionCard.click();

    // Dialog 以道具名稱為 aria-label
    const itemDialog = page.getByRole('dialog', { name: '治療藥水' });
    await expect(itemDialog).toBeVisible();

    // 使用按鈕
    const useBtn = itemDialog.getByRole('button', { name: '使用物品' });
    await expect(useBtn).toBeEnabled();

    // ── Phase B：使用消耗品 + WS 事件 ──
    const wsPromise = waitForWebSocketEvent(page, {
      event: 'item.used',
      channel: `private-character-${characterId}`,
    });

    await useBtn.click();
    await expect(itemDialog).not.toBeVisible({ timeout: 10000 });
    const wsRaw = await wsPromise;
    const wsEvent = (wsRaw as { payload: Record<string, unknown> }).payload;

    expect(wsEvent.itemName).toBe('治療藥水');
    expect(wsEvent.checkPassed).toBe(true);

    // ── Phase C：Runtime DB 斷言 ──
    const runtimeDocs = await dbQuery('character_runtime', { refId: characterId });
    const runtime = runtimeDocs[0];

    // stats 更新
    const hpStat = (runtime.stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(hpStat!.value).toBe(70); // 50 + 20

    // quantity 遞減
    const runtimeItem = (runtime.items as Array<{ id: string; quantity: number; lastUsedAt?: string }>)
      .find(i => i.id === 'item-potion');
    expect(runtimeItem!.quantity).toBe(1); // 2 - 1
    expect(runtimeItem!.lastUsedAt).toBeDefined();

    // ── Phase D：Baseline 隔離 ──
    const baselineDocs = await dbQuery('characters', { _id: characterId });
    const baseline = baselineDocs[0];

    const baseHp = (baseline.stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(baseHp!.value).toBe(50); // 不變

    const baseItem = (baseline.items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-potion');
    expect(baseItem!.quantity).toBe(2); // 不變

    // ── Phase E：再次使用 → 耗盡 ──
    // 重新開啟 dialog
    await navItems.click();
    await page.getByText('治療藥水').click();
    const itemDialog2 = page.getByRole('dialog', { name: '治療藥水' });
    await expect(itemDialog2).toBeVisible();

    const useBtn2 = itemDialog2.getByRole('button', { name: '使用物品' });
    await expect(useBtn2).toBeEnabled();

    const wsPromise2 = waitForWebSocketEvent(page, {
      event: 'item.used',
      channel: `private-character-${characterId}`,
    });
    await useBtn2.click();
    await expect(itemDialog2).not.toBeVisible({ timeout: 10000 });
    await wsPromise2;

    // quantity = 0
    const runtimeDocs2 = await dbQuery('character_runtime', { refId: characterId });
    const runtime2 = runtimeDocs2[0];
    const runtimeItem2 = (runtime2.items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-potion');
    expect(runtimeItem2!.quantity).toBe(0);

    // HP = 90 (70 + 20)
    const hpStat2 = (runtime2.stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(hpStat2!.value).toBe(90);

    // 道具仍在列表中（不被刪除），但不可再使用
    await navItems.click();
    const potionCard2 = page.getByText('治療藥水');
    await expect(potionCard2).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // #7.2 Item Use cross-target + random check pass/fail 雙分支
  // ────────────────────────────────────────────────────────────
  test('#7.2 cross-target random check: pass + fail branches', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 2 角色 + 消耗品（random check, other target） ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    const charA = await seed.character({
      gameId,
      name: 'E2E 攻擊者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
      items: [
        {
          id: 'item-dart',
          name: '毒鏢',
          description: '投擲毒鏢',
          type: 'consumable',
          quantity: 5,
          checkType: 'random',
          randomConfig: { maxValue: 100, threshold: 50 },
          effects: [
            { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -15 },
          ],
        },
      ],
    });
    const charAId = charA._id;

    const charB = await seed.character({
      gameId,
      name: 'E2E 目標',
      stats: [{ id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 }],
    });
    const charBId = charB._id;

    // Runtime
    await seed.characterRuntime({
      refId: charAId,
      gameId,
      name: 'E2E 攻擊者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
      items: [
        {
          id: 'item-dart',
          name: '毒鏢',
          description: '投擲毒鏢',
          type: 'consumable',
          quantity: 5,
          checkType: 'random',
          randomConfig: { maxValue: 100, threshold: 50 },
          effects: [
            { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -15 },
          ],
        },
      ],
    });
    await seed.characterRuntime({
      refId: charBId,
      gameId,
      name: 'E2E 目標',
      stats: [{ id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Phase A：Pass 分支（Math.random → 0.7 → roll = 71 ≥ 50） ──
    await asPlayer({ characterId: charAId });
    await page.goto(`/c/${charAId}`);
    // 注入 Math.random 控制擲骰（保存原始值以便還原）
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__origMathRandom = Math.random;
      Math.random = () => 0.7;
    });

    const navItems = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems.click();

    await page.getByText('毒鏢').click();
    const dartDialog = page.getByRole('dialog', { name: '毒鏢' });
    await expect(dartDialog).toBeVisible();

    // 選擇目標 — Radix Select combobox
    const targetSelect = dartDialog.getByRole('combobox');
    await targetSelect.click();
    await page.getByRole('option', { name: 'E2E 目標' }).click();

    // 使用
    const useBtn = dartDialog.getByRole('button', { name: '使用物品' });
    const wsPassPromise = waitForWebSocketEvent(page, {
      event: 'item.used',
      channel: `private-character-${charAId}`,
    });
    await useBtn.click();
    await expect(dartDialog).not.toBeVisible({ timeout: 10000 });

    const wsPassRaw = await wsPassPromise;
    const wsPass = (wsPassRaw as { payload: Record<string, unknown> }).payload;
    expect(wsPass.checkPassed).toBe(true);
    expect(wsPass.itemName).toBe('毒鏢');

    // B 的 HP 被扣
    const runtimeB1 = await dbQuery('character_runtime', { refId: charBId });
    const bHp1 = (runtimeB1[0].stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(bHp1!.value).toBe(65); // 80 - 15

    // A 的 quantity 遞減
    const runtimeA1 = await dbQuery('character_runtime', { refId: charAId });
    const aDart1 = (runtimeA1[0].items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-dart');
    expect(aDart1!.quantity).toBe(4); // 5 - 1

    // ── Phase B：Fail 分支（Math.random → 0.1 → roll = 11 < 50） ──
    await page.evaluate(() => { Math.random = () => 0.1; });

    await navItems.click();
    await page.getByText('毒鏢').click();
    const dartDialog2 = page.getByRole('dialog', { name: '毒鏢' });
    await expect(dartDialog2).toBeVisible();

    const targetSelect2 = dartDialog2.getByRole('combobox');
    await targetSelect2.click();
    await page.getByRole('option', { name: 'E2E 目標' }).click();

    const useBtn2 = dartDialog2.getByRole('button', { name: '使用物品' });
    const wsFailPromise = waitForWebSocketEvent(page, {
      event: 'item.used',
      channel: `private-character-${charAId}`,
    });
    await useBtn2.click();
    await expect(dartDialog2).not.toBeVisible({ timeout: 10000 });

    const wsFailRaw = await wsFailPromise;
    const wsFail = (wsFailRaw as { payload: Record<string, unknown> }).payload;
    expect(wsFail.checkPassed).toBe(false);

    // B 的 HP 不變（效果未執行）
    const runtimeB2 = await dbQuery('character_runtime', { refId: charBId });
    const bHp2 = (runtimeB2[0].stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(bHp2!.value).toBe(65); // 仍然是 65

    // A 的 quantity 仍遞減（使用行為本身消耗 quantity，不管 check pass/fail）
    const runtimeA2 = await dbQuery('character_runtime', { refId: charAId });
    const aDart2 = (runtimeA2[0].items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-dart');
    expect(aDart2!.quantity).toBe(3); // 4 - 1

    // ── Phase C：Baseline 隔離 ──
    const baseA = await dbQuery('characters', { _id: charAId });
    const baseDart = (baseA[0].items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-dart');
    expect(baseDart!.quantity).toBe(5); // 不變

    const baseB = await dbQuery('characters', { _id: charBId });
    const baseHpB = (baseB[0].stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(baseHpB!.value).toBe(80); // 不變

    // 還原 Math.random
    await page.evaluate(() => {
      Math.random = (window as unknown as Record<string, unknown>).__origMathRandom as () => number;
    });
  });

  // ────────────────────────────────────────────────────────────
  // #7.3 Equip/Unequip toggle + stat boost apply/revert + Maximum Value Recovery Rule
  // ────────────────────────────────────────────────────────────
  test('#7.3 equip/unequip toggle: stat boost apply + revert + max recovery rule', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 1 角色 + 1 裝備（多 statBoost） ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    const char = await seed.character({
      gameId,
      name: 'E2E 裝備玩家',
      stats: [
        { id: 'stat-atk', name: '攻擊力', value: 20, maxValue: 50 },
        { id: 'stat-hp', name: '生命值', value: 30, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-sword',
          name: '魔劍',
          type: 'equipment',
          quantity: 1,
          equipped: false,
          statBoosts: [
            { statName: '攻擊力', value: 10, target: 'both' },   // value +10, maxValue +10
            { statName: '生命值', value: 5, target: 'maxValue' }, // maxValue +5 only
          ],
        },
      ],
    });
    const characterId = char._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId,
      name: 'E2E 裝備玩家',
      stats: [
        { id: 'stat-atk', name: '攻擊力', value: 20, maxValue: 50 },
        { id: 'stat-hp', name: '生命值', value: 30, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-sword',
          name: '魔劍',
          type: 'equipment',
          quantity: 1,
          equipped: false,
          statBoosts: [
            { statName: '攻擊力', value: 10, target: 'both' },
            { statName: '生命值', value: 5, target: 'maxValue' },
          ],
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Phase A：穿上裝備 ──
    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);

    const navItems = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems.click();

    await page.getByText('魔劍').click();
    const swordDialog = page.getByRole('dialog', { name: '魔劍' });
    await expect(swordDialog).toBeVisible();

    // 穿戴裝備按鈕
    const equipBtn = swordDialog.getByRole('button', { name: '穿戴裝備' });
    await expect(equipBtn).toBeEnabled();

    const wsEquipPromise = waitForWebSocketEvent(page, {
      event: 'equipment.toggled',
      channel: `private-character-${characterId}`,
    });

    await equipBtn.click();
    // Dialog 關閉（handleToggleEquipment 成功後 setSelectedItem(null)）
    await expect(swordDialog).not.toBeVisible({ timeout: 10000 });
    const wsEquipRaw = await wsEquipPromise;
    const wsEquip = (wsEquipRaw as { payload: Record<string, unknown> }).payload;
    expect(wsEquip.equipped).toBe(true);
    expect(wsEquip.itemName).toBe('魔劍');

    // DB 斷言：裝備後 stats
    const runtime1 = await dbQuery('character_runtime', { refId: characterId });
    const r1 = runtime1[0];

    const atkAfterEquip = (r1.stats as Array<{ name: string; value: number; maxValue: number }>)
      .find(s => s.name === '攻擊力');
    expect(atkAfterEquip!.value).toBe(30);    // 20 + 10
    expect(atkAfterEquip!.maxValue).toBe(60); // 50 + 10

    const hpAfterEquip = (r1.stats as Array<{ name: string; value: number; maxValue: number }>)
      .find(s => s.name === '生命值');
    expect(hpAfterEquip!.value).toBe(30);      // 不變（target=maxValue only）
    expect(hpAfterEquip!.maxValue).toBe(105);  // 100 + 5

    // item equipped 狀態
    const swordAfterEquip = (r1.items as Array<{ id: string; equipped: boolean }>)
      .find(i => i.id === 'item-sword');
    expect(swordAfterEquip!.equipped).toBe(true);

    // ── Phase B：卸除裝備 ──
    // equip 後 handleToggleEquipment 呼叫 router.refresh()，但 dialog 的
    // selectedItem 是 click 時從 items array 取的快照，不會隨 refresh 更新。
    // 必須 reload 確保拿到最新 equipped 狀態。
    await page.reload();

    const navItems2 = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems2.click();
    await page.getByText('魔劍').click();
    const swordDialog2 = page.getByRole('dialog', { name: '魔劍' });
    await expect(swordDialog2).toBeVisible();

    const unequipBtn = swordDialog2.getByRole('button', { name: '卸除裝備' });
    await expect(unequipBtn).toBeEnabled();

    const wsUnequipPromise = waitForWebSocketEvent(page, {
      event: 'equipment.toggled',
      channel: `private-character-${characterId}`,
    });

    await unequipBtn.click();
    await expect(swordDialog2).not.toBeVisible({ timeout: 10000 });
    const wsUnequipRaw = await wsUnequipPromise;
    const wsUnequip = (wsUnequipRaw as { payload: Record<string, unknown> }).payload;
    expect(wsUnequip.equipped).toBe(false);

    // DB 斷言：卸除後 stats（revert）
    const runtime2 = await dbQuery('character_runtime', { refId: characterId });
    const r2 = runtime2[0];

    const atkAfterUnequip = (r2.stats as Array<{ name: string; value: number; maxValue: number }>)
      .find(s => s.name === '攻擊力');
    // target='both' 的 revert 走 max recovery rule：min(current, newMax) = min(30, 50) = 30
    // 不是對稱反向 30 - 10 = 20（只有 target='value' 才做對稱反向）
    expect(atkAfterUnequip!.value).toBe(30);
    expect(atkAfterUnequip!.maxValue).toBe(50); // revert: 60 - 10

    const hpAfterUnequip = (r2.stats as Array<{ name: string; value: number; maxValue: number }>)
      .find(s => s.name === '生命值');
    expect(hpAfterUnequip!.maxValue).toBe(100); // revert: 105 - 5
    // Maximum Value Recovery Rule：value=30 < newMax=100 → 不 clamp，仍為 30
    expect(hpAfterUnequip!.value).toBe(30);

    // item unequipped
    const swordAfterUnequip = (r2.items as Array<{ id: string; equipped: boolean }>)
      .find(i => i.id === 'item-sword');
    expect(swordAfterUnequip!.equipped).toBe(false);

    // ── Phase C：Baseline 隔離 ──
    const baseline = await dbQuery('characters', { _id: characterId });
    const b = baseline[0];

    const baseAtk = (b.stats as Array<{ name: string; value: number; maxValue: number }>)
      .find(s => s.name === '攻擊力');
    expect(baseAtk!.value).toBe(20);    // 不變
    expect(baseAtk!.maxValue).toBe(50); // 不變

    const baseSword = (b.items as Array<{ id: string; equipped: boolean }>)
      .find(i => i.id === 'item-sword');
    expect(baseSword!.equipped).toBe(false); // 不變
  });

  // ────────────────────────────────────────────────────────────
  // #7.4 Showcase: sender triggers + receiver readonly dialog（safe fields only）
  // ────────────────────────────────────────────────────────────
  test('#7.4 showcase: sender triggers + receiver sees readonly dialog with safe fields only', async ({
    browser,
    seed,
    dbQuery,
  }) => {
    // ── Seed：active game + 2 角色（A=展示者, B=觀看者） ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 角色 A：持有含敏感欄位的道具（effects, checkType, randomConfig）
    const charA = await seed.character({
      gameId,
      name: 'E2E 展示者',
      items: [
        {
          id: 'item-ring',
          name: '魔法戒指',
          description: '蘊含古老力量的戒指',
          type: 'tool',
          quantity: 3,
          checkType: 'random',
          tags: ['combat', 'stealth'],
          randomConfig: { maxValue: 20, threshold: 10 },
          effects: [
            { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -10 },
          ],
        },
      ],
    });
    const charAId = charA._id;

    // 角色 B：純觀看者
    const charB = await seed.character({
      gameId,
      name: 'E2E 觀看者',
    });
    const charBId = charB._id;

    // Runtime
    await seed.characterRuntime({
      refId: charAId,
      gameId,
      name: 'E2E 展示者',
      items: [
        {
          id: 'item-ring',
          name: '魔法戒指',
          description: '蘊含古老力量的戒指',
          type: 'tool',
          quantity: 3,
          checkType: 'random',
          tags: ['combat', 'stealth'],
          randomConfig: { maxValue: 20, threshold: 10 },
          effects: [
            { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -10 },
          ],
        },
      ],
    });
    await seed.characterRuntime({ refId: charBId, gameId, name: 'E2E 觀看者' });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 Player context（A=展示者, B=觀看者） ──
    const ctxA = await browser.newContext({ baseURL: E2E_BASE_URL });
    const pageA = await ctxA.newPage();
    await ctxA.request.post('/api/test/login', {
      data: { mode: 'player', characterIds: [charAId] },
    });
    await pageA.addInitScript(
      ({ id }: { id: string }) => {
        localStorage.setItem(`character-${id}-unlocked`, 'true');
        localStorage.setItem(`character-${id}-fullAccess`, 'true');
      },
      { id: charAId },
    );

    const ctxB = await browser.newContext({ baseURL: E2E_BASE_URL });
    const pageB = await ctxB.newPage();
    await ctxB.request.post('/api/test/login', {
      data: { mode: 'player', characterIds: [charBId] },
    });
    await pageB.addInitScript(
      ({ id }: { id: string }) => {
        localStorage.setItem(`character-${id}-unlocked`, 'true');
        localStorage.setItem(`character-${id}-fullAccess`, 'true');
      },
      { id: charBId },
    );

    try {
      // ── Phase A：Player B 先載入頁面（建立 SSE 連線） ──
      await pageB.goto(`/c/${charBId}`);

      // ── Phase B：Player A 展示道具 ──
      await pageA.goto(`/c/${charAId}`);
      const navItems = pageA.getByRole('navigation').getByRole('button', { name: '物品' });
      await navItems.click();

      await pageA.getByText('魔法戒指').click();
      const ringDialog = pageA.getByRole('dialog', { name: '魔法戒指' });
      await expect(ringDialog).toBeVisible();

      // 選擇目標：從 Radix Select 下拉選單選擇 B
      const targetSelect = ringDialog.locator('button[role="combobox"]');
      await targetSelect.click();
      await pageA.getByRole('option', { name: 'E2E 觀看者' }).click();

      // 點擊「展示」按鈕
      const showcaseBtn = ringDialog.getByRole('button', { name: '展示' });
      await expect(showcaseBtn).toBeEnabled();

      // 先註冊 WS 監聽再觸發動作
      const wsBPromise = waitForWebSocketEvent(pageB, {
        event: 'item.showcased',
        channel: `private-character-${charBId}`,
      });

      await showcaseBtn.click();
      // A 側 dialog 關閉
      await expect(ringDialog).not.toBeVisible({ timeout: 10000 });

      // 等待 B 側收到 WS 事件
      const wsRaw = await wsBPromise;
      const wsPayload = (wsRaw as { payload: Record<string, unknown> }).payload;
      expect(wsPayload.fromCharacterName).toBe('E2E 展示者');
      expect(wsPayload.toCharacterId).toBe(charBId);

      // ── Phase C：Player B 看到唯讀展示 Dialog ──
      const showcaseDialog = pageB.getByRole('dialog', {
        name: 'E2E 展示者 展示了 魔法戒指',
      });
      await expect(showcaseDialog).toBeVisible({ timeout: 10000 });

      // 安全欄位可見
      await expect(showcaseDialog.getByText('魔法戒指')).toBeVisible();
      await expect(showcaseDialog.getByText('蘊含古老力量的戒指')).toBeVisible();
      await expect(showcaseDialog.getByText('道具')).toBeVisible(); // type:tool → 道具
      await expect(showcaseDialog.getByText('戰鬥')).toBeVisible(); // tag:combat → 戰鬥
      await expect(showcaseDialog.getByText('隱匿')).toBeVisible(); // tag:stealth → 隱匿
      await expect(showcaseDialog.getByText('E2E 展示者')).toBeVisible(); // 展示者名稱

      // 敏感欄位不可見（effects, checkType, randomConfig 不應出現在 showcase dialog）
      await expect(showcaseDialog.getByText('stat_change')).not.toBeVisible();
      await expect(showcaseDialog.getByText('-10')).not.toBeVisible();
      await expect(showcaseDialog.getByText('random')).not.toBeVisible();

      // 只有「關閉」按鈕，無互動按鈕
      const closeBtn = showcaseDialog.getByRole('button', { name: '關閉' });
      await expect(closeBtn).toBeVisible();
      await expect(showcaseDialog.getByRole('button', { name: '使用物品' })).not.toBeVisible();
      await expect(showcaseDialog.getByRole('button', { name: '展示' })).not.toBeVisible();
      await expect(showcaseDialog.getByRole('button', { name: '轉移' })).not.toBeVisible();

      // 關閉 dialog
      await closeBtn.click();
      await expect(showcaseDialog).not.toBeVisible();

      // ── Phase D：DB 斷言 ──
      // A 的道具數量不變（showcase 不消耗）
      const runtimeA = await dbQuery('character_runtime', { refId: charAId });
      const ringA = (runtimeA[0].items as Array<{ id: string; quantity: number }>)
        .find(i => i.id === 'item-ring');
      expect(ringA!.quantity).toBe(3);

      // B 的 viewedItems 記錄了此次展示
      const runtimeB = await dbQuery('character_runtime', { refId: charBId });
      const viewedItems = runtimeB[0].viewedItems as Array<{
        itemId: string;
        sourceCharacterId: string;
      }> | undefined;
      expect(viewedItems).toBeDefined();
      expect(viewedItems!.some(
        v => v.itemId === 'item-ring' && v.sourceCharacterId === charAId
      )).toBe(true);
    } finally {
      // 清理 context
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ────────────────────────────────────────────────────────────
  // #7.5 Transfer: isTransferable guard + partial quantity + equipment auto-unequip
  // ────────────────────────────────────────────────────────────
  test('#7.5 transfer: isTransferable guard + partial quantity + equipment auto-unequip', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 2 角色 ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 角色 A（玩家操控）：3 個道具
    const charA = await seed.character({
      gameId,
      name: 'E2E 轉移者',
      items: [
        {
          id: 'item-quest',
          name: '任務信件',
          description: '不可轉移的任務物品',
          type: 'tool',
          quantity: 1,
          isTransferable: false,
        },
        {
          id: 'item-potion',
          name: '回復藥水',
          description: '可分批轉移',
          type: 'consumable',
          quantity: 3,
          isTransferable: true,
        },
        {
          id: 'item-armor',
          name: '鎧甲',
          description: '已穿戴的裝備',
          type: 'equipment',
          quantity: 1,
          equipped: true,
          isTransferable: true,
          statBoosts: [
            { statName: '防禦力', value: 5, target: 'value' },
          ],
        },
      ],
      stats: [
        { id: 'stat-def', name: '防禦力', value: 15, maxValue: 50 },
      ],
    });
    const charAId = charA._id;

    // 角色 B（目標）：無物品
    const charB = await seed.character({
      gameId,
      name: 'E2E 接收者',
    });
    const charBId = charB._id;

    // Runtime
    await seed.characterRuntime({
      refId: charAId,
      gameId,
      name: 'E2E 轉移者',
      items: [
        {
          id: 'item-quest',
          name: '任務信件',
          description: '不可轉移的任務物品',
          type: 'tool',
          quantity: 1,
          isTransferable: false,
        },
        {
          id: 'item-potion',
          name: '回復藥水',
          description: '可分批轉移',
          type: 'consumable',
          quantity: 3,
          isTransferable: true,
        },
        {
          id: 'item-armor',
          name: '鎧甲',
          description: '已穿戴的裝備',
          type: 'equipment',
          quantity: 1,
          equipped: true,
          isTransferable: true,
          statBoosts: [
            { statName: '防禦力', value: 5, target: 'value' },
          ],
        },
      ],
      stats: [
        { id: 'stat-def', name: '防禦力', value: 15, maxValue: 50 },
      ],
    });
    await seed.characterRuntime({ refId: charBId, gameId, name: 'E2E 接收者' });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Login as Player A ──
    await asPlayer({ characterId: charAId });
    await page.goto(`/c/${charAId}`);
    const navItems = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems.click();

    // ── Phase A：非轉移物品 → 無「轉移」按鈕 ──
    await page.getByText('任務信件').click();
    const questDialog = page.getByRole('dialog', { name: '任務信件' });
    await expect(questDialog).toBeVisible();

    // 展示按鈕可見，但轉移按鈕不應存在（isTransferable=false）
    await expect(questDialog.getByRole('button', { name: '轉移' })).not.toBeVisible();

    // 關閉 dialog（Escape 鍵）
    await page.keyboard.press('Escape');
    await expect(questDialog).not.toBeVisible({ timeout: 5000 });

    // ── Phase B：轉移 consumable（partial quantity: 3 → 2） ──
    await page.getByText('回復藥水').click();
    const potionDialog = page.getByRole('dialog', { name: '回復藥水' });
    await expect(potionDialog).toBeVisible();

    // 選擇目標 B
    const targetSelect = potionDialog.locator('button[role="combobox"]');
    await targetSelect.click();
    await page.getByRole('option', { name: 'E2E 接收者' }).click();

    // 點擊「轉移」
    const transferBtn = potionDialog.getByRole('button', { name: '轉移' });
    await expect(transferBtn).toBeEnabled();

    const wsTransferPromise = waitForWebSocketEvent(page, {
      event: 'item.transferred',
      channel: `private-character-${charAId}`,
    });

    await transferBtn.click();
    await expect(potionDialog).not.toBeVisible({ timeout: 10000 });

    const wsTransferRaw = await wsTransferPromise;
    const wsTransfer = (wsTransferRaw as { payload: Record<string, unknown> }).payload;
    expect(wsTransfer.itemName).toBe('回復藥水');
    expect(wsTransfer.quantity).toBe(1);
    expect(wsTransfer.transferType).toBe('give');
    expect(wsTransfer.toCharacterId).toBe(charBId);

    // DB 斷言：A 的藥水 qty 2，B 新增 qty 1
    const runtimeA1 = await dbQuery('character_runtime', { refId: charAId });
    const potionA = (runtimeA1[0].items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-potion');
    expect(potionA!.quantity).toBe(2);

    const runtimeB1 = await dbQuery('character_runtime', { refId: charBId });
    const potionB = (runtimeB1[0].items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-potion');
    expect(potionB).toBeDefined();
    expect(potionB!.quantity).toBe(1);

    // ── Phase C：轉移 equipped equipment → auto-unequip ──
    // reload 確保 items array 最新
    await page.reload();
    const navItems2 = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems2.click();

    await page.getByText('鎧甲').click();
    const armorDialog = page.getByRole('dialog', { name: '鎧甲' });
    await expect(armorDialog).toBeVisible();

    // 選擇目標 B
    const targetSelect2 = armorDialog.locator('button[role="combobox"]');
    await targetSelect2.click();
    await page.getByRole('option', { name: 'E2E 接收者' }).click();

    const transferBtn2 = armorDialog.getByRole('button', { name: '轉移' });
    await expect(transferBtn2).toBeEnabled();

    const wsTransfer2Promise = waitForWebSocketEvent(page, {
      event: 'item.transferred',
      channel: `private-character-${charAId}`,
    });

    await transferBtn2.click();
    await expect(armorDialog).not.toBeVisible({ timeout: 10000 });

    const wsTransfer2Raw = await wsTransfer2Promise;
    const wsTransfer2 = (wsTransfer2Raw as { payload: Record<string, unknown> }).payload;
    expect(wsTransfer2.itemName).toBe('鎧甲');

    // DB 斷言：A 的鎧甲被移除（qty 1 → 0 → $pull）
    const runtimeA2 = await dbQuery('character_runtime', { refId: charAId });
    const armorA = (runtimeA2[0].items as Array<{ id: string }>)
      .find(i => i.id === 'item-armor');
    expect(armorA).toBeUndefined(); // 已移除

    // A 的防禦力 stat boost 已 revert（15 → revert +5 value boost → 10）
    const defAfterTransfer = (runtimeA2[0].stats as Array<{ name: string; value: number; maxValue: number }>)
      .find(s => s.name === '防禦力');
    expect(defAfterTransfer!.value).toBe(10); // 15 - 5 = 10（純 value boost 對稱反向）
    expect(defAfterTransfer!.maxValue).toBe(50); // maxValue 不受影響（target='value'）

    // B 收到鎧甲，auto-unequip（equipped=false）
    const runtimeB2 = await dbQuery('character_runtime', { refId: charBId });
    const armorB = (runtimeB2[0].items as Array<{ id: string; equipped: boolean; quantity: number }>)
      .find(i => i.id === 'item-armor');
    expect(armorB).toBeDefined();
    expect(armorB!.equipped).toBe(false);
    expect(armorB!.quantity).toBe(1);

    // ── Phase D：Baseline 隔離 ──
    const baseA = await dbQuery('characters', { _id: charAId });
    const basePotion = (baseA[0].items as Array<{ id: string; quantity: number }>)
      .find(i => i.id === 'item-potion');
    expect(basePotion!.quantity).toBe(3); // 不變

    const baseArmor = (baseA[0].items as Array<{ id: string }>)
      .find(i => i.id === 'item-armor');
    expect(baseArmor).toBeDefined(); // baseline 仍存在

    // baseline 的防禦力不變
    const baseDef = (baseA[0].stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '防禦力');
    expect(baseDef!.value).toBe(15); // 不變
  });

  // ────────────────────────────────────────────────────────────
  // #7.6 Usage limit + cooldown + readOnly 拒絕
  // ────────────────────────────────────────────────────────────
  test('#7.6 usage limit + cooldown + readOnly: UI guards prevent usage', async ({
    page,
    browser,
    seed,
    asPlayer,
  }) => {
    // ── Seed：active game + 1 角色（含 exhausted / cooldown 道具） ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    const char = await seed.character({
      gameId,
      name: 'E2E 限制測試',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-exhausted',
          name: '耗盡捲軸',
          description: '已達使用上限',
          type: 'consumable',
          quantity: 1,
          checkType: 'none',
          usageLimit: 2,
          usageCount: 2,
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 10 },
          ],
        },
        {
          id: 'item-cooldown',
          name: '冷卻法杖',
          description: '冷卻中',
          type: 'tool',
          quantity: 1,
          checkType: 'none',
          cooldown: 300,
          lastUsedAt: new Date(),
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 5 },
          ],
        },
        {
          id: 'item-normal',
          name: '普通藥水',
          description: '可正常使用',
          type: 'consumable',
          quantity: 1,
          checkType: 'none',
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 10 },
          ],
        },
      ],
    });
    const characterId = char._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId,
      name: 'E2E 限制測試',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-exhausted',
          name: '耗盡捲軸',
          description: '已達使用上限',
          type: 'consumable',
          quantity: 1,
          checkType: 'none',
          usageLimit: 2,
          usageCount: 2,
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 10 },
          ],
        },
        {
          id: 'item-cooldown',
          name: '冷卻法杖',
          description: '冷卻中',
          type: 'tool',
          quantity: 1,
          checkType: 'none',
          cooldown: 300,
          lastUsedAt: new Date(),
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 5 },
          ],
        },
        {
          id: 'item-normal',
          name: '普通藥水',
          description: '可正常使用',
          type: 'consumable',
          quantity: 1,
          checkType: 'none',
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 10 },
          ],
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── Phase A：Usage limit exhausted → 按鈕 disabled ──
    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);
    const navItems = page.getByRole('navigation').getByRole('button', { name: '物品' });
    await navItems.click();

    await page.getByText('耗盡捲軸').click();
    const exhaustedDialog = page.getByRole('dialog', { name: '耗盡捲軸' });
    await expect(exhaustedDialog).toBeVisible();

    // 使用按鈕顯示「已達使用次數上限」且 disabled
    const exhaustedBtn = exhaustedDialog.getByRole('button', { name: /使用物品.*已達使用次數上限/ });
    await expect(exhaustedBtn).toBeVisible();
    await expect(exhaustedBtn).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(exhaustedDialog).not.toBeVisible({ timeout: 5000 });

    // ── Phase B：Cooldown → 按鈕 disabled ──
    await page.getByText('冷卻法杖').click();
    const cooldownDialog = page.getByRole('dialog', { name: '冷卻法杖' });
    await expect(cooldownDialog).toBeVisible();

    // 使用按鈕顯示「冷卻中」且 disabled
    const cooldownBtn = cooldownDialog.getByRole('button', { name: /使用物品.*冷卻中/ });
    await expect(cooldownBtn).toBeVisible();
    await expect(cooldownBtn).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(cooldownDialog).not.toBeVisible({ timeout: 5000 });

    // ── Phase C：ReadOnly 模式 → 所有按鈕 disabled ──
    // addInitScript 會累積，無法在同一 page 切換 readOnly。
    // 建立獨立 context 確保 fullAccess 不被前面的 init script 覆蓋。
    const readOnlyCtx = await browser.newContext({ baseURL: E2E_BASE_URL });
    const readOnlyPage = await readOnlyCtx.newPage();

    await readOnlyCtx.request.post('/api/test/login', {
      data: { mode: 'player', characterIds: [characterId] },
    });
    await readOnlyPage.addInitScript(
      ({ id }: { id: string }) => {
        localStorage.setItem(`character-${id}-unlocked`, 'true');
        // 不設 fullAccess → readOnly 模式
      },
      { id: characterId },
    );

    try {
      await readOnlyPage.goto(`/c/${characterId}`);
      const navItems2 = readOnlyPage.getByRole('navigation').getByRole('button', { name: '物品' });
      await navItems2.click();

      // 開啟普通藥水（本身可用，但 readOnly 下禁止）
      await readOnlyPage.getByText('普通藥水').click();
      const normalDialog = readOnlyPage.getByRole('dialog', { name: '普通藥水' });
      await expect(normalDialog).toBeVisible();

      // 使用按鈕顯示「預覽模式」且 disabled
      const previewBtn = normalDialog.getByRole('button', { name: '預覽模式' });
      await expect(previewBtn).toBeVisible();
      await expect(previewBtn).toBeDisabled();
    } finally {
      await readOnlyCtx.close();
    }
  });
});
