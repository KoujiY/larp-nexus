# E2E Flow #2 — 玩家真實 PIN 解鎖 → 角色卡預覽模式（smoke 層）

> 本檔案從 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 拆出。原文件整併多個 flow 過於龐大，Flow #2 以獨立檔案管理，與 Flow #1 / Flow #3 相同拆分策略。
> 共用規格（db-fixture、auth-fixture、stub pusher client、WebSocket 斷言慣例等）仍以 `E2E_FLOWS_PLAN.md` 的「共同規格」section 為準，本檔只描述 Flow #2 範圍內的 test case 細節。
>
> **上游文件**：[E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md)
> **對應 spec 檔**：`e2e/smoke/player-can-unlock.spec.ts`（單一 spec 檔內含 3 個 test case）

---

## Flow #2 — 玩家真實 PIN 解鎖 → 角色卡預覽模式（smoke 層）

**對應 spec 檔**：`e2e/smoke/player-can-unlock.spec.ts`（單一 spec 檔內含 3 個 test case）

### 設計背景（為什麼走真實 PIN，不走 test-login）

與 Flow #1 的 magic link 不同，PIN 解鎖走真實路徑的成本極低：
- 無基礎設施（不需 SMTP catcher）
- PIN 驗證是純 server API（`POST /api/characters/[characterId]/unlock`），沒有 email 中介
- PIN 輸入畫面是玩家端**核心互動入口**，是使用者真實路徑最值得覆蓋的一段

`auth-fixture.asPlayer()` 是繞過版本（直接設 `session.unlockedCharacterIds` + `localStorage[character-*]`），給 Flow #5/#6/#7/#8 使用。**Flow #2 刻意不用 asPlayer**，這是 Flow #2 存在的唯一理由——如果用 fixture 繞過，就失去了驗證 PIN input + unlock API 這條真實使用者路徑的意義。

**與 Flow #1 的對比**：Flow #1 繞過 magic link（真實路徑有 SMTP 成本），Flow #2 走真實 PIN（無基礎設施成本）。兩條 flows 的「真實 vs 繞過」是獨立決策，不是統一原則。

### Flow #2 範圍定義（smoke 層）

Smoke 層只測**預覽模式**（PIN-only unlock，對應 `pin-unlock.tsx:91-93` 的 `onUnlocked(true)`）。完整互動模式（PIN + gameCode → `onUnlocked(false)`）**不在 Flow #2 範圍**，理由：
- 完整互動需 `game.isActive: true`，而 `isActive` 切換由 Flow #3 game activation 驗證，smoke 層不應依賴未驗證的上游
- 完整互動模式涉及 Baseline → Runtime character 自動 upgrade（`getCharacterById` at `app/actions/characters.ts:~170`），複雜度遠高於 smoke 層職責

具體來說：

- **測**：PIN 輸入路徑可達 → `POST /unlock` 成功路徑 → `POST /unlock` 錯誤路徑 → `hasPinLock:false` 直接進入分支 → CharacterCardView 掛載 → 預覽模式 banner → 預覽模式 read-only enforcement（代表性觀測點）→ localStorage 雙 key 狀態
- **不測**：baselineData 實際讀取正確性（物理不可行，見「Flow #2 跨 case 已知陷阱」第 1 條）、完整互動模式、PIN input 前端過濾邏輯（unit test 覆蓋）、rate limit、refresh 後的 state persistence（延後）、theme/RWD、WebSocket 訂閱行為（預覽模式不保證）、物品 / 技能 / 任務的 interaction 細節（Flow #5/#7）

### 3 個 test case 的獨立性設計

Flow #2 分為 3 個 test case，每個都以**空 DB 起點**獨立 seed：

1. **獨立 rerun**：CI 若只有 #2.2 或 #2.3 flaky 可單獨重跑
2. **錯誤隔離**：#2.1 失敗不會拖紅 #2.2/#2.3
3. **分支明確**：#2.1 走 `hasPinLock:true` 成功路徑、#2.2 走 `hasPinLock:true` 錯誤路徑、#2.3 走 `hasPinLock:false` 直接進入路徑。這三條是 `CharacterCardView` 內部**三條互斥的元件樹選擇**，塞在同一 case 會遮蔽 regression

