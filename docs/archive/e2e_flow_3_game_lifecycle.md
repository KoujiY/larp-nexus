# E2E Flow #3 — GM 劇本管理完整生命週期

> 本檔案從 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 拆出。原文件已過於龐大，Flow #3 以獨立檔案管理。
> 共用規格（fixture、db-reset、stub pusher、WebSocket 斷言慣例等）仍以 `../archive/e2e-flows-plan.md` 的「共同規格」section 為準，本檔只描述 Flow #3 範圍內的 test case 細節。
>
> **上游文件**：[../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md)
> **對應 spec 檔**：`e2e/flows/gm-game-lifecycle.spec.ts`（單一 spec 檔內含 6 個 test case）

---

## Flow #3 — GM 劇本管理完整生命週期（flows 層）

**對應 spec 檔**：`e2e/flows/gm-game-lifecycle.spec.ts`（單一 spec 檔內含 6 個 test case）

### 設計背景

Flow #3 涵蓋「GM 從零到結束一個劇本」的完整生命週期：建立 → 設定 → 編輯 → 開始遊戲 → 結束遊戲 → 刪除。這 6 個 test case 有意設計成**獨立的 DB 起點**（每個 test case 各自 seed，不串接前一個的狀態），理由：
1. **獨立 rerun**：CI 上若只有 #3.4 flaky，可單獨重跑而不需跑前 3 個 case
2. **錯誤隔離**：#3.1 失敗不會把 #3.2-#3.6 通通拖紅，誤導根因定位
3. **前置最小化**：每個 case 只 seed 它自己需要的 DB state，fixture 複雜度可控

**與下游 flow 的分流**（在第 [待決定日期] 的規劃輪次中確定）：
- **stat_change 預設事件動作 → Flow #9（新）預設事件 runtime 執行**：stat_change 效果執行邏輯與 skill effect 共用 `executeSkillEffects`，放在 Flow #9 更能驗證效果管線
- **reveal_secret / reveal_task 預設事件動作定義 → Flow #4 局部測試**：這兩類動作需要預先存在的 character secrets / tasks 作為目標，Flow #3 沒有 character seed，語意不契合
- **auto-reveal 條件編輯器與 runtime 觸發 → 未來 Flow #10（auto-reveal 專屬）**：橫切系統，獨立規劃
- **runPresetEvent runtime 執行 → Flow #9**：runtime console 互動與 GM 廣播同類，不屬 Flow #3 的「準備階段」

### Flow #3 共用規格

#### 共用 seed 起點
**每個 test case 都以空 DB + 1 個 GMUser + `asGm()` session 為起點**，額外 seed 由各 case 自行宣告。`asGm()` fixture 會處理：(1) seed GMUser 到 DB、(2) 呼叫 `/api/test/login` 寫 iron-session cookie、(3) 必要時設 `dynamic = 'force-dynamic'` 對應的 cookie path 在 context 範圍生效。

#### 共用 URL
- `/games` — 劇本列表頁（`app/(gm)/games/page.tsx`）
- `/games/{gameId}` — 劇本編輯頁（`app/(gm)/games/[gameId]/page.tsx`，內含 GameEditTabs 結構）

#### 斷言助手歸納（寫 fixture 時參考）
Flow #3 大量使用以下斷言模式，建議抽 helper：
- `expectGameInDb({ name, gameCode?, isActive?, publicInfo?, presetEvents? })` — 查 Game doc 對比欄位
- `expectToastVisible(page, text)` — 等 sonner toast
- `expectCardInGameList(page, { name, gameCode, status })` — /games 列表卡片存在性與欄位
- `expectGameEditPageLoaded(page, gameId)` — /games/{id} 頁面關鍵元素可見（麵包屑、標題、GameCodeSection、GameEditTabs）

---

### Test case #3.1 — 建立劇本 + 必填/長度/唯一性驗證

**對應場景**：A1 / A2 / A3 / A4 / A5 / A6 / A7（正反面）

#### 進入點
- 角色：GM（`asGm()`）
- URL：`/games`（空狀態）

#### 前置 seed
- 1 GMUser
- **無 Game**（空 DB 起點，驗證「從 0 到 1」的入口完整可達）
- **負面分支專用**：在「唯一性反面」子測試中，另 seed 1 個 Game，`gameCode = 'EXIST1'`，屬於**另一個** GMUser（證明跨 GM 的 gameCode 唯一性也生效）

#### 操作步驟

**主線（happy path，covers A1-A4）**：
1. `asGm()` → `page.goto('/games')`
2. 等空狀態元素 `getByText('尚無劇本')` + `getByText('建立您的第一個劇本，開始編織冒險的篇章')` + `getByRole('button', { name: '建立第一個劇本' })`（文案源自 `app/(gm)/games/page.tsx:43-46`、`create-game-button.tsx:151`）
3. 點擊 `建立第一個劇本` 按鈕 → Dialog 開啟（`create-game-button.tsx:140-165`）
4. 等 Dialog 標題 `getByRole('heading', { name: '建立新劇本' })` 可見
5. **等 gameCode 欄位自動填入**：Dialog 打開時會呼叫 `generateGameCodeClient()` 自動生成一個 6 位碼（`create-game-button.tsx:58-65`），然後 useEffect 觸發 `checkGameCodeAvailability` 防抖 500ms 後回 `available`
6. 用 `page.waitForFunction(() => /^[A-Z0-9]{6}$/.test(...))` 等 input value 有值，或直接等狀態指示 icon 變綠 `locator('[data-testid="gamecode-status"]')`（若無 data-testid，等 `getByText('此代碼可以使用')`）
7. `fill` 劇本名稱：`'E2E 測試劇本 #3.1'`（至 `<Input>` 對應 label `劇本名稱`）
8. `fill` 劇本描述：`'自動化 lifecycle 測試'`
9. **不**改動 `最大檢定值`（維持預設 100，驗證 default 行為）
10. **不**改動 gameCode（讓自動生成值送出）
11. 點擊 `getByRole('button', { name: '建立劇本' })` 提交

