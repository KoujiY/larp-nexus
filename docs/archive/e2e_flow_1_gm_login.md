# E2E Flow #1 — GM test-login → 劇本列表（smoke 層）

> 本檔案從 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 拆出。原文件整併多個 flow 過於龐大，Flow #1 以獨立檔案管理，與 Flow #3 相同拆分策略。
> 共用規格（db-fixture、auth-fixture、stub pusher client、WebSocket 斷言慣例等）仍以 `../archive/e2e-flows-plan.md` 的「共同規格」section 為準，本檔只描述 Flow #1 範圍內的 test case 細節。
>
> **上游文件**：[../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md)
> **對應 spec 檔**：`e2e/smoke/gm-can-login.spec.ts`（單一 spec 檔內含 3 個 test case）

---

## Flow #1 — GM test-login → 劇本列表（smoke 層）

**對應 spec 檔**：`e2e/smoke/gm-can-login.spec.ts`（單一 spec 檔內含 3 個 test case）

### 設計背景（為什麼用 test-login 而非真實 magic link）

`NEXT_DEVELOPMENT_PLAN.md:596, :671` 明確定調：

> Magic link / SMTP **不測**。Magic link 是登入入口非核心玩法；業務邏輯由 unit test 覆蓋，E2E 透過 test-only login bypass 直接進主畫面。避免為此引入 SMTP catcher 基礎設施。

所以 Flow #1 **刻意**繞過 `/auth/login` + `sendMagicLink` + 信箱輪詢那條真實路徑，直接走 `POST /api/test/login` 開 GM session。magic link 的 token 生成 / 過期 / 驗證由 unit test 覆蓋，E2E 不重複測。

**這與 Flow #2 的決策相反**：Flow #2 走真實 PIN 流程，因為 PIN 是玩家端核心互動入口、無基礎設施成本。兩條 flows 的「真實 vs 繞過」是獨立決策，不是統一原則。

### Flow #1 範圍定義（smoke 層）

Smoke 層的職責是「fixture 穩定 + 入口可達 + 授權隔離正確」，**不做 UI surface 覆蓋**。具體來說：

- **測**：test-login 可寫 session → `/games` 可達 → 空/非空 render 分支 → 卡片基本定位（用 `game.name`）→ 點擊導航 → 跨 GM 隔離
- **不測**：卡片上的 gameCode / description / 狀態 badge / 建立日期 / character count 欄位（屬 Flow #4 與列表類 flow）、封面圖、hover 動畫、sidebar 其他項目、theme toggle、logout flow、RWD 行為、skeleton 載入幀、快取 revalidate

### 3 個 test case 的獨立性設計

Flow #1 分為 3 個 test case，每個都以**空 DB 起點**獨立 seed：

1. **獨立 rerun**：CI 若只有 #1.3 flaky 可單獨重跑
2. **錯誤隔離**：#1.1 失敗不會拖紅 #1.2/#1.3
3. **前置最小化**：#1.1 只需 1 GMUser + 0 Game、#1.2 只需 1 GMUser + 2 Game、#1.3 只需 2 GMUser + 2 Game。無任何 case 需要 seed Character（character 相關的聚合驗證延後至 Flow #4+）

### Flow #1 共用規格

#### 共用 URL
- `/games` — 劇本列表頁（`app/(gm)/games/page.tsx`）
- `/auth/login` — 登入頁（未登入時 `/games` redirect 的目標）
- `/api/test/login` — test-login bypass endpoint（僅 `E2E === '1'` 時啟用）

#### 共用斷言助手
Flow #1 大量重複以下模式，建議抽 helper：
- `expectRedirectedToLogin(page)` — 等 URL 變為 `/auth/login`（含或不含 query string）
- `expectSessionCookieValid(context)` — 從 browser context 讀 `larp-nexus-session` cookie，解密後驗 `isLoggedIn === true && gmUserId === expected`
- `expectGameListEmpty(page)` — 等 `尚無劇本` heading 與空狀態 CTA
- `expectGameCardByName(page, name)` — 用 `getByText(name)` 定位卡片，回 `locator`
- `expectActiveNavItem(page, label)` — 驗 sidebar 中某項為 active 狀態

#### 共用 seed builder
所有 case 僅需 `seed-fixture.gmUser` + `seed-fixture.game`，**不需** `seed-fixture.character`。這使 Flow #1 成為最小 fixture subset，後續 flow 擴充 opts。