### Flow #2 共用規格

#### 共用 URL
- `/c/{characterId}` — 角色卡頁（`app/c/[characterId]/page.tsx`，**不在** `app/(player)/` route group）
- `POST /api/characters/{characterId}/unlock` — PIN 解鎖 endpoint（`app/api/characters/[characterId]/unlock/route.ts`）

**Route 結構小注**：頁面 render `<CharacterCardView>`，PIN 畫面由 `CharacterCardView` 自己根據 `useLocalStorageUnlock` hook 決定是否渲染 `<PinUnlock>`（見 `character-card-view.tsx:51-80`）。PIN 輸入畫面與角色卡主畫面**共用同一個 URL**，切換由 React state + localStorage 驅動，不是路由跳轉。Spec **不應**用 `page.waitForURL('/c/...')`（URL 從頭到尾沒變），應等**元素變化**（PIN heading 消失 / tabs 出現）。

#### 共用 selector 慣例

Flow #2 涉及一些 shadcn/ui + 自訂元件的特殊 selector，抽共用 helper 可減少重複：

- `pinInput(page)` → `page.locator('input[aria-label="PIN 輸入"]')`（透明 overlay input，非方格 div）
- `previewBanner(page)` → `page.getByText('遊戲準備中 — 預覽模式')`（見 `character-mode-banner.tsx:29-50`；**文案撰寫 spec 時讀一次 source 確認**，避免硬編碼亂碼）
- `expectPinUnlockVisible(page)` → 等 PinUnlock 的「以 PIN 預覽角色」submit 文字 or PIN input 存在
- `expectCharacterCardViewVisible(page, { characterName })` → 等預設 tab `資訊` 選中 + `page.getByText(characterName)` 可見
- `readLocalStorageKey(page, key)` → `page.evaluate((k) => localStorage.getItem(k), key)`

#### 共用 seed builder

所有 case 僅需 `seed-fixture.gmUser` + `seed-fixture.game({ isActive: false })` + `seed-fixture.character`，**不需** runtime doc、`baselineData`、skills / items / tasks 內容（只驗渲染不驗互動）。

**重要**：雖然 `unlock/route.ts` 本身不讀 GMUser，但 seed builder 鏈通常是 `gmUser → game → character`，所以 GMUser 是副產品而非 Flow #2 的功能需求。

#### 共用斷言：預覽模式 read-only 觀測點

所有「預覽模式 read-only」驗證都挑**代表性觀測點**（不做全面 UI surface 掃描）：
1. **物品 tab 的使用按鈕**應 disabled 或隱藏（對應 `isReadOnly` 判斷）
2. **數值 tab 的可編輯 stat 欄位**應為唯讀顯示（無 input / edit control）

兩個觀測點足以證明 `isReadOnly` flag 在關鍵互動點有效。**不要**抄 Flow #5/#7 的完整物品互動斷言進 Flow #2。

---

### Test case #2.1 — PIN 解鎖成功進入預覽模式

**對應場景**：A1 / A2 / B1 / B2 / C1 / D1 / D2 / D3 / D4 / D5 / D6 / D7 / D8 / D9 / D10 / D11 / E1 / E2

#### 進入點
- 角色：Player（無 iron-session，localStorage 空）
- URL：起點為 `/c/{characterId}`

#### 前置 seed
- 1 GMUser（builder 副產品，不直接斷言）
- 1 Game（`isActive: false`，預覽模式前置）
- 1 Character：
  - `gameId` 指向上面的 game
  - `hasPinLock: true`
  - `pin: '1234'`（**明文儲存**，見 `unlock/route.ts:67` 直接字串比對，seed 時不需 hash）
  - `name: 'E2E Test Character #2.1'`
  - `stats`：至少 1 個條目（例：`[{ name: 'HP', value: 10 }]`）供數值 tab 觀測
  - `items`：至少 1 個 consumable item 供物品 tab 觀測 read-only

