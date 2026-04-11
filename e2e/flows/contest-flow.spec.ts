/**
 * Flow #6 — 對抗檢定（contest / random_contest）
 *
 * 驗證「對抗檢定」的完整三階段事件閉環：
 * - 雙 browser context 即時互動（A 攻擊 → B 防禦 → 結果）
 * - 三階段 WS 事件：skill.contest subType: request → result → effect
 * - contest / random_contest 雙路徑
 * - 防守方資源選擇 + combat tag 過濾 + equipment 過濾
 * - 三種勝負：attacker_wins / defender_wins / both_fail
 *
 * @see docs/refactoring/E2E_FLOW_6_CONTEST.md
 */

import { test, expect, type Page } from '../fixtures';
import { waitForWebSocketEvent } from '../helpers/wait-for-websocket-event';
import { setupDualPlayerContext } from '../helpers/setup-dual-player-context';

// ── 共用 helper：攻擊方發動對抗技能 ──────────────────
async function attackerUseContestSkill(
  pageA: Page,
  attackerId: string,
  skillName: string,
  defenderName: string,
) {
  await pageA.goto(`/c/${attackerId}`);
  const nav = pageA.getByRole('navigation');
  await nav.getByRole('button', { name: '技能' }).click();

  // 點擊技能卡開啟 BottomSheet
  await pageA.getByText(skillName).first().click();
  const skillDialog = pageA.getByRole('dialog', { name: skillName });
  await expect(skillDialog).toBeVisible();

  // 選擇目標角色
  const targetSelect = skillDialog.locator('button[role="combobox"]');
  await targetSelect.click();
  await pageA.getByRole('option', { name: defenderName }).click();

  // 使用技能
  const useBtn = skillDialog.getByRole('button', { name: '使用技能' });
  await expect(useBtn).toBeEnabled();
  await useBtn.click();
}