**負面 #1 — 空白名稱（A5）**：
1. 打開 Dialog 後，**不**填入名稱
2. 嘗試點擊 `建立劇本` 按鈕
3. 驗證：`<Input name="name">` 有 HTML `required` attribute（`create-game-button.tsx:189`），瀏覽器會阻止 submit 並顯示原生 validation tooltip
4. 斷言 server action **未被呼叫**（攔 `page.waitForResponse` 並 timeout）

**負面 #2 — 名稱超過 100 字（A6）**：
1. `fill` 名稱為 101 個字的字串（可用 `'長'.repeat(101)`）
2. 點擊 `建立劇本`
3. 驗證 server 回 `VALIDATION_ERROR` + 錯誤訊息「劇本名稱不可超過 100 字元」（`games.ts:22`），Dialog 內的 error box 顯示該訊息（`create-game-button.tsx:290-295`）

**負面 #3 — gameCode 已被佔用（A7 反面）**：
1. 前置 seed 另一個 GM 的 Game 佔用 `gameCode: 'EXIST1'`
2. 打開 Dialog，等自動生成的 code 出現
3. **清空** gameCode 欄位並 `fill('EXIST1')`
4. 等防抖 500ms + `checkGameCodeAvailability` 回應
5. 驗證：狀態指示器變成 ✗（destructive icon）+ 文字 `此代碼已被其他劇本使用，請換一個`（`create-game-button.tsx:240`）
6. 驗證：`建立劇本` 按鈕為 disabled（`create-game-button.tsx:313` 的 disabled 條件含 `gameCodeCheckStatus === 'unavailable'`）
7. 嘗試點擊按鈕，驗證 server action **未被觸發**

**正面（A7 正面）**：
1. 打開 Dialog，等自動生成的 code
2. 清空並 fill 一個**確定不衝突**的 code（例：`'AVAIL1'`）
3. 等防抖完成、狀態變 ✓ + `此代碼可以使用`
4. 填名稱後按建立，驗證成功

#### 非同步等待點
- Dialog 打開動畫（`Dialog` 元件 transition 約 200ms）
- gameCode 自動生成 + 防抖 500ms + `checkGameCodeAvailability` 網路來回（通常 <100ms in-memory DB）→ 狀態變 `available`
- 提交後 `createGame` server action 回 200
- `router.refresh() + router.push(/games/${id})`（`create-game-button.tsx:124-125`）
- 目標頁 `/games/{gameId}` 載入 + header 渲染

#### 斷言

**UI 層**：
- 建立成功後 URL 變為 `/games/{createdGameId}`
- Header 麵包屑顯示 `劇本管理 > E2E 測試劇本 #3.1`（`[gameId]/page.tsx:56-59`）
- Header 標題 `E2E 測試劇本 #3.1` + Badge `待機中`（`[gameId]/page.tsx:63-71`）
- `GameCodeSection` 顯示自動生成的 6 位碼
- 預設顯示「劇本資訊」Tab（`GameEditTabs` 無 consoleTab 時 `activeTab = 'info'`，`game-edit-tabs.tsx:29`）
- EnvironmentBanner 顯示 Baseline 模式（非 active）

**DB 層**（透過 `/api/test/db-query?collection=games`）：
- `Game.findOne({ name: 'E2E 測試劇本 #3.1', gmUserId })` 存在
- `gameCode` 符合 `/^[A-Z0-9]{6}$/` 且與 UI 顯示一致
- `description === '自動化 lifecycle 測試'`
- `isActive === false`
- `randomContestMaxValue === 100`（Dialog 預設，`create-game-button.tsx:50`）
- `publicInfo` 為空物件或預設 `{ blocks: [] }`
- `presetEvents` 為空陣列
- `createdAt` 與 `updatedAt` 為近 5 秒內時間戳

#### 反向驗證
- **拿掉 `asGm()`**：不登入直接 `page.goto('/games')` → 應被 server-side redirect 至 `/auth/login`（`app/(gm)/games/page.tsx:17-19`）
- **拿掉 `asGm()` 直接 POST server action**：透過 `page.evaluate` 嘗試直接呼叫 `createGame({...})` → 應回 `UNAUTHORIZED`（`games.ts:148`）
- **DB 本應無 game 卻存在**：如果 `asGm()` 的 DB reset 未生效，同名 Game 會產生 `E11000` duplicate key 或列表多出舊資料；此反向驗證等同驗證 `db-fixture` 的 reset 正確性

#### 已知陷阱
1. **gameCode 自動生成的非決定性**：每次測試 Dialog 打開時 `generateGameCodeClient()` 回傳值不同。斷言時**不要硬編碼** gameCode 值，應用 regex `/^[A-Z0-9]{6}$/` 或從 UI 擷取後再對比 DB。
2. **防抖 500ms 不要用 `waitForTimeout`**：應等 `checkGameCodeAvailability` 的 response 或等狀態指示 icon 變化。固定 sleep 會讓 test 在慢機器上 flaky。
3. **`required` HTML attribute 的 validation 觸發方式**：負面 #1 的空白名稱驗證靠的是瀏覽器原生 HTML5 validation（`create-game-button.tsx:189`），不是 server-side。Playwright 的 `page.click()` 會觸發原生 tooltip 但**不會**讓 form submit，要驗證 server 沒被呼叫而不是驗證錯誤訊息文字。
4. **`router.refresh() + router.push()` 的順序副作用**：`create-game-button.tsx:124-125` 先 refresh 再 push。spec 等「建立後抵達 `/games/{id}`」時要注意中間可能短暫回到 `/games` 列表。建議用 `page.waitForURL(/\/games\/[a-f0-9]{24}$/)` 而不是 `waitForURL('/games/{id}')` 字串 equality，因為 id 是新建立的。
5. **`最大檢定值` 欄位的預設 100 是前端設的**：`create-game-button.tsx:50` 的 `randomContestMaxValue: 100` 只在前端 state；後端 `games.ts:198-200` 會檢查 `data.randomContestMaxValue && > 0` 才寫 DB，否則**不寫這個欄位**（落到 schema default）。斷言 DB 時要確認 schema default 也是 100（Game schema 應驗證）。若不確定，斷言「`>= 100 || undefined`」會更保險。
6. **EXIST1 這類負面 seed 的 gmUserId**：必須屬於**另一個** GMUser，不能是當前 `asGm()` 的 user。理由：`isGameCodeUnique` 是全域檢查，不是 per-GM，反之如果屬於同一 GM 會讓斷言語意模糊（「是因為全域唯一，還是因為同 GM 唯一？」）。