#### 操作步驟

**階段 1 — 未解鎖訪問進入 PinUnlock（A1/A2）**：
1. **不**呼叫 `asPlayer()`，browser context 保持空 cookie / 空 localStorage
2. `page.goto('/c/{characterId}')`
3. 等 PinUnlock 元件渲染

**階段 2 — 輸入正確 PIN 觸發 unlock（B1/B2/C1）**：
1. 驗證 PinUnlock 視覺關鍵元素存在（heading + PIN input）
2. 在 `pinInput(page)` 鍵入 `1234`
3. **不**輸入 gameCode（保持空白以走預覽模式分支）
4. 點擊「以 PIN 預覽角色」按鈕（或按 Enter 觸發 form submit）

**階段 3 — 等待解鎖完成 + CharacterCardView 掛載（D1/D5/D9/D10）**：
1. 等 `POST /unlock` response 200
2. 等 PinUnlock 消失
3. 等 CharacterCardView 的預設 tab `資訊` 被選中且 active
4. 驗證角色名稱 `E2E Test Character #2.1` 顯示

**階段 4 — 預覽模式 banner 與 read-only 驗證（D6/D7/D8/D11）**：
1. 驗證 `previewBanner(page)` 顯示
2. 驗證「重新解鎖」按鈕存在（不測點擊行為，行為屬 H1 延後項）
3. 切到「物品」tab，驗證 seed 的 consumable item 顯示但使用按鈕 disabled/隱藏
4. 切到「數值」tab，驗證 `HP` 顯示為唯讀（無 input control）

**階段 5 — localStorage 雙 key 狀態驗證（D2/D3/E1/E2）**：
1. `readLocalStorageKey(page, 'character-{id}-unlocked')` → `'true'`
2. `readLocalStorageKey(page, 'character-{id}-fullAccess')` → `null`（**重要**：預覽模式**不**設 fullAccess）
3. Server session 驗證（D4）：若 `/api/test/session-dump` 已實作，驗 `session.unlockedCharacterIds` 含此 id；否則暫略，由 fixture Phase 實作時補

#### 非同步等待點
- 階段 2 → 階段 3：`page.waitForResponse(res => res.url().includes('/unlock') && res.status() === 200)`
- 階段 3：`page.getByRole('tab', { name: '資訊' })` visible + `aria-selected="true"` or equivalent
- 階段 4 tab 切換：`page.getByRole('tab', { name: '物品' }).click()` 後等物品清單或空狀態渲染（**不**用 `waitForTimeout`）

#### 斷言

**UI 層（階段 3）**：
- 預設 active tab 為「資訊」（驗 `character-card-view.tsx:103` 已修為 `useState('info')`）
- 角色名稱 `E2E Test Character #2.1` 可見
- 5 個 tab 文字都存在：`資訊 / 數值 / 任務 / 物品 / 技能`（見 `TAB_CONFIG` at `character-card-view.tsx:39-45`；**順序**為 `物品/技能/資訊/數值/任務`，但 active 為 `資訊`）
- PinUnlock 的「以 PIN 預覽角色」submit 文字**不存在**

**UI 層（階段 4）**：
- `previewBanner(page)` 可見
- 「重新解鎖」按鈕可見（見 `character-mode-banner.tsx:29-50` 的右側 LockKeyhole icon 按鈕）
- 物品 tab：seed item 可見、其「使用」按鈕 disabled 或不存在
- 數值 tab：`HP` stat 顯示為唯讀（無 input element、無 edit button）

**LocalStorage 層（階段 5）**：
- `character-{id}-unlocked === 'true'`
- `character-{id}-fullAccess === null`（**關鍵反向斷言**：預覽模式的可觀測邊界）

**Session 層**：
- 若 `/api/test/session-dump` 可用：`session.unlockedCharacterIds` 包含 `characterId`
- 否則：**smoke 層先略**，理由同 Flow #1——後續 `asPlayer()` fixture 實作時，它本身就依賴 `session.unlockedCharacterIds` 寫入路徑，fixture 能跑通即隱含驗證此寫入

