# E2E Flows Plan

> 本文件是 `NEXT_DEVELOPMENT_PLAN.md §6 Phase 2` 的產出。
>
> **用途**：為 E2E 8 個 flows 逐一展開詳細規劃，作為 Phase 4（smoke specs）與 Phase 5（flows specs）實作的**唯一參考來源**。
>
> **讀者**：寫 spec 的人（目前是 Claude 自己或接手的 maintainer）。
>
> **為什麼 docs 先於 code**：fixture API shape 不能憑空設計。先把 8 個 flows 的「前置 seed」「非同步等待點」「斷言」全部列出，再一次歸納 fixture 反推結論，Fixture 就能一版到位。若顛倒順序，flows 的真實需求會反覆回頭改 fixture，白工。
>
> **ground truth 來源**：本文件所有 `file:line` 參照來自 Explore agent 對 code base 的直接掃描（commit `d395256` 之後執行）。若 code 有重構導致行號漂移，以「函數名 / 事件名」為準。

---

## 共同規格

### 測試執行前提

- Playwright 啟動時已由 `e2e/global-setup.ts` 啟動 `mongodb-memory-server`，`MONGODB_URI` 注入 webServer
- `E2E=1` 啟用 `webpack alias` 把 `pusher-server` / `pusher-client` swap 成 stub 版本
- SSE route `/api/test/events` 作為 server↔client IPC
- **每個 test 開始前** `resetDb` auto-fixture 呼叫 `POST /api/test/reset`，一次清空 DB collections + contest-tracker in-memory Map + E2E event bus listeners（✅ Phase 3 已實作為三合一 endpoint）
- 所有 spec 從 `e2e/fixtures` import `test` 和 `expect`，不直接用 `@playwright/test`

### 每個 flow 的規格欄位

| 欄位 | 意義 |
|---|---|
| **進入點** | 使用者角色 + URL + 是否需預先登入 |
| **前置 seed** | `/api/test/reset` 之後、使用者操作之前，DB 需要有哪些資料 |
| **操作步驟** | 使用者從進入點到觸發目標行為的最小動作序列 |
| **非同步等待點** | 操作後到斷言可執行之間，要等哪個 WebSocket event / DOM 變化 / server 回應 |
| **斷言** | UI 可見結果、DB side effect、另一個 browser context 的狀態（若有） |
| **反向驗證** | 故意破壞哪一段實作會讓這個 spec 必定 fail |
| **已知陷阱** | 寫 spec 時容易踩的坑 |

### 斷言分層原則

flow spec 的斷言 **必須同時包含至少 2 層**：

1. **UI 層**（最接近使用者感受）
2. **DB 層 或 WebSocket event 層**（最接近系統真相）

只做 UI 斷言的風險：element 出現但資料未持久化，spec 綠但 production 壞。
只做 DB 斷言的風險：資料正確但 UI 未更新，spec 綠但使用者體驗壞。

---

## Flow #1 — GM test-login → 劇本列表（smoke 層）

> **⚠ 已拆出為獨立檔案**：Flow #1 的完整規格（3 個 test case、跨 case 已知陷阱、Flow #1 專屬 fixture 需求、延後項目追蹤）已移至 [E2E_FLOW_1_GM_LOGIN.md](./E2E_FLOW_1_GM_LOGIN.md)。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #1"` 與章節連結仍可定位。

---

## Flow #2 — 玩家真實 PIN 解鎖 → 角色卡預覽模式（smoke 層）

> **⚠ 已拆出為獨立檔案**：Flow #2 的完整規格（3 個 test case、跨 case 已知陷阱、Flow #2 專屬 fixture 需求、延後項目追蹤）已移至 [E2E_FLOW_2_PLAYER_PIN.md](./E2E_FLOW_2_PLAYER_PIN.md)。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #2"` 與章節連結仍可定位。

---

## Flow #3 — GM 劇本管理完整生命週期（flows 層）

