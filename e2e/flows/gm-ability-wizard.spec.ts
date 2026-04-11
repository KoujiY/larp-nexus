/**
 * Flow #4b — Ability Wizard & Stats CRUD
 *
 * 驗證 GM 端角色卡的「數值」「物品」「技能」三個分頁的 CRUD 操作，
 * 包含 AbilityEditWizard 的 4 步驟新增/編輯流程。
 *
 * 規格文件：docs/refactoring/E2E_FLOW_4B_ABILITY_WIZARD.md
 *
 * 注意事項：
 * - 全程在 inactive game 操作，baseline-only 寫入
 * - Stats/Items/Skills 三個 tab 都無 <form> wrapper，只能透過 SaveBar 儲存
 * - 合併多次操作為單次 save 以避免 stale closure（規則 11）
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { clickSaveBar } from '../helpers/click-save-bar';

test.describe('Flow #4b — Ability Wizard & Stats CRUD', () => {
  // ────────────────────────────────────────────────────────────
  // #4b.1 Stats inline CRUD + validator
  // ────────────────────────────────────────────────────────────
  test('#4b.1 stats inline CRUD + validator', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（空 stats） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: 'E2E 數值角色' },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    // 切到「數值」tab
    await page.getByRole('tab', { name: '數值' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 新增兩個 stat（合併為單次 save 避免 stale closure） ──
    // 空狀態顯示引導文案
    await expect(page.getByText('尚未定義任何數值').first()).toBeVisible();
    await page.getByRole('button', { name: '新增第一個數值' }).click();

    // 新增 stat 自動進入編輯模式（name input auto-focus）
    const nameInput1 = page.getByPlaceholder('數值名稱').first();
    await expect(nameInput1).toBeVisible();
    await nameInput1.fill('生命值');

    // 數值 input（type=number，編輯模式中的 5xl 文字 input）
    // stat card 編輯模式有一個 number input（value），初始 0
    const valueInput1 = page.locator('input[type="number"]').first();
    await valueInput1.fill('100');

    // 完成編輯（推給父層 state）
    await page.getByRole('button', { name: '完成編輯' }).click();

    // 新增第二個 stat（此時已離開空狀態，用 DashedAddButton）
    await page.getByRole('button', { name: '新增數值' }).click();
    // 第二個 stat card 進入編輯模式
    const nameInput2 = page.getByPlaceholder('數值名稱').first();
    await expect(nameInput2).toBeVisible();
    await nameInput2.fill('魔力');

    // 第二個 value input
    const valueInput2 = page.locator('input[type="number"]').first();
    await valueInput2.fill('50');

    // 完成第二個 stat 編輯
    await page.getByRole('button', { name: '完成編輯' }).click();

    // 兩個 stat 都完成 → dirty=true → 一次 save
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    await clickSaveBar(page);
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 — Phase A ──
    const chars = await dbQuery('characters', { _id: characterId });
    expect(chars).toHaveLength(1);
    const statsA = (chars[0] as Record<string, unknown>).stats as Array<Record<string, unknown>>;
    expect(statsA).toHaveLength(2);
    expect(statsA.find((s) => s.name === '生命值')).toBeDefined();
    expect(statsA.find((s) => s.name === '魔力')).toBeDefined();
    expect(Number(statsA.find((s) => s.name === '生命值')!.value)).toBe(100);
    expect(Number(statsA.find((s) => s.name === '魔力')!.value)).toBe(50);

    // ── Phase B — 修改 + 刪除（合併為單次 save） ──
    // 等待 Phase A 的所有 toast 自動關閉 + role.updated 事件處理完畢
    // 防止 Phase B 的 waitForToast('已儲存') 誤匹配 Phase A 的殘留 toast
    // 也確保 E2E Pusher stub 回送的 role.updated 事件不會在 Phase B 編輯時觸發 discard
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });

    // 修改「生命值」的數值 → 點編輯進入 edit 模式
    // 注意：hasText 只匹配 DOM textContent，不匹配 input value
    // 所以 view mode 用 hasText 定位 card 點「編輯」，
    // 進入 edit mode 後改用 has: '完成編輯' button 定位（同時只有一張卡片在編輯）
    const hpCardView = page.locator('div.bg-card.rounded-2xl').filter({ hasText: '生命值' });
    await expect(hpCardView).toBeVisible();
    await hpCardView.getByRole('button', { name: '編輯' }).click();

    // edit mode：「生命值」從 <p> 搬進 <input value>，hasText 不再匹配
    // 改用「有完成編輯按鈕」的卡片定位（同一時間只有一張卡片在 edit mode）
    const editingCard = page.locator('div.bg-card.rounded-2xl').filter({
      has: page.getByRole('button', { name: '完成編輯' }),
    });
    await expect(editingCard).toBeVisible();

    // 修改數值為 80
    const hpValueInput = editingCard.locator('input[type="number"]').first();
    await hpValueInput.fill('80');
    await editingCard.getByRole('button', { name: '完成編輯' }).click();

    // 刪除「魔力」stat（soft delete）
    const mpCard = page.locator('div.bg-card.rounded-2xl').filter({ hasText: '魔力' });
    await mpCard.getByRole('button', { name: '刪除' }).click();

    // dirty=true → save
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    await clickSaveBar(page);
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 — Phase B ──
    const charsB = await dbQuery('characters', { _id: characterId });
    const statsB = (charsB[0] as Record<string, unknown>).stats as Array<Record<string, unknown>>;
    expect(statsB).toHaveLength(1);
    expect(statsB[0].name).toBe('生命值');
    expect(Number(statsB[0].value)).toBe(80);

    // ── Phase C — Validator 反向驗證：空 name ──
    // 等待 Phase B 的 toast 關閉 + role.updated 事件處理完畢
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });

    // 新增一個 stat，不填 name 就嘗試儲存
    await page.getByRole('button', { name: '新增數值' }).click();
    const emptyNameInput = page.getByPlaceholder('數值名稱').first();
    await expect(emptyNameInput).toBeVisible();

    // 不填 name，直接完成編輯（draft 的 name 是空字串）
    // value input 有預設 0，name 為空
    await page.getByRole('button', { name: '完成編輯' }).click();

    // 嘗試儲存 → 前端驗證攔截
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    await clickSaveBar(page);
    // 顯示錯誤 toast
    await waitForToast(page, '所有數值欄位都需要名稱');

    // Save Bar 仍可見（save 未成功）
    await expect(saveAllBtn).toBeVisible();

    // 取消新增（新的 stat 在編輯模式按取消 = hardRemove）
    // 先進入編輯模式（空 name stat 完成編輯後回到檢視模式，需要再按編輯）
    const emptyCard = page.locator('div.bg-card.rounded-2xl').filter({ hasText: '未命名' });
    await emptyCard.getByRole('button', { name: '刪除' }).click();

    // 刪除後 dirty state 與 Phase B 相同 → SaveBar 應消失（因為 effectiveStats 回到 Phase B 狀態）
    // 但實際上新增+刪除的過程使 stats 陣列不同於 initialStats
    // soft delete 使 effectiveStats = [生命值(80)]，與 save 後的 initialStats 一致
    await expect(saveAllBtn).not.toBeVisible({ timeout: 3000 });
  });

  // ────────────────────────────────────────────────────────────
  // #4b.2 Items Wizard happy path（4 步驟完整走過）
  // ────────────────────────────────────────────────────────────
  test('#4b.2 items wizard happy path', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（含 1 個 stat 供 effect target） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: {
        name: 'E2E 物品角色',
        stats: [{ id: 'stat-hp', name: 'HP', value: 100 }],
      },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    // 切到「物品」tab
    await page.getByRole('tab', { name: '物品' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 空狀態 → 開啟 Wizard ──
    await expect(page.getByText('尚無物品').first()).toBeVisible();
    await page.getByRole('button', { name: '新增第一個物品' }).click();

    // Wizard Dialog 開啟
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ── Step 1：基本資訊 ──
    // 步驟標示
    await expect(dialog.getByText('步驟 1')).toBeVisible();

    // 填入名稱（必填）
    await dialog.getByPlaceholder('輸入物品名稱...').fill('治療藥水');
    // 填入描述
    await dialog.getByPlaceholder('描述此物品的外觀、來源或特殊傳說...').fill('恢復 20 HP 的紅色藥水');

    // 物品類型選擇 — 點選「消耗品」卡片
    await dialog.getByText('消耗品', { exact: true }).click();

    // 下一步
    await dialog.getByRole('button', { name: '下一步' }).click();

    // ── Step 2：檢定系統 ──
    await expect(dialog.getByText('步驟 2')).toBeVisible();

    // 選擇「無檢定」（預設可能已選，但明確點選）
    await dialog.getByText('無檢定', { exact: true }).click();

    // 下一步
    await dialog.getByRole('button', { name: '下一步' }).click();

    // ── Step 3：使用限制 ──
    await expect(dialog.getByText('步驟 3')).toBeVisible();

    // 消耗品預設 usageLimit=1，改為 3
    const usageInput = dialog.locator('input[type="number"]').first();
    await usageInput.fill('3');

    // 下一步
    await dialog.getByRole('button', { name: '下一步' }).click();

    // ── Step 4：效果設計 ──
    await expect(dialog.getByText('步驟 4')).toBeVisible();

    // 新增效果
    await dialog.getByRole('button', { name: '新增效果' }).click();

    // 效果類型預設為「數值變更」(stat_change)，無需手動選擇

    // 選擇目標數值 — HP
    // Radix Select combobox 沒有 accessible name（label 未用 htmlFor 關聯）
    // 「選擇數值」是 combobox 內部的 placeholder 文字，用 hasText filter 定位
    await dialog.getByRole('combobox').filter({ hasText: '選擇數值' }).click();
    await page.getByRole('option', { name: 'HP' }).click();

    // 填入數值變更量
    await dialog.getByPlaceholder('+5 或 -10').fill('20');

    // 儲存物品（Wizard 完成按鈕）
    await dialog.getByRole('button', { name: '儲存物品' }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // ── Phase B — Wizard 完成後，物品出現在列表 ──
    await expect(page.getByText('治療藥水')).toBeVisible();

    // dirty=true → Save Bar 出現
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    // 儲存（Items tab 無 <form> wrapper，只能用 SaveBar）
    await clickSaveBar(page);
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 ──
    const chars = await dbQuery('characters', { _id: characterId });
    expect(chars).toHaveLength(1);
    const char = chars[0] as Record<string, unknown>;
    const items = char.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);

    const item = items[0];
    expect(item.name).toBe('治療藥水');
    expect(item.description).toBe('恢復 20 HP 的紅色藥水');
    expect(item.type).toBe('consumable');
    expect(item.checkType).toBe('none');
    expect(Number(item.usageLimit)).toBe(3);
    expect(Number(item.usageCount)).toBe(0);

    const effects = item.effects as Array<Record<string, unknown>>;
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('stat_change');
    expect(effects[0].targetStat).toBe('HP');
    expect(Number(effects[0].value)).toBe(20);
  });

  // ────────────────────────────────────────────────────────────
  // #4b.3 Items Wizard 互鎖規則：checkType=contest 需 relatedStat
  // ────────────────────────────────────────────────────────────
  test('#4b.3 items wizard interlock: contest requires relatedStat', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（含 1 個 stat 供 relatedStat 選擇） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: {
        name: 'E2E 互鎖角色',
        stats: [{ id: 'stat-str', name: '力量', value: 10 }],
      },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    await page.getByRole('tab', { name: '物品' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 開啟 Wizard，填 Step 1 ──
    await expect(page.getByText('尚無物品').first()).toBeVisible();
    await page.getByRole('button', { name: '新增第一個物品' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Step 1：填入名稱 + 選「道具」類型
    await dialog.getByPlaceholder('輸入物品名稱...').fill('投擲匕首');
    await dialog.getByText('道具', { exact: true }).click();
    await dialog.getByRole('button', { name: '下一步' }).click();

    // ── Phase B — Step 2：選「對抗檢定」但不選 relatedStat ──
    await expect(dialog.getByText('步驟 2')).toBeVisible();
    await dialog.getByText('對抗檢定', { exact: true }).click();

    // relatedStat Select 出現（placeholder: '選擇數值'）
    await expect(dialog.getByRole('combobox').filter({ hasText: '選擇數值' })).toBeVisible();

    // 直接跳到 Step 3、Step 4，不選 relatedStat
    await dialog.getByRole('button', { name: '下一步' }).click();
    await expect(dialog.getByText('步驟 3')).toBeVisible();
    await dialog.getByRole('button', { name: '下一步' }).click();
    await expect(dialog.getByText('步驟 4')).toBeVisible();

    // ── Phase C — 嘗試儲存 → 驗證攔截 ──
    await dialog.getByRole('button', { name: '儲存物品' }).click();

    // 驗證錯誤 toast + 自動跳回 Step 2
    await waitForToast(page, '請選擇對抗檢定使用的數值');
    await expect(dialog.getByText('步驟 2')).toBeVisible();

    // ── Phase D — 補選 relatedStat → 儲存成功 ──
    await dialog.getByRole('combobox').filter({ hasText: '選擇數值' }).click();
    await page.getByRole('option', { name: '力量' }).click();

    // 完成剩餘步驟 → 儲存
    await dialog.getByRole('button', { name: '儲存物品' }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // SaveBar 出現 → 儲存到 DB
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    await clickSaveBar(page);
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 ──
    const chars = await dbQuery('characters', { _id: characterId });
    const items = (chars[0] as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('投擲匕首');
    expect(items[0].checkType).toBe('contest');

    const contestConfig = items[0].contestConfig as Record<string, unknown>;
    expect(contestConfig.relatedStat).toBe('力量');
  });

  // ────────────────────────────────────────────────────────────
  // #4b.4 Skills Wizard happy path + 技能專屬效果
  // ────────────────────────────────────────────────────────────
  test('#4b.4 skills wizard happy path + exclusive effects', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（含 stat 供 stat_change 用） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: {
        name: 'E2E 技能角色',
        stats: [{ id: 'stat-hp', name: 'HP', value: 100 }],
      },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    await page.getByRole('tab', { name: '技能' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 開啟 Skills Wizard ──
    await expect(page.getByText('尚無技能').first()).toBeVisible();
    await page.getByRole('button', { name: '新增第一個技能' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title 為「新增技能」（h1，非 sr-only 的 DialogTitle h2）
    await expect(dialog.locator('h1', { hasText: '新增技能' })).toBeVisible();

    // Step 1：基本資訊
    await dialog.getByPlaceholder('輸入技能名稱...').fill('大師技能');
    await dialog.getByPlaceholder('描述技能的效果和使用方式...').fill('測試技能描述');
    await dialog.getByRole('button', { name: '下一步' }).click();

    // Step 2：檢定 = 無檢定
    await expect(dialog.getByText('步驟 2')).toBeVisible();
    await dialog.getByText('無檢定', { exact: true }).click();
    await dialog.getByRole('button', { name: '下一步' }).click();

    // Step 3：使用限制 — usageLimit=1
    await expect(dialog.getByText('步驟 3')).toBeVisible();
    const usageInput = dialog.locator('input[type="number"]').first();
    await usageInput.fill('1');
    await dialog.getByRole('button', { name: '下一步' }).click();

    // ── Phase B — Step 4：加入 stat_change 效果 ──
    await expect(dialog.getByText('步驟 4')).toBeVisible();
    await dialog.getByRole('button', { name: '新增效果' }).click();

    // 效果類型預設 stat_change，選擇目標數值 HP
    await dialog.getByRole('combobox').filter({ hasText: '選擇數值' }).click();
    await page.getByRole('option', { name: 'HP' }).click();
    await dialog.getByPlaceholder('+5 或 -10').fill('-10');

    // ── Phase C — 加入 task_reveal 效果（技能專屬） ──
    await dialog.getByRole('button', { name: '新增效果' }).click();

    // 新增效果後自動選取效果 2，右側面板已切換到新效果的編輯區
    // 「效果 2」同時出現在 sidebar button 和右側面板 paragraph，用 paragraph 定位
    await expect(dialog.getByRole('paragraph').filter({ hasText: '效果 2' })).toBeVisible();

    // 選擇效果類型 → task_reveal（「揭露任務」）
    // 效果類型 Select — 新效果預設 stat_change，改為 task_reveal
    // 用效果配置面板中「效果類型」label 旁的 combobox 定位
    const effectTypeCombobox = dialog.getByRole('combobox').filter({ hasText: '數值變更' });
    await effectTypeCombobox.click();
    await page.getByRole('option', { name: '揭露任務' }).click();

    // 填入目標任務 ID
    await dialog.getByPlaceholder('任務 ID').fill('task-secret-001');

    // ── Phase D — 儲存技能 ──
    await dialog.getByRole('button', { name: '儲存技能' }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // SaveBar 出現 → 儲存到 DB
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    await clickSaveBar(page);
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 ──
    const chars = await dbQuery('characters', { _id: characterId });
    const char = chars[0] as Record<string, unknown>;
    const skills = char.skills as Array<Record<string, unknown>>;
    expect(skills).toHaveLength(1);

    const skill = skills[0];
    expect(skill.name).toBe('大師技能');
    expect(skill.description).toBe('測試技能描述');
    expect(skill.checkType).toBe('none');
    expect(Number(skill.usageLimit)).toBe(1);
    expect(Number(skill.usageCount)).toBe(0);

    const skillEffects = skill.effects as Array<Record<string, unknown>>;
    expect(skillEffects).toHaveLength(2);
    expect(skillEffects[0].type).toBe('stat_change');
    expect(skillEffects[0].targetStat).toBe('HP');
    expect(Number(skillEffects[0].value)).toBe(-10);
    expect(skillEffects[1].type).toBe('task_reveal');
    expect(skillEffects[1].targetTaskId).toBe('task-secret-001');
  });

  // ────────────────────────────────────────────────────────────
  // #4b.5 Skills Wizard edit mode（載入既有 → 修改 → 儲存）
  // ────────────────────────────────────────────────────────────
  test('#4b.5 skills wizard edit mode', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（含 1 個既有 skill） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: {
        name: 'E2E 編輯技能角色',
        stats: [{ id: 'stat-hp', name: 'HP', value: 100 }],
        skills: [{
          id: 'skill-existing',
          name: '初始技能',
          description: '舊描述',
          checkType: 'none',
          usageLimit: 2,
          cooldown: 0,
          usageCount: 0,
          effects: [{ type: 'stat_change', targetStat: 'HP', value: 10 }],
        }],
      },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    await page.getByRole('tab', { name: '技能' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 點擊既有 skill 的「編輯」按鈕 ──
    // AbilityCard 包含技能名稱文字
    await expect(page.getByText('初始技能').first()).toBeVisible();

    // 只有一個 skill card → 只有一個「編輯」按鈕
    await page.getByRole('button', { name: '編輯' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title 為「編輯技能」（h1，非 sr-only 的 DialogTitle h2）
    await expect(dialog.locator('h1', { hasText: '編輯技能' })).toBeVisible();

    // ── Phase B — 驗證 Step 1 預填值 ──
    // 名稱、描述已預填
    await expect(dialog.getByPlaceholder('輸入技能名稱...')).toHaveValue('初始技能');
    await expect(dialog.getByPlaceholder('描述技能的效果和使用方式...')).toHaveValue('舊描述');

    // 修改名稱
    await dialog.getByPlaceholder('輸入技能名稱...').fill('進化技能');

    // ── Phase C — 跳到 Step 4 修改效果值 ──
    // 使用 Stepper 直接跳步（點擊步驟 4 的按鈕）
    await dialog.getByRole('button', { name: /跳至步驟 4/ }).click();
    await expect(dialog.getByText('步驟 4')).toBeVisible();

    // 效果列表已有 1 項（stat_change）
    // 修改效果的變更量
    const effectValueInput = dialog.getByPlaceholder('+5 或 -10');
    await expect(effectValueInput).toHaveValue('10');
    await effectValueInput.fill('20');

    // ── Phase D — 儲存修改 ──
    await dialog.getByRole('button', { name: '儲存技能' }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // SaveBar 出現 → 儲存到 DB
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    await clickSaveBar(page);
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 ──
    const chars = await dbQuery('characters', { _id: characterId });
    const char = chars[0] as Record<string, unknown>;
    const skills = char.skills as Array<Record<string, unknown>>;
    expect(skills).toHaveLength(1);

    const skill = skills[0];
    // 同一 skill id（覆蓋更新，非新增+刪除）
    expect(skill.id).toBe('skill-existing');
    expect(skill.name).toBe('進化技能');
    expect(skill.description).toBe('舊描述'); // 未修改
    expect(skill.checkType).toBe('none');
    expect(Number(skill.usageLimit)).toBe(2); // 未修改
    expect(Number(skill.usageCount)).toBe(0);

    const skillEffects = skill.effects as Array<Record<string, unknown>>;
    expect(skillEffects).toHaveLength(1);
    expect(skillEffects[0].type).toBe('stat_change');
    expect(skillEffects[0].targetStat).toBe('HP');
    expect(Number(skillEffects[0].value)).toBe(20); // 已修改
  });
});