**DB 層**：
- **無變化**：`POST /unlock` 只讀 Character、寫 iron-session cookie，**不寫 DB**（見 `unlock/route.ts` 整體）
- 這是設計上的事實，不是測試縮減

#### 反向驗證
- **`fullAccess` key 缺席驗證**本身就是預覽模式正確性的反向斷言（若實作誤把預覽當完整互動，`fullAccess=true` 會被寫入，斷言會失敗）
- **seed 破壞**：把 seed 的 `pin` 改成 `5678`、原本輸入 `1234` 應進入錯誤路徑（交給 #2.2）
- **PinUnlock 應**在解鎖後消失：若 `setIsManuallyUnlocked` 未正確設置，PinUnlock 會殘留，階段 3 的 disappear 斷言會失敗

#### 已知陷阱
1. **透明 input overlay 的輸入方法**：PIN 方格是純視覺 div，真正的 input 是疊在上面的透明 `<input aria-label="PIN 輸入">`（`pin-unlock.tsx:181-186`）。Playwright 用 `page.locator('input[aria-label="PIN 輸入"]').fill('1234')` 即可，**不需要**模擬點擊方格
2. **PIN 明文儲存**：`unlock/route.ts:67` 直接 `pin !== character.pin` 字串比對，seed 時 `Character.create({ pin: '1234' })` 即可，不需 bcrypt hash
3. **預設 tab 修正**：`character-card-view.tsx:103` 已從 `'items'` 修正為 `'info'`，spec 斷言 `資訊` 為預設 active tab。若 spec 撰寫時看到 `'items'` 代表 regression
4. **TAB_CONFIG 順序 vs active 順序分離**：`TAB_CONFIG` 陣列順序是 `[物品, 技能, 資訊, 數值, 任務]`（視覺順序），與 `useState` 初始值獨立。Spec 不應假設「第一個 tab == active tab」
5. **「重新解鎖」按鈕行為未測**：階段 4 只驗存在性，不測點擊後行為（點擊後應清 localStorage 並回 PinUnlock）。行為測試屬 H1 延後項，spec 若誤點擊會進入未定義行為
6. **`useLocalStorageUnlock` 的 SSR snapshot**：`character-card-view.tsx:74` 的 `getServerSnapshot` 在 `hasPinLock:true` 時回 `false`，所以 SSR 階段渲染 PinUnlock → client hydration 後才可能切換。Spec 若直接測 `page.goto` 後**極短時間**的斷言，要確認等到 hydration 完成（建議等 PIN input enabled）

---

### Test case #2.2 — PIN 錯誤路徑

**對應場景**：F1 / F2 / F3 / F4 / F5 / F6

#### 進入點
- 角色：Player（無 iron-session，localStorage 空）
- URL：起點為 `/c/{characterId}`

#### 前置 seed
- 與 #2.1 **完全相同** seed（1 GMUser + 1 Game isActive:false + 1 Character hasPinLock:true pin:'1234'）
- Character name 可改為 `E2E Test Character #2.2` 以利除錯區分

#### 操作步驟

**階段 1 — 進入 PinUnlock**：
1. `page.goto('/c/{characterId}')`
2. 等 PinUnlock 渲染

**階段 2 — 輸入錯誤 PIN**：
1. 在 `pinInput(page)` 鍵入 `9999`（故意與 seed 的 `1234` 不同）
2. 點擊「以 PIN 預覽角色」

**階段 3 — 等待錯誤反饋**：
1. 等 `POST /unlock` response（非 200，見斷言）
2. 等 client 顯示錯誤訊息

**階段 4 — 反向驗證 read-only 狀態**：
1. 驗證 PinUnlock **仍然存在**
2. 驗證 CharacterCardView **未**掛載
3. 驗證 localStorage 兩個 key 都**不存在**

#### 非同步等待點
- 階段 2 → 階段 3：`page.waitForResponse(res => res.url().includes('/unlock'))`（接受 non-200 status）
- 階段 3：等錯誤訊息元素出現（見斷言 F2）