> **⚠ 已拆出為獨立檔案**：Flow #3 的完整規格（6 個 test case、跨 case 已知陷阱、Flow #3 專屬 fixture 需求）已移至 [E2E_FLOW_3_GAME_LIFECYCLE.md](./E2E_FLOW_3_GAME_LIFECYCLE.md)，因為本文件過於龐大，不適合再承載 Flow #3 級別的詳細規格。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #3"` 與章節連結仍可定位。後續 Flow #4–#8 的詳細規格（一旦完成撰寫）也可能採用同樣的拆分策略。

---

> ⚠ **Flow #1 至 #8 全部完成拆出**，詳見各自獨立檔案。**Fixture 反推結論**小節的終版必須等所有 flow 重寫完才能定稿，目前只能視為暫存草稿。
>
> Flow #1/#2/#3/#4/#4b/#5/#6/#6b/#7/#8/#9/#10/#11/#12 已完成拆出，詳見各自獨立檔案。
>
> **Flow 總數更新**：原規劃 8 個 → 目前確定 12 個。Flow #9 預設事件 runtime 執行、Flow #10 auto-reveal 專屬、Flow #11 預覽模式 baseline 讀取分流、Flow #12 時間依賴 edge case。

## Flow #4 — GM 角色卡 CRUD（flows 層）

> **⚠ 已拆出為獨立檔案**：Flow #4 的完整規格因涵蓋 7 個分頁的 CRUD，體量過大而拆成兩份姊妹檔：
> - [E2E_FLOW_4_GM_CHARACTER_CRUD.md](./E2E_FLOW_4_GM_CHARACTER_CRUD.md) — 主線 8 個 test case（建立、基本設定、背景故事、隱藏資訊、任務、Dirty/Save Bar、刪除）
> - [E2E_FLOW_4B_ABILITY_WIZARD.md](./E2E_FLOW_4B_ABILITY_WIZARD.md) — 5 個 test case（Stats CRUD、Items Wizard happy path、Items Wizard 互鎖、Skills Wizard + 專屬效果、Skills Wizard edit mode）
>
> 拆分理由：`AbilityEditWizard` 是 Items/Skills 共用的 4 步驟互動，與 character edit tabs 的 dirty state 機器幾乎解耦，分開維護可減少單一 spec 檔的爆炸面。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #4"` 與章節連結仍可定位。

---

## Flow #5 — Player 使用技能（flows 層）

> **⚠ 已拆出為獨立檔案**：Flow #5 的完整規格（6 個 test case、WebSocket 事件鏈驗證、baseline/runtime 隔離斷言、基礎設施依賴清單）已移至 [E2E_FLOW_5_PLAYER_USE_SKILL.md](./E2E_FLOW_5_PLAYER_USE_SKILL.md)。
>
> Flow #5 是第一個需要**實作 `asPlayer()` fixture 與 `wsCapture` helper** 的 flow，獨立檔案中明確標註基礎設施依賴清單，避免在 fixture 未備時先寫 spec 造成誤紅。
>
> **對抗 (contest) 技能**刻意完全排除於 Flow #5，因 `skill-use.ts:237` 的提早 return 讓 effects 在 contest-respond 階段才執行——這條閉環拆至 Flow #6。**item_take / item_steal** 的 TargetItemSelectionDialog 延遲選擇拆至 Flow #7。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #5"` 與章節連結仍可定位。

---

## Flow #6 — 對抗檢定（flows 層，multi-context）