---

### Test case #1.1 — 未登入訪問 + test-login 進入空狀態列表

**對應場景**：A4 / B1 / C1 / C2 / C3 / F1 / F2 / F8

#### 進入點
- 角色：GM（無 session）
- URL：起點為 `/games`（未登入狀態直接訪問）

#### 前置 seed
- 1 GMUser（`email: 'gm1@test'`, `displayName: 'Test GM 1'`）
- **無 Game**（空 DB 起點）
- **無 Character**

#### 操作步驟

**階段 1 — 未登入反向驗證（B1）**：
1. **不**呼叫 `asGm()`，browser context 保持空 cookie
2. `page.goto('/games')`
3. 等 redirect 至 `/auth/login`

**階段 2 — test-login fixture 成功寫 session（A4）**：
1. `asGm({ gmUserId: user1.id, email: 'gm1@test' })` → fixture 內部呼叫 `POST /api/test/login` body `{ mode: 'gm', gmUserId, email, displayName }`
2. 等 response 200 `{ ok: true, mode: 'gm' }`（`app/api/test/login/route.ts:56-63`）
3. 驗證 `larp-nexus-session` cookie 已寫入 browser context（`lib/auth/session.ts:20-28`）

**階段 3 — 抵達空狀態列表（C1/C2/C3）**：
1. `page.goto('/games')`
2. 等 page render 完成（`getByRole('heading', { name: '劇本管理' })` 可見）
3. 驗證空狀態 UI

**階段 4 — Sidebar 與 EnvironmentBanner 檢查（F1/F2/F8）**：
1. 同一 page，驗證 sidebar 存在 + `劇本管理` 項為 active
2. 驗證 `EnvironmentBanner` **不**出現於列表頁

#### 非同步等待點
- 階段 1：`page.waitForURL(/\/auth\/login/)`
- 階段 2：`page.waitForResponse(url => url.endsWith('/api/test/login') && res.status() === 200)`
- 階段 3：`page.waitForLoadState('networkidle')` + `getByRole('heading', { name: '劇本管理' })` visible
- 階段 4：無額外等待（同頁斷言）

#### 斷言

**UI 層**：
- 階段 1：URL 符合 `/\/auth\/login/`
- 階段 3：
  - H1 `劇本管理` 可見（`app/(gm)/games/page.tsx:67-76`）
  - `getByText('尚無劇本')` 可見（`gm-empty-state.tsx:40-68`）
  - `getByText('建立您的第一個劇本，編織冒險的篇章')` 可見（`app/(gm)/games/page.tsx:43-46` 的 subtitle；**若實際文案為「建立您的第一個劇本，開始編織冒險的篇章」以實際為準**）
  - `getByRole('button', { name: '建立第一個劇本' })` 可見（`create-game-button.tsx:151`）
  - 該按鈕為 `variant="empty-state"` 的 `DashedAddButton`（驗 className 含 dashed border 相關 class 或 `data-variant="empty-state"` 若有）
  - **非空狀態元素缺席**：grid (`.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3`) 不存在、`建立新劇本` card（非空變體首格）不存在
- 階段 4：
  - Sidebar 存在：`getByRole('navigation')` 或 `[data-testid="gm-sidebar"]`（若有）
  - `getByRole('link', { name: '劇本管理' })` 為 active 狀態（className 含 primary 背景 / aria-current="page"）
  - `EnvironmentBanner` 不存在：`getByText(/Runtime 模式|Baseline 模式/)` 應 `not.toBeVisible()`

**Session 層**：
- 階段 2 後：browser context 的 `larp-nexus-session` cookie 存在
- Cookie 屬性：`httpOnly: true`、`maxAge ≈ 604800`（7 天）、`sameSite: 'lax'`
- （可選）呼叫 `/api/test/session-dump` endpoint（若實作）驗 `{ isLoggedIn: true, gmUserId, email }`

**DB 層**：
- **無斷言**：test-login 不寫 DB，GMUser 由 seed 階段寫入；列表為空也不代表 DB 異常