#### 斷言

**Server 回應層（F1）**：
- `POST /unlock` response status 為 **401** 或 **403**（以 `unlock/route.ts` 實作為準；目前 `:67` 比對失敗後的分支**讀一次 source 確認**，不硬編碼）
- Response body `{ success: false }` 或等同的錯誤 envelope

**UI 層（F2/F3）**：
- 錯誤訊息顯示：`page.getByRole('alert')` 或固定錯誤 selector 可見（**文案不寫死**，避免 i18n/亂碼問題。若無 `role="alert"`，讀 `pin-unlock.tsx` 確認錯誤顯示機制，以 source 為準）
- PinUnlock 的 `pinInput(page)` 仍存在
- 「以 PIN 預覽角色」按鈕仍可見

**PinUnlock 未消失（F3）**：
- `expectCharacterCardViewVisible` 斷言**反向**失敗：預設 tab `資訊` **不**應被 active，角色名稱**不**應顯示
- 等同於驗證 `setIsManuallyUnlocked(true)` 未被呼叫

**輸入框狀態（F4）**：
- 輸入框保留或清空皆可（以實作為準）。**不做強制斷言**，避免測試脆弱。若實作選擇清空，spec 寫 `expect(pinInput).toHaveValue('')`；若保留，則 `toHaveValue('9999')`。**撰寫 spec 時先讀一次 `pin-unlock.tsx` handleSubmit error handler 的實作**再決定

**LocalStorage 層（F5）**：
- `readLocalStorageKey(page, 'character-{id}-unlocked') === null`
- `readLocalStorageKey(page, 'character-{id}-fullAccess') === null`
- 這是關鍵反向斷言：錯誤路徑**不應**留下任何 client-side 髒狀態

**Session 層（F6）**：
- 若 `/api/test/session-dump` 可用：`session.unlockedCharacterIds` **不**包含 `characterId`
- 否則暫略（同 #2.1）

**DB 層**：
- 無變化（錯誤路徑同樣不寫 DB）

#### 反向驗證
- **成功路徑不應觸發**：如果實作有 bug 導致錯誤 PIN 也寫 localStorage，F5 斷言會抓到
- **重複錯誤**：按送出後再改值再按，應觸發**兩次** `POST /unlock`（非 201/200），每次都回錯。spec 可選擇性做這一條（驗證 form 未 lock）

#### 已知陷阱
1. **錯誤文案路徑**：`pin-unlock.tsx:78-80` 可能把 server 回的錯誤覆寫為通用文案。spec **不應**斷言特定文案內容，只斷言「有錯誤訊息元素出現」
2. **Rate limit 未實作**：`unlock/route.ts` 目前無 rate limit，spec **不要**假設連續錯誤會被 block（F7 延後項）。如果未來加 rate limit，#2.2 需要在 teardown 做 reset 或 seed 不同 characterId
3. **錯誤狀態碼以 source 為準**：先前文件寫 401，但 `unlock/route.ts:67` 實際可能回 400/401/403/200+success:false。**spec 撰寫時讀 source**確認 status code 與 body shape，不硬編碼
4. **F3 的斷言時序**：PinUnlock 未消失的斷言要在錯誤反饋出現**之後**才做，否則可能誤等到 loading 中間狀態

---

### Test case #2.3 — 無 PIN 角色直接進入（`hasPinLock: false` 分支）

**對應場景**：A3

#### 進入點
- 角色：Player（無 iron-session，localStorage 空）
- URL：起點為 `/c/{characterId}`

#### 前置 seed
- 1 GMUser（builder 副產品）
- 1 Game（`isActive: false`）
- 1 Character：
  - `hasPinLock: false`
  - `pin: undefined` 或 `''`
  - `name: 'E2E Test Character #2.3'`
  - 其餘欄位與 #2.1 類似（1 stat、1 item）

#### 操作步驟

**階段 1 — 直接訪問**：
1. `page.goto('/c/{characterId}')`
2. 等 page 完成 SSR + hydration