---

### Test case #3.2 — Game Code 變更與唯一性（已建立劇本）

**對應場景**：F1 / F3 / F4 / F5

#### 進入點
- 角色：GM
- URL：`/games/{gameId}`（該 game 已存在）

#### 前置 seed
- 1 GMUser
- **Game A**（`gameCode: 'ORIG01'`, `isActive: false`）— 測試目標
- **Game B**（`gameCode: 'TAKEN1'`, 屬同一 GM 或另一 GM 皆可）— 負面分支的佔用 code

#### 操作步驟

**主線（變更成功）**：
1. `asGm()` → `page.goto('/games/{gameA_id}')`
2. 等 `GameCodeSection` 渲染，看到大字體 `ORIG01`
3. 點擊編輯 icon（`game-code-section.tsx`，具體 selector 由讀該 component 時確定；推薦 `getByRole('button', { name: /編輯.*代碼/ })` 或類似 aria label）
4. 等編輯 Dialog 開啟
5. 清空輸入框，`fill('NEWCD1')`
6. 等防抖 500ms + 即時唯一性檢查回 `available`
7. 點擊「儲存」按鈕
8. 等 `updateGameCode` server action 回 200
9. 等 `revalidatePath('/games')` + `revalidatePath('/games/{gameId}')` 後 `router.refresh()` 重新 render header

**負面（新 code 已被佔用）**：
1. 同主線前 4 步
2. `fill('TAKEN1')` — Game B 已佔用的 code
3. 等防抖 500ms + 即時檢查
4. 驗證狀態指示器變 ✗ + 錯誤文字「此代碼已被其他劇本使用」
5. 儲存按鈕 disabled
6. 點擊按鈕 → server action 未被呼叫

**不變性驗證**：
1. Dialog 打開但**不改動**值（仍為 `ORIG01`），點「儲存」或「取消」
2. 斷言 DB `gameCode` 仍為 `ORIG01`、`updatedAt` 若只改這個欄位則 optional 更新

#### 非同步等待點
- 編輯 Dialog 開啟動畫
- 即時唯一性檢查防抖 500ms
- `updateGameCode` server action 回 200
- `router.refresh()` 後 header 重新 render（`GameCodeSection` 顯示新值）

#### 斷言

**UI 層**：
- Header 的 `GameCodeSection` 顯示新值 `NEWCD1`（主線）
- 列表頁 `/games` 回去檢查同一 game 的卡片也顯示新 code（驗證 `revalidatePath('/games')` 生效）

**DB 層**：
- `Game.findById(gameA_id).gameCode === 'NEWCD1'`（主線）
- 主線後 Game B 的 `gameCode` 仍為 `TAKEN1`（不受影響）
- 負面分支後 Game A 的 `gameCode` 仍為 `ORIG01`（未被改寫）

#### 反向驗證
- **跨 GM 存取**：`asGm({ gmUserId: 'otherGm' })` 存取 Game A 的編輯頁 → `getGameById` 回 `UNAUTHORIZED` 或 `NOT_FOUND`，redirect 至 login 或 404 頁
- **直接呼叫 `updateGameCode`**：`page.evaluate` 傳 `otherGm` 的 session → 應回權限錯誤（`games.ts:524-604` 的 `updateGameCode` 必須讀 `getCurrentGMUserId`）

#### 已知陷阱
1. **`revalidatePath` 在 header 層的行為**：Header 的 `GameCodeSection` 是 server component 渲染值，`router.refresh()` 後會重新取得 props。spec 不能只等 `updateGameCode` response 就斷言 header，要等 refresh 完成。建議等 `page.waitForFunction(() => document.querySelector('...').textContent === 'NEWCD1')`。
2. **Dialog teardown 的 dirty state**：如果 Dialog 有變更但關閉，下次打開應重置為當前 DB 值，不應保留上次輸入。spec 應加一個 `#3.2.extra` — 打開 → 改值 → 取消 → 再打開 → 驗證重置。若這個假設不成立，回報為 bug。
3. **`isValidGameCodeFormat` 是 client 函式**：即時檢查走 client-side format regex 先過濾，再發 server 請求。spec 的「格式錯誤」變體由 unit test 覆蓋（按先前決定 A7 格式錯誤不測 E2E）。
4. **併發 race**：若兩個 GM 同時改同一個 code 到相同目標值，後者會撞到 DB 唯一 index。smoke 不需測此邊界，但 Phase 3 後期的 stress 測可加。

---

### Test case #3.3 — 劇本資訊編輯（名稱 / 描述 / 世界觀 blocks / 隨機檢定值）

**對應場景**：B1 / B2 / B3 + C1-C4 + E1

#### 進入點
- 角色：GM
- URL：`/games/{gameId}`（Game 已存在）

#### 前置 seed
- 1 GMUser
- 1 Game（`name: '舊名稱'`, `description: ''`, `publicInfo: { blocks: [] }`, `randomContestMaxValue: 100`, `isActive: false`）

#### 操作步驟

**子流程 A — 名稱必填 + scrollIntoView 提示**：
1. `asGm()` → `page.goto('/games/{gameId}')`
2. 預設在「劇本資訊」Tab（`GameEditTabs` 初始 activeTab = 'info'）
3. 定位名稱欄位，清空（`fill('')`）
4. 點 footer 的「儲存變更」按鈕
5. 驗證：
   - 名稱欄位出現紅色 error ring（`GM_ERROR_RING_CLASS`，`game-edit-form.tsx:147`）
   - 顯示 error text「此欄位為必填，請輸入劇本名稱」(`game-edit-form.tsx:150`)
   - `updateGame` server action **未被呼叫**（前端 early return，`game-edit-form.tsx:80-86`）
   - 瀏覽器捲動到名稱欄位（`scrollIntoView` 行為；可斷言 `nameFieldRef` 元素在 viewport 內）
6. 再次輸入有效名稱 → error state 自動消失（`showNameError` 被 reset，`game-edit-form.tsx:143`）