test.describe('Flow #6 — Contest (對抗檢定)', () => {
  // ─── #6.1 Happy path：contest + 不防禦 + attacker_wins + 效果執行 ─────
  test('#6.1 happy path: contest + no defense → attacker_wins + stat_change applied', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=80，技能「重擊」contest/str，opponentMax=0/0，效果 hp -20
    const charA = await seed.character({
      gameId,
      name: '攻擊者A',
      stats: [{ id: 'stat-str', name: '力量', value: 80, maxValue: 100 }],
      skills: [{
        id: 'skill-strike',
        name: '重擊',
        description: '強力攻擊',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -20,
        }],
        tags: [],
      }],
    });

    // 防守方：str=30, hp=100
    const charB = await seed.character({
      gameId,
      name: '防守者B',
      stats: [
        { id: 'stat-str', name: '力量', value: 30, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
    });

    // Runtime（Active game 需要）
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '攻擊者A',
      stats: [{ id: 'stat-str', name: '力量', value: 80, maxValue: 100 }],
      skills: [{
        id: 'skill-strike',
        name: '重擊',
        description: '強力攻擊',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -20,
        }],
        tags: [],
      }],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '防守者B',
      stats: [
        { id: 'stat-str', name: '力量', value: 30, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // ── Phase A — 防守方先載入頁面（建立 SSE 連線） ──
      await pageB.goto(`/c/${charB._id}`);
      // 等待角色卡載入（用通知按鈕作為載入指標）
      await pageB.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

      // 建立 WS listener：request 事件（防守方收到對抗請求）
      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: { path: 'payload.subType', value: 'request' },
      });

      // ── Phase B — 攻擊方發動對抗 ──
      await attackerUseContestSkill(pageA, charA._id, '重擊', '防守者B');

      // 攻擊方 UI：skill dialog 關閉或顯示成功
      // useSkill 返回 message: '已對 防守者B 發起對抗檢定'
      // 等待 sheet 關閉
      await expect(pageA.getByRole('dialog', { name: '重擊' })).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — 防守方收到對抗請求 ──
      const requestEvent = await requestPromise as { payload: Record<string, unknown> };
      const reqPayload = requestEvent.payload;
      expect(reqPayload.subType).toBe('request');
      expect(reqPayload.attackerName).toBe('攻擊者A');
      expect(reqPayload.checkType).toBe('contest');
      expect(reqPayload.opponentMaxItems).toBe(0);
      expect(reqPayload.opponentMaxSkills).toBe(0);

      // ContestResponseDialog 出現
      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // opponentMax=0/0 → 顯示「只能使用基礎數值對抗」
      await expect(contestDialog.getByText('只能使用基礎數值對抗')).toBeVisible();

      // 按鈕文案：無選擇 → 「使用基礎數值回應」
      const respondBtn = contestDialog.getByRole('button', { name: '使用基礎數值回應' });
      await expect(respondBtn).toBeVisible();

      // 建立 result WS listener（攻擊方收到結果）
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: { path: 'payload.subType', value: 'result' },
      });

      // ── Phase D — 防守方回應（不防禦） ──
      await respondBtn.click();

      // 對話框關閉
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase E — 結果驗證 ──
      const resultEventA = await resultPromiseA as { payload: Record<string, unknown> };
      const resultPayload = resultEventA.payload;
      expect(resultPayload.subType).toBe('result');
      expect(resultPayload.result).toBe('attacker_wins'); // 80 > 30

      // ── Phase F — DB 驗證 ──
      // 防守方 HP = 80（100 - 20）
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      expect(runtimeB.length).toBe(1);
      const bStats = runtimeB[0].stats as Array<{ name: string; value: number }>;
      const bHp = bStats.find(s => s.name === '生命值');
      expect(bHp).toBeDefined();
      expect(bHp!.value).toBe(80);

      // 攻擊方 stats 不變
      const runtimeA = await dbQuery('character_runtime', { refId: charA._id });
      const aStats = runtimeA[0].stats as Array<{ name: string; value: number }>;
      const aStr = aStats.find(s => s.name === '力量');
      expect(aStr!.value).toBe(80);

      // Baseline 隔離：防守方 baseline HP 仍為 100
      const baselineB = await dbQuery('characters', { _id: charB._id });
      const baseStats = baselineB[0].stats as Array<{ name: string; value: number }>;
      const baseHp = baseStats.find(s => s.name === '生命值');
      expect(baseHp!.value).toBe(100);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6.2 技能防禦 + attacker_wins + combat tag 過濾 ───────────
  test('#6.2 skill defense + attacker_wins + combat tag filtering', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=70，技能「戰鬥打擊」有 combat tag，允許 1 技能防禦
    const charA = await seed.character({
      gameId,
      name: '戰鬥攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 70, maxValue: 100 }],
      skills: [{
        id: 'skill-combat-strike',
        name: '戰鬥打擊',
        description: '帶戰鬥標籤的攻擊',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 1,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -15,
        }],
        tags: ['combat'],
      }],
    });

    // 防守方：str=50, hp=100，兩個防禦技能（一個 combat，一個 non-combat）
    const charB = await seed.character({
      gameId,
      name: '技能防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 50, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-defend-combat',
          name: '戰鬥防禦',
          description: '有 combat tag 的防禦技能',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: ['combat'],
          effects: [],
        },
        {
          id: 'skill-defend-noncombat',
          name: '一般防禦',
          description: '無 combat tag 的防禦技能',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: [],
          effects: [],
        },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '戰鬥攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 70, maxValue: 100 }],
      skills: [{
        id: 'skill-combat-strike',
        name: '戰鬥打擊',
        description: '帶戰鬥標籤的攻擊',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 1,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -15,
        }],
        tags: ['combat'],
      }],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '技能防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 50, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      skills: [
        {
          id: 'skill-defend-combat',
          name: '戰鬥防禦',
          description: '有 combat tag 的防禦技能',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: ['combat'],
          effects: [],
        },
        {
          id: 'skill-defend-noncombat',
          name: '一般防禦',
          description: '無 combat tag 的防禦技能',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: [],
          effects: [],
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // ── Phase A — 防守方先載入 ──
      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

      // 建立 request WS listener
      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: { path: 'payload.subType', value: 'request' },
      });

      // ── Phase B — 攻擊方發動 ──
      await attackerUseContestSkill(pageA, charA._id, '戰鬥打擊', '技能防守者');
      await expect(pageA.getByRole('dialog', { name: '戰鬥打擊' })).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — 防守方收到請求 ──
      const requestEvent = await requestPromise as { payload: Record<string, unknown> };
      expect(requestEvent.payload.attackerHasCombatTag).toBe(true);
      expect(requestEvent.payload.opponentMaxSkills).toBe(1);

      // Contest dialog 出現
      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // ── Phase D — Combat tag 過濾驗證 ──
      // 有 combat tag 的「戰鬥防禦」應可見
      await expect(contestDialog.getByText('戰鬥防禦')).toBeVisible();
      // 無 combat tag 的「一般防禦」不應出現（被篩選掉）
      await expect(contestDialog.getByText('一般防禦')).not.toBeVisible();

      // 選擇「戰鬥防禦」技能
      await contestDialog.getByText('戰鬥防禦').click();

      // 按鈕文案變為「確認回應」
      const respondBtn = contestDialog.getByRole('button', { name: '確認回應' });
      await expect(respondBtn).toBeVisible();

      // 建立 result WS listener
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: { path: 'payload.subType', value: 'result' },
      });

      // ── Phase E — 防守方回應 ──
      await respondBtn.click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase F — 結果驗證（attacker_wins: 70 > 50） ──
      const resultEventA = await resultPromiseA as { payload: Record<string, unknown> };
      expect(resultEventA.payload.result).toBe('attacker_wins');

      // ── Phase G — DB 驗證 ──
      // 防守方 HP = 85（100 - 15）
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      expect(runtimeB.length).toBe(1);
      const bStats = runtimeB[0].stats as Array<{ name: string; value: number }>;
      const bHp = bStats.find(s => s.name === '生命值');
      expect(bHp!.value).toBe(85);

      // Baseline 隔離
      const baselineB = await dbQuery('characters', { _id: charB._id });
      const baseStats = baselineB[0].stats as Array<{ name: string; value: number }>;
      expect(baseStats.find(s => s.name === '生命值')!.value).toBe(100);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6.3 道具防禦 + defender_wins + combat tag + equipment 過濾 ────
  test('#6.3 item defense + defender_wins + combat/equipment filtering', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=40，combat tag，允許 1 道具防禦
    const charA = await seed.character({
      gameId,
      name: '道具測試攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 40, maxValue: 100 }],
      skills: [{
        id: 'skill-combat-attack',
        name: '戰鬥攻擊',
        description: '帶戰鬥標籤的攻擊（允許道具防禦）',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 1,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -10,
        }],
        tags: ['combat'],
      }],
    });

    // 防守方：str=70, hp=100，3 個道具（1 combat tool / 1 non-combat tool / 1 equipment）
    const charB = await seed.character({
      gameId,
      name: '道具防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 70, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-shield',
          name: '戰鬥盾牌',
          description: 'combat + tool → 應出現',
          type: 'tool',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: ['combat'],
          quantity: 1,
          usageLimit: 0,
          cooldown: 0,
        },
        {
          id: 'item-tool-noncombat',
          name: '偵查道具',
          description: '無 combat tag → 不應出現',
          type: 'tool',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: [],
          quantity: 1,
          usageLimit: 0,
          cooldown: 0,
        },
        {
          id: 'item-equipment',
          name: '護甲',
          description: 'equipment checkType=none → 不應出現',
          type: 'equipment',
          checkType: 'none',
          tags: ['combat'],
          quantity: 1,
          equipped: true,
        },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '道具測試攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 40, maxValue: 100 }],
      skills: [{
        id: 'skill-combat-attack',
        name: '戰鬥攻擊',
        description: '帶戰鬥標籤的攻擊（允許道具防禦）',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 1,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -10,
        }],
        tags: ['combat'],
      }],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '道具防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 70, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      items: [
        {
          id: 'item-shield',
          name: '戰鬥盾牌',
          description: 'combat + tool → 應出現',
          type: 'tool',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: ['combat'],
          quantity: 1,
          usageLimit: 0,
          cooldown: 0,
        },
        {
          id: 'item-tool-noncombat',
          name: '偵查道具',
          description: '無 combat tag → 不應出現',
          type: 'tool',
          checkType: 'contest',
          contestConfig: { relatedStat: '力量' },
          tags: [],
          quantity: 1,
          usageLimit: 0,
          cooldown: 0,
        },
        {
          id: 'item-equipment',
          name: '護甲',
          description: 'equipment checkType=none → 不應出現',
          type: 'equipment',
          checkType: 'none',
          tags: ['combat'],
          quantity: 1,
          equipped: true,
        },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // ── Phase A — 防守方先載入 ──
      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: { path: 'payload.subType', value: 'request' },
      });

      // ── Phase B — 攻擊方發動 ──
      await attackerUseContestSkill(pageA, charA._id, '戰鬥攻擊', '道具防守者');
      await expect(pageA.getByRole('dialog', { name: '戰鬥攻擊' })).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — 防守方收到請求 + 三層過濾驗證 ──
      await requestPromise;
      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // ✅ 戰鬥盾牌（combat + tool + contest）→ 可見
      await expect(contestDialog.getByText('戰鬥盾牌')).toBeVisible();
      // ❌ 偵查道具（無 combat tag）→ 被過濾
      await expect(contestDialog.getByText('偵查道具')).not.toBeVisible();
      // ❌ 護甲（equipment, checkType=none ≠ contest）→ 被過濾
      await expect(contestDialog.getByText('護甲')).not.toBeVisible();

      // 選擇戰鬥盾牌
      await contestDialog.getByText('戰鬥盾牌').click();
      const respondBtn = contestDialog.getByRole('button', { name: '確認回應' });
      await expect(respondBtn).toBeVisible();

      // 建立 result WS listener（攻擊方）
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: { path: 'payload.subType', value: 'result' },
      });

      // ── Phase D — 回應 ──
      await respondBtn.click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase E — 結果驗證（defender_wins: 40 < 70） ──
      const resultEventA = await resultPromiseA as { payload: Record<string, unknown> };
      expect(resultEventA.payload.result).toBe('defender_wins');

      // ── Phase F — DB 驗證 ──
      // defender_wins → 攻擊方效果不執行，B HP 維持 100
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      const bStats = runtimeB[0].stats as Array<{ name: string; value: number }>;
      expect(bStats.find(s => s.name === '生命值')!.value).toBe(100);

      // A stats 不變
      const runtimeA = await dbQuery('character_runtime', { refId: charA._id });
      const aStats = runtimeA[0].stats as Array<{ name: string; value: number }>;
      expect(aStats.find(s => s.name === '力量')!.value).toBe(40);

      // Baseline 隔離
      const baselineB = await dbQuery('characters', { _id: charB._id });
      const baseStats = baselineB[0].stats as Array<{ name: string; value: number }>;
      expect(baseStats.find(s => s.name === '生命值')!.value).toBe(100);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6.4 random_contest + conditional result (tieResolution=both_fail) ──
  test('#6.4 random_contest: event structure + conditional DB assertion', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：hp=100，random_contest 技能（tieResolution=both_fail）
    const charA = await seed.character({
      gameId,
      name: '隨機攻擊者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
      skills: [{
        id: 'skill-gamble',
        name: '賭運',
        description: '隨機對抗',
        checkType: 'random_contest',
        contestConfig: {
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'both_fail',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -30,
        }],
        tags: [],
      }],
    });

    // 防守方：hp=100
    const charB = await seed.character({
      gameId,
      name: '隨機防守者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '隨機攻擊者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
      skills: [{
        id: 'skill-gamble',
        name: '賭運',
        description: '隨機對抗',
        checkType: 'random_contest',
        contestConfig: {
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'both_fail',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -30,
        }],
        tags: [],
      }],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '隨機防守者',
      stats: [{ id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 }],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // ── Phase A — 防守方先載入 ──
      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: { path: 'payload.subType', value: 'request' },
      });

      // ── Phase B — 攻擊方發動 random_contest ──
      await attackerUseContestSkill(pageA, charA._id, '賭運', '隨機防守者');
      await expect(pageA.getByRole('dialog', { name: '賭運' })).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — request 事件驗證 ──
      const requestEvent = await requestPromise as { payload: Record<string, unknown> };
      const reqPayload = requestEvent.payload;
      expect(reqPayload.subType).toBe('request');
      expect(reqPayload.checkType).toBe('random_contest');
      // random_contest 隱匿攻擊方骰值
      expect(reqPayload.attackerValue).toBe(0);

      // Contest dialog 出現
      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // opponentMax=0/0 → 只能基礎數值
      await expect(contestDialog.getByText('只能使用基礎數值對抗')).toBeVisible();

      // 建立 result WS listener（攻擊方）
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: { path: 'payload.subType', value: 'result' },
      });

      // ── Phase D — 防守方回應 ──
      const respondBtn = contestDialog.getByRole('button', { name: '使用基礎數值回應' });
      await respondBtn.click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase E — 結果驗證（random，三種都可能） ──
      const resultEventA = await resultPromiseA as { payload: Record<string, unknown> };
      const resultPayload = resultEventA.payload;
      expect(resultPayload.subType).toBe('result');
      expect(resultPayload.checkType).toBe('random_contest');
      // 結構驗證：骰值 >= 1
      expect(resultPayload.attackerValue).toBeGreaterThanOrEqual(1);
      expect(resultPayload.defenderValue).toBeGreaterThanOrEqual(1);
      // 結果為三種之一
      expect(['attacker_wins', 'defender_wins', 'both_fail']).toContain(resultPayload.result);

      // ── Phase F — DB 條件驗證 ──
      // 等待效果執行完成（polling 取代固定 timeout — 方法 2）
      const expectedBHp = resultPayload.result === 'attacker_wins' ? 70 : 100;
      await expect.poll(async () => {
        const rt = await dbQuery('character_runtime', { refId: charB._id });
        return (rt[0]?.stats as Array<{ name: string; value: number }>)
          .find(s => s.name === '生命值')?.value;
      }, { timeout: 10000 }).toBe(expectedBHp);

      // Baseline 隔離：A, B baseline 都不變
      const baselineA = await dbQuery('characters', { _id: charA._id });
      expect((baselineA[0].stats as Array<{ name: string; value: number }>)
        .find(s => s.name === '生命值')!.value).toBe(100);
      const baselineB = await dbQuery('characters', { _id: charB._id });
      expect((baselineB[0].stats as Array<{ name: string; value: number }>)
        .find(s => s.name === '生命值')!.value).toBe(100);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6.5 單選限制 + 道具/技能互斥切換 ───────────
  test('#6.5 single-select + item/skill mutual exclusion', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=60，允許道具+技能防禦
    const charA = await seed.character({
      gameId,
      name: '彈性攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 60, maxValue: 100 }],
      skills: [{
        id: 'skill-flex-contest',
        name: '彈性對抗',
        description: '允許防禦資源',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 99,
          opponentMaxSkills: 99,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -10,
        }],
        tags: [],
      }],
    });

    // 防守方：str=50, hp=100，2 道具 + 2 技能（全部 checkType=contest, relatedStat=力量, 無 combat tag）
    const charB = await seed.character({
      gameId,
      name: '多資源防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 50, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      items: [
        { id: 'item-d1', name: '防具一', description: '防禦用', type: 'tool', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], quantity: 1 },
        { id: 'item-d2', name: '防具二', description: '防禦用', type: 'tool', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], quantity: 1 },
      ],
      skills: [
        { id: 'skill-d1', name: '防禦技一', description: '防禦', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], effects: [] },
        { id: 'skill-d2', name: '防禦技二', description: '防禦', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], effects: [] },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '彈性攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 60, maxValue: 100 }],
      skills: [{
        id: 'skill-flex-contest',
        name: '彈性對抗',
        description: '允許防禦資源',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 99,
          opponentMaxSkills: 99,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -10,
        }],
        tags: [],
      }],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '多資源防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 50, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
      items: [
        { id: 'item-d1', name: '防具一', description: '防禦用', type: 'tool', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], quantity: 1 },
        { id: 'item-d2', name: '防具二', description: '防禦用', type: 'tool', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], quantity: 1 },
      ],
      skills: [
        { id: 'skill-d1', name: '防禦技一', description: '防禦', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], effects: [] },
        { id: 'skill-d2', name: '防禦技二', description: '防禦', checkType: 'contest', contestConfig: { relatedStat: '力量' }, tags: [], effects: [] },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // ── Phase A — 防守方先載入 ──
      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: { path: 'payload.subType', value: 'request' },
      });

      // ── Phase B — 攻擊方發動 ──
      await attackerUseContestSkill(pageA, charA._id, '彈性對抗', '多資源防守者');
      await expect(pageA.getByRole('dialog', { name: '彈性對抗' })).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — 防守方收到請求 ──
      await requestPromise;
      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // 斷言：2 道具 + 2 技能全部可見（無 combat tag 限制）
      await expect(contestDialog.getByText('防具一')).toBeVisible();
      await expect(contestDialog.getByText('防具二')).toBeVisible();
      await expect(contestDialog.getByText('防禦技一')).toBeVisible();
      await expect(contestDialog.getByText('防禦技二')).toBeVisible();

      // ── Phase D — 單選限制：選一個道具後其餘 disabled ──
      await contestDialog.getByText('防具一').click();
      await expect(contestDialog.getByRole('button', { name: '確認回應' })).toBeVisible();

      // 防具二 應被 disabled（opacity 降低，無法點擊）
      const item2Card = contestDialog.locator('.rounded-xl').filter({ hasText: '防具二' });
      await expect(item2Card).toHaveCSS('opacity', '0.4');

      // 技能也應被 disabled（跨類別互斥）
      const skill1Card = contestDialog.locator('.rounded-xl').filter({ hasText: '防禦技一' });
      await expect(skill1Card).toHaveCSS('opacity', '0.4');

      // ── Phase E — 取消道具 → 切換到技能 ──
      // 再次點擊防具一 → 取消勾選
      await contestDialog.getByText('防具一').click();
      // 按鈕恢復為「使用基礎數值回應」
      await expect(contestDialog.getByRole('button', { name: '使用基礎數值回應' })).toBeVisible();

      // 選擇技能
      await contestDialog.getByText('防禦技一').click();
      await expect(contestDialog.getByRole('button', { name: '確認回應' })).toBeVisible();

      // 防禦技二 應被 disabled
      const skill2Card = contestDialog.locator('.rounded-xl').filter({ hasText: '防禦技二' });
      await expect(skill2Card).toHaveCSS('opacity', '0.4');

      // 道具也應被 disabled（跨類別互斥）
      const item1Card = contestDialog.locator('.rounded-xl').filter({ hasText: '防具一' });
      await expect(item1Card).toHaveCSS('opacity', '0.4');

      // ── Phase F — 回應（以 skill-d1） ──
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: { path: 'payload.subType', value: 'result' },
      });

      await contestDialog.getByRole('button', { name: '確認回應' }).click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase G — 結果（attacker_wins: 60 > 50） ──
      const resultEventA = await resultPromiseA as { payload: Record<string, unknown> };
      expect(resultEventA.payload.result).toBe('attacker_wins');

      // ── Phase H — DB 驗證 ──
      // 等待效果執行完成（polling 取代固定 timeout — 方法 2）
      await expect.poll(async () => {
        const rt = await dbQuery('character_runtime', { refId: charB._id });
        return (rt[0]?.stats as Array<{ name: string; value: number }>)
          .find(s => s.name === '生命值')?.value;
      }, { timeout: 10000 }).toBe(90);

      // B HP = 90（100 - 10）
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      const bStats = runtimeB[0].stats as Array<{ name: string; value: number }>;
      expect(bStats.find(s => s.name === '生命值')!.value).toBe(90);

      // B 的 skill-d1 應有 lastUsedAt（使用紀錄更新）
      const bSkills = runtimeB[0].skills as Array<{ id: string; lastUsedAt?: string }>;
      const usedSkill = bSkills.find(s => s.id === 'skill-d1');
      expect(usedSkill).toBeDefined();
      expect(usedSkill!.lastUsedAt).toBeDefined();

      // B 的 items 不應有 lastUsedAt（未使用道具）
      const bItems = runtimeB[0].items as Array<{ id: string; lastUsedAt?: string }>;
      const item1 = bItems.find(i => i.id === 'item-d1');
      expect(item1?.lastUsedAt).toBeUndefined();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── #6.6 隱匿標籤（stealth tag）+ source 隱藏 ──────────────────
  test('#6.6 stealth tag: attacker name hidden + effect source hidden', async ({
    seed,
    dbQuery,
    browser,
  }) => {
    // ── Seed ──
    const { gmUserId } = await seed.gmWithGame();
    const game = await seed.game({ gmUserId, isActive: true });
    const gameId = game._id;

    // 攻擊方：str=60，stealth tag 技能，opponentMax=0/0
    const charA = await seed.character({
      gameId,
      name: '隱匿攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 60, maxValue: 100 }],
      skills: [{
        id: 'skill-stealth-strike',
        name: '暗殺',
        description: '隱匿攻擊',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -25,
        }],
        tags: ['stealth'],
      }],
    });

    // 防守方：str=40, hp=100
    const charB = await seed.character({
      gameId,
      name: '隱匿防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 40, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
    });

    // Runtime
    await seed.characterRuntime({
      refId: charA._id,
      gameId,
      name: '隱匿攻擊者',
      stats: [{ id: 'stat-str', name: '力量', value: 60, maxValue: 100 }],
      skills: [{
        id: 'skill-stealth-strike',
        name: '暗殺',
        description: '隱匿攻擊',
        checkType: 'contest',
        contestConfig: {
          relatedStat: '力量',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        effects: [{
          type: 'stat_change',
          targetType: 'other',
          targetStat: '生命值',
          value: -25,
        }],
        tags: ['stealth'],
      }],
    });
    await seed.characterRuntime({
      refId: charB._id,
      gameId,
      name: '隱匿防守者',
      stats: [
        { id: 'stat-str', name: '力量', value: 40, maxValue: 100 },
        { id: 'stat-hp', name: '生命值', value: 100, maxValue: 100 },
      ],
    });
    await seed.gameRuntime({ refId: gameId, gmUserId });

    // ── 建立雙 context ──
    const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(
      browser, charA._id, charB._id,
    );

    try {
      // ── Phase A — 防守方先載入 ──
      await pageB.goto(`/c/${charB._id}`);
      await pageB.locator('button[aria-label*="通知"]').first().waitFor({ state: 'visible' });

      const requestPromise = waitForWebSocketEvent(pageB, {
        event: 'skill.contest',
        channel: `private-character-${charB._id}`,
        filter: { path: 'payload.subType', value: 'request' },
      });

      // ── Phase B — 攻擊方發動隱匿對抗 ──
      await attackerUseContestSkill(pageA, charA._id, '暗殺', '隱匿防守者');
      await expect(pageA.getByRole('dialog', { name: '暗殺' })).not.toBeVisible({ timeout: 10000 });

      // ── Phase C — request 事件驗證：stealth 標記 ──
      const requestEvent = await requestPromise as { payload: Record<string, unknown> };
      expect(requestEvent.payload.sourceHasStealthTag).toBe(true);

      // Contest dialog 出現
      const contestDialog = pageB.getByRole('dialog', { name: '對抗檢定' });
      await expect(contestDialog).toBeVisible({ timeout: 10000 });

      // 隱匿驗證：攻擊方名稱顯示為「有人」而非真實角色名
      await expect(contestDialog.getByText('有人 對你使用了技能或物品')).toBeVisible();
      // 真實名稱不應出現
      await expect(contestDialog.getByText('隱匿攻擊者')).not.toBeVisible();

      // opponentMax=0/0 → 只能基礎數值
      await expect(contestDialog.getByText('只能使用基礎數值對抗')).toBeVisible();

      // 建立 result WS listener
      const resultPromiseA = waitForWebSocketEvent(pageA, {
        event: 'skill.contest',
        channel: `private-character-${charA._id}`,
        filter: { path: 'payload.subType', value: 'result' },
      });

      // ── Phase D — 防守方回應 ──
      await contestDialog.getByRole('button', { name: '使用基礎數值回應' }).click();
      await expect(contestDialog).not.toBeVisible({ timeout: 10000 });

      // ── Phase E — 結果（attacker_wins: 60 > 40） ──
      const resultEventA = await resultPromiseA as { payload: Record<string, unknown> };
      expect(resultEventA.payload.result).toBe('attacker_wins');

      // ── Phase F — DB 驗證 ──
      // 等待效果執行完成（polling 取代固定 timeout — 方法 2）
      await expect.poll(async () => {
        const rt = await dbQuery('character_runtime', { refId: charB._id });
        return (rt[0]?.stats as Array<{ name: string; value: number }>)
          .find(s => s.name === '生命值')?.value;
      }, { timeout: 10000 }).toBe(75);

      // B runtime HP = 75（100 - 25）
      const runtimeB = await dbQuery('character_runtime', { refId: charB._id });
      const bStats = runtimeB[0].stats as Array<{ name: string; value: number }>;
      expect(bStats.find(s => s.name === '生命值')!.value).toBe(75);

      // Baseline 不變
      const baselineB = await dbQuery('characters', { _id: charB._id });
      const baseStats = baselineB[0].stats as Array<{ name: string; value: number }>;
      expect(baseStats.find(s => s.name === '生命值')!.value).toBe(100);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