**階段 2 — 驗證繞過 PinUnlock 分支**：
1. 驗證 PinUnlock 元件**未**渲染（整條子樹缺席）
2. 驗證 CharacterCardView 直接可見、預設 tab `資訊` active
3. 驗證角色名稱 `E2E Test Character #2.3` 顯示

**階段 3 — localStorage 完全空**：
1. `readLocalStorageKey(page, 'character-{id}-unlocked') === null`
2. `readLocalStorageKey(page, 'character-{id}-fullAccess') === null`
3. 雖無 localStorage 但 UI 仍可互動（因 `hasPinLock:false` 的 server snapshot 分支直接回 `true`）

#### 非同步等待點
- 階段 1：`page.waitForLoadState('networkidle')` + `getByRole('tab', { name: '資訊' })` visible
- 無 unlock API call 需等待（此 case **不**觸發 `POST /unlock`）

#### 斷言

**UI 層**：
- PinUnlock 整個元件**缺席**：`pinInput(page).count() === 0`、「以 PIN 預覽角色」submit 文字不存在
- CharacterCardView 掛載：預設 tab `資訊` active、角色名稱顯示
- **關鍵反向**：`previewBanner(page)` **不**顯示（因 `hasPinLock:false` → `isReadOnly=false` → 不是預覽模式、是完整互動模式）

**這個 case 的 read-only 斷言方向與 #2.1 相反**：
- #2.1 是預覽模式，read-only 按鈕 disabled
- #2.3 是完整互動模式（`isReadOnly=false`），物品 tab 的使用按鈕**應 enabled**

**LocalStorage 層**：
- 兩個 key 都 `null`（確認繞過分支不依賴 client 持久化）

**Session 層**：
- `session.unlockedCharacterIds` **不**包含 `characterId`（繞過分支不寫 session，`useLocalStorageUnlock` 的 `getUnlockedSnapshot` 在 `!hasPinLock` 時直接回 `true`，與 session 無關）

**DB 層**：
- 無變化

#### 反向驗證
- **如果把 seed 改為 `hasPinLock: true`**：此 case 應立刻失敗（PinUnlock 會出現），驗證分支判斷的實際依據是 `hasPinLock` flag
- **如果 `character-card-view.tsx:74` 的 `getServerSnapshot` 實作錯誤**（例如忽略 `hasPinLock`）：此 case 會繞不過 PinUnlock，斷言會抓到

#### 已知陷阱
1. **`hasPinLock:false` 的 SSR / hydration 一致性**：`getServerSnapshot` 回 `!hasPinLock = true`，`getUnlockedSnapshot` 在 client 也回 `true` → 兩邊一致，不會 hydration mismatch。但**如果**未來改實作讓 client 去讀 localStorage 才返回，就會產生 mismatch。Spec 能抓到這個 regression
2. **完整互動模式 != 遊戲進行中**：`hasPinLock:false` → `isReadOnly=false` → 看起來是「完整互動」，但 `game.isActive=false` 下所有 server action 可能仍被 gate（視 `validatePlayerAccess` 實作）。#2.3 **不測**這些 action，只測 UI 層的 read-only flag 正確
3. **物品 tab 使用按鈕 enabled 但不點擊**：#2.3 只驗證按鈕 enabled（UI 狀態），**不**觸發真實使用（屬 Flow #7 範圍）
4. **Server 層 session 無寫入**：即使使用者能互動，session 中並**沒有** `unlockedCharacterIds` entry，任何 server action 的授權必須靠另一條路徑（例如 characterId 直接綁定 gameCode 或其他）。這是 `hasPinLock:false` 的副作用之一，spec 不測但 spec 作者必須知道
5. **isActive 組合**：此 case seed `isActive: false`。未來若想擴充「`hasPinLock:false` + `isActive:true`」組合，屬新 case（非 #2.3 變體），避免污染 smoke 範圍

---

## Flow #2 跨 case 已知陷阱（橫切）