**子流程 B — 名稱與 randomContestMaxValue 編輯**：
1. `fill('新劇本名稱')` 到名稱欄位
2. `fill('150')` 到 `最大檢定值` number input
3. 驗證 `儲存變更` 按鈕從 disabled 變 enabled（`isDirty === true`，`game-edit-form.tsx:254`）
4. 點儲存
5. 等 `updateGame` 回 200
6. 等 `toast.success('劇本更新成功！')`（`game-edit-form.tsx:104`）
7. 等 `router.refresh()`

**子流程 C — 世界觀 blocks CRUD（C1-C4，不含 C5 拖曳）**：
1. 在「劇本資訊」Tab 的右側找到「世界觀公開資訊」section（`game-edit-form.tsx:232-244`）
2. 點擊新增區塊按鈕（`BackgroundBlockEditor` 內，確切 selector 需讀該 component）
3. 新增一個 `type: 'title'` 區塊，`fill` content `'第一章：開場'`
4. 再新增一個 `type: 'body'` 區塊，`fill` content `'故事從這裡開始...'`
5. 點儲存變更
6. 等 toast + refresh
7. 重新進入編輯頁，驗證兩個 block 都在
8. hover 第一個 block → 刪除按鈕顯示 → 點刪除 → 確認（若有 confirm dialog）
9. 點儲存
10. 重新進入，驗證只剩第二個 block

#### 非同步等待點
- `updateGame` server action 回 200
- `toast.success` 可見
- `resetDirty()` 觸發 → 儲存按鈕變回 disabled（`game-edit-form.tsx:106`）
- `router.refresh()` 後 form 重新載入最新 `initialData`（`game-edit-form.tsx:58-61` 的 `prevInitialData !== initialData` 分支會重設 `formData`）

#### 斷言

**UI 層**：
- 子流程 A：error ring + error text 顯示，名稱欄位在 viewport 內
- 子流程 B：toast「劇本更新成功！」出現
- 子流程 B：header 的標題 `<h1>` 從「舊名稱」變成「新劇本名稱」（`[gameId]/page.tsx:63`）
- 子流程 C：世界觀 section 顯示對應 block 內容
- 所有子流程：儲存後按鈕回到 disabled（`!isDirty`）

**DB 層**：
- 子流程 B：`Game.findById({ id }).name === '新劇本名稱'` + `randomContestMaxValue === 150`
- 子流程 C：`Game.findById({ id }).publicInfo.blocks` 的長度、type、content 符合每個步驟
- `updatedAt` 每次儲存都更新

#### 反向驗證
- **`randomContestMaxValue <= 0`**：嘗試 `fill('0')` 然後儲存 → server 回 `VALIDATION_ERROR` + `隨機對抗檢定上限值必須大於 0`（`games.ts:294-301`）
- **跨 GM 編輯**：`asGm({ otherGm })` 存取同一 gameId → `updateGame` 回 `NOT_FOUND`（`games.ts:311-316`，因 query 條件包含 gmUserId）
- **未儲存直接關頁**：這個屬於 I2 的橫切驗證，放到 #3.3.I2 子 case（見下方）

**橫切 I2 未儲存保護**（在 #3.3 執行）：
1. 編輯名稱（dirty state 生效）
2. 點「預設事件」Tab
3. 驗證 `window.confirm('您有未儲存的變更，確定要離開嗎？')` 彈出（`game-edit-tabs.tsx:34`）
4. Playwright 攔截 `dialog` event，`dialog.dismiss()` 驗證停留在當前 tab
5. 再觸發一次，`dialog.accept()` 驗證切到新 tab，dirty state 丟棄

#### 已知陷阱
1. **`useFormGuard` 的 dirty 判斷靠 deep equal**：改了一個字元再改回去，`isDirty` 會回到 `false`。spec 要驗證這個行為，否則 dirty state 的 UI 反映可能有 race（input 變更 → state 更新 → `useEffect` → `onDirtyChange`）。
2. **`initialData` 的 useMemo 依賴是 `game` 物件**：server action 成功後 `router.refresh()` 會重新傳入 `game` prop，觸發 `useMemo` 重算 `initialData`，再觸發 `prevInitialData !== initialData` 分支重設 `formData`。spec 驗證「儲存後 dirty 清空」靠這個機制。
3. **`scrollIntoView` 在 Playwright headless 的行為**：`behavior: 'smooth'` 會造成動畫，斷言 viewport 位置前應等動畫結束。建議用 `page.waitForFunction(() => { const el = ...; const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= window.innerHeight; })`。
4. **`BackgroundBlockEditor` 使用 `@dnd-kit`**：即使不測拖曳，新增/刪除按鈕也可能跟 DnDContext 有交互（例如 sortable sensor 攔截 pointer event）。spec 若點擊失效，先確認是否需要先 `keyboard` escape sensor。
5. **`最大檢定值` 的 `parseInt` fallback 到 100**：`game-edit-form.tsx:163` 有 `|| 100`，代表輸入非數字時會 fallback。spec 若要測 negative input，應驗證 `Math.max(1, ...)` 的 clamp 行為而不是原值。

---

### Test case #3.4 — 預設事件 CRUD（只測 broadcast 動作類型）

**對應場景**：D1 / D2 / D3+D5（合併）/ D9 / D10 / D11

#### 進入點
- 角色：GM
- URL：`/games/{gameId}`（Game 已存在，`presetEvents: []`）

#### 前置 seed
- 1 GMUser
- 1 Game（`presetEvents: []`, `isActive: false`）
- **不**需 seed character（broadcast 動作不需指定角色目標，或目標是「所有玩家」）

#### 操作步驟