#### 反向驗證
- **階段 1 本身就是反向驗證**（無 session → redirect）
- **額外**：手動改寫 cookie 為 `{ isLoggedIn: true, gmUserId: null }` 後 goto `/games` → 應仍被 redirect（驗 `isAuthenticated()` 同時檢查 `isLoggedIn` 與 `gmUserId`，`lib/auth/session.ts:42-45`）
- **非空 grid 的缺席**：若 seed 洩漏讓別的 game 混進這個 GM 的列表，`建立新劇本` card（非空首格）會出現，斷言會失敗。這是 DB isolation 的間接驗證

#### 已知陷阱
1. **test-login 僅於 `E2E === '1'` 啟用**：`app/api/test/login/route.ts:37-39` 在非 E2E 環境回 404。spec 執行環境必須確保 `process.env.E2E === '1'`（`playwright.config.ts` 的 `webServer.env`）。
2. **空狀態 subtitle 實際文案待確認**：舊版 Flow #1 寫「建立您的第一個劇本」，Explore 結果與 page source 顯示完整版為「建立您的第一個劇本，開始編織冒險的篇章」。spec 寫作時**讀一次 source** 取得確切文案，避免硬編碼中文字元錯誤。
3. **`EnvironmentBanner` 不在列表頁**：`app/(gm)/games/page.tsx` 沒把 `topSlot` 傳給 `PageLayout`，所以 banner 不渲染。這是刻意的（列表頁沒有 `game.isActive` 上下文）。spec 若誤以為 banner 會出現會等不到元素。
4. **redirect 行為的時機**：`app/(gm)/games/page.tsx:17-19` 是 server-side redirect（`redirect('/auth/login')`），不是 client navigation。Playwright 的 `waitForURL` 在 server redirect 後會抓到新 URL，但若用 `page.waitForNavigation()` 要指定 `waitUntil: 'commit'` 或更寬鬆的條件。
5. **iron-session cookie 的加密**：cookie value 是加密過的，spec **不能**直接 parse cookie value，應透過 fixture 的 session-dump helper 或信任「下一個 request 成功就代表 cookie 有效」。
6. **階段 1 與階段 2 之間的 context 污染**：階段 1 驗完 redirect 後，階段 2 呼叫 `asGm()` 寫 session。若 Playwright 沒清 history state，階段 2 的 `goto('/games')` 可能受到階段 1 的 redirect 快取影響。建議階段 1 結束後 `page.goto('about:blank')` 再進階段 2。或把階段 1 拆成獨立 sub-test。

---

### Test case #1.2 — 非空狀態：grid 渲染與卡片導航

**對應場景**：D1 / D3 / D4

#### 進入點
- 角色：GM（已登入）
- URL：`/games`

#### 前置 seed
- 1 GMUser
- **2 個 Game**：
  - Game 舊：`name: '第一個劇本'`，`createdAt: T - 1 day`
  - Game 新：`name: '第二個劇本'`，`createdAt: T`
  - 其他欄位可全部省略（`gameCode`/`description`/`isActive` 由 schema default 決定，本 case **不驗**這些欄位的值）
- **無 Character**（本 case 不驗 character count 聚合正確性）

#### 操作步驟
1. `asGm()` → `page.goto('/games')`
2. 等 grid 渲染完成（`getByText('第一個劇本')` 與 `getByText('第二個劇本')` 都可見）
3. **排序驗證（D4）**：抓 grid 內所有 game card 的順序（排除首格 `建立新劇本` card），驗第一張為 `第二個劇本`（較新）、第二張為 `第一個劇本`（較舊）
4. **卡片導航驗證（D3）**：點擊 `第二個劇本` 卡片
5. 等 URL 變為 `/games/{newGameId}`

#### 非同步等待點
- `getByText('第一個劇本')` 與 `getByText('第二個劇本')` 都 visible
- `page.waitForURL(/\/games\/[a-f0-9]{24}$/)` （ObjectId hex 長度 24）

#### 斷言

**UI 層**：
- **Grid 存在（D1）**：非空變體 grid 容器存在（class `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` 或 `[data-testid="games-grid"]`）
- **首格為 `建立新劇本` card**：`getByRole('button', { name: '建立新劇本' })` 或 `CreateGameButton variant="card"` 渲染為 dashed border + label
- **兩個 game card 可見**：用 `getByText('第一個劇本')` 與 `getByText('第二個劇本')` 定位
- **排序**：第一個 game card（排除首格 CTA）為 `第二個劇本`（`createdAt desc`，驗 `app/actions/games.ts:41-42` 的 `.sort({ createdAt: -1 })`）
- **導航成功**：URL 符合 `/\/games\/[a-f0-9]{24}$/`，且該 id 等於 seeded `newGameId`