### 陷阱 #1：禁止在 Flow #2 斷言「預覽模式讀到 baseline」（E6 / K1 橫切）

**背景**：`character-card-view.tsx:95` 的實作為：
```ts
const bl = isReadOnly ? character.baselineData : undefined;
const displayStats = bl?.stats ?? character.stats;
```
而 Flow #2 的 fixture 前置為 `game.isActive: false` → `app/actions/public.ts:116` gate 不執行 → `character.baselineData === undefined`。所有 display 值（stats / items / skills / tasks）實際走 `?? character.*` **fallback 路徑**，而非 `baselineData` 讀取路徑。

**禁止寫法**：
```ts
// ❌ 假 pass
expect(statCell).toHaveText(String(seededBaselineHp));
```

**原因**：即使把 line 96 改成 `bl?.stats ?? 0`，此斷言**仍會 pass**（因為 `bl` 本來就 undefined，fallback 讀 `character.stats` 不受影響）。完全**沒有 regression 保護**。

**正確做法**：
- baseline 讀取語義由「待評估新 Flow — 預覽模式 baseline 讀取分流」覆蓋（見 `E2E_FLOWS_PLAN.md` 的 Flow #9/#10 待抽出項目清單 section）
- Flow #2 只驗證「預覽模式 UI read-only enforcement」（D8 觀測點）與「預覽模式 banner 顯示」（D6）與「`fullAccess` localStorage key 不存在」（D3）
- **D3 是 Flow #2 可觀測的預覽模式邊界**——不是 baseline 讀取，而是「預覽模式確實沒被誤升級為 full-access」的反向證據

### 陷阱 #2：PIN 驗證是 server，不是 client

`pin-unlock.tsx` 的 `verifyPin()`（大約在 line 42-50）呼叫 `POST /api/characters/{id}/unlock`。**禁止**用 `localStorage.setItem` 偽造解鎖狀態跳過 server 驗證——會遺漏「PIN 錯誤 → server 401」這條關鍵路徑。#2.2 的存在就是為了防止這種偷懶。

### 陷阱 #3：雙重持久化（server + client）缺一不可

PIN 解鎖的狀態同時寫進 iron-session cookie（server-side 授權）與 localStorage（client-side UI 持久化）：
- **只有 session 沒 localStorage**：重新整理後 `useLocalStorageUnlock` 讀到空 → 再次顯示 PIN 畫面（`asPlayer()` fixture 踩過此雷，見 `auth-fixture API` spec）
- **只有 localStorage 沒 session**：UI 進得去，但呼叫 `useItem` 等 server action 會被拒（讀 `session.unlockedCharacterIds` 找不到）

Flow #2 的 #2.1 同時斷言這兩層（或在 session-dump 未就緒時至少斷言 localStorage 層）。

### 陷阱 #4：PIN 輸入與角色卡共用同一 URL

切換是 React state + localStorage 驅動，不是 `router.push`。Spec **不應** `page.waitForURL('/c/...')`（URL 從頭到尾沒變），應該等**元素變化**（PIN heading 消失 / tabs 出現）。

### 陷阱 #5：`revalidatePath` / `router.refresh()` 的副作用不在 Flow #2 範圍

`unlock/route.ts` 若呼叫 `revalidatePath('/c/{id}')`（**讀 source 確認**），會觸發 server component re-fetch。這個副作用對 Flow #2 不重要（反正畫面切換是由 localStorage 驅動的），但 spec 要避免依賴 request 次數的斷言。

### 陷阱 #6：每個 test case 的 DB reset 必須徹底

三個 case 共用 webServer，DB 殘留會污染：`db-fixture.beforeEach` 的 `/api/test/reset` 必須清 `Character / GMUser / Game` 全部 collection，不能只清 Character（否則 #2.2 的舊 Character doc 會被 #2.3 的 `findById` 意外抓到）。

### 陷阱 #7：iron-session cookie 不要直接 parse

Cookie value 加密過，spec 不能直接讀 cookie 內容。依賴：
- fixture 的 `/api/test/session-dump` helper（若有）
- 或間接：下一個需要 session 的 request 成功即代表 cookie 有效