**子流程 A — 建立第一個預設事件（D1 / D2 / D3+D5 / D9）**：
1. `asGm()` → `page.goto('/games/{gameId}')`
2. 點擊「預設事件」Tab（`game-edit-tabs.tsx:61`，`value="events"`）
3. 若 form 有 dirty state，會觸發 I2 confirm — 假設這裡無 dirty（前置沒編輯）
4. 等 `PresetEventsEditForm` 渲染，看到 empty state + 「新增事件」虛線框按鈕
5. 點「新增事件」→ 預設事件編輯 Dialog 開啟（Master-Detail 佈局）
6. `fill` 事件名稱：`'開場廣播'`
7. `fill` 事件描述：`'遊戲開始時的提示'`
8. （可選）切換「向玩家顯示事件名稱」Eye toggle
9. 在左欄（動作列表）點「新增動作」
10. 選擇動作類型 `broadcast`
11. 右欄出現 broadcast 動作編輯器，填：
    - 目標：「所有玩家」或 game-level 廣播（具體 UI 待讀 `preset-event-action-editor.tsx`）
    - 標題：`'遊戲開始'`
    - 訊息：`'歡迎進入劇本！'`
12. 點「儲存」按鈕 → Dialog 關閉
13. 等 server action（可能是 `updateGame` with presetEvents patch，或專屬的 `updatePresetEvent`）回 200
14. 等 toast 或 UI 更新顯示新卡片
15. 驗證「預設事件」Tab grid 中出現一張名為「開場廣播」的卡片

**子流程 B — 編輯既有預設事件（D10）**：
1. 承子流程 A 的 state，點擊剛建立的「開場廣播」卡片的編輯按鈕
2. 等 Dialog 開啟，欄位預填為原值
3. 修改事件名稱為 `'開場廣播 v2'`
4. 點儲存
5. 等 Dialog 關閉 + UI 更新 + 卡片文字變更

**子流程 C — 刪除預設事件（D11）**：
1. 承子流程 B 的 state
2. 點擊卡片的刪除按鈕
3. 等確認 dialog（若有）
4. 確認刪除
5. 等 server action 回 200
6. 驗證卡片從 grid 消失、grid 回到 empty state + 「新增事件」按鈕

#### 非同步等待點
- Tab 切換（無網路，純 client）
- 「新增事件」Dialog 開啟動畫
- 儲存 Dialog 時 server action 回 200
- `router.refresh()` + Tab 內容重新渲染

#### 斷言

**UI 層**：
- 子流程 A：grid 出現「開場廣播」卡片，顯示動作 badges（如 `[broadcast]`）、狀態 icon
- 子流程 B：卡片文字變為「開場廣播 v2」
- 子流程 C：grid 回到 empty state

**DB 層**：
- 子流程 A 後：`Game.findById({ id }).presetEvents` 陣列長度為 1，`[0].name === '開場廣播'`，`[0].actions` 含一個 `{ type: 'broadcast', title: '遊戲開始', message: '歡迎進入劇本！' }`
- 子流程 B 後：`presetEvents[0].name === '開場廣播 v2'`
- 子流程 C 後：`presetEvents.length === 0`

#### 反向驗證
- **`isActive === true` 時的 Runtime 層分流**：seed Game 為 `isActive: true`，嘗試同樣流程 → 新增的事件應寫入 `GameRuntime.presetEvents`（Runtime 層）而非 `Game.presetEvents`（Baseline 層）。**此變體不屬 #3.4 smoke 範圍**（屬 Flow #9 預設事件 runtime 執行的前置），但若要驗證 Baseline/Runtime 分流，此 case 是最低成本的點。**建議：暫不加入 #3.4，留給 Flow #9 決定**。
- **跨 GM 編輯**：`asGm({ otherGm })` 存取 → 取不到 game → redirect

#### 已知陷阱
1. **`isRuntime` prop 影響編輯流向**：`game-edit-tabs.tsx:84` 的 `PresetEventsEditForm` 收 `isRuntime={game.isActive}`，這個 flag 決定 CRUD 寫到 Baseline 還是 Runtime。#3.4 前置必須 `isActive: false`，否則資料會寫錯地方。
2. **`preset-events.ts` 有 Baseline 與 Runtime 兩套 action**：`createPresetEvent` / `updatePresetEvent` / `deletePresetEvent`（Baseline）vs `createRuntimePresetEvent` / `updateRuntimePresetEvent` / `deleteRuntimePresetEvent`（Runtime）。spec 斷言 server action 時要等對的那一個。
3. **Dialog 的 Master-Detail 佈局**：左欄是動作列表、右欄是動作編輯器。切換動作會重置右欄表單。spec 若連續編輯多個動作要注意狀態 reset。
4. **broadcast 目標的語意**：broadcast 預設事件的 `target` 是「全 game」還是「特定角色」需讀 `preset-event-action-editor.tsx` 確認。若是 game-level，對應 `emitGameBroadcast` 與 PendingEvent（見 Flow #8）；若是 character-level，對應 `role.message`。**這個事實會影響 Flow #9 執行斷言**，但 #3.4 只驗證 CRUD 持久化，不觸發執行，所以影響較小。
5. **stat_change / reveal_secret / reveal_task / auto-reveal 已明確排除**：#3.4 spec **不要**誤加這些動作類型的 test case。`preset-event-action-editor.tsx` 下拉選單會出現全部類型，spec 要明確**只選 broadcast**，避免 copy-paste 其他類型的 test 污染 Flow #3 範圍。

---

### Test case #3.5 — 遊戲生命週期 start/end + 狀態敏感限制

**對應場景**：G1-G6 + J1 / J2 / J3

#### 進入點
- 角色：GM
- URL：`/games/{gameId}`（Game 已存在，`isActive: false`）

#### 前置 seed
- 1 GMUser
- 1 Game（`isActive: false`，已帶有 1 個 Character、1 個 broadcast 預設事件、世界觀 2 個 blocks）
  - 為什麼要預先塞內容：`startGame()` 會建立 Runtime 快照（`GameRuntime` doc），spec 要驗證快照**真的有資料**，不是空的
- 1 Character（屬這個 Game，含基本欄位，不需 PIN）

#### 操作步驟

**子流程 A — 開始遊戲（G1-G3 + J 的負面預備）**：
1. `asGm()` → `page.goto('/games/{gameId}')`
2. 等 Header 渲染，看到「開始遊戲」按鈕（`GameLifecycleControls`，`isActive: false` 分支，`game-lifecycle-controls.tsx:95-104`）
3. 點擊「開始遊戲」→ 確認 Dialog 開啟
4. 驗證 Dialog 顯示：
   - 標題「開始遊戲」
   - PlayCircle 圖示（success color）
   - 警告清單 3 條：「玩家可以進行遊戲操作」/「遊戲期間無法上傳物品及技能圖片」/「除圖片外，遊戲期間的修改不會同步回 Baseline」（`game-lifecycle-controls.tsx:122-126`）