> **⚠ 已拆出為獨立檔案**：Flow #6 的完整規格因涵蓋雙 browser context、三階段事件序列、多種勝負分支，體量龐大而拆成兩份姊妹檔：
> - [E2E_FLOW_6_CONTEST.md](./E2E_FLOW_6_CONTEST.md) — 主線 6 個 test case（happy path、技能防禦+combat tag、道具防禦+equipment 過濾、random_contest+both_fail、互斥選擇+opponentMax、隱匿標籤）
> - [E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md](./E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md) — 3 個 test case（#6b.1 item_take 對抗延遲、#6b.2 item_steal 對抗延遲、#6b.3 item_steal 非對抗延遲）
>
> 拆分理由：`item_take`/`item_steal` 的延遲物品選擇涉及額外的 `selectTargetItemForContest`（對抗）/ `selectTargetItemAfterUse`（非對抗）action 與 `TargetItemSelectionDialog`，與主線對抗流程的 `ContestResponseDialog` 解耦，分開維護可減少單一 spec 檔的爆炸面。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #6"` 與章節連結仍可定位。

---

## Flow #7 — 道具操作：use / equip / showcase / transfer（flows 層）

> **⚠ 已拆出為獨立檔案**：Flow #7 的完整規格（6 個 test case）已移至 [E2E_FLOW_7_ITEM_OPERATIONS.md](./E2E_FLOW_7_ITEM_OPERATIONS.md)。
>
> 範圍從舊版的 3 子 flow（use/equip/showcase）擴充為 4 種操作 + 6 cases：consumable 使用（self/cross-target + random check）、equipment equip/unequip toggle + stat boost、showcase + receiver dialog、transfer + isTransferable + partial quantity、usage limit + cooldown + readOnly + error 拒絕。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #7"` 與章節連結仍可定位。

---

## Flow #8 — GM 廣播與單角色訊息（flows 層）

> **⚠ 已拆出為獨立檔案**：
> - [E2E_FLOW_8_GM_BROADCAST.md](./E2E_FLOW_8_GM_BROADCAST.md) — 4 個 test case（#8.1 broadcast happy path、#8.2 character message + PendingEvent 反向驗證、#8.3 表單驗證 + 模式切換、#8.4 authorization guard）
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #8"` 與章節連結仍可定位。

---

## Flow #9–#12 待盤點項目清單

> **盤點完成時間**：Flow #1–#8 全部拆出後，全面篩檢所有延後/排除/橫切項目的結果。
> 各 flow 本文中的就近註記（grep `Flow #9` / `Flow #10` / `Flow #11` / `Flow #12`）保留原位，作為回頭追溯的索引。
>
> **紀律**：每條項目必須附 `(來源: §X.Y)` 以便回溯。

### Flow #9 — 預設事件 runtime 執行

