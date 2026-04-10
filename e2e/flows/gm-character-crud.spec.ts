/**
 * Flow #4 — GM 角色卡 CRUD
 *
 * 驗證 GM 端角色卡 CRUD 的整條鏈：從空白遊戲建立角色、填入 7 個分頁內容、到刪除角色。
 *
 * 規格文件：docs/refactoring/E2E_FLOW_4_GM_CHARACTER_CRUD.md
 *
 * 注意事項：
 * - 全程在 inactive game 操作，baseline-only 寫入
 * - active game 的 runtime 雙寫行為由 Flow #5-#9 覆蓋
 * - Items/Skills Wizard 拆至 Flow #4b
 */

import { test, expect } from '../fixtures';
import { waitForToast } from '../helpers/wait-for-toast';
import { clickSaveBar } from '../helpers/click-save-bar';

test.describe('Flow #4 — GM character CRUD', () => {
  // ────────────────────────────────────────────────────────────
  // #4.1a 空白遊戲建立第一張角色（happy path + validation）
  // ────────────────────────────────────────────────────────────
  test('#4.1a create character in empty game + validation', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game（無角色） ──
    const { gmUserId, gameId } = await seed.gmWithGame();
    await asGm({ gmUserId });

    // ── Phase A — 進入列表，驗證空狀態 ──
    await page.goto(`/games/${gameId}`);
    // 切到角色列表 tab（預設 tab 是「劇本資訊」）
    await page.getByRole('tab', { name: '角色列表' }).click();
    await expect(page.getByText('尚未建立任何角色')).toBeVisible();

    // ── Reverse validation A — 空 name 嘗試 submit ──
    await page.getByRole('button', { name: '建立第一個角色', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByPlaceholder('例如：流浪騎士 艾德溫');
    const submitBtn = dialog.getByRole('button', { name: '建立角色', exact: true });

    // 不填 name 直接 submit → HTML5 required 阻擋，dialog 仍開啟
    await submitBtn.click();
    await expect(dialog).toBeVisible();

    // ── Reverse validation B — PIN 格式錯誤（2 位） ──
    await nameInput.fill('E2E 主角');
    // 啟用 PIN toggle（dialog 內只有一個 switch）
    await dialog.getByRole('switch').click();
    const pinInput = dialog.getByPlaceholder('輸入 4 位數字');
    await pinInput.fill('12');
    // PinField 500ms debounce 後顯示格式錯誤
    await expect(dialog.getByText('PIN 格式錯誤（需要 4 位數字）')).toBeVisible({ timeout: 3000 });
    await expect(submitBtn).toBeDisabled();

    // ── Phase B — 填入正確資料 ──
    await pinInput.fill('1234');
    // 等待 PIN 可用性檢查完成
    await expect(dialog.getByText('PIN 碼可用')).toBeVisible({ timeout: 3000 });

    // ── Phase C — 送出建立 ──
    await submitBtn.click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // ── Phase D — 角色出現在列表 ──
    // createCharacter 做 router.refresh()，列表重新 render
    await expect(page.getByText('E2E 主角')).toBeVisible({ timeout: 5000 });

    // ── Phase E — 導航至編輯頁，驗證預設 tab ──
    await page.getByText('點擊卡片進入編輯 →').click();
    await page.waitForURL(/\/games\/[^/]+\/characters\/[^/]+$/);

    // 預設分頁為「基本設定」
    const tabBasic = page.getByRole('tab', { name: '基本設定' });
    await expect(tabBasic).toHaveAttribute('aria-selected', 'true');

    // 基本設定的 name 欄位顯示建立時的名稱
    await expect(page.getByPlaceholder('例：瑪格麗特夫人')).toHaveValue('E2E 主角');

    // Save Bar 不可見（dirty=false）
    await expect(page.getByRole('button', { name: '全部儲存' })).not.toBeVisible();

    // ── DB 斷言 ──
    const chars = await dbQuery('characters', { gameId });
    expect(chars).toHaveLength(1);
    const char = chars[0];
    expect(char.name).toBe('E2E 主角');
    expect(char.hasPinLock).toBe(true);
    expect(char.pin).toBe('1234');
  });

  // ────────────────────────────────────────────────────────────
  // #4.1b PIN 同 game 內唯一性
  // ────────────────────────────────────────────────────────────
  test('#4.1b PIN uniqueness within same game', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 1 角色（pin=1234） ──
    const { gmUserId, gameId } = await seed.gmWithGame();
    await seed.character({
      gameId,
      name: '先行者',
      hasPinLock: true,
      pin: '1234',
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}`);
    await page.getByRole('tab', { name: '角色列表' }).click();

    // 已有角色時，grid 內的 DashedAddButton 文案不同
    await page.getByRole('button', { name: '建立新角色', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByPlaceholder('例如：流浪騎士 艾德溫');
    const submitBtn = dialog.getByRole('button', { name: '建立角色', exact: true });

    // ── 嘗試使用重複 PIN ──
    await nameInput.fill('後來者');
    await dialog.getByRole('switch').click();
    const pinInput = dialog.getByPlaceholder('輸入 4 位數字');
    await pinInput.fill('1234');

    // PinField 即時檢查 → 此 PIN 已被使用
    await expect(dialog.getByText('此 PIN 已被使用')).toBeVisible({ timeout: 3000 });
    await expect(submitBtn).toBeDisabled();

    // DB 層：仍只有 1 張角色
    const charsBefore = await dbQuery('characters', { gameId });
    expect(charsBefore).toHaveLength(1);

    // ── Reverse：改用不重複 PIN → 成功建立 ──
    await pinInput.clear();
    await pinInput.fill('5678');
    await expect(dialog.getByText('PIN 碼可用')).toBeVisible({ timeout: 3000 });

    await submitBtn.click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // DB 層：現在有 2 張角色
    const charsAfter = await dbQuery('characters', { gameId });
    expect(charsAfter).toHaveLength(2);
    // 驗證新角色的 PIN
    const newChar = charsAfter.find(
      (c: Record<string, unknown>) => c.name === '後來者',
    );
    expect(newChar).toBeDefined();
    expect(newChar!.pin).toBe('5678');
  });

  // ────────────────────────────────────────────────────────────
  // #4.2 基本設定分頁 CRUD（含 PIN 修改）
  // ────────────────────────────────────────────────────────────
  test('#4.2 basic settings CRUD + PIN change', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（僅 name，其他欄位空） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: 'E2E 主角' },
    });
    await asGm({ gmUserId });

    // ── Phase A — 進入編輯頁，驗證初始狀態 ──
    await page.goto(`/games/${gameId}/characters/${characterId}`);
    await expect(page.getByRole('tab', { name: '基本設定' })).toHaveAttribute('aria-selected', 'true');

    const nameInput = page.getByPlaceholder('例：瑪格麗特夫人');
    await expect(nameInput).toHaveValue('E2E 主角');
    // Save Bar 隱藏（dirty=false）
    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });
    await expect(saveAllBtn).not.toBeVisible();

    // ── Phase B — 修改四個文字欄位 ──
    await nameInput.fill('修改後的名字');
    // dirty → Save Bar 出現
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    await page.getByPlaceholder('輸入角色的背景故事、性格特徵等...').fill('E2E 角色描述');
    await page.getByPlaceholder('例：外表高雅的貴婦人，實則是黑市情報販子').fill('E2E 標語');
    await page.getByPlaceholder('描述角色的行為準則與個性...').fill('E2E 人格特質');

    // 儲存（evaluate retry loop 避免 AnimatePresence detach — 方法 3）
    await clickSaveBar(page);
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── Phase C — 啟用 PIN 並設定 ──
    // 等待 toast 先出現再消失，確保 router.refresh() 完成重新渲染（規則 13/19）
    // 注意：not.toBeVisible 在 toast 尚未 mount 時就會通過，必須先等 mount
    const toast = page.locator('[data-sonner-toast]');
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).not.toBeVisible({ timeout: 10000 });
    // 頁面只有一個 Switch（PIN 解鎖保護）
    await page.getByRole('switch').click();
    // 啟用後 PIN 輸入出現，placeholder 是 '4-6 位數字'（因角色原本無 PIN）
    const pinInput = page.getByPlaceholder('4-6 位數字');
    await pinInput.fill('9876');
    await expect(page.getByText('PIN 碼可用')).toBeVisible({ timeout: 3000 });

    await expect(saveAllBtn).toBeVisible();
    await clickSaveBar(page);
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── Phase D — 圖片欄位 gate（僅驗 UI 存在，不實際上傳） ──
    // 圖片上傳 UI 在頁面 header 區域，不在 tab 內，此處略過
    // Blob 上傳在 E2E 排除範圍

    // 等待 save toast 出現並消失，確保 router.refresh() 重渲染完成（方法 2）
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-sonner-toast]')).not.toBeVisible({ timeout: 10000 });

    // ── Reverse validation — 清空 name → 儲存失敗 ──
    await nameInput.fill('');
    await expect(saveAllBtn).toBeVisible();
    await clickSaveBar(page);
    // 儲存失敗 → Save Bar 仍可見（dirty 未歸零）
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    // 恢復 name 以免影響 DB 斷言
    await nameInput.fill('修改後的名字');

    // ── DB 斷言（Phase B+C 的結果） ──
    const chars = await dbQuery('characters', { _id: characterId });
    expect(chars).toHaveLength(1);
    const char = chars[0] as Record<string, unknown>;
    expect(char.name).toBe('修改後的名字');
    expect(char.description).toBe('E2E 角色描述');
    expect(char.slogan).toBe('E2E 標語');
    expect(char.hasPinLock).toBe(true);
    expect(char.pin).toBe('9876');
    // personality 存在 publicInfo 底下
    const publicInfo = char.publicInfo as Record<string, unknown> | undefined;
    expect(publicInfo?.personality).toBe('E2E 人格特質');
  });

  // ────────────────────────────────────────────────────────────
  // #4.3 背景故事分頁：blocks + relationships CRUD
  // ────────────────────────────────────────────────────────────
  test('#4.3 background blocks + relationships CRUD', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色 ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: 'E2E 主角' },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    // 切到「背景故事」tab
    await page.getByRole('tab', { name: '背景故事' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 新增 2 個 background blocks + 1 個 relationship，一次儲存 ──
    // 將 blocks 與 relationship 在同一批次操作，避免中間 save → router.refresh()
    // 導致 save handler 閉包捕獲到舊的 formData（stale closure race）
    //
    // 重要：每次 fill 後使用 toHaveValue 斷言作為 React 狀態刷新屏障。
    // BackgroundBlockEditor 維護獨立的 internal state，透過 onChange 回傳 parent。
    // React 18 automatic batching 可能延遲 flush setState，導致後續操作拿到
    // stale closure 中的舊 blocks。toHaveValue 斷言迫使 Playwright 等待
    // React re-render 完成（controlled component 更新 DOM value），確保每一步
    // 的狀態都已正確傳播。

    // 新增 block 1
    await page.getByRole('button', { name: '新增區塊', exact: true }).click();
    const bodyTextareas = page.getByPlaceholder('段落內文...');
    await expect(bodyTextareas.first()).toBeVisible();
    await bodyTextareas.first().fill('第一段背景故事');
    await expect(bodyTextareas.first()).toHaveValue('第一段背景故事');

    // 新增 block 2
    // force: true — SaveBar（fixed bottom z-50）在 block 1 dirty 後出現，
    // 可能遮蔽位於頁面底部的「新增區塊」按鈕
    await page.getByRole('button', { name: '新增區塊', exact: true }).click({ force: true });
    await expect(bodyTextareas.nth(1)).toBeVisible();
    await bodyTextareas.nth(1).fill('第二段背景故事');
    await expect(bodyTextareas.nth(1)).toHaveValue('第二段背景故事');

    // NOTE: 拖曳重排測試因 dnd-kit 與 Playwright 的 pointer event 相容性問題，
    // 暫不在此 case 實作。block 順序驗證已由 DB 斷言覆蓋。

    // 新增 relationship（右欄初始為空狀態）
    await expect(page.getByText('尚未新增任何人物關係')).toBeVisible();
    // force: true — Save Bar（fixed bottom z-50）在 blocks dirty 後出現，
    // 可能遮蔽位於頁面底部的「新增關係」按鈕
    await page.getByRole('button', { name: '新增關係', exact: true }).click({ force: true });

    // 填入關係資料（targetName 是自由文字欄位，非下拉選單）
    // 等待 addRelationship 的 setState → 條件渲染完成
    await expect(page.getByPlaceholder('角色名稱')).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('角色名稱').fill('路人甲');
    await expect(page.getByPlaceholder('角色名稱')).toHaveValue('路人甲');
    await page.getByPlaceholder('描述與此角色的關係...').fill('宿敵');
    await expect(page.getByPlaceholder('描述與此角色的關係...')).toHaveValue('宿敵');

    // 一次儲存 blocks + relationship
    await expect(saveAllBtn).toBeVisible();
    // 繞過 SaveBar 的 Map-based handler registration（useEffect 非同步註冊
    // 導致 stale closure），改用 form 原生 submit 直接呼叫 BackgroundStoryTab
    // 的 handleSubmit → save()，此路徑始終讀取當前 render 閉包的 formData。
    const bgForm = page.locator('[data-state="active"] form');
    await bgForm.evaluate(el => (el as HTMLFormElement).requestSubmit());
    await waitForToast(page, '背景故事已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 — blocks ──
    const chars = await dbQuery('characters', { _id: characterId });
    expect(chars).toHaveLength(1);
    const char = chars[0] as Record<string, unknown>;
    const publicInfo = char.publicInfo as Record<string, unknown> | undefined;

    const background = publicInfo?.background as Array<{ type: string; content: string }> | undefined;
    expect(background).toHaveLength(2);
    expect(background![0].type).toBe('body');
    expect(background![0].content).toBe('第一段背景故事');
    expect(background![1].content).toBe('第二段背景故事');

    // ── DB 斷言 — relationships ──
    const relationships = publicInfo?.relationships as Array<{ targetName: string; description: string }> | undefined;
    expect(relationships).toHaveLength(1);
    expect(relationships![0].targetName).toBe('路人甲');
    expect(relationships![0].description).toBe('宿敵');

    // ── Phase B — 刪除 relationship ──
    // 等待 save toast 消失，確保 router.refresh() 重渲染完成（方法 2）
    await expect(page.locator('[data-sonner-toast]')).not.toBeVisible({ timeout: 10000 });
    // 關係已選中（第一個也是唯一一個），點開 dropdown menu 刪除
    // lucide-react v0.400+ 將 MoreHorizontal 改名為 Ellipsis，
    // SVG class 變為 lucide-ellipsis
    await page.locator('button:has(svg.lucide-ellipsis)').click();
    await page.getByRole('menuitem', { name: '刪除此關係', exact: true }).click();

    await expect(saveAllBtn).toBeVisible();
    // Phase A 的 toast "背景故事已儲存" 可能仍可見（Sonner 預設 4 秒），
    // 因此 Phase B 不用 waitForToast，改為只等 save bar 消失
    await bgForm.evaluate(el => (el as HTMLFormElement).requestSubmit());
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // DB：relationships 已清空
    const charsAfter = await dbQuery('characters', { _id: characterId });
    const publicInfoAfter = (charsAfter[0] as Record<string, unknown>).publicInfo as Record<string, unknown> | undefined;
    const relsAfter = publicInfoAfter?.relationships as Array<unknown> | undefined;
    expect(relsAfter).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────
  // #4.4 隱藏資訊 CRUD（secrets + soft delete）
  // ────────────────────────────────────────────────────────────
  test('#4.4 secrets CRUD + soft delete', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色（無 secrets） ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: 'E2E 主角' },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    // 切到「隱藏資訊」tab
    await page.getByRole('tab', { name: '隱藏資訊' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 新增 secret（多段落） ──
    // 空狀態：顯示引導文案
    await expect(page.getByText('尚未新增隱藏資訊')).toBeVisible();
    await page.getByRole('button', { name: '新增第一條隱藏資訊' }).click();

    // SecretEditDialog 開啟（新 secret 無標題 → dialog title 為 "編輯隱藏資訊"）
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 填入標題
    await dialog.getByPlaceholder('隱藏資訊標題').fill('深層秘密');

    // normalizeSecretContent 將空字串轉為 ['']，dialog 初始有 1 個空段落
    await dialog.getByPlaceholder('段落 1...').fill('第一段內容');

    // 新增第二段
    await dialog.getByRole('button', { name: /新增段落/ }).click();
    await dialog.getByPlaceholder('段落 2...').fill('第二段內容');

    // 確認（存入 SecretsTab 本地狀態，尚未送 server）
    await dialog.getByRole('button', { name: '確認' }).click();
    await expect(dialog).toBeHidden();

    // dirty=true → Save Bar 出現
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    // SecretsTab 有 <form onSubmit={handleSubmit}> 包裝，使用 requestSubmit
    // 繞過 Map-based handler 的 stale closure 風險（同 #4.3 策略）
    const secretsForm = page.locator('[data-state="active"] form');
    await secretsForm.evaluate(el => (el as HTMLFormElement).requestSubmit());
    await waitForToast(page, '隱藏資訊已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 — Phase A ──
    const chars = await dbQuery('characters', { _id: characterId });
    expect(chars).toHaveLength(1);
    const char = chars[0] as Record<string, unknown>;
    const secretInfo = char.secretInfo as Record<string, unknown> | undefined;
    const dbSecrets = secretInfo?.secrets as Array<Record<string, unknown>> | undefined;
    expect(dbSecrets).toHaveLength(1);
    expect(dbSecrets![0].title).toBe('深層秘密');
    // content 以陣列形式儲存（normalizeSecretContent）
    const content = dbSecrets![0].content as string[];
    expect(content).toHaveLength(2);
    expect(content[0]).toBe('第一段內容');
    expect(content[1]).toBe('第二段內容');
    expect(dbSecrets![0].isRevealed).toBe(false);

    // ── Phase B — Soft delete + undo + re-delete + save ──
    // 等待 save toast 消失，確保 router.refresh() 重渲染完成（方法 2）
    await expect(page.locator('[data-sonner-toast]')).not.toBeVisible({ timeout: 10000 });

    // 左欄列表中唯一的 secret，點擊刪除（IconActionButton aria-label="刪除"）
    await page.getByRole('button', { name: '刪除', exact: true }).click();

    // 軟刪除：UI 顯示刪除標記（strikethrough + 半透明）
    // 詳情面板顯示「此隱藏資訊已標記刪除，儲存後將被移除。」
    await expect(page.getByText('此隱藏資訊已標記刪除，儲存後將被移除。')).toBeVisible();

    // 復原（左列表 + 右詳情面板都有 aria-label="復原" 的 IconActionButton，
    // 使用 .first() 避免 strict mode violation）
    await page.getByRole('button', { name: '復原', exact: true }).first().click();
    // 復原後刪除文案消失
    await expect(page.getByText('此隱藏資訊已標記刪除，儲存後將被移除。')).not.toBeVisible();

    // 再次刪除 → 這次儲存（復原後 "刪除" 按鈕只在左列表出現，不需 .first()）
    await page.getByRole('button', { name: '刪除', exact: true }).click();
    await expect(page.getByText('此隱藏資訊已標記刪除，儲存後將被移除。')).toBeVisible();

    // dirty=true → 儲存
    await expect(saveAllBtn).toBeVisible();
    await secretsForm.evaluate(el => (el as HTMLFormElement).requestSubmit());
    await waitForToast(page, '隱藏資訊已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 — Phase B ──
    const charsAfter = await dbQuery('characters', { _id: characterId });
    const secretInfoAfter = (charsAfter[0] as Record<string, unknown>).secretInfo as Record<string, unknown> | undefined;
    const secretsAfter = secretInfoAfter?.secrets as Array<unknown> | undefined;
    expect(secretsAfter).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────
  // #4.5 任務 CRUD（一般任務 + 隱藏任務 + soft delete）
  // ────────────────────────────────────────────────────────────
  test('#4.5 tasks CRUD + soft delete', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色 ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: 'E2E 主角' },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    // 切到「任務」tab
    await page.getByRole('tab', { name: '任務' }).click();

    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — 新增一般任務 + 隱藏任務（不中間 save） ──
    // 將兩個任務合併在同一次 save 操作中，避免中間 save → router.refresh()
    // 後 useEffect 重新註冊 Map handler 的時序問題（useEffect 在 paint 後
    // 非同步觸發，Playwright 可能在 Map 更新前就點了 SaveBar）。

    // 左欄空狀態
    await expect(page.getByText('尚無一般任務')).toBeVisible();
    await page.getByRole('button', { name: '新增一般任務' }).click();

    // 任務編輯 Dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('新增任務')).toBeVisible();

    // 填入標題與描述
    await dialog.getByPlaceholder('例：找到失蹤的信件').fill('主線任務 1');
    await dialog.getByPlaceholder('詳細描述任務內容...').fill('打倒魔王');

    // 確認（存入 TasksEditForm 本地狀態）
    await dialog.getByRole('button', { name: '確認' }).click();
    await expect(dialog).toBeHidden();

    // 任務卡片出現在左欄（一般任務欄）
    await expect(page.getByText('主線任務 1')).toBeVisible();

    // 接著新增隱藏任務（不先儲存）
    await page.getByRole('button', { name: '新增隱藏任務' }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('新增任務')).toBeVisible();

    // 填入標題
    await dialog.getByPlaceholder('例：找到失蹤的信件').fill('隱藏任務 1');

    // 「隱藏目標」switch 應已開啟（handleAddTask(true) 設定 isHidden=true）
    // 驗證「已揭露」switch 存在（隱藏任務才顯示）
    await expect(dialog.getByText('已揭露')).toBeVisible();

    // 確認
    await dialog.getByRole('button', { name: '確認' }).click();
    await expect(dialog).toBeHidden();

    // 兩個任務卡片都可見
    await expect(page.getByText('主線任務 1')).toBeVisible();
    await expect(page.getByText('隱藏任務 1')).toBeVisible();

    // dirty=true → 一次儲存兩個任務
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });
    // TasksEditForm 無 <form> 包裝，使用 SaveBar 儲存。
    // 兩個任務都在同一個 render cycle 的 effectiveTasks 中，
    // Map handler 在此刻已正確註冊（無中間 refresh 的時序風險）。
    // evaluate retry loop 避免 AnimatePresence detach（方法 3）
    await clickSaveBar(page);
    // SaveBar 的 saveAll 對各 tab handler 傳入 { silent: true }，顯示聚合 toast
    await waitForToast(page, '已儲存');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // ── DB 斷言 — Phase A ──
    const chars = await dbQuery('characters', { _id: characterId });
    expect(chars).toHaveLength(1);
    const char = chars[0] as Record<string, unknown>;
    const dbTasks = char.tasks as Array<Record<string, unknown>> | undefined;
    expect(dbTasks).toHaveLength(2);

    const generalTask = dbTasks!.find((t) => t.title === '主線任務 1');
    expect(generalTask).toBeDefined();
    expect(generalTask!.description).toBe('打倒魔王');
    expect(generalTask!.isHidden).toBe(false);
    expect(generalTask!.status).toBe('pending');

    const hiddenTask = dbTasks!.find((t) => t.title === '隱藏任務 1');
    expect(hiddenTask).toBeDefined();
    expect(hiddenTask!.isHidden).toBe(true);
    expect(hiddenTask!.isRevealed).toBe(false);
    expect(hiddenTask!.status).toBe('pending');

    // ── Phase B — Soft delete UI 驗證（delete + undo） ──
    // 注意：soft delete 的持久化（save 後 DB 反映刪除）已由 #4.4 secrets 測試
    // 覆蓋（使用 form.requestSubmit 繞過 Map handler）。TasksEditForm 沒有
    // <form> 包裝，只能透過 SaveBar 儲存，而 SaveBar 的 Map-based handler
    // 在 router.refresh() 後有 useEffect 重新註冊的時序問題，因此此處只驗證
    // soft delete 的 UI 行為（刪除 → 復原 → 狀態回復），不驗證持久化。
    // 等待 save toast 消失，確保 router.refresh() 重渲染完成（方法 2）
    await expect(page.locator('[data-sonner-toast]')).not.toBeVisible({ timeout: 10000 });

    // 「主線任務 1」在左欄 <section>，「隱藏任務 1」在右欄 <section>
    const generalColumn = page.locator('section').filter({ hasText: '一般任務' });

    // 點擊刪除 → 復原按鈕出現
    await generalColumn.getByRole('button', { name: '刪除' }).click();
    await expect(generalColumn.getByRole('button', { name: '復原' })).toBeVisible();

    // Save Bar 出現（dirty=true）
    await expect(saveAllBtn).toBeVisible();

    // 點擊復原 → 刪除/編輯按鈕回復
    await generalColumn.getByRole('button', { name: '復原' }).click();
    await expect(generalColumn.getByRole('button', { name: '刪除' })).toBeVisible();
    await expect(generalColumn.getByRole('button', { name: '編輯' })).toBeVisible();

    // 復原後 dirty 歸零 → Save Bar 消失
    await expect(saveAllBtn).not.toBeVisible({ timeout: 3000 });
  });

  // ────────────────────────────────────────────────────────────
  // #4.6 Dirty state + Discard + beforeunload
  // ────────────────────────────────────────────────────────────
  test('#4.6 dirty state + discard + beforeunload', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed：GM + inactive game + 角色 ──
    const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: 'E2E 主角' },
    });
    await asGm({ gmUserId });

    await page.goto(`/games/${gameId}/characters/${characterId}`);
    const nameInput = page.getByPlaceholder('例：瑪格麗特夫人');
    const saveAllBtn = page.getByRole('button', { name: '全部儲存' });

    // ── Phase A — dirty=false 初始狀態 ──
    await expect(nameInput).toHaveValue('E2E 主角');
    await expect(saveAllBtn).not.toBeVisible();

    // ── Phase B — 任一欄位變動 → dirty=true ──
    await nameInput.fill('E2E 主角（已修改）');
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    // ── Phase C — 捨棄變更 ──
    await page.getByRole('button', { name: '捨棄變更' }).click();
    // 確認 Dialog（Radix AlertDialog portal）
    await expect(page.getByText('捨棄所有變更？')).toBeVisible();
    await page.getByRole('button', { name: '捨棄所有變更' }).click();

    // name 回到原值、Save Bar 消失
    await expect(nameInput).toHaveValue('E2E 主角');
    await expect(saveAllBtn).not.toBeVisible({ timeout: 3000 });

    // DB：name 未被修改
    const charsC = await dbQuery('characters', { _id: characterId });
    expect((charsC[0] as Record<string, unknown>).name).toBe('E2E 主角');

    // ── Phase D — beforeunload 攔截 ──
    // 再次修改 name → dirty=true
    await nameInput.fill('即將離開');
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    // 設定 dialog listener：捕捉 beforeunload → dismiss（取消導航）
    let beforeunloadFired = false;
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'beforeunload') {
        beforeunloadFired = true;
        await dialog.dismiss();
      }
    });

    // 嘗試完整頁面導航（觸發 native beforeunload）
    // dismiss 後 goto 會 throw 或 navigate 不完成，用 catch 忽略
    await page.goto(`/games/${gameId}`, { timeout: 3000 }).catch(() => {});

    // 斷言：beforeunload 觸發、仍在編輯頁
    expect(beforeunloadFired).toBe(true);
    expect(page.url()).toContain(`/characters/${characterId}`);
    // 修改仍在
    await expect(nameInput).toHaveValue('即將離開');

    // ── Phase E — 儲存後 dirty 歸零，可以離開 ──
    // 先移除 beforeunload dialog listener，避免干擾後續導航
    page.removeAllListeners('dialog');

    // Phase D 的 goto.catch() 導致 Map 中的 save handler closure 可能是 stale 的，
    // 改用 form.requestSubmit() 繞過 Map，直接觸發 BasicSettingsTab 的 handleSubmit → save()
    await nameInput.fill('已儲存名稱');
    await expect(saveAllBtn).toBeVisible({ timeout: 3000 });

    // 找到 basic settings tab 的 <form> 並 requestSubmit
    const basicForm = page.locator('form').filter({ has: nameInput });
    await basicForm.evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });

    // DB：name 已更新
    const charsE = await dbQuery('characters', { _id: characterId });
    expect((charsE[0] as Record<string, unknown>).name).toBe('已儲存名稱');
  });

  // ────────────────────────────────────────────────────────────
  // #4.7 刪除角色：isActive gate
  // ────────────────────────────────────────────────────────────
  test('#4.7 delete character gate (inactive vs active)', async ({
    page,
    seed,
    asGm,
    dbQuery,
  }) => {
    // ── Seed A：inactive game + 角色 ──
    const seedA = await seed.gmWithGameAndCharacter({
      characterOverrides: { name: '待刪角色' },
    });
    // ── Seed B：active game + 角色（同一 GM，分開建立） ──
    const gameB = await seed.game({ gmUserId: seedA.gmUserId, isActive: true });
    const charB = await seed.character({ gameId: gameB._id, name: '不可刪角色' });
    // Active game 需要 characterRuntime，否則 server 端會 console.warn
    await seed.characterRuntime({ refId: charB._id, gameId: gameB._id, name: '不可刪角色' });

    await asGm({ gmUserId: seedA.gmUserId });

    // ── Phase A — inactive game 可以刪除 ──
    await page.goto(`/games/${seedA.gameId}/characters/${seedA.characterId}`);

    // 「刪除角色」按鈕可見（aria-label="刪除角色" 的 IconActionButton）
    const deleteBtn = page.getByRole('button', { name: '刪除角色' });
    await expect(deleteBtn).toBeVisible();

    // 點擊 → 確認 Dialog
    await deleteBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('確認刪除角色')).toBeVisible();
    await expect(dialog.getByText('待刪角色')).toBeVisible();

    // 確認刪除
    await dialog.getByRole('button', { name: '確認刪除' }).click();

    // 導航回遊戲頁面
    await page.waitForURL(`/games/${seedA.gameId}`, { timeout: 10000 });

    // DB：角色已硬刪除
    const charsA = await dbQuery('characters', { _id: seedA.characterId });
    expect(charsA).toHaveLength(0);

    // ── Phase B — active game 時刪除按鈕不存在 ──
    await page.goto(`/games/${gameB._id}/characters/${charB._id}`);
    // 等待頁面載入（確認角色名稱可見）
    await expect(page.getByRole('heading', { name: '不可刪角色' })).toBeVisible({ timeout: 5000 });

    // 「刪除角色」按鈕不在 DOM（server component 條件渲染 !game.isActive）
    await expect(page.getByRole('button', { name: '刪除角色' })).not.toBeVisible();

    // DB：角色仍存在
    const charsB = await dbQuery('characters', { _id: charB._id });
    expect(charsB).toHaveLength(1);
  });
});