5. 點「確認開始」按鈕
6. 等 `startGameAction` server action 回 200
7. 等 `toast.success('遊戲已成功開始！')`（`game-lifecycle-controls.tsx:52`）
8. 等 `router.refresh()` 後 Header 重新渲染
9. 驗證 Header 的按鈕變為「結束遊戲」（destructive variant），狀態 Badge 變為「進行中」

**子流程 B — 驗證 isActive=true 的橫切副作用（J1 + J2 + J3）**：
1. 承子流程 A 後的 state（`isActive: true`）
2. **J1 驗證**：
   - `GameEditTabs` 新增「控制台」Tab 且預設選中（`game-edit-tabs.tsx:29, 57-58`）
   - `EnvironmentBanner` 顯示 Runtime 模式
3. **J2 驗證**：
   - 切到「預設事件」Tab
   - `PresetEventsEditForm` 收到 `isRuntime={true}`，新增事件時寫 Runtime 層而非 Baseline
   - 這一步只驗證 UI hint（例如「僅本場次」標記 tooltip 或文案）存在，**不實際執行**（runtime CRUD 留 Flow #9）
4. **J3 驗證**：
   - 切到「角色列表」Tab
   - 「新增角色」按鈕應 disabled 或替換為提示文字「遊戲進行中無法新增角色」
   - 現有角色卡的刪除按鈕應隱藏
   - （只驗證 UI，server 層的 `GAME_ACTIVE` 拒絕留 Flow #4 反向驗證）

**子流程 C — 結束遊戲（G4-G6）**：
1. 承子流程 A 後的 state（`isActive: true`）
2. 點擊「結束遊戲」按鈕 → 結束 Dialog 開啟
3. 驗證 Dialog 顯示：
   - 標題「確定要結束遊戲？」
   - AlertTriangle 圖示（destructive color）
   - 警告清單 3 條：「Runtime 資料將被封存為快照」/「玩家將無法繼續使用物品和技能」/「系統將切回 Baseline 設定模式」（`game-lifecycle-controls.tsx:183-187`）
   - 「快照名稱（選填）」input，placeholder「自動命名：遊戲結束快照」
4. `fill` 快照名稱 `'E2E 測試快照'`
5. 點「結束遊戲」按鈕
6. 等 `endGameAction('{gameId}', 'E2E 測試快照')` server action 回 200
7. 等 `toast.success('遊戲已成功結束！快照已保存')`（`game-lifecycle-controls.tsx:77`）
8. 等 refresh 後 Header 變回「開始遊戲」按鈕，狀態 Badge 變「待機中」

#### 非同步等待點
- Dialog 開關動畫
- `startGameAction` server action（會呼叫底層 `startGame()` 建 Runtime，DB 操作稍長，預留 3 秒）
- `startGameAction` 會 emit WebSocket event 給玩家頻道（stub pusher 會接收到 trigger 呼叫）
- `revalidatePath('/games/{gameId}')` + `revalidatePath('/games')`（`game-lifecycle.ts:39-40`）
- `router.refresh()` 後 header 重繪
- 同理 `endGameAction`，會刪 Runtime 並可能存 snapshot

#### 斷言

**UI 層**：
- 子流程 A 後：Header Badge = 「進行中」、按鈕 = 「結束遊戲」、EnvironmentBanner 為 Runtime 模式、`GameEditTabs` 新增「控制台」Tab
- 子流程 B 驗證 J1/J2/J3 的 UI 狀態
- 子流程 C 後：Header Badge = 「待機中」、按鈕 = 「開始遊戲」、控制台 Tab 消失

**DB 層**：
- 子流程 A 後：
  - `Game.findById(id).isActive === true`
  - `GameRuntime.findOne({ refId: gameId, type: 'runtime' })` 存在，其內 `presetEvents` 複製自 Baseline（broadcast 事件存在），`publicInfo.blocks` 複製自 Baseline
  - `CharacterRuntime.findOne({ gameId, type: 'runtime' })` 存在（對應那 1 個 character）
- 子流程 C 後：
  - `Game.findById(id).isActive === false`
  - `GameRuntime.findOne({ refId: gameId, type: 'runtime' })` **不存在**（或被移到 snapshot 型別）
  - `CharacterRuntime` 同上
  - 若 snapshot 功能啟用：`GameRuntime.findOne({ refId: gameId, type: 'snapshot', name: 'E2E 測試快照' })` 存在

**WebSocket 層**（stub pusher trigger 呼叫記錄）：
- 子流程 A：stub 的 `trigger` history 含一筆 game-level event（例如 `game.started` 或 `game.isActive.changed`，具體 channel/event 名需讀 `startGame()` 實作）
- 子流程 C：同上，對應 end 的 event

**WebSocket 層不驗證玩家端收到**：Flow #3 沒有 player context，只驗證 server 有 emit。收到端的驗證留給 Flow #5/#6/#8。

#### 反向驗證
- **直接對 `isActive: true` 的 game 再呼叫 `startGameAction`**：應回錯誤（已開始）— 具體錯誤碼需讀 `startGame()` 實作，可能是 `ALREADY_ACTIVE` 或類似
- **跨 GM 開始遊戲**：`asGm({ otherGm })` 呼叫 → 回 `UNAUTHORIZED` 或 `NOT_FOUND`
- **endGameAction 對 `isActive: false` 的 game**：應回錯誤（未開始）