**DB 層**：
- **無斷言**：本 case 不改變 DB state，只驗讀取路徑

#### 反向驗證
- **空陣列 fallback**：把 seed 的 2 個 game 改回 0 → 應走空狀態分支（屬 #1.1 已覆蓋，不重複）
- **排序反向**：交換 `createdAt` 讓 `第一個劇本` 變較新 → grid 首格（排除 CTA）應變為 `第一個劇本`，驗 sort 方向非硬編碼
- **跨 GM 混入**：另 seed 一個 `otherGm` 的 game `'混入劇本'` → 驗證該 game **不**出現於當前 GM 的 grid（屬 #1.3 主力覆蓋，本 case 可選做 smoke check）

#### 已知陷阱
1. **`createdAt` 時間差需顯著**：兩個 game 的 `createdAt` 若過於接近（< 1ms），sort 結果可能因 MongoDB 內部 tie-break 順序而 flaky。spec seed 時應明確隔開至少 1 秒，或用 explicit `_id` 排序 fallback。
2. **首格 `建立新劇本` card 會混淆 card 計數**：grid 內**首格永遠**是 `CreateGameButton variant="card"`，實際 game card 從第 2 格開始。spec 若用 `locator('.game-card').first()` 會抓到 CTA 而非 game。建議用 `getByText(gameName)` 或 data-testid 嚴格定位。
3. **點擊卡片後 redirect 的 server-side 行為**：卡片是 `NavLink href={/games/${id}}`，點擊後 Next.js 走 client navigation，但目標頁 `[gameId]/page.tsx` 有 `dynamic = 'force-dynamic'`，所以仍會完整 round-trip。spec 等 URL 變化 + 等目標頁的 heading 出現（例如 `getByRole('heading', { name: /第二個劇本/ })` 若實作顯示 game name）。
4. **本 case 不驗 `/games/{id}` 內容**：點擊後只驗 URL 到達正確 id，不驗目標頁 render 結果。目標頁的細節留給 Flow #3 全面覆蓋，避免 Flow #1 與 Flow #3 範圍重疊。
5. **grid class selector 脆弱性**：Tailwind 的 class 組合可能隨設計調整而變（例如 `xl:grid-cols-3` 改為 `lg:grid-cols-3`）。若用 class selector 會脆，建議為 grid 容器加 `data-testid="games-grid"`。這是 **source code 調整建議**，不是 spec 責任。

---

### Test case #1.3 — 跨 GM 資料隔離

**對應場景**：E1 + B2 反向驗證

#### 進入點
- 角色：GM-A（目標 GM）
- URL：`/games`

#### 前置 seed
- **GM-A**（target，`email: 'gm-a@test'`）+ `Game A`（`name: 'GM A 的劇本'`, `gmUserId: gmA.id`）
- **GM-B**（other，`email: 'gm-b@test'`）+ `Game B`（`name: 'GM B 的劇本'`, `gmUserId: gmB.id`）
- **無 Character**

#### 操作步驟

**主線 — 僅看到自己的 game（E1）**：
1. `asGm({ gmUserId: gmA.id })` → `page.goto('/games')`
2. 等 grid 渲染完成
3. 驗證 `GM A 的劇本` 可見
4. 驗證 `GM B 的劇本` **不**可見

**反向 — session cookie 缺 gmUserId（B2）**：
1. 手動寫入一個殘缺 session：`{ isLoggedIn: true, gmUserId: undefined }`（透過 `/api/test/login` 傳 `gmUserId: null` 觸發 Zod 400，或直接透過 context 寫 cookie 繞過 test-login）
2. `page.goto('/games')`
3. 驗證 redirect 至 `/auth/login`（因 `isAuthenticated()` 同時要求 `isLoggedIn && gmUserId`，`lib/auth/session.ts:42-45`）

#### 非同步等待點
- 主線：`getByText('GM A 的劇本')` visible
- 反向：`page.waitForURL(/\/auth\/login/)`

#### 斷言

**UI 層**：
- **主線**：
  - `GM A 的劇本` 文字可見
  - `GM B 的劇本` 文字**不**可見（用 `expect(page.getByText('GM B 的劇本')).not.toBeVisible()`）
  - Grid 內 game card 數量為 1（排除首格 CTA 後）
