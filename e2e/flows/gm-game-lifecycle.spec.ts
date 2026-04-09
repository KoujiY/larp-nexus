/**
 * Flow #3 — GM 劇本管理完整生命週期（flows 層）
 *
 * 涵蓋「GM 從零到結束一個劇本」的完整生命週期：
 * - #3.1 建立劇本 + 必填/長度/唯一性驗證
 * - #3.2 Game Code 變更與唯一性
 * - #3.3 劇本資訊編輯（名稱/描述/世界觀 blocks/隨機檢定值）
 * - #3.4 預設事件 CRUD（broadcast 動作類型）
 * - #3.5 遊戲生命週期 start/end + 狀態敏感限制
 * - #3.6 劇本連鎖刪除
 *
 * 每個 test case 各自 seed，不串接前一個的狀態（獨立 rerun + 錯誤隔離）。
 * 參照規格：docs/refactoring/E2E_FLOW_3_GAME_LIFECYCLE.md
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';

test.describe('Flow #3 — GM game lifecycle', () => {
  test('#3.1 create game + validation', async ({ page, seed, asGm, dbQuery }) => {
    // ── Seed：GM user only（空 DB 起點）──
    const gm = await seed.gmUser();
    await asGm({ gmUserId: gm._id });

    // ── Phase 1：空狀態 → 開啟建立 Dialog ──
    await page.goto('/games');
    await expect(page.getByRole('heading', { name: '劇本管理' })).toBeVisible();
    await page.getByRole('button', { name: '建立第一個劇本' }).click();

    // Dialog 開啟
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '建立新劇本' })).toBeVisible();

    // ── Phase 2：等 gameCode 自動生成 + 即時檢查通過 ──
    const gameCodeInput = dialog.getByPlaceholder('ABC123');
    // 等待自動生成的 code 填入（6 位英數字）
    await expect(gameCodeInput).not.toHaveValue('');
    // 等待即時唯一性檢查回 available
    await expect(dialog.getByText('此代碼可以使用')).toBeVisible({ timeout: 5000 });

    // 擷取自動生成的 gameCode 供後續 DB 驗證
    const autoGameCode = await gameCodeInput.inputValue();

    // ── Phase 3：填寫表單 → 提交 ──
    await dialog.getByPlaceholder('例：末日餘暉').fill('E2E 測試劇本 #3.1');
    await dialog.getByPlaceholder('輸入關於此劇本的詳細背景或介紹...').fill('自動化 lifecycle 測試');
    // 不改動最大檢定值（驗證預設 100）、不改動 gameCode（使用自動生成值）

    await dialog.getByRole('button', { name: '建立劇本' }).click();

    // ── Phase 4：建立成功 → 導航到劇本編輯頁 ──
    await page.waitForURL(/\/games\/[a-f0-9]{24}$/, { timeout: 10000 });

    // Header 驗證
    await expect(page.getByRole('heading', { level: 1, name: 'E2E 測試劇本 #3.1' })).toBeVisible();
    await expect(page.locator('main').getByText('待機中')).toBeVisible();
    // GameCodeSection 顯示自動生成的 code
    await expect(page.getByText(autoGameCode)).toBeVisible();
    // 預設顯示「劇本資訊」Tab
    await expect(page.getByRole('tab', { name: '劇本資訊' })).toBeVisible();

    // ── Phase 5：DB 驗證 ──
    const games = await dbQuery('games');
    expect(games.length).toBe(1);
    const game = games[0];
    expect(game.name).toBe('E2E 測試劇本 #3.1');
    expect(game.description).toBe('自動化 lifecycle 測試');
    expect(game.gameCode).toBe(autoGameCode);
    expect(game.isActive).toBe(false);
    // randomContestMaxValue：前端預設 100，後端寫入 DB
    expect(game.randomContestMaxValue).toBe(100);

    // ── Phase 6：負面 — 名稱超過 100 字 ──
    // 回到列表頁，再次建立
    await page.goto('/games');
    // 非空狀態使用「建立新劇本」按鈕
    await page.getByRole('button', { name: '建立新劇本' }).click();
    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible();

    // 等 gameCode 自動生成
    await expect(dialog2.getByText('此代碼可以使用')).toBeVisible({ timeout: 5000 });

    // 填入超長名稱（101 字）
    await dialog2.getByPlaceholder('例：末日餘暉').fill('長'.repeat(101));
    await dialog2.getByRole('button', { name: '建立劇本' }).click();

    // 等 server 回 validation error → Dialog 內顯示錯誤
    await expect(dialog2.locator('.bg-destructive\\/10')).toBeVisible({ timeout: 5000 });

    // Dialog 仍然存在（沒有關閉）
    await expect(dialog2).toBeVisible();

    // ── Phase 7：負面 — gameCode 已被佔用 ──
    // 先 seed 另一個 GM 佔用 'EXIST1'
    const otherGm = await seed.gmUser({ email: 'other@test.com', displayName: 'Other GM' });
    await seed.game({ gmUserId: otherGm._id, name: '佔位劇本', gameCode: 'EXIST1' });

    // 在當前 Dialog 中清空 gameCode 並輸入已佔用的
    const codeInput2 = dialog2.getByPlaceholder('ABC123');
    await codeInput2.clear();
    await codeInput2.fill('EXIST1');

    // 等防抖 500ms + 即時檢查回 unavailable
    await expect(dialog2.getByText('此代碼已被其他劇本使用，請換一個')).toBeVisible({ timeout: 5000 });

    // 建立按鈕應為 disabled
    await expect(dialog2.getByRole('button', { name: '建立劇本' })).toBeDisabled();
  });

  test('#3.2 game code change + uniqueness', async ({ page, seed, asGm, dbQuery }) => {
    // ── Seed：GM + Game A（目標）+ Game B（佔用 code）──
    const gm = await seed.gmUser();
    const gameA = await seed.game({ gmUserId: gm._id, name: '目標劇本', gameCode: 'ORIG01' });
    await seed.game({ gmUserId: gm._id, name: '佔位劇本', gameCode: 'TAKEN1' });
    await asGm({ gmUserId: gm._id });

    // ── Phase 1：進入劇本編輯頁 → 看到目前 code ──
    await page.goto(`/games/${gameA._id}`);
    await expect(page.getByText('ORIG01')).toBeVisible();

    // ── Phase 2：開啟編輯 Dialog → 變更成功 ──
    await page.getByRole('button', { name: '編輯遊戲代碼' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '編輯遊戲代碼' })).toBeVisible();

    // 清空並輸入新 code
    const codeInput = dialog.getByPlaceholder('ABC123');
    await codeInput.clear();
    await codeInput.fill('NEWCD1');

    // 等防抖 500ms + 即時檢查回 available
    await expect(dialog.getByText('此代碼可以使用')).toBeVisible({ timeout: 5000 });

    // 提交
    await dialog.getByRole('button', { name: '確認更新' }).click();

    // Dialog 關閉 + UI 更新
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    // Header 的 GameCodeSection 顯示新 code（等 router.refresh）
    await expect(page.getByText('NEWCD1')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ORIG01')).not.toBeVisible();

    // DB 驗證
    const games = await dbQuery('games', { _id: gameA._id });
    expect(games[0].gameCode).toBe('NEWCD1');

    // ── Phase 3：負面 — 新 code 已被佔用 ──
    await page.getByRole('button', { name: '編輯遊戲代碼' }).click();
    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible();

    const codeInput2 = dialog2.getByPlaceholder('ABC123');
    await codeInput2.clear();
    await codeInput2.fill('TAKEN1');

    // 等防抖 + 即時檢查回 unavailable
    await expect(dialog2.getByText('此代碼已被使用')).toBeVisible({ timeout: 5000 });
    // 確認更新按鈕 disabled
    await expect(dialog2.getByRole('button', { name: '確認更新' })).toBeDisabled();

    // ── Phase 4：Dialog reset 驗證 — 取消後重開應回到當前值 ──
    await dialog2.getByRole('button', { name: '取消' }).click();
    await expect(dialog2).not.toBeVisible();

    // 重新開啟
    await page.getByRole('button', { name: '編輯遊戲代碼' }).click();
    const dialog3 = page.getByRole('dialog');
    await expect(dialog3).toBeVisible();

    // Input 應為當前 DB 值 'NEWCD1'（不是上次輸入的 'TAKEN1'）
    await expect(dialog3.getByPlaceholder('ABC123')).toHaveValue('NEWCD1');
    // 狀態應為 idle（未變更）
    await expect(dialog3.getByText('當前代碼：NEWCD1')).toBeVisible();
    // 確認更新按鈕 disabled（code 未變更）
    await expect(dialog3.getByRole('button', { name: '確認更新' })).toBeDisabled();
  });

  test('#3.3 game info edit (name / description / blocks / maxValue)', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + Game（基礎欄位） ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '舊名稱',
      description: '',
      gameCode: 'EDIT01',
    });
    await asGm({ gmUserId: gm._id });

    // ══════════════════════════════════════
    // 子流程 A — 名稱必填驗證 + scrollIntoView
    // ══════════════════════════════════════
    await page.goto(`/games/${game._id}`);
    await expect(page.getByRole('heading', { level: 1, name: '舊名稱' })).toBeVisible();

    // 預設在「劇本資訊」Tab
    await expect(page.getByRole('tab', { name: '劇本資訊' })).toBeVisible();

    // 清空名稱
    const nameInput = page.getByPlaceholder('請輸入劇本名稱');
    await nameInput.clear();

    // 點儲存
    const saveBtn = page.getByRole('button', { name: '儲存變更' });
    await saveBtn.click();

    // 驗證 error 顯示
    await expect(page.getByText('此欄位為必填，請輸入劇本名稱')).toBeVisible();

    // 驗證名稱欄位在 viewport 內（scrollIntoView 行為）
    await page.waitForFunction(() => {
      const el = document.querySelector('input[placeholder="請輸入劇本名稱"]');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });

    // 重新輸入有效名稱 → error 消失
    await nameInput.fill('有效名稱');
    await expect(page.getByText('此欄位為必填，請輸入劇本名稱')).not.toBeVisible();

    // ══════════════════════════════════════
    // 子流程 B — 名稱 + randomContestMaxValue 編輯
    // ══════════════════════════════════════
    await nameInput.clear();
    await nameInput.fill('新劇本名稱');

    // 修改最大檢定值
    const maxValueInput = page.locator('input[type="number"]');
    await maxValueInput.clear();
    await maxValueInput.fill('150');

    // 儲存按鈕應為 enabled（isDirty === true）
    await expect(saveBtn).toBeEnabled();

    // 點儲存
    await saveBtn.click();

    // 等 toast 成功訊息
    await waitForToast(page, '劇本更新成功！');

    // 等 router.refresh() → header 標題更新
    await expect(page.getByRole('heading', { level: 1, name: '新劇本名稱' })).toBeVisible({ timeout: 5000 });

    // 儲存後按鈕回到 disabled（dirty 已 reset）
    await expect(saveBtn).toBeDisabled();

    // DB 驗證
    const games = await dbQuery('games', { _id: game._id });
    expect(games[0].name).toBe('新劇本名稱');
    expect(games[0].randomContestMaxValue).toBe(150);

    // ══════════════════════════════════════
    // 子流程 C — 世界觀 blocks CRUD
    // ══════════════════════════════════════

    // C1：新增第一個 block（預設為 body 類型）
    await page.getByRole('button', { name: '新增區塊' }).click();

    // 切換為 title 類型
    await page.getByRole('button', { name: '標題' }).click();
    // 填寫標題內容
    await page.getByPlaceholder('章節標題...').fill('第一章：開場');

    // C2：新增第二個 block（保持 body 類型）
    await page.getByRole('button', { name: '新增區塊' }).click();
    // 此時有 2 個 block，body placeholder 是第二個 block
    await page.getByPlaceholder('段落內文...').fill('故事從這裡開始...');

    // 儲存
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await waitForToast(page, '劇本更新成功！');
    await expect(saveBtn).toBeDisabled();

    // DB 驗證 blocks
    const gamesAfterBlocks = await dbQuery('games', { _id: game._id });
    const blocks = gamesAfterBlocks[0].publicInfo?.blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('title');
    expect(blocks[0].content).toBe('第一章：開場');
    expect(blocks[1].type).toBe('body');
    expect(blocks[1].content).toBe('故事從這裡開始...');

    // C3：刪除第一個 block（hover 顯示刪除按鈕）
    // 重新載入以確認 blocks 持久化
    await page.reload();
    await expect(page.getByPlaceholder('章節標題...')).toHaveValue('第一章：開場');
    await expect(page.getByPlaceholder('段落內文...')).toHaveValue('故事從這裡開始...');

    // 向上找到第一個 block 容器（title block，class 含 'group' 的 div）
    const titleInput = page.getByPlaceholder('章節標題...');
    const firstBlock = titleInput.locator('xpath=ancestor::div[contains(@class, "group")]').first();
    // hover 觸發 group-hover 顯示刪除按鈕
    await firstBlock.hover();
    // 點擊刪除按鈕（block 內含 SVG 的 button 中最後一個是 Trash2）
    await firstBlock.locator('button:has(svg)').last().click();

    // 儲存
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await waitForToast(page, '劇本更新成功！');

    // DB 驗證：只剩 1 個 block
    const gamesAfterDelete = await dbQuery('games', { _id: game._id });
    const remainingBlocks = gamesAfterDelete[0].publicInfo?.blocks;
    expect(remainingBlocks).toHaveLength(1);
    expect(remainingBlocks[0].type).toBe('body');
    expect(remainingBlocks[0].content).toBe('故事從這裡開始...');

    // ══════════════════════════════════════
    // 橫切 I2 — 未儲存保護（dirty → tab switch → confirm）
    // ══════════════════════════════════════

    // 製造 dirty state：修改名稱
    await page.getByPlaceholder('請輸入劇本名稱').fill('未儲存的名稱');
    // 等待 dirty state 傳播（form isDirty → useEffect → parent infoDirty）
    await expect(saveBtn).toBeEnabled();

    // 攔截 window.confirm dialog
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toBe('您有未儲存的變更，確定要離開嗎？');
      await dialog.dismiss(); // 拒絕離開
    });

    // 嘗試切換到「預設事件」Tab
    await page.getByRole('tab', { name: '預設事件' }).click();

    // 應停留在「劇本資訊」Tab（dismiss 阻止了切換）
    await expect(page.getByPlaceholder('請輸入劇本名稱')).toBeVisible();

    // 移除舊的 dialog handler，改為 accept
    page.removeAllListeners('dialog');
    page.on('dialog', async (dialog) => {
      await dialog.accept(); // 接受離開
    });

    // 再次嘗試切換
    await page.getByRole('tab', { name: '預設事件' }).click();

    // 應成功切到「預設事件」Tab（名稱欄位不再可見）
    await expect(page.getByPlaceholder('請輸入劇本名稱')).not.toBeVisible({ timeout: 3000 });

    // 清理 listener
    page.removeAllListeners('dialog');
  });

  test('#3.4 preset events CRUD (broadcast)', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + Game（無預設事件） ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '預設事件測試',
      gameCode: 'EVNT01',
    });
    await asGm({ gmUserId: gm._id });

    // ══════════════════════════════════════
    // 子流程 A — 建立第一個預設事件
    // ══════════════════════════════════════
    await page.goto(`/games/${game._id}`);

    // 切到「預設事件」Tab
    await page.getByRole('tab', { name: '預設事件' }).click();

    // 等 empty state 顯示
    await expect(page.getByText('尚未建立預設事件')).toBeVisible();

    // 點「建立預設事件」（empty state 按鈕）
    await page.getByRole('button', { name: '建立預設事件' }).click();

    // Dialog 開啟
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '建立預設事件' })).toBeVisible();

    // 填寫事件名稱
    await dialog.getByPlaceholder('如：第二幕開場、BOSS 登場').fill('開場廣播');

    // 填寫備註
    await dialog.getByPlaceholder('選填，GM 自用備忘').fill('遊戲開始時的提示');

    // 動作列表預設已有一個 broadcast 動作（右欄已顯示編輯器）
    // 勾選「全體角色」
    await dialog.getByText('全體角色').click();

    // 填寫廣播標題與內容
    await dialog.getByPlaceholder('廣播標題').fill('遊戲開始');
    await dialog.getByPlaceholder('廣播內容').fill('歡迎進入劇本！');

    // 點「建立事件」
    await dialog.getByRole('button', { name: '建立事件' }).click();

    // 等 toast + Dialog 關閉
    await waitForToast(page, '預設事件已建立');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // 驗證卡片出現
    await expect(page.getByRole('heading', { name: '開場廣播', level: 3 })).toBeVisible();
    // 卡片顯示動作數
    await expect(page.getByText('1 個動作')).toBeVisible();

    // DB 驗證
    const gamesA = await dbQuery('games', { _id: game._id });
    const presetEvents = gamesA[0].presetEvents;
    expect(presetEvents).toHaveLength(1);
    expect(presetEvents[0].name).toBe('開場廣播');
    expect(presetEvents[0].description).toBe('遊戲開始時的提示');
    expect(presetEvents[0].actions).toHaveLength(1);
    expect(presetEvents[0].actions[0].type).toBe('broadcast');
    expect(presetEvents[0].actions[0].broadcastTitle).toBe('遊戲開始');
    expect(presetEvents[0].actions[0].broadcastMessage).toBe('歡迎進入劇本！');

    // ══════════════════════════════════════
    // 子流程 B — 編輯既有預設事件
    // ══════════════════════════════════════

    // 點擊卡片的編輯按鈕
    await page.getByRole('button', { name: '編輯', exact: true }).click();

    // Dialog 開啟，應為編輯模式
    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByRole('heading', { name: '編輯預設事件' })).toBeVisible();

    // 名稱應預填為原值
    const nameInput = editDialog.getByPlaceholder('如：第二幕開場、BOSS 登場');
    await expect(nameInput).toHaveValue('開場廣播');

    // 修改名稱
    await nameInput.clear();
    await nameInput.fill('開場廣播 v2');

    // 點「更新事件」
    await editDialog.getByRole('button', { name: '更新事件' }).click();

    // 等 toast + Dialog 關閉
    await waitForToast(page, '預設事件已更新');
    await expect(editDialog).not.toBeVisible({ timeout: 5000 });

    // 卡片名稱已更新
    await expect(page.getByRole('heading', { name: '開場廣播 v2', level: 3 })).toBeVisible();

    // DB 驗證
    const gamesB = await dbQuery('games', { _id: game._id });
    expect(gamesB[0].presetEvents[0].name).toBe('開場廣播 v2');

    // ══════════════════════════════════════
    // 子流程 C — 刪除預設事件
    // ══════════════════════════════════════

    // 點擊卡片的刪除按鈕
    await page.getByRole('button', { name: '刪除', exact: true }).click();

    // 確認刪除 Dialog 開啟
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByRole('heading', { name: '確認刪除事件' })).toBeVisible();
    // 顯示事件名稱
    await expect(deleteDialog.getByText('開場廣播 v2')).toBeVisible();

    // 點「確認刪除」
    await deleteDialog.getByRole('button', { name: '確認刪除' }).click();

    // 等 toast
    await waitForToast(page, '預設事件已刪除');

    // 回到 empty state
    await expect(page.getByText('尚未建立預設事件')).toBeVisible({ timeout: 5000 });

    // DB 驗證
    const gamesC = await dbQuery('games', { _id: game._id });
    expect(gamesC[0].presetEvents).toHaveLength(0);
  });

  test('#3.5 game lifecycle start/end + state constraints', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + Game（含角色、預設事件、世界觀 blocks） ──
    const gm = await seed.gmUser();
    const game = await seed.game({
      gmUserId: gm._id,
      name: '生命週期測試',
      gameCode: 'LIFE01',
      publicInfo: {
        blocks: [
          { type: 'title', content: '章節一' },
          { type: 'body', content: '故事開始...' },
        ],
      },
      presetEvents: [{
        id: 'evt-seed-1',
        name: 'Seed 廣播',
        showName: false,
        actions: [{
          id: 'act-seed-1',
          type: 'broadcast',
          broadcastTargets: 'all',
          broadcastTitle: '測試標題',
          broadcastMessage: '測試內容',
        }],
      }],
    });
    await seed.character({ gameId: game._id, name: '測試角色' });
    await asGm({ gmUserId: gm._id });

    // ══════════════════════════════════════
    // 子流程 A — 開始遊戲
    // ══════════════════════════════════════
    await page.goto(`/games/${game._id}`);
    await expect(page.getByRole('heading', { level: 1, name: '生命週期測試' })).toBeVisible();

    // 應顯示「待機中」狀態
    await expect(page.locator('main').getByText('待機中')).toBeVisible();
    // Baseline banner
    await expect(page.getByText('設定模式（Baseline）')).toBeVisible();

    // 點擊「開始遊戲」
    await page.getByRole('button', { name: '開始遊戲' }).click();

    // 確認 Dialog 開啟
    const startDialog = page.getByRole('dialog');
    await expect(startDialog).toBeVisible();
    await expect(startDialog.getByRole('heading', { name: '開始遊戲' })).toBeVisible();

    // 驗證警告清單
    await expect(startDialog.getByText('玩家可以進行遊戲操作')).toBeVisible();
    await expect(startDialog.getByText('無法上傳物品及技能圖片')).toBeVisible();
    await expect(startDialog.getByText('不會同步回 Baseline')).toBeVisible();

    // 點「確認開始」
    await startDialog.getByRole('button', { name: '確認開始' }).click();

    // 等 toast
    await waitForToast(page, '遊戲已成功開始！', { timeout: 10000 });

    // 等 router.refresh() → UI 更新
    await expect(page.locator('main').getByText('進行中', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '結束遊戲' })).toBeVisible();

    // DB 驗證
    const gamesAfterStart = await dbQuery('games', { _id: game._id });
    expect(gamesAfterStart[0].isActive).toBe(true);

    // GameRuntime 已建立
    const runtimes = await dbQuery('game_runtime', { refId: game._id });
    expect(runtimes.length).toBeGreaterThanOrEqual(1);
    const runtime = runtimes.find((r: Record<string, unknown>) => r.type === 'runtime');
    expect(runtime).toBeTruthy();

    // CharacterRuntime 已建立
    const charRuntimes = await dbQuery('character_runtime', { gameId: game._id });
    expect(charRuntimes.length).toBeGreaterThanOrEqual(1);

    // ══════════════════════════════════════
    // 子流程 B — J1/J2/J3 驗證
    // ══════════════════════════════════════

    // J1：控制台 Tab 出現且預設選中
    await expect(page.getByRole('tab', { name: '控制台' })).toBeVisible();
    // EnvironmentBanner 顯示 Runtime
    await expect(page.getByText('遊戲進行中（Runtime）')).toBeVisible();

    // J3：切到「角色列表」Tab
    await page.getByRole('tab', { name: '角色列表' }).click();
    // 「新增角色」被替換為鎖定提示
    await expect(page.getByText('遊戲進行中無法新增角色')).toBeVisible();

    // ══════════════════════════════════════
    // 子流程 C — 結束遊戲
    // ══════════════════════════════════════

    // 點擊「結束遊戲」trigger 按鈕
    await page.getByRole('button', { name: '結束遊戲' }).click();

    // 結束 Dialog 開啟
    const endDialog = page.getByRole('dialog');
    await expect(endDialog).toBeVisible();
    await expect(endDialog.getByRole('heading', { name: '確定要結束遊戲？' })).toBeVisible();

    // 驗證警告清單
    await expect(endDialog.getByText('封存為快照')).toBeVisible();
    await expect(endDialog.getByText('無法繼續使用物品和技能')).toBeVisible();
    await expect(endDialog.getByText('切回 Baseline 設定模式')).toBeVisible();

    // 填寫快照名稱
    await endDialog.getByPlaceholder('自動命名：遊戲結束快照').fill('E2E 測試快照');

    // 點 Dialog 內的「結束遊戲」確認按鈕
    await endDialog.getByRole('button', { name: '結束遊戲' }).click();

    // 等 toast
    await waitForToast(page, '遊戲已成功結束！快照已保存', { timeout: 10000 });

    // 等 router.refresh() → UI 回到待機
    await expect(page.locator('main').getByText('待機中')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '開始遊戲' })).toBeVisible();
    // Runtime banner 消失
    await expect(page.getByText('設定模式（Baseline）')).toBeVisible();
    // 控制台 Tab 消失
    await expect(page.getByRole('tab', { name: '控制台' })).not.toBeVisible();

    // DB 驗證
    const gamesAfterEnd = await dbQuery('games', { _id: game._id });
    expect(gamesAfterEnd[0].isActive).toBe(false);

    // Runtime 已清除（只剩 snapshot）
    const runtimesAfterEnd = await dbQuery('game_runtime', { refId: game._id });
    const activeRuntime = runtimesAfterEnd.find((r: Record<string, unknown>) => r.type === 'runtime');
    expect(activeRuntime).toBeUndefined();
  });

  test('#3.6 cascade delete game', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：Target GM + Game A（含子資料）+ Other GM + Game B（隔離對照） ──
    const targetGm = await seed.gmUser({ email: 'target@test.com', displayName: 'Target GM' });
    const otherGm = await seed.gmUser({ email: 'other@test.com', displayName: 'Other GM' });

    // Target GM 的 Game A
    const gameA = await seed.game({
      gmUserId: targetGm._id,
      name: '待刪劇本',
      gameCode: 'DELA01',
    });
    const charA1 = await seed.character({ gameId: gameA._id, name: '角色 A1' });
    const charA2 = await seed.character({ gameId: gameA._id, name: '角色 A2' });

    // Game A 的 Log
    await seed.log({
      gameId: gameA._id,
      actorType: 'gm',
      actorName: 'Target GM',
      action: 'game.created',
      detail: {},
    });

    // Game A 的 PendingEvent（game-level）
    await seed.pendingEvent({
      targetGameId: gameA._id,
      eventType: 'game.broadcast',
      eventPayload: { title: '測試', message: '測試' },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // Game A 的殘留 Runtime（模擬未正常結束的 runtime）
    await seed.gameRuntime({
      refId: gameA._id,
      gmUserId: targetGm._id,
      name: '待刪劇本',
      gameCode: 'DELA01',
    });
    await seed.characterRuntime({
      refId: charA1._id,
      gameId: gameA._id,
      name: '角色 A1',
    });

    // Other GM 的 Game B（隔離對照）
    const gameB = await seed.game({
      gmUserId: otherGm._id,
      name: '隔離劇本',
      gameCode: 'ISOL01',
    });
    const charB1 = await seed.character({ gameId: gameB._id, name: '角色 B1' });

    // Game B 的 Log
    await seed.log({
      gameId: gameB._id,
      actorType: 'gm',
      actorName: 'Other GM',
      action: 'game.created',
      detail: {},
    });

    // Game B 的 PendingEvent（character-level）
    await seed.pendingEvent({
      targetCharacterId: charB1._id,
      eventType: 'e2e.isolation.check',
      eventPayload: { effects: [] },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // ══════════════════════════════════════
    // 執行刪除
    // ══════════════════════════════════════
    await asGm({ gmUserId: targetGm._id, email: 'target@test.com' });
    await page.goto(`/games/${gameA._id}`);
    await expect(page.getByRole('heading', { level: 1, name: '待刪劇本' })).toBeVisible();

    // 點「刪除劇本」按鈕
    await page.getByRole('button', { name: '刪除劇本' }).click();

    // 確認 Dialog 開啟
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '確認刪除劇本' })).toBeVisible();
    // 顯示劇本名稱和警告
    await expect(dialog.getByText('待刪劇本')).toBeVisible();
    await expect(dialog.getByText('此操作無法復原')).toBeVisible();

    // 點「確認刪除」
    await dialog.getByRole('button', { name: '確認刪除' }).click();

    // 等 redirect 到 /games
    await page.waitForURL('/games', { timeout: 10000 });

    // ══════════════════════════════════════
    // DB 驗證：Target GM 側全部清除
    // ══════════════════════════════════════

    // Game A 已刪除
    const gamesA = await dbQuery('games', { _id: gameA._id });
    expect(gamesA).toHaveLength(0);

    // Character A1, A2 已刪除
    const charsA = await dbQuery('characters', { gameId: gameA._id });
    expect(charsA).toHaveLength(0);

    // GameRuntime 已刪除
    const gameRtA = await dbQuery('game_runtime', { refId: gameA._id });
    expect(gameRtA).toHaveLength(0);

    // CharacterRuntime 已刪除
    const charRtA = await dbQuery('character_runtime', { gameId: gameA._id });
    expect(charRtA).toHaveLength(0);

    // Log 已刪除
    const logsA = await dbQuery('logs', { gameId: gameA._id });
    expect(logsA).toHaveLength(0);

    // PendingEvent（game-level）已刪除
    const peA = await dbQuery('pending_events', { targetGameId: gameA._id });
    expect(peA).toHaveLength(0);

    // ══════════════════════════════════════
    // DB 驗證：Other GM 側完整保留
    // ══════════════════════════════════════

    // Game B 仍存在
    const gamesB = await dbQuery('games', { _id: gameB._id });
    expect(gamesB).toHaveLength(1);

    // Character B1 仍存在
    const charsB = await dbQuery('characters', { _id: charB1._id });
    expect(charsB).toHaveLength(1);

    // Log 仍存在
    const logsB = await dbQuery('logs', { gameId: gameB._id });
    expect(logsB).toHaveLength(1);

    // PendingEvent 仍存在（用 eventType 查詢，避免 targetCharacterId 被 auto-convert 為 ObjectId）
    const peB = await dbQuery('pending_events', { eventType: 'e2e.isolation.check' });
    expect(peB).toHaveLength(1);
  });
});