#### 已知陷阱
1. **`startGame()` 的原子性**：若建立 Runtime 中途失敗（例如 DB 一致性），`Game.isActive` 與 `GameRuntime` 可能不同步。smoke 不測此邊界，但斷言 DB 時要同時查兩個 collection 才算完整驗證。
2. **`EnvironmentBanner` 的 `isActive` prop 來自 page server component**：它與 `GameLifecycleControls` 的 state 不同步管理，都靠 `router.refresh()` 觸發重新渲染。spec 等狀態翻轉時要等**兩個地方都更新**。
3. **「控制台」Tab 的預設選中邏輯**：`game-edit-tabs.tsx:29` 的 `useState(hasConsole ? 'console' : 'info')` 只在 mount 時執行一次。從 `isActive: false → true` 的轉換是透過 `router.refresh()` 重新 mount 整個 page 與 `GameEditTabs` component，所以這行會重新執行並選中 console。若未來改為 preserveState，此斷言會失效。
4. **snapshot 名稱的 trim 行為**：`game-lifecycle-controls.tsx:73` 的 `snapshotName.trim() || undefined`。spec 若要測「空白快照名」應 fill `'   '` 而非 `''`（空字串會導致 placeholder 顯示但 state 為空）。
5. **WebSocket event 的 channel 格式**：game-level event 通常走 `private-game-{gameId}` 或 `presence-game-{gameId}`。smoke 斷言 stub trigger 時要用 `filter: { channel: new RegExp('^.*game.*' + gameId) }`，避免誤抓到其他 flow 留下的 event。
6. **`toast.success` 的 sonner timeout**：sonner toast 預設 4 秒自動消失。spec 若在 toast 出現後立刻做下一個操作，要用 `getByRole('status')` 而非依賴固定 selector。
7. **開始/結束 Dialog 的 Portal 渲染**：shadcn Dialog 用 Portal 渲染到 body 末端，`page.getByRole('dialog')` 可以抓到，但若有多個 Dialog 同時存在（例如 Edit Tab 的 confirm + Lifecycle Dialog），要用更具體的 selector。

---

### Test case #3.6 — 劇本連鎖刪除

**對應場景**：H4 / H5

#### 進入點
- 角色：GM
- URL：`/games/{gameId}`（Game 已存在，帶子資料）

#### 前置 seed
- 1 GMUser（target，屬當前 `asGm()`）
- 1 GMUser（other，另一位，seed 用於驗證**不會**連鎖刪除到別人的資料）
- **Target GM 的 Game A**（目標）：
  - 含 2 個 Character（A1, A2）
  - 含 1 筆 Log（`writeLog` 寫入 game level 紀錄）
  - 含 1 筆 PendingEvent（`targetGameId: gameA.id`）
  - 若 `isActive: true`：含 GameRuntime + CharacterRuntime（驗證 Runtime 也會被刪）
    - 但為了降低 setup 複雜度，建議 `isActive: false` + **手動**預先寫一筆 GameRuntime / CharacterRuntime 模擬殘留 runtime 資料
- **Other GM 的 Game B**（隔離對照）：
  - 含 1 個 Character（B1）
  - 含 1 筆 Log
  - 含 1 筆 PendingEvent（`targetCharacterId: b1.id`）
  - 刪除 Game A 後，Game B 的所有資料必須**完整保留**

#### 操作步驟
1. `asGm({ target })` → `page.goto('/games/{gameA_id}')`
2. Header 的「操作按鈕群」中找到「刪除劇本」按鈕（`GameHeaderActions` → `DeleteGameButton`）
3. 點「刪除劇本」→ 確認 Dialog 開啟
4. 驗證 Dialog 顯示警告訊息（含「刪除後所有角色卡資料將被刪除」或類似，需讀 `delete-game-button.tsx` 確認文案）
5. 點確認
6. 等 `deleteGame` server action 回 200
7. 等 redirect 至 `/games`（成功後通常會 navigate 回列表，需讀 `delete-game-button.tsx` 確認）
8. 等 `revalidatePath('/games')`（`games.ts:417`）後列表頁載入

#### 非同步等待點
- Dialog 開啟動畫
- `deleteGame` server action：`Promise.all([Character.deleteMany, CharacterRuntime.deleteMany, GameRuntime.deleteMany, Log.deleteMany, PendingEvent.deleteMany × 2])` + `Game.deleteOne` + `deleteImagesFromBlob`（`games.ts:401-415`）— 可能耗時 500ms-1s
- Blob 刪除是 fire-and-forget（graceful degradation，失敗不影響刪除結果，`games.ts:414`），spec 不需等
- redirect + `/games` 頁載入

#### 斷言

**UI 層**：
- 刪除後 URL 為 `/games`
- 列表不再顯示 Game A 的卡片
- 列表仍顯示 Other GM 的 Game B 嗎？**不會**，因為 `/games` 只列當前 GM 的 games（`getGames` filter by gmUserId）。這一項要透過直接 DB query 驗證

**DB 層**（核心斷言，驗證連鎖刪除完整性）：

Target GM 側（應全部刪除）：
- `Game.findById(gameA_id)` → `null`
- `Character.find({ gameId: gameA_id })` → `[]`
- `CharacterRuntime.find({ gameId: gameA_id })` → `[]`
- `GameRuntime.findOne({ refId: gameA_id })` → `null`
- `Log.find({ gameId: gameA_id })` → `[]`
- `PendingEvent.find({ targetGameId: gameA_id })` → `[]`
- `PendingEvent.find({ targetCharacterId: { $in: [a1.id, a2.id] } })` → `[]`

Other GM 側（應完整保留）：
- `Game.findById(gameB_id)` → 存在
- `Character.findById(b1.id)` → 存在
- `Log.findOne({ gameId: gameB_id })` → 存在
- `PendingEvent.findOne({ targetCharacterId: b1.id })` → 存在

**Blob 清理不做斷言**：E2E 環境無 Blob token，`deleteImagesFromBlob` 會 no-op 或 graceful fail。coverage 由 unit test 覆蓋 `collectCharacterImageUrls` + `deleteImagesFromBlob` 本身。

#### 反向驗證
- **跨 GM 刪除**：`asGm({ other })` 呼叫 `deleteGame(gameA_id)` → 回 `NOT_FOUND`（`games.ts:380-386`，filter 包含 gmUserId）
- **無效 gameId**：`deleteGame('invalid-hex')` → 回 `VALIDATION_ERROR` + `無效的劇本 ID`（`games.ts:372-374`）
- **刪除不存在的 game**：`deleteGame('ffffffffffffffffffffffff')` → 回 `NOT_FOUND`