- **反向**：URL 符合 `/\/auth\/login/`

**DB 層（交叉驗證 `getGames()` filter 正確）**：
- 直接 DB query：`Game.find({ gmUserId: gmA.id })` 回 1 筆、`Game.find({ gmUserId: gmB.id })` 回 1 筆、`Game.find({})` 回 2 筆
- 這一層不是驗 E2E 路徑，而是驗 seed fixture 真的建了兩個不同 GM 的 game（避免「測 isolation 但其實兩 game 都在同一 GM 下」的假綠燈）

#### 反向驗證
- **交換角色**：改用 `asGm({ gmUserId: gmB.id })` → 應只看到 `GM B 的劇本`，看不到 `GM A 的劇本`（對稱驗證）
- **`asGm` 傳不存在的 gmUserId**：`asGm({ gmUserId: 'ffffffffffffffffffffffff' })` → `getGames()` 回 `{ success: true, data: [] }`（空陣列），頁面走空狀態分支 → 看到 `尚無劇本`。這驗證「GMUser 不存在 ≠ UNAUTHORIZED」的設計（`app/actions/games.ts:40-42` 沒檢查 GMUser 存在性，直接 filter）
- **`asGm` 傳他人 GM 的 id 但 email 亂寫**：session 以 `gmUserId` 為準，email 不影響 `getGames()` filter → 仍只看到該 gmUserId 的 game

#### 已知陷阱
1. **seed 的 2 個 game 必須屬於不同 GMUser**：若 seed 寫錯讓兩 game 都屬於 `gmA`，主線斷言「看不到 GM B」會假綠（因為根本沒有 B 的 game）。DB 層斷言（上述）就是防這個。
2. **`asGm` fixture 的參數必須透傳 gmUserId**：若 fixture 預設自動建一個 random GMUser，會覆蓋 spec 指定的 `gmA.id`。spec 寫作時確認 `asGm({ gmUserId: gmA.id })` 真的把這個 id 塞進 session，而不是 fixture 內部自建。
3. **反向路徑「session 缺 gmUserId」的構造方式**：`/api/test/login` 的 Zod schema 可能 `gmUserId: z.string()` 是必填，會在 400 階段就擋下。spec 若要真的測 session 結構缺欄位，需繞過 test-login 直接寫 cookie（需 helper），或改為測「gmUserId 指向不存在 user」+「isAuthenticated fallback 到 null gmUserId」的組合。**決策**：若直接寫 cookie 成本高，可把 B2 降級為「traffic path 反向」而非「session 結構反向」，只保留 #1.1 階段 1 的純 `/games` 無 cookie redirect 驗證即可。
4. **B2 在 smoke 層的價值邊界**：嚴格說這個反向驗證是 `lib/auth/session.ts:42-45` 的 unit test 責任（`isAuthenticated()` 函式）。若構造成本太高，可把 B2 從 #1.3 移除，只保留 E1 正面 + 反向對稱驗證，讓 smoke 層更乾淨。**建議：先寫 E1 正面 + 反向對稱；B2 留 TODO comment 指向 unit test**。

---

### Flow #1 跨 case 已知陷阱（橫切）

1. **每個 test case 的 DB reset**：3 個 case 都用同一 webServer。`db-fixture.beforeEach` 必須清 **GMUser / Game / Log / PendingEvent** 全部 collection。即使 Flow #1 沒 seed Character / Runtime，也要預防上次跑 Flow #3 後殘留的 CharacterRuntime 影響本 case（雖然 Flow #1 不查這些 collection，但 fixture reset 應是統一的）。

2. **`asGm()` 的 cookie scope 跨 test case 不重用**：Playwright `test.beforeEach` 配合新 context 會清空 cookies。spec 不應手動 `beforeAll` 共用 context，會讓「誰的 gmUserId」混淆（特別是 #1.3 跨 GM 場景會被污染）。

3. **`/api/test/login` 是 fixture 內部細節，spec 不該直接呼叫**：spec 應透過 `asGm(opts)` fixture 介面，不該有 `page.request.post('/api/test/login', ...)` 這種 raw call。保持抽象層次，讓未來若換成其他 auth bypass 機制（例如 auto-sign JWT）時只需改 fixture。

