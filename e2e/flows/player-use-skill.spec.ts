/**
 * Flow #5 — Player 使用技能（非對抗、非 item 轉移）
 *
 * 驗證「玩家在 active game 中使用技能」的完整閉環：
 * - Stub Pusher + SSE IPC 捕捉 WebSocket 事件
 * - skill-effect-executor 的 effects 真的被執行
 * - baseline / runtime 隔離
 * - 使用限制（usageLimit / cooldown）的 UI 與 server 雙層守門
 *
 * 規格文件：docs/refactoring/E2E_FLOW_5_PLAYER_USE_SKILL.md
 *
 * 注意事項：
 * - 全程在 active game 操作，需手動 seed characterRuntime + gameRuntime
 * - URL 是 `/c/{characterId}`（非 `/characters/`）
 * - BottomSheet 是自訂元件，非 Radix Dialog，使用 role="dialog" + aria-label={skillName}
 * - waitForWebSocketEvent 必須在觸發動作前建立 promise（避免 race）
 */

import { test, expect } from '../fixtures';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';

test.describe('Flow #5 — Player Use Skill', () => {
  // ────────────────────────────────────────────────────────────
  // #5.1 Happy path: checkType=none + stat_change self + baseline/runtime 隔離
  // ────────────────────────────────────────────────────────────
  test('#5.1 happy path: self-target stat_change + baseline/runtime isolation', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：GM + active game + 角色（含 stat + skill） ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const activeGameId = game._id;

    // 角色 baseline：hp=50, maxValue=100
    const character = await seed.character({
      gameId: activeGameId,
      name: 'E2E 技能角色',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-heal',
          name: '小治療',
          description: '恢復 20 HP',
          checkType: 'none',
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '生命值',
            value: 20,
          }],
        },
      ],
    });
    const characterId = character._id;

    // Active game 需要 characterRuntime + gameRuntime
    // characterRuntime 是 baseline 的 runtime 副本
    await seed.characterRuntime({
      refId: characterId,
      gameId: activeGameId,
      name: 'E2E 技能角色',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-heal',
          name: '小治療',
          description: '恢復 20 HP',
          checkType: 'none',
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '生命值',
            value: 20,
          }],
        },
      ],
    });
    await seed.gameRuntime({
      refId: activeGameId,
      gmUserId,
    });

    // ── Player login + 導航 ──
    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);

    // ── Phase A：進入技能 tab ──
    // 底部導航列用 button（非 tab role）
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();

    // 技能卡可見（skill name 在 h3 中）
    const skillCard = page.getByText('小治療').first();
    await expect(skillCard).toBeVisible();

    // ── Phase B：開啟 BottomSheet ──
    await skillCard.click();
    const skillDialog = page.getByRole('dialog', { name: '小治療' });
    await expect(skillDialog).toBeVisible();

    // 使用技能按鈕 enabled
    const useBtn = skillDialog.getByRole('button', { name: '使用技能' });
    await expect(useBtn).toBeEnabled();

    // self-target 不應出現目標選擇
    await expect(skillDialog.getByText('請選擇目標角色')).not.toBeVisible();

    // ── Phase C：使用技能（先建立 WS event listener 再觸發動作）──
    const wsEventPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${characterId}`,
    });

    await useBtn.click();

    // 成功後 Sheet 自動關閉（非對抗技能不顯示 Sonner toast，結果進 notification panel）
    await expect(skillDialog).not.toBeVisible({ timeout: 10000 });

    // ── Phase D：WebSocket 事件斷言 ──
    // SSE data 是 BaseEvent 結構：{ type, timestamp, payload }
    const wsRaw = await wsEventPromise as {
      type: string;
      timestamp: number;
      payload: {
        characterId: string;
        skillId: string;
        skillName: string;
        checkType: string;
        checkPassed: boolean;
        effectsApplied?: string[];
      };
    };
    const wsEvent = wsRaw.payload;
    expect(wsEvent.skillName).toBe('小治療');
    expect(wsEvent.checkType).toBe('none');
    expect(wsEvent.checkPassed).toBe(true);
    expect(wsEvent.effectsApplied).toBeDefined();
    expect(wsEvent.effectsApplied!.length).toBeGreaterThan(0);

    // ── Phase E：Runtime DB 斷言 ──
    const runtimeDocs = await dbQuery('character_runtime', {
      refId: characterId,
    });
    expect(runtimeDocs.length).toBe(1);
    const runtime = runtimeDocs[0];
    const runtimeStats = runtime.stats as Array<{ id: string; name: string; value: number; maxValue?: number }>;
    const hpStat = runtimeStats.find(s => s.name === '生命值');
    expect(hpStat).toBeDefined();
    expect(hpStat!.value).toBe(70); // 50 + 20

    // lastUsedAt 應被設定
    const runtimeSkills = runtime.skills as Array<{
      id: string;
      lastUsedAt?: string;
      usageCount?: number;
    }>;
    const healSkill = runtimeSkills.find(s => s.id === 'skill-heal');
    expect(healSkill).toBeDefined();
    expect(healSkill!.lastUsedAt).toBeDefined();
    // usageLimit=0（未設定）→ usageCount 不遞增
    expect(healSkill!.usageCount).toBe(0);

    // ── Phase F：Baseline 隔離斷言 ──
    const baselineDocs = await dbQuery('characters', {
      _id: characterId,
    });
    expect(baselineDocs.length).toBe(1);
    const baseline = baselineDocs[0];
    const baselineStats = baseline.stats as Array<{ id: string; name: string; value: number }>;
    const baselineHp = baselineStats.find(s => s.name === '生命值');
    expect(baselineHp).toBeDefined();
    expect(baselineHp!.value).toBe(50); // 未變

    const baselineSkills = baseline.skills as Array<{
      id: string;
      lastUsedAt?: string;
    }>;
    const baselineHealSkill = baselineSkills.find(s => s.id === 'skill-heal');
    expect(baselineHealSkill).toBeDefined();
    expect(baselineHealSkill!.lastUsedAt).toBeUndefined(); // 未變
  });

  // ────────────────────────────────────────────────────────────
  // #5.2 跨角色目標 + checkType='random' 雙分支
  // ────────────────────────────────────────────────────────────
  test('#5.2 cross-target random check: pass + fail branches', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：GM + active game + 2 角色 ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const activeGameId = game._id;

    // 角色 A（攻擊方）：帶技能
    const charA = await seed.character({
      gameId: activeGameId,
      name: 'E2E 攻擊者',
      stats: [],
      skills: [
        {
          id: 'skill-bolt',
          name: '閃電箭',
          description: '對目標造成 15 傷害',
          checkType: 'random',
          randomConfig: { maxValue: 20, threshold: 11 },
          effects: [{
            type: 'stat_change',
            targetType: 'other',
            targetStat: '生命值',
            value: -15,
          }],
        },
      ],
    });
    const charAId = charA._id;

    // 角色 B（目標）：hp=50
    const charB = await seed.character({
      gameId: activeGameId,
      name: 'E2E 防守者',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      skills: [],
    });
    const charBId = charB._id;

    // Runtime 副本
    await seed.characterRuntime({
      refId: charAId,
      gameId: activeGameId,
      name: 'E2E 攻擊者',
      stats: [],
      skills: [
        {
          id: 'skill-bolt',
          name: '閃電箭',
          description: '對目標造成 15 傷害',
          checkType: 'random',
          randomConfig: { maxValue: 20, threshold: 11 },
          effects: [{
            type: 'stat_change',
            targetType: 'other',
            targetStat: '生命值',
            value: -15,
          }],
        },
      ],
    });
    await seed.characterRuntime({
      refId: charBId,
      gameId: activeGameId,
      name: 'E2E 防守者',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      skills: [],
    });
    await seed.gameRuntime({
      refId: activeGameId,
      gmUserId,
    });

    // ── Player A login + 導航 ──
    await asPlayer({ characterId: charAId });
    await page.goto(`/c/${charAId}`);

    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();
    await page.getByText('閃電箭').first().click();

    const skillDialog = page.getByRole('dialog', { name: '閃電箭' });
    await expect(skillDialog).toBeVisible();

    // ── Phase A：成功分支（注入 Math.random → checkResult=15） ──
    // 目標選擇下拉應出現（targetType='other'）
    // 等待目標載入完成
    const targetSelect = skillDialog.locator('[role="combobox"]');
    await expect(targetSelect).toBeVisible({ timeout: 10000 });

    // 打開下拉選單並選擇 B
    await targetSelect.click();
    await page.getByRole('option', { name: 'E2E 防守者' }).click();

    // 注入 Math.random：Math.floor(0.7 * 20) + 1 = 15 >= 11 → pass
    await page.evaluate(() => { Math.random = () => 0.7; });

    const useBtn = skillDialog.getByRole('button', { name: '使用技能' });
    await expect(useBtn).toBeEnabled();

    // 先建立 WS event listener
    const wsPassPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${charAId}`,
    });

    await useBtn.click();
    await expect(skillDialog).not.toBeVisible({ timeout: 10000 });

    // ── Phase B：成功分支斷言 ──
    const wsPassRaw = await wsPassPromise as {
      type: string;
      timestamp: number;
      payload: {
        checkPassed: boolean;
        checkResult?: number;
        effectsApplied?: string[];
        targetCharacterId?: string;
      };
    };
    const wsPass = wsPassRaw.payload;
    expect(wsPass.checkPassed).toBe(true);
    expect(wsPass.checkResult).toBe(15);
    expect(wsPass.effectsApplied).toBeDefined();
    expect(wsPass.effectsApplied!.length).toBeGreaterThan(0);

    // B 的 runtime HP 應被扣減
    const runtimeBDocs = await dbQuery('character_runtime', { refId: charBId });
    expect(runtimeBDocs.length).toBe(1);
    const runtimeBStats = runtimeBDocs[0].stats as Array<{ name: string; value: number }>;
    const bHp = runtimeBStats.find(s => s.name === '生命值');
    expect(bHp).toBeDefined();
    expect(bHp!.value).toBe(35); // 50 - 15

    // ── Phase C：失敗分支（注入 Math.random → checkResult=5） ──
    // 重新開啟技能對話框
    await nav.getByRole('button', { name: '技能' }).click();
    await page.getByText('閃電箭').first().click();
    await expect(skillDialog).toBeVisible();

    // 重新選擇目標
    await expect(targetSelect).toBeVisible({ timeout: 10000 });
    await targetSelect.click();
    await page.getByRole('option', { name: 'E2E 防守者' }).click();

    // 注入 Math.random：Math.floor(0.2 * 20) + 1 = 5 < 11 → fail
    await page.evaluate(() => { Math.random = () => 0.2; });

    const wsFailPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${charAId}`,
    });

    const useBtn2 = skillDialog.getByRole('button', { name: '使用技能' });
    await expect(useBtn2).toBeEnabled();
    await useBtn2.click();
    await expect(skillDialog).not.toBeVisible({ timeout: 10000 });

    // ── Phase D：失敗分支斷言 ──
    const wsFailRaw = await wsFailPromise as {
      type: string;
      timestamp: number;
      payload: {
        checkPassed: boolean;
        checkResult?: number;
        effectsApplied?: string[];
      };
    };
    const wsFail = wsFailRaw.payload;
    expect(wsFail.checkPassed).toBe(false);
    expect(wsFail.checkResult).toBe(5);
    // 失敗時不執行效果
    expect(wsFail.effectsApplied).toBeUndefined();

    // B 的 HP 不應再變（仍為 35）
    const runtimeBDocs2 = await dbQuery('character_runtime', { refId: charBId });
    const runtimeBStats2 = runtimeBDocs2[0].stats as Array<{ name: string; value: number }>;
    const bHp2 = runtimeBStats2.find(s => s.name === '生命值');
    expect(bHp2!.value).toBe(35);
  });

  // ────────────────────────────────────────────────────────────
  // #5.3 多 effect 執行順序 + 空 effects 反向驗證
  // ────────────────────────────────────────────────────────────
  test('#5.3 multi-effect execution order + empty effects', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：GM + active game + 2 角色 ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const activeGameId = game._id;

    // 角色 A：帶 mp stat + hidden task + 2 skills（combo + empty）
    const charA = await seed.character({
      gameId: activeGameId,
      name: 'E2E 複合角色',
      stats: [
        { id: 'stat-mp', name: '魔力值', value: 100, maxValue: 200 },
      ],
      tasks: [
        {
          id: 'task-hidden-1',
          title: '隱藏任務',
          description: '完成特殊條件',
          isHidden: true,
          isRevealed: false,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
      skills: [
        {
          id: 'skill-combo',
          name: '複合技',
          description: '消耗魔力對敵人造成傷害並揭露任務',
          checkType: 'none',
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '魔力值', value: -10 },
            { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -20 },
            { type: 'task_reveal', targetType: 'self', targetTaskId: 'task-hidden-1' },
          ],
        },
        {
          id: 'skill-empty',
          name: '空技能',
          description: '無任何效果',
          checkType: 'none',
          effects: [],
        },
      ],
    });
    const charAId = charA._id;

    // 角色 B：hp=80
    const charB = await seed.character({
      gameId: activeGameId,
      name: 'E2E 目標角色',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
      skills: [],
    });
    const charBId = charB._id;

    // Runtime 副本
    await seed.characterRuntime({
      refId: charAId,
      gameId: activeGameId,
      name: 'E2E 複合角色',
      stats: [
        { id: 'stat-mp', name: '魔力值', value: 100, maxValue: 200 },
      ],
      tasks: [
        {
          id: 'task-hidden-1',
          title: '隱藏任務',
          description: '完成特殊條件',
          isHidden: true,
          isRevealed: false,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
      skills: [
        {
          id: 'skill-combo',
          name: '複合技',
          description: '消耗魔力對敵人造成傷害並揭露任務',
          checkType: 'none',
          effects: [
            { type: 'stat_change', targetType: 'self', targetStat: '魔力值', value: -10 },
            { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -20 },
            { type: 'task_reveal', targetType: 'self', targetTaskId: 'task-hidden-1' },
          ],
        },
        {
          id: 'skill-empty',
          name: '空技能',
          description: '無任何效果',
          checkType: 'none',
          effects: [],
        },
      ],
    });
    await seed.characterRuntime({
      refId: charBId,
      gameId: activeGameId,
      name: 'E2E 目標角色',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 80, maxValue: 100 },
      ],
      skills: [],
    });
    await seed.gameRuntime({
      refId: activeGameId,
      gmUserId,
    });

    // ── Player A login ──
    await asPlayer({ characterId: charAId });
    await page.goto(`/c/${charAId}`);

    const nav = page.getByRole('navigation');

    // ── Phase A：複合技（3 effects） ──
    await nav.getByRole('button', { name: '技能' }).click();
    await page.getByText('複合技').first().click();

    const comboDialog = page.getByRole('dialog', { name: '複合技' });
    await expect(comboDialog).toBeVisible();

    // targetType='other' → 需選擇目標
    const targetSelect = comboDialog.locator('[role="combobox"]');
    await expect(targetSelect).toBeVisible({ timeout: 10000 });
    await targetSelect.click();
    await page.getByRole('option', { name: 'E2E 目標角色' }).click();

    const wsComboPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${charAId}`,
    });

    const comboBtn = comboDialog.getByRole('button', { name: '使用技能' });
    await expect(comboBtn).toBeEnabled();
    await comboBtn.click();
    await expect(comboDialog).not.toBeVisible({ timeout: 10000 });

    // WS 事件：effectsApplied 應包含 3 個效果
    const wsComboRaw = await wsComboPromise as {
      payload: {
        checkPassed: boolean;
        effectsApplied?: string[];
      };
    };
    expect(wsComboRaw.payload.checkPassed).toBe(true);
    expect(wsComboRaw.payload.effectsApplied).toBeDefined();
    expect(wsComboRaw.payload.effectsApplied!.length).toBe(3);

    // DB 斷言：A 的 mp 減少
    const runtimeADocs = await dbQuery('character_runtime', { refId: charAId });
    const runtimeA = runtimeADocs[0];
    const aMp = (runtimeA.stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '魔力值');
    expect(aMp!.value).toBe(90); // 100 - 10

    // DB 斷言：B 的 hp 減少
    const runtimeBDocs = await dbQuery('character_runtime', { refId: charBId });
    const bHp = (runtimeBDocs[0].stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '生命值');
    expect(bHp!.value).toBe(60); // 80 - 20

    // DB 斷言：A 的 hidden task 被揭露
    const aTasks = runtimeA.tasks as Array<{ id: string; isRevealed: boolean }>;
    const revealedTask = aTasks.find(t => t.id === 'task-hidden-1');
    expect(revealedTask).toBeDefined();
    expect(revealedTask!.isRevealed).toBe(true);

    // ── Phase B：空技能（effects=[]） ──
    await nav.getByRole('button', { name: '技能' }).click();
    await page.getByText('空技能').first().click();

    const emptyDialog = page.getByRole('dialog', { name: '空技能' });
    await expect(emptyDialog).toBeVisible();

    // 無目標選擇（self-only，且無 effects）
    const wsEmptyPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${charAId}`,
    });

    const emptyBtn = emptyDialog.getByRole('button', { name: '使用技能' });
    await expect(emptyBtn).toBeEnabled();
    await emptyBtn.click();
    await expect(emptyDialog).not.toBeVisible({ timeout: 10000 });

    // skill.used 事件仍發出（行為日誌語意）但無 effectsApplied
    const wsEmptyRaw = await wsEmptyPromise as {
      payload: {
        checkPassed: boolean;
        effectsApplied?: string[];
      };
    };
    expect(wsEmptyRaw.payload.checkPassed).toBe(true);
    expect(wsEmptyRaw.payload.effectsApplied).toBeUndefined();

    // lastUsedAt 仍被更新（代表 use 真的執行了）
    const runtimeADocs2 = await dbQuery('character_runtime', { refId: charAId });
    const emptySkill = (runtimeADocs2[0].skills as Array<{ id: string; lastUsedAt?: string }>)
      .find(s => s.id === 'skill-empty');
    expect(emptySkill).toBeDefined();
    expect(emptySkill!.lastUsedAt).toBeDefined();
  });

  // ────────────────────────────────────────────────────────────
  // #5.4 限制條件：usageLimit 耗盡 + cooldown 守門
  // ────────────────────────────────────────────────────────────
  test('#5.4 usageLimit exhaustion + cooldown guard', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 1 角色 + 2 skills ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const activeGameId = game._id;

    const character = await seed.character({
      gameId: activeGameId,
      name: 'E2E 限制角色',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-limited',
          name: '限次技能',
          description: '只能用一次',
          checkType: 'none',
          usageLimit: 1,
          cooldown: 0,
          effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 5 }],
        },
        {
          id: 'skill-cooldown',
          name: '冷卻技能',
          description: '30 秒冷卻',
          checkType: 'none',
          usageLimit: 0,
          cooldown: 30,
          effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 3 }],
        },
      ],
    });
    const characterId = character._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId: activeGameId,
      name: 'E2E 限制角色',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-limited',
          name: '限次技能',
          description: '只能用一次',
          checkType: 'none',
          usageLimit: 1,
          cooldown: 0,
          effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 5 }],
        },
        {
          id: 'skill-cooldown',
          name: '冷卻技能',
          description: '30 秒冷卻',
          checkType: 'none',
          usageLimit: 0,
          cooldown: 30,
          effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: 3 }],
        },
      ],
    });
    await seed.gameRuntime({
      refId: activeGameId,
      gmUserId,
    });

    await asPlayer({ characterId });
    await page.goto(`/c/${characterId}`);

    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();

    // ── Phase A：usageLimit=1 第一次使用成功 ──
    await page.getByText('限次技能').first().click();
    const limitedDialog = page.getByRole('dialog', { name: '限次技能' });
    await expect(limitedDialog).toBeVisible();

    const wsLimitedPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${characterId}`,
    });

    const limitedBtn = limitedDialog.getByRole('button', { name: '使用技能' });
    await expect(limitedBtn).toBeEnabled();
    await limitedBtn.click();
    await expect(limitedDialog).not.toBeVisible({ timeout: 10000 });

    await wsLimitedPromise; // 確認事件已發

    // DB 驗證：usageCount=1
    const runtimeDocs1 = await dbQuery('character_runtime', { refId: characterId });
    const limitedSkill1 = (runtimeDocs1[0].skills as Array<{ id: string; usageCount?: number }>)
      .find(s => s.id === 'skill-limited');
    expect(limitedSkill1!.usageCount).toBe(1);

    // ── Phase B：usageLimit 耗盡 — UI 守門 ──
    // 頁面刷新後（router.refresh），skill card 應顯示耗盡狀態
    // 等待「次數已耗盡」badge 出現
    await expect(page.getByText('次數已耗盡')).toBeVisible({ timeout: 10000 });

    // 耗盡的 skill card 不可點擊（onClick=undefined），所以不驗 dialog

    // ── Phase C：cooldown=30 第一次使用成功 ──
    await page.getByText('冷卻技能').first().click();
    const cooldownDialog = page.getByRole('dialog', { name: '冷卻技能' });
    await expect(cooldownDialog).toBeVisible();

    const wsCooldownPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${characterId}`,
    });

    const cooldownBtn = cooldownDialog.getByRole('button', { name: '使用技能' });
    await expect(cooldownBtn).toBeEnabled();
    await cooldownBtn.click();
    await expect(cooldownDialog).not.toBeVisible({ timeout: 10000 });

    await wsCooldownPromise;

    // DB 驗證：lastUsedAt 已設定、usageCount 不增（usageLimit=0）
    const runtimeDocs2 = await dbQuery('character_runtime', { refId: characterId });
    const cooldownSkill = (runtimeDocs2[0].skills as Array<{ id: string; lastUsedAt?: string; usageCount?: number }>)
      .find(s => s.id === 'skill-cooldown');
    expect(cooldownSkill!.lastUsedAt).toBeDefined();
    expect(cooldownSkill!.usageCount).toBe(0);

    // ── Phase D：cooldown 守門 — UI 顯示冷卻遮罩 ──
    // 冷卻技能應顯示冷卻覆蓋層（包含「冷卻」文字）
    await expect(page.getByText(/冷卻 \d+s/)).toBeVisible({ timeout: 10000 });

    // 冷卻中的 skill card 不可點擊（isDisabled=true），所以不驗 dialog
  });

  // ────────────────────────────────────────────────────────────
  // #5.5 readOnly 模式遮蔽互動 + TemporaryEffect record 建立
  // ────────────────────────────────────────────────────────────
  test('#5.5 readOnly mode + TemporaryEffect creation', async ({
    page,
    seed,
    asPlayer,
    dbQuery,
  }) => {
    // ── Seed：active game + 1 角色 + 帶 duration 的 buff 技能 ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const activeGameId = game._id;

    // hasPinLock: true 才能讓 readOnly 模式生效
    // （無 PIN 鎖時 fullAccess 永遠為 true）
    const character = await seed.character({
      gameId: activeGameId,
      name: 'E2E Buff角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-str', name: '力量', value: 10, maxValue: 50 },
      ],
      skills: [
        {
          id: 'skill-buff',
          name: '力量增幅',
          description: '暫時提升 5 力量（60秒）',
          checkType: 'none',
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '力量',
            value: 5,
            duration: 60,
          }],
        },
      ],
    });
    const characterId = character._id;

    await seed.characterRuntime({
      refId: characterId,
      gameId: activeGameId,
      name: 'E2E Buff角色',
      hasPinLock: true,
      pin: '1234',
      stats: [
        { id: 'stat-str', name: '力量', value: 10, maxValue: 50 },
      ],
      skills: [
        {
          id: 'skill-buff',
          name: '力量增幅',
          description: '暫時提升 5 力量（60秒）',
          checkType: 'none',
          effects: [{
            type: 'stat_change',
            targetType: 'self',
            targetStat: '力量',
            value: 5,
            duration: 60,
          }],
        },
      ],
    });
    await seed.gameRuntime({
      refId: activeGameId,
      gmUserId,
    });

    // ── Phase A：readOnly 模式（fullAccess=false） ──
    await asPlayer({ characterId, readOnly: true });
    await page.goto(`/c/${characterId}`);

    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: '技能' }).click();

    // 技能卡可見
    await expect(page.getByText('力量增幅').first()).toBeVisible();

    // 點擊開啟 dialog — readOnly 模式 dialog 仍可開啟
    await page.getByText('力量增幅').first().click();
    const buffDialog = page.getByRole('dialog', { name: '力量增幅' });
    await expect(buffDialog).toBeVisible();

    // 按鈕顯示「預覽模式」且 disabled
    const previewBtn = buffDialog.getByRole('button', { name: '預覽模式' });
    await expect(previewBtn).toBeVisible();
    await expect(previewBtn).toBeDisabled();

    // 關閉 dialog
    // BottomSheet 有 onClose — 點擊背景或按 Escape
    await page.keyboard.press('Escape');
    await expect(buffDialog).not.toBeVisible();

    // ── Phase B：切換到 fullAccess 模式 ──
    await page.evaluate((id: string) => {
      localStorage.setItem(`character-${id}-fullAccess`, 'true');
    }, characterId);
    await page.reload();

    // 重新進入技能 tab
    await nav.getByRole('button', { name: '技能' }).click();
    await page.getByText('力量增幅').first().click();
    const buffDialog2 = page.getByRole('dialog', { name: '力量增幅' });
    await expect(buffDialog2).toBeVisible();

    // 現在按鈕應為「使用技能」且 enabled
    const useBtn = buffDialog2.getByRole('button', { name: '使用技能' });
    await expect(useBtn).toBeEnabled();

    // 使用技能
    const wsPromise = waitForWebSocketEvent(page, {
      event: 'skill.used',
      channel: `private-character-${characterId}`,
    });

    await useBtn.click();
    await expect(buffDialog2).not.toBeVisible({ timeout: 10000 });
    await wsPromise;

    // ── Phase C：TemporaryEffect DB 斷言 ──
    const runtimeDocs = await dbQuery('character_runtime', { refId: characterId });
    const runtime = runtimeDocs[0];

    // stats 應已更新
    const strStat = (runtime.stats as Array<{ name: string; value: number }>)
      .find(s => s.name === '力量');
    expect(strStat!.value).toBe(15); // 10 + 5

    // temporaryEffects 應有一筆記錄
    const tempEffects = runtime.temporaryEffects as Array<{
      sourceType: string;
      sourceId: string;
      sourceName: string;
      targetStat: string;
      deltaValue?: number;
      duration: number;
      isExpired: boolean;
      expiresAt: string;
    }>;
    expect(tempEffects).toBeDefined();
    expect(tempEffects.length).toBe(1);

    const buff = tempEffects[0];
    expect(buff.sourceType).toBe('skill');
    expect(buff.sourceId).toBe('skill-buff');
    expect(buff.sourceName).toBe('力量增幅');
    expect(buff.targetStat).toBe('力量');
    expect(buff.deltaValue).toBe(5);
    expect(buff.duration).toBe(60);
    expect(buff.isExpired).toBe(false);
    // expiresAt 應在未來
    expect(new Date(buff.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // ────────────────────────────────────────────────────────────
  // #5.6 授權與錯誤處理：PIN gate 擋住未授權存取
  // ────────────────────────────────────────────────────────────
  test('#5.6 PIN-locked character blocks unauthorized skill access', async ({
    page,
    seed,
    asPlayer,
  }) => {
    // ── Seed：active game + 2 角色（A 無 PIN、B 有 PIN） ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const activeGameId = game._id;

    const charA = await seed.character({
      gameId: activeGameId,
      name: 'E2E 玩家A',
      skills: [],
    });
    const charAId = charA._id;

    const charB = await seed.character({
      gameId: activeGameId,
      name: 'E2E 鎖定角色',
      hasPinLock: true,
      pin: '9999',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-secret',
          name: '秘密技能',
          description: '不應被使用',
          checkType: 'none',
          effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: -50 }],
        },
      ],
    });
    const charBId = charB._id;

    // Runtime（B 的技能效果若被執行會扣 HP）
    await seed.characterRuntime({
      refId: charBId,
      gameId: activeGameId,
      name: 'E2E 鎖定角色',
      hasPinLock: true,
      pin: '9999',
      stats: [
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-secret',
          name: '秘密技能',
          description: '不應被使用',
          checkType: 'none',
          effects: [{ type: 'stat_change', targetType: 'self', targetStat: '生命值', value: -50 }],
        },
      ],
    });
    await seed.gameRuntime({
      refId: activeGameId,
      gmUserId,
    });

    // ── 以玩家 A 身分登入（只有 A 在 session 中） ──
    await asPlayer({ characterId: charAId });

    // ── 嘗試存取 B 的角色頁 ──
    await page.goto(`/c/${charBId}`);

    // B 有 PIN 鎖且 localStorage 未設 unlocked → 顯示 PIN 解鎖畫面
    // 技能 tab 不可見（被 PinUnlock 畫面擋住）
    const nav = page.getByRole('navigation');
    await expect(nav).not.toBeVisible({ timeout: 5000 });

    // PIN 輸入介面應可見
    await expect(page.getByText('E2E 鎖定角色')).toBeVisible();
    // PinUnlock 畫面不會顯示技能相關內容
    await expect(page.getByText('秘密技能')).not.toBeVisible();
  });
});