#### 已知陷阱
1. **`Promise.all` 的部分失敗風險**：若其中一個 `deleteMany` 失敗（例如 DB 連線抖動），其他已完成的刪除**不會回滾**，會留下 orphan。spec 不測此邊界，但若發生斷言失敗，根因可能是 partial delete。
2. **PendingEvent 的雙查詢**：`games.ts:406-409` 有 `PendingEvent.deleteMany({ targetGameId })` + 條件式 `PendingEvent.deleteMany({ targetCharacterId: { $in } })`。若 spec seed 時只建 targetGameId 的 pending event，第二次 deleteMany 的 filter 是空陣列 → code path 的 `characterIdStrings.length > 0` 分支被跳過 → 實際不會執行。這是**刻意的**，但斷言時要小心：必須同時 seed 兩種 pending event 才能驗證兩個 deleteMany 都生效。
3. **Redirect 後的 `force-dynamic` re-fetch**：刪除後 redirect 到 `/games`，該頁 `dynamic = 'force-dynamic'`，會重新 `getGames()`。如果 redirect 發生在 cache 失效之前，列表可能還短暫顯示被刪 game。spec 用 `waitForFunction` 等「列表 length === 1」而非 `waitForURL`。
4. **`delete-game-button.tsx` 的 Dialog 文案可能依需求變化**：不要硬編碼「刪除後所有角色卡資料將被刪除」這類長文案，用 `getByRole('heading', { name: /刪除/ })` 或 data-testid 更穩。
5. **Character 的 `imageUrl` / `items[].imageUrl` / `skills[].imageUrl` 都算在 `collectCharacterImageUrls` 內**：這是 Blob 清理的範圍，但不影響 DB 層斷言。若未來 Character 增加新的 image 欄位，`collectCharacterImageUrls` 需同步更新，否則會留 orphan image；但這屬於 `character-cleanup.ts` 的單元測試範圍，不是 E2E 範圍。

---

### Flow #3 跨 case 已知陷阱（橫切）

1. **每個 test case 的 DB reset 必須徹底**：由於 6 個 case 共用同一 webServer，DB 殘留會污染。`db-fixture.beforeEach` 呼叫 `/api/test/reset` 必須清 **Game / Character / CharacterRuntime / GameRuntime / Log / PendingEvent / GMUser** 全部 collection，不能只清 Game（否則 #3.6 的 other GM 資料會洩漏到其他 case）。

2. **`asGm()` 的 cookie scope 跨 test case 不重用**：Playwright 的 `test.beforeEach` 配合 `context` 重建會清空 cookies，新 `asGm()` 會 seed 新 GMUser + 寫新 cookie。spec 不要手動在 beforeAll 共用 context，會讓「誰的 gmUserId」混淆。

3. **Sonner toast 的堆疊**：連續測試中 toast 可能還沒消失就堆疊下一個。斷言 toast 時用 `filter: { hasText: '...' }` 而非 `locator('[role="status"]')` nth(0)。

4. **`next/cache` revalidate 的跨 test 污染**：`revalidatePath` 標記的失效會在 memory 中累積。若 webServer 是單一 long-running process，前一個 test 的 revalidate 會影響下一個 test 的首次載入。建議 `db-fixture` 額外呼叫一個 `/api/test/cache-reset` endpoint（若實作）或直接 `page.goto(..., { waitUntil: 'networkidle' })` 確保載入完成。

5. **`router.refresh()` 的 React 行為**：`router.refresh()` 會重新 fetch server component 但**不會** unmount client component。這代表 `useState` 值會保留。spec 若要斷言「儲存後 form 重置」必須驗證 `initialData` memo 重算觸發了 `formData` 重設（見 #3.3 陷阱 2），不能假設 form 自動清空。

6. **`GameEditTabs` 的 I2 未儲存保護會攔截 test case 切換**：若 test case 留下 dirty state 而沒儲存/取消就結束，下次開啟同 page 時 form 會顯示舊 dirty 值。每個 test case 結尾前應確保：(a) 儲存完成，或 (b) 明確 `page.close()` 讓 context 丟棄狀態。

7. **`EnvironmentBanner` 在 Runtime 模式的高度會推擠 `GameEditTabs` 的 sticky footer**：`game-edit-tabs.tsx:41-42` 的 offset 計算 `~310px` 包含 banner。若 spec 斷言 sticky 按鈕位置要注意 Runtime/Baseline 模式的差異。

### Flow #3 對 fixture 的需求（給 Fixture 反推結論小節累積）

以下需求將在所有 flow 重寫完後統一整併到 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 末的 Fixture 反推結論 section：

- **`seed-fixture.gmUser({ email?, displayName? })`**：支援多 GM seed（#3.2 負面、#3.6 隔離對照）
- **`seed-fixture.game({ gmUserId, name?, gameCode?, isActive?, publicInfo?, presetEvents?, randomContestMaxValue? })`**：可指定所有 GM 可編輯欄位的 override
- **`seed-fixture.character({ gameId, name?, hasPinLock? })`**：#3.5 / #3.6 需要
- **`seed-fixture.log({ gameId, characterId?, actorType, action, details })`**：#3.6 驗證 Log 連鎖刪除
- **`seed-fixture.pendingEvent({ targetGameId?, targetCharacterId?, title, message })`**：#3.6 驗證 PendingEvent 連鎖刪除
- **`seed-fixture.gameRuntime({ refId, snapshot })`** + **`seed-fixture.characterRuntime({ gameId, refId, snapshot })`**：#3.6 驗證 Runtime collection 連鎖刪除（`isActive: false` 的情境下手動注入殘留）
- **`db-fixture.reset`** 必須清 7 個 collection：Game / Character / CharacterRuntime / GameRuntime / Log / PendingEvent / GMUser
- **`/api/test/db-query?collection=xxx&filter=yyy`** 需支援這 7 個 collection 的讀取
- **`wait-for-toast`** helper（#3.3, #3.5, #3.6 大量使用）
- **`wait-for-dialog-open` / `wait-for-dialog-close`** helper（shadcn Dialog 有動畫）
- **`handle-confirm-dialog`** helper（`window.confirm` 攔截，`game-edit-tabs.tsx:34` 的未儲存保護）
- **`expect-game-in-db`** / **`expect-no-game-in-db`** 斷言 helper