4. **「空狀態 CTA 可點」vs「點擊後的 Dialog」範圍**：Flow #1 的 C2 只驗「按鈕存在且 variant 正確」，**不**驗點擊後的 Dialog 內容（屬 Flow #3 #3.1）。spec 若不小心展開成「點擊 → Dialog 開 → 填表 → 提交」會入侵 Flow #3 範圍。要明確在 spec comment 標註「此處不繼續，由 Flow #3.1 驗證」。

5. **Fixture 的 minimum seed API**：Flow #1 會**首次**定義 `seed-fixture.gmUser` 與 `seed-fixture.game` 的介面。後續 Flow #2/#3/#4 會擴充 opts，但基本簽章不該變。寫 Flow #1 fixture 時要預想：
   - `gmUser({ email?, displayName? })` 回 `{ id, email, displayName }`
   - `game({ gmUserId, name?, gameCode?, createdAt?, isActive?, publicInfo?, presetEvents?, randomContestMaxValue? })` 回 `{ id, ...fields }`
   - 這些簽章要能被 Flow #3 的複雜 case 沿用，不用每個 flow 重寫 seed helper

6. **Test-login 與實際 magic link 的 session 結構對齊**：`lib/auth/session.ts` 的 `SessionData` type 是共用的。`/api/test/login` 寫的欄位必須與真實 `sendMagicLink → callback` 流程寫的欄位一致（`isLoggedIn` / `gmUserId` / `email`）。若哪天 magic link 加了新欄位（例如 `loginAt`），test-login 也要同步，否則 spec 會過但 production session 與 test session 有語意分叉。這屬 **source code 維護責任**，但 spec 寫作者應在 review 時注意。

### Flow #1 對 fixture 的需求（給 Fixture 反推結論小節累積）

以下需求將在所有 flow 重寫完後統一整併到 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 末的 Fixture 反推結論 section：

- **`auth-fixture.asGm({ gmUserId, email?, displayName? })`**：呼叫 `/api/test/login`、寫 iron-session cookie、回 `{ user, context }`
- **`seed-fixture.gmUser({ email?, displayName? })`**：最小 API，回 `{ id, email, displayName }`
- **`seed-fixture.game({ gmUserId, name?, createdAt?, ... })`**：最小 API，只要求 `gmUserId` 與 `name`，其他欄位 optional
- **`db-fixture.reset`**：清 GMUser / Game / Log / PendingEvent（以及 Flow #3 所需的 Character / CharacterRuntime / GameRuntime，統一清）
- **`expect-redirected-to-login`** helper
- **`expect-session-cookie-valid`** helper（若構造成本低）
- **`expect-game-list-empty`** helper（等空狀態 UI 完成渲染）
- **`expect-game-card-by-name`** helper（用 game.name 定位卡片，回 locator）
- **`expect-active-nav-item`** helper（驗 sidebar active 狀態）
- **`/api/test/session-dump`** endpoint（可選，若要做 session 結構斷言）

### Flow #1 延後至其他 flow 的項目（traceability）

以下場景於盤點時列出但**刻意延後**，避免 Flow #1 範圍蔓延：

- **D2 卡片欄位細節**（gameCode / description / `待機中`/`進行中` badge / 建立日期 / `X 位角色` count）→ Flow #4 或未來列表類 flow
- **D5 character count 聚合正確性** → Flow #4 建立角色後的 regression bonus check
- **D6 封面圖 gradient overlay** → 視覺細節，目前無對應 flow
- **D7 hover 卡片動畫** → 非 Playwright 適合範圍
- **B5 `/` 根頁「GM 登入」按鈕** → 靜態首頁，屬未來 `auth-entry` flow（若需要）
- **F3 Mobile < lg RWD** → 獨立 RWD flow 或 visual regression
- **F4 Sidebar 摺疊/展開持久化** → 非 `/games` 本身功能
- **F5 Theme toggle** → 獨立 theme flow
- **F6 Logout flow** → 未來 `auth-logout` flow
- **G1 loading.tsx skeleton 渲染幀** → Playwright 不易穩定捕捉，不測
- **H1 `force-dynamic` 快取驗證** → 由 Flow #3 CRUD 後的 refresh 行為隱含覆蓋
- **Magic link 真實路徑 / SMTP 流程** → 永不測（由 unit test 覆蓋，`NEXT_DEVELOPMENT_PLAN.md:596, :671`）