---

## Flow #2 對 fixture 的需求（給 Fixture 反推結論小節累積）

以下需求已部分落地到 `E2E_FLOWS_PLAN.md` 的「Fixture 反推結論」section，此處累積 Flow #2 範圍內的具體需求：

- **`seed-fixture.character({ gameId, name?, hasPinLock?, pin?, stats?, items? })`**：
  - 支援 `hasPinLock` 切換（#2.1 / #2.2 需 true、#2.3 需 false）
  - 支援 `pin` 明文（不 hash）
  - 支援 `stats` / `items` overrides 以滿足 read-only 觀測點

- **`seed-fixture.game({ isActive: false })`**：Flow #2 所有 case 都固定 `isActive: false`，這是 builder 預設值即可

- **`/api/test/session-dump`**（**可選**）：Flow #2 的 #2.1 / #2.2 在 session 層斷言會用到。若 fixture Phase 先不實作，Flow #2 先降級為只驗 localStorage 層 + `POST /unlock` response 狀態

- **`readLocalStorageKey(page, key)` helper**：Flow #2 大量使用，建議抽到共用 helper 檔

- **`waitForResponse` wrapper**：`waitForUnlockResponse(page)` — 同時處理 200 / 401 / 403 並回傳 `{ status, body }` 供 spec 後續斷言

- **`asPlayer()` fixture 的擴充**：**Flow #2 不使用此 fixture**，但 Flow #2 的發現推動了 `readOnly` 選項（見 `E2E_FLOWS_PLAN.md` 的 `auth-fixture API` section）。兩邊的 traceability 在此記錄

---

## Flow #2 延後至其他 flow 的項目（traceability）

以下是 Flow #2 scan 階段發現但**排除/延後**的項目，記錄來源以便未來追溯：

### 排除（物理或設計上 Flow #2 無法覆蓋）

- **E6 / K1 baselineData 讀取正確性** → 移交「待評估新 Flow — 預覽模式 baseline 讀取分流」
- **B3 character initial 120px 裝飾圖** → 純視覺，排除
- **B4 character image Blob 渲染** → Blob 無法模擬，排除
- **B6 submit 按鈕文案字面驗證** → 純視覺，排除
- **C2–C5 PIN input 前端過濾** → unit test 覆蓋（`pin-unlock.tsx:181` `replace(/\D/g,'')` + `slice(0,4)` + disabled 條件）
- **G1–G3 submit 按鈕 loading / disabled / 防連擊** → unit test 覆蓋
- **J1–J4 theme / RWD** → 使用者決定 Phase J 全排除
- **I1 WebSocket subscribe 行為** → 預覽模式訂閱行為不保證，不納入 smoke

### 延後（Flow #2 不做但可能有後續 flow 補上）

- **E3 secretInfo 顯隱策略** → 角色卡秘密專用 flow（未規劃）
- **E5 items usage.available 顯示** → Flow #7 道具 flow
- **F7 PIN 連續錯誤 rate limit** → 安全強化後續（目前 `unlock/route.ts` 無 rate limit）
- **H1 解鎖後重新整理的 state persistence** → 延後
- **H2「重新解鎖」按鈕點擊行為** → 與 H1 一併延後

### 橫切（Flow #2 不重複測，其他 flow 已覆蓋或將覆蓋）

- **A4 不存在 characterId → 404** → Flow #1 已覆蓋通用 404
- **B5 跨 GM 不可見** → Flow #1 #1.3 已覆蓋跨 GM 隔離
- **E4 Runtime vs Baseline dual-read** → Flow #5（使用技能）會覆蓋 Runtime 讀取路徑
- **L1 / L2 跨 GM 訪問他人角色** → Flow #1 #1.3 已覆蓋

---

> **後續動作**：Flow #2 spec 撰寫完成後，回頭更新 `E2E_FLOWS_PLAN.md` 主文件的 Flow #2 區塊為 anchor + pointer（與 Flow #1 / Flow #3 相同處理）。