> **⚠ 已拆出為獨立檔案**：
> - [E2E_FLOW_9_PRESET_EVENT_RUNTIME.md](./E2E_FLOW_9_PRESET_EVENT_RUNTIME.md) — 6 個 test case（#9.1 Baseline→Runtime 複製+執行狀態、#9.2 Runtime CRUD、#9.3 broadcast all+specific+PendingEvent 反向驗證、#9.4 stat_change、#9.5 reveal_secret+reveal_task、#9.6 部分失敗+skip）
>
> 原待涵蓋 5 項全部涵蓋：stat_change(#9.4)、runPresetEvent(#9.1/#9.3–#9.6)、Runtime CRUD(#9.2)、Baseline/Runtime 分流(#9.1/#9.2)、broadcast target 語意(#9.3)

### Flow #10 — auto-reveal 專屬

> **⚠ 已拆出為獨立檔案**：
> - [E2E_FLOW_10_AUTO_REVEAL.md](./E2E_FLOW_10_AUTO_REVEAL.md) — 5 個 test case（#10.1 items_viewed→secret reveal、#10.2 items_acquired→task reveal、#10.3 secrets_revealed chain reveal、#10.4 AND/OR matchLogic、#10.5 條件編輯器 UI）
>
> 原待涵蓋 6 項全部涵蓋：條件編輯器 UI(#10.5)、runtime 觸發路徑(#10.1/#10.2/#10.3)、secrets/tasks 整合點(#10.1/#10.2/#10.3)、runtime 實際觸發(#10.1–#10.4)、轉移後自動揭露(#10.2)、recordItemView+showcase/transfer 後 auto-reveal(#10.1)

### Flow #11 — 預覽模式 baseline 讀取分流

> **⚠ 已拆出為獨立檔案**：
> - [E2E_FLOW_11_PREVIEW_MODE_BASELINE.md](./E2E_FLOW_11_PREVIEW_MODE_BASELINE.md) — 4 個 test case（#11.1 preview mode 顯示 baseline 資料、#11.2 preview→full access 切換後顯示 runtime、#11.3 預覽模式互動鎖定、#11.4 game 未啟動時 baselineData 不填充）
>
> 原待涵蓋 3 項全部涵蓋：baseline 讀取(#11.1)、模式切換(#11.2)、Runtime 分歧驗證(#11.1 seed)。額外新增互動鎖定(#11.3)與 inactive game fallback(#11.4)

### Flow #12 — 時間依賴 edge case

> **⚠ 已拆出為獨立檔案**：
> - [E2E_FLOW_12_TIME_DEPENDENT_EDGE_CASES.md](./E2E_FLOW_12_TIME_DEPENDENT_EDGE_CASES.md) — 5 個 test case（#12.1 TemporaryEffect 過期 stat rollback + WS event、#12.2 多效果累疊逐步過期、#12.3 Skill cooldown clock mock、#12.4 Item cooldown clock mock、#12.5 PendingEvent TTL 清除）
>
> 原待涵蓋 6 項中 5 項涵蓋：TemporaryEffect 過期(#12.1)、Skill cooldown(#12.3)、Item cooldown(#12.4)、PendingEvent TTL(#12.5)、多效果累疊(#12.2)。contest-tracker timeout **降級為 unit test**（server-side `setInterval` 無法 mock，詳見 spec 檔案）

### 不排程項目（留原位紀錄，未來視需求補上）

以下項目保留在各自 Flow spec 的「不測」表格中，不主動安排進任何 flow：

- defender_wins + defender 技能帶 item_take/steal — 對稱路徑，低優先（§Flow #6b）
- 放棄選擇（不選道具關閉 dialog）— 待查證 UI（§Flow #6b）
- 多 item_take/steal 效果同時 — edge case（§Flow #6b）
- 對抗取消 (cancel) — 待查證是否有 cancel API（§Flow #6）
- 道具發動對抗（item checkType=contest）— 低優先（§Flow #6）
- 多 attacker 同時對同一 defender — 並發 edge case（§Flow #6）
- `targetType='any'` 下拉選自己 — 非主線（§Flow #5）
- 同時開多個 Wizard（dialog stacking）— UX edge case（§Flow #4b）
- PendingEvent 離線重連 replay — 需複雜編排（§Flow #8）

### unit test / integration test 覆蓋（不排入 E2E flow）

- SkillCard / ItemCard cooldown countdown 動畫 — UI 動畫斷言 flaky（§Flow #5、#7）
- Equipment effects panel 顯示 — 純 display（§Flow #7）
- PIN input 前端過濾邏輯 — 純前端邏輯（§Flow #2）
- `$inc` 並發 race condition — property-test（§Flow #7）
- 由道具觸發的非對抗延遲選擇（入口差異）— 共用 `selectTargetItemAfterUse`（§Flow #6b）
- `_eventId` 去重（WS + PendingEvent）— 需精確時序控制（§Flow #8）
- Wizard form 初始化效能 — 非功能性（§Flow #4b）

---

## Fixture 反推結論

> **Phase 3 實作狀態**：✅ 已完成（下方為 Phase 2 原始規劃 + Phase 3 實作結果對照）
>
> 實作檔案：
> - `e2e/fixtures/index.ts` — 統一 Playwright custom fixtures（`resetDb` / `seed` / `dbQuery` / `asGm` / `asPlayer` / `asGmAndPlayer`）
> - `app/api/test/reset/route.ts` — DB 清空 + contest-tracker + event bus reset
> - `app/api/test/seed/route.ts` — 批次 seed（Mongoose model `.create()` 觸發 schema 驗證）
> - `app/api/test/db-query/route.ts` — DB 查詢（spec 斷言用）
> - `e2e/helpers/wait-for-toast.ts`
> - `e2e/helpers/wait-for-websocket-event.ts`
> - `e2e/helpers/wait-for-db-state.ts`
> - `lib/contest-tracker.ts` — 新增 `__testResetAll()`

### `seed-fixture` builder API shape ✅

Phase 2 規劃 → Phase 3 實作對照：

```
seed.gmUser({ email?, displayName? }) → { _id, ... }                           ✅ 預設 email='e2e-gm@test.com', displayName='E2E GM'
seed.game({ gmUserId, ...overrides }) → { _id, gameCode, ... }                 ✅ 自動遞增 gameCode (E2E001, E2E002, ...)
seed.character({ gameId, ...overrides }) → { _id, ... }                        ✅ 支援 stats/skills/items/任意欄位 overrides
seed.characterRuntime({ refId, gameId, ...overrides }) → { _id, ... }          ✅ Phase 2 未明列但 #9/#12 需要
seed.gameRuntime({ refId, gmUserId, ...overrides }) → { _id, ... }             ✅ Phase 2 未明列但 #9/#11 需要
seed.pendingEvent(overrides) → { _id, ... }                                     ✅ #8/#12 需要
seed.log(overrides) → { _id, ... }                                              ✅ 通用
```

鏈式 convenience：

```
seed.gmWithGame({ gmUserOverrides?, gameOverrides? }) → { gmUserId, gameId, gameCode }
seed.gmWithGameAndCharacter({ gmUserOverrides?, gameOverrides?, characterOverrides? }) → { gmUserId, gameId, gameCode, characterId }
```

**Phase 3 實作決策**：
- 便利方法的 overrides 拆為 `gmUserOverrides` / `gameOverrides` / `characterOverrides`，避免同名欄位（如 `name`）衝突
- `seed.game` 的 `isActive` 預設 `false`（取 Mongoose schema default），需要 `true` 時用 `gameOverrides: { isActive: true }`
- 所有 ID 回傳**字串格式**（ObjectId toString）
- 每個 seed 方法內部呼叫 `POST /api/test/seed`，由 Mongoose `.create()` 觸發 schema 驗證
- ObjectId 字串自動轉換：seed endpoint 內建 `convertObjectIds()`，`_id` 和 `*Id` 結尾的 24-char hex 自動轉為 ObjectId

### `auth-fixture` API ✅

```
asGm({ gmUserId, email? }) → 注入 iron-session GM cookie 到當前 context + page.reload()
asPlayer({ characterId, readOnly?: boolean }) → session.unlockedCharacterIds + addInitScript localStorage
  readOnly: false (預設) → session unlocked + localStorage unlocked + localStorage fullAccess (完整互動)
  readOnly: true         → session unlocked + localStorage unlocked only (預覽模式，不設 fullAccess)
asGmAndPlayer({ gmUserId, characterId, email?, readOnly? }) → 雙 context（回傳 { gmPage, playerPage, gmContext, playerContext }）
```

**Phase 3 實作決策**：
- `asGmAndPlayer` 用 `browser.newContext()` 建立兩個獨立 BrowserContext（各自有獨立 cookie/localStorage）
- teardown 自動關閉所有建立的 context，防止洩漏
- `asGm` 呼叫後自動 `page.reload()` 讓 session cookie 生效
- `asPlayer` 用 `page.addInitScript()` 確保 localStorage 在首次 navigation 前就設好

**Flow #6 確認**：✅ 使用 `browser.newContext()` 建立雙獨立 context
**Flow #2 確認**：✅ `readOnly:false` 三重設定（session + unlocked + fullAccess）
**預覽模式 `readOnly:true`**：✅ 僅設 session + unlocked，不設 fullAccess

### `wait-for-*` helpers 抽象層級 ✅

```
waitForToast(page, text, { timeout? })                                          ✅ e2e/helpers/wait-for-toast.ts
waitForWebSocketEvent(page, { event, channel?, filter?, timeout? })             ✅ e2e/helpers/wait-for-websocket-event.ts
waitForDbState(request, { collection, filter?, predicate?, timeout?, interval? }) ✅ e2e/helpers/wait-for-db-state.ts
waitForContestStage(context, stage: 'request' | 'result' | 'effect')           ⏳ Phase 4 實作 Flow #6 spec 時再加（thin wrapper over waitForWebSocketEvent）
```

**Phase 3 實作決策**：
- `waitForWebSocketEvent` 在 browser 端建立 `EventSource` 監聽 `/api/test/events` SSE stream
- ⚠️ 使用模式（防 race）：先 `const p = waitForWebSocketEvent(...)`，再觸發 action，最後 `await p`
- `waitForDbState` 用 polling（預設 200ms 間隔），超時 throw 並印出最近查詢結果
- `waitForToast` 基於 Sonner 的 `[data-sonner-toast]` DOM selector
- `waitForContestStage` 延後到 Phase 4 Flow #6 實作時新增，因為它只是 `waitForWebSocketEvent` 的 thin wrapper

### `db-fixture` reset 粒度 ✅

Phase 3 將三層 reset 合併為單一 `POST /api/test/reset`：

```
resetDb auto-fixture (每個 test 自動觸發):
  POST /api/test/reset →
    1. deleteMany({}) per collection（保留 index 結構，避免 dropDatabase 的 index 重建開銷）
    2. __testResetAll()（清 contest-tracker in-memory Map）
    3. getE2EBus().removeAllListeners()（清 E2E event bus stale listener）
    4. gameCodeCounter = 0（重設 fixture 側的 gameCode 遞增器）
```

**Phase 3 決策**：合併而非分成三個獨立 endpoint，因為 reset 三層是固定搭配，拆開只增加 HTTP round-trip 無實益。

### `/api/test/*` endpoint 清單（Phase 3 完成狀態）

```
POST /api/test/login           — ✅ Phase 1 已實作（iron-session GM/Player 注入）
POST /api/test/reset           — ✅ Phase 3 已實作（DB + contest-tracker + event bus 三合一）
POST /api/test/seed            — ✅ Phase 3 已實作（Mongoose model .create() 批次建立）
GET  /api/test/events          — ✅ Phase 1 已實作（SSE IPC for Pusher stub）
GET  /api/test/db-query        — ✅ Phase 3 已實作（collection allowlist + ObjectId 自動轉換）
GET  /api/test/session-dump    — ⏳ 可選，debug 時再加
```

**安全性**：所有 endpoint 頂端做 `if (process.env.E2E !== '1') return 404`。

---

## E2E Spec 撰寫規範（Phase 4 教訓總結）

> Phase 4 smoke spec 開發經歷 6 輪修正才收斂（Round 1 全滅 6/6）。以下是萃取出的根因與防範規則，**所有後續 Phase 的 spec 撰寫必須遵循**。

### 規則 1：Locator 選擇優先序

```
getByRole() > page.locator('scope').getByText() > getByText()
```

- **預設用 `getByRole()`**：`getByRole('heading', { name, level })`、`getByRole('button', { name })`、`getByRole('link', { name })` 等語義 selector 不受 DOM 副本影響
- **`getByText()` 只在確認唯一性後使用**：它匹配所有 text content 包含目標字串的元素（含父層累積文字），幾乎必然在複雜 UI 中碰到 strict mode violation
- **需要 `exact: true`**：當目標文字是其他文字的子字串時（如「資訊」vs「額外資訊」），必須加 `exact: true`
- **CSS selector 永遠限定 scope**：`page.locator('main .game-card')` 而非 `page.locator('.game-card')`，避免匹配到 RSC streaming 的隱藏 DOM 副本

**根因**：Playwright strict mode 會在 locator 匹配到 2+ 元素時直接 fail。`getByText` 是最寬鬆的 matcher，幾乎一定命中。Next.js App Router 的 RSC streaming 會在 hydration 過程中短暫保留隱藏 DOM 節點（不在 ARIA tree 中，但 CSS selector 能匹配），使問題更加不確定（flaky）。

### 規則 2：寫 seed data 前先讀 schema

在 `seed.character()` / `seed.game()` 等建立資料前，**必須先確認目標 model 的 required fields**：

- 讀 `lib/db/schemas/shared-schemas.ts` 確認 subdocument schema（stats、items、skills 等）
- 讀 `lib/db/models/` 下對應的 model 定義確認頂層 required fields
- 特別注意：`stats[].id`、`items[].id`、`skills[].id` 都是 `required: true`

**根因**：Mongoose `.create()` 會觸發 schema 驗證，缺少 required field 直接 reject，但錯誤訊息只說 "Seed failed (400)" 不直接指出是哪個欄位。

### 規則 3：寫 locator 前先讀目標元件

在用 `getByText('xxx')` 或 `locator('.class')` 之前，**必須先讀目標元件的原始碼確認**：

- 這段文字在 DOM 中出現幾次、出現在哪些元素上
- 是否有父元件（如 NavLink、Dialog）會把文字包在更大的 accessible name 中
- 元件是否在多處渲染同樣的文字（如 PinUnlock 顯示 characterName，CharacterCardView 也顯示）

**根因**：PinUnlock 元件會渲染 `characterName`，導致用角色名來斷言「CharacterCardView 未掛載」失敗。

### 規則 4：Fixture 涉及 cookie/session 時先驗證共享

`page.request`（與 page 共享 BrowserContext cookie）和 `request`（standalone APIRequestContext）是**完全隔離的**：

```typescript
// ❌ cookie 不共享：login 成功但 page 導航時仍未認證
asGm: async ({ request }, use) => {
  await request.post('/api/test/login', { data: { ... } });
};

// ✅ cookie 共享：page.request 和 page 同一個 BrowserContext
asGm: async ({ page }, use) => {
  await page.request.post('/api/test/login', { data: { ... } });
};
```

**根因**：Playwright 的 `request` fixture 是獨立的 HTTP client，不參與任何 BrowserContext 的 cookie jar。這在只測 API round-trip 的 infrastructure spec 中不會暴露，只有在 browser 導航時才會觸發。

### 規則 5：修一個 pattern、掃全部

每次修復一個 strict mode violation 或 locator 問題後，**立即 grep 整個 e2e/ 目錄找同類 pattern**：

```bash
# 修完一個 getByText strict mode 後
grep -r "getByText(" e2e/smoke/ --include="*.ts"
# 逐一確認每個 getByText 是否有同樣風險
```

**根因**：Phase 4 因為「只修當下失敗的那一行」而非「掃描同類問題」，導致同一類錯誤跨 3 輪才修完（Round 2 修 `'資訊'`，Round 4 才修 `'物品'`，兩者完全同源）。

### 規則 6：每寫完 1-2 個 test case 就跑一次

不要一口氣寫完所有 case 再跑。**增量驗證**能在第一個 case 就暴露架構層問題（cookie 隔離、schema 缺欄位），避免同類錯誤在所有 case 中重複出現。

### Next.js RSC Streaming 已知行為

Next.js App Router 使用 React Server Components streaming，Server 端先送出 HTML shell，再以 RSC payload 更新 DOM。在 hydration 過程中：

- 某些 DOM 節點可能短暫存在兩份（初始 HTML + hydrated 版本）
- 這些副本**不在 ARIA accessibility tree 中**（截圖和 `page.accessibility.snapshot()` 看不到）
- 但 **CSS selector 和 `getByText()` 能匹配到**
- 這是**間歇性的**（取決於 streaming 時序），導致 flaky test

**對策**：用 `getByRole()`（基於 ARIA tree，不受隱藏副本影響）或 scope 到 `main`/`aside` 等語義容器。
