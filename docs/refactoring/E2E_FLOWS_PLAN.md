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

## Flow #5 — Player 使用技能（flows 層）✅

> **完成**：6 個 test case 全部通過（2026-04-10）。Spec 檔：`e2e/flows/player-use-skill.spec.ts`。
>
> 完整規格與實作後修正見 [E2E_FLOW_5_PLAYER_USE_SKILL.md](./E2E_FLOW_5_PLAYER_USE_SKILL.md)。
>
> **對抗 (contest) 技能**刻意完全排除於 Flow #5，因 `skill-use.ts:237` 的提早 return 讓 effects 在 contest-respond 階段才執行——這條閉環拆至 Flow #6。**item_take / item_steal** 的 TargetItemSelectionDialog 延遲選擇拆至 Flow #7。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #5"` 與章節連結仍可定位。

---

## Flow #6 — 對抗檢定（flows 層，multi-context） ✅

> **⚠ 已拆出為獨立檔案**：Flow #6 的完整規格因涵蓋雙 browser context、三階段事件序列、多種勝負分支，體量龐大而拆成兩份姊妹檔：
> - [E2E_FLOW_6_CONTEST.md](./E2E_FLOW_6_CONTEST.md) — 主線 6 個 test case（happy path、技能防禦+combat tag、道具防禦+equipment 過濾、random_contest+both_fail、單選限制+互斥切換、隱匿標籤）
> - [E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md](./E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md) — 3 個 test case（#6b.1 item_take 對抗延遲、#6b.2 item_steal 對抗延遲、#6b.3 item_steal 非對抗延遲）
>
> 拆分理由：`item_take`/`item_steal` 的延遲物品選擇涉及額外的 `selectTargetItemForContest`（對抗）/ `selectTargetItemAfterUse`（非對抗）action 與 `TargetItemSelectionDialog`，與主線對抗流程的 `ContestResponseDialog` 解耦，分開維護可減少單一 spec 檔的爆炸面。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #6"` 與章節連結仍可定位。

---

## Flow #7 — 道具操作：use / equip / showcase / transfer（flows 層） ✅

> **⚠ 已拆出為獨立檔案**：Flow #7 的完整規格（6 個 test case）已移至 [E2E_FLOW_7_ITEM_OPERATIONS.md](./E2E_FLOW_7_ITEM_OPERATIONS.md)。
>
> 範圍從舊版的 3 子 flow（use/equip/showcase）擴充為 4 種操作 + 6 cases：consumable 使用（self/cross-target + random check）、equipment equip/unequip toggle + stat boost、showcase + receiver dialog、transfer + isTransferable + partial quantity、usage limit + cooldown + readOnly + error 拒絕。
>
> **實作完成**：6 個 test case 全數通過。實作過程中發現並修復 production bug（裝備轉移未 revert stat boosts）。
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #7"` 與章節連結仍可定位。

---

## Flow #8 — GM 廣播與單角色訊息（flows 層） ✅

> **⚠ 已拆出為獨立檔案**：
> - [E2E_FLOW_8_GM_BROADCAST.md](./E2E_FLOW_8_GM_BROADCAST.md) — 4 個 test case（#8.1 broadcast happy path、#8.2 character message + PendingEvent 反向驗證、#8.3 表單驗證 + 模式切換、#8.4 authorization guard）
>
> 本位置保留標題作為 anchor，讓 `grep "Flow #8"` 與章節連結仍可定位。
>
> **完成備註**：4 個 test case 全數通過。實作過程中修正 `convertObjectIds` 的 String ID 欄位誤轉問題（`targetGameId`/`targetCharacterId`）。

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

### Flow #11 — 預覽模式 baseline 讀取分流 ✅

> **完成**：4 個 test case 全部通過（2026-04-10）。Spec 檔：`e2e/flows/preview-mode.spec.ts`。
>
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

### 規則 7：`exact: true` 預設使用

所有 `getByRole('button', { name })` 和 `getByText()` **預設加 `exact: true`**，除非刻意需要部分匹配。

**根因**：頁面上常有命名層級關係的按鈕（header 的「編輯遊戲代碼」vs 卡片的「編輯」、header 的「刪除劇本」vs 卡片的「刪除」），部分匹配會命中多個元素觸發 strict mode violation。Flow #3 的 #3.4 在同一 test case 連續犯了「編輯」和「刪除」兩次，因為修完第一個沒掃第二個。

### 規則 8：Seed 嵌套結構前逐層檢查 required

Seed 含有 sub-document array 的欄位時（如 `presetEvents`、`actions`），必須逐層確認每一層的 required 欄位，特別是 `id` 欄位。

**根因**：Flow #3 的 #3.5 seed presetEvents 時遺漏了頂層 `id: { required: true }`，只注意到 action 的 `id`。Mongoose validation error 格式為 `Path 'xxx' is required`，不難診斷但完全可預防。

### 規則 9：`dbQuery` collection 名稱必須與 Mongoose `collection:` 定義一致

查詢 DB 時使用的 collection 名稱必須 grep `collection:` 確認實際值。不要憑直覺加 `s` 變複數。

**根因**：Mongoose model 定義 `collection: 'game_runtime'`（單數），但 db-query endpoint 的 allowlist 和 spec 都誤用了 `game_runtimes`（複數）。查不存在的 collection 永遠返回空陣列，不會報錯，難以察覺。

### 規則 10：`dbQuery` filter 的 `*Id` key 會被 auto-convert 為 ObjectId

db-query endpoint 的 `convertObjectIds` 會自動將 filter 中以 `Id` 結尾的 key（如 `targetCharacterId`、`targetGameId`）從 string 轉為 `ObjectId`。若目標 collection 的對應欄位是 `String` 類型（如 PendingEvent 的 `targetCharacterId`），轉換後的 `ObjectId` 查詢 `String` 欄位永遠不匹配。

**對策**：改用其他非 `*Id` 結尾的欄位查詢（如 `eventType`），或在 seed 時設定可辨識的唯一值作為 filter key。

### Next.js RSC Streaming 已知行為

Next.js App Router 使用 React Server Components streaming，Server 端先送出 HTML shell，再以 RSC payload 更新 DOM。在 hydration 過程中：

- 某些 DOM 節點可能短暫存在兩份（初始 HTML + hydrated 版本）
- 這些副本**不在 ARIA accessibility tree 中**（截圖和 `page.accessibility.snapshot()` 看不到）
- 但 **CSS selector 和 `getByText()` 能匹配到**
- 這是**間歇性的**（取決於 streaming 時序），導致 flaky test

**對策**：用 `getByRole()`（基於 ARIA tree，不受隱藏副本影響）或 scope 到 `main`/`aside` 等語義容器。

---

## E2E Spec 撰寫規範（Phase 5 教訓追加）

> Phase 5 Flow #4（GM Character CRUD，8 test cases）經歷多輪修正。以下是 Phase 4 未涵蓋的新增模式與規則。

### 規則 11：SaveBar Map handler stale closure — 必須用 `form.requestSubmit()` 繞過

**問題**：`useCharacterEditState` 用 `Map<string, SaveHandler>` 管理各 tab 的 save handler。Tab 內透過 `useEffect(() => { onRegisterSave?.(save) }, [save])` 註冊。`useEffect` 在 **paint 後非同步執行**，存在時間窗口：SaveBar 已 visible（dirty=true）但 Map 裡仍是舊 handler。Playwright 的自動化操作比人類點擊快，能命中這個 race window。

**觸發條件**：save → `router.refresh()` → component re-render → `save` 取得新 reference → `useEffect` 排隊 → Playwright 在此間隙 click SaveBar → Map 中的 handler 送出舊資料。

**影響範圍**：所有 tab 都有風險，但只在「save → refresh → 再操作 → 再 save」的流程中才會觸發。

**解法**：

| Tab 有 `<form>` wrapper | 解法 |
|---|---|
| ✅ BasicSettingsTab, BackgroundStoryTab, SecretsTab | `form.requestSubmit()` 繞過 Map，直接觸發 `handleSubmit → save()`，此路徑讀取當前 render 的 closure |
| ❌ TasksEditForm（用 `<>` fragment） | 重構測試邏輯，將多次操作合併為**單次 save**，避免中間 refresh 造成 stale closure |

```typescript
// ✅ 有 <form> 的 tab — requestSubmit 繞過 Map
const form = page.locator('[data-state="active"] form');
await form.evaluate(el => (el as HTMLFormElement).requestSubmit());

// ✅ 無 <form> 的 tab — 合併操作為單次 save
// 新增任務 A → 新增任務 B → 一次 saveAllBtn.click()（此刻 Map handler 尚未被 refresh 打亂）
```

### 規則 12：SaveBar aggregate toast 需用專屬片段匹配

SaveBar 的 `saveAll` 對每個 tab handler 傳入 `{ silent: true }` 抑制個別 tab 的 toast，最後統一顯示聚合 toast：「已儲存 N 個分頁的變更 (tab名1, tab名2)」。

**⚠️ Flow #10 修正**：原策略「`waitForToast(page, '已儲存')`」被證明不可靠。`'已儲存'` 同時匹配個別 tab toast（如 `'隱藏資訊已儲存'`）和聚合 toast，會在 saveAll 尚未完成時就提前通過，導致後續 DB 斷言失敗。

**對策**：
- SaveBar 聚合 toast：`waitForToast(page, '個分頁的變更')`（只出現在聚合 toast）
- 個別 tab toast：用完整 tab 名稱如 `'隱藏資訊已儲存'`、`'背景故事已儲存'`
- 通則：toast match text 必須在整個 codebase 中**唯一**匹配目標 toast，不可有歧義

### 規則 13：`router.refresh()` 後需等待 AnimatePresence 穩定

`router.refresh()` 觸發 Server Component 重新 fetch + 傳新 props 給 Client Component。若 UI 使用 Framer Motion `AnimatePresence`，exit/enter 動畫期間 DOM 元素會被 detach/recreate。在此期間 Playwright 的 `fill()` / `click()` 會因目標元素被 unmount 而 fail。

**對策**：在 `router.refresh()` 之後、下一步互動之前加 `await page.waitForTimeout(1000)`。目前出現在 #4.2（PIN 修改後）、#4.3（blocks 儲存後）、#4.4（secrets 儲存後）。

```typescript
// save 觸發 router.refresh() → AnimatePresence 動畫
await expect(saveAllBtn).not.toBeVisible({ timeout: 5000 });
// 等待動畫穩定後再操作
await page.waitForTimeout(1000);
```

**注意**：1000ms 是經驗值，足以涵蓋 Framer Motion 預設動畫時長。若未來有更快的 deterministic 信號可替代。

### 規則 14：條件渲染元素 — fill 前必須 waitFor visible

當 `setState` 觸發條件渲染（新元素才出現在 DOM），Playwright 的 `fill()` 可能在 React re-render 完成前就執行，導致 timeout。

```typescript
// ❌ 可能在 DOM 更新前就嘗試 fill
await addButton.click();
await page.getByPlaceholder('角色名稱').fill('路人甲');

// ✅ 先等條件渲染完成
await addButton.click();
await expect(page.getByPlaceholder('角色名稱')).toBeVisible({ timeout: 5000 });
await page.getByPlaceholder('角色名稱').fill('路人甲');
```

### 規則 15：`page.goto().catch()` 後的頁面狀態不可靠

`page.goto()` 觸發 beforeunload → dismiss → `catch()` 捕獲錯誤後，瀏覽器留在原頁面，但：

1. **導航狀態殘留**：後續的 `page.goto()` 或 `page.reload()` 可能觸發 `net::ERR_ABORTED` 或 `networkidle` timeout
2. **Map handler 可能 stale**：goto 過程中 React 的 cleanup/re-render 行為不確定
3. **`page.removeAllListeners('dialog')` 只移除 Playwright 側 listener**，不影響瀏覽器原生 beforeunload handler

**對策**：
- beforeunload 測試後，**不要再做 `page.goto()` 或 `page.reload()`**
- 需要儲存時用 `form.requestSubmit()` 繞過 Map handler
- 驗證用 DB 斷言（`dbQuery`）+ SaveBar 消失，不依賴導航

### 規則 16：Active game 角色需 seed `characterRuntime`

GM 編輯頁載入 active game 的角色時，`getCharacterData()` 會嘗試讀取 `characterRuntime`。若不存在：
- Server 端 `console.warn`（不影響功能，fallback 到 baseline）
- 但可能干擾 E2E 的 server log 分析

**對策**：seed active game 的角色時一併 seed `characterRuntime`：

```typescript
const gameB = await seed.game({ gmUserId, isActive: true });
const charB = await seed.character({ gameId: gameB._id, name: '角色名' });
await seed.characterRuntime({ refId: charB._id, gameId: gameB._id, name: '角色名' });
```

### 規則 17：Soft delete 持久化測試需區分 tab 類型

Soft delete（前端 `deletedIds` Set + `effectiveTasks/effectiveSecrets` useMemo filter）的**持久化驗證**需要 save 動作。但 save 受規則 11 的 Map handler stale closure 影響：

- **有 `<form>` 的 tab**（SecretsTab）：可用 `requestSubmit()` 驗證 soft delete 後 save → DB 反映刪除
- **無 `<form>` 的 tab**（TasksEditForm）：只驗證 soft delete 的 **UI 行為**（刪除 → 復原 → 狀態回復），持久化由有 `<form>` 的 tab 代為覆蓋

### 規則 18：`force: true` click 用於 SaveBar 遮蔽場景（有限制）

SaveBar（`fixed bottom z-50`）在 dirty 狀態出現後，可能遮蔽位於頁面底部的按鈕（如「新增關係」DashedAddButton）。

**對策**：`await button.click({ force: true })` 繞過 Playwright 的 visibility/stability/enabled 檢查。僅在確認按鈕確實存在但被遮蔽時使用。

**⚠️ Phase 6 修正 — `force: true` 的限制**：
- `force: true` **不跳過** attached 和 viewport 檢查 — 若元素被 AnimatePresence detach，`force: true` 一樣失敗
- `force: true` 在動畫元素上可能命中已 detach 的 DOM 節點，click event 發送到「空氣中」而靜默失敗
- **AnimatePresence 動畫元素**（如 StickySaveBar 進場中的按鈕）：改用 `page.waitForFunction() + page.evaluate()` 或 `page.evaluate(async)` + retry loop

### 規則 19：跨 Phase 必須等 toast 全部消失

Sonner toast 持續 ~4 秒。若 Phase A save 後的 `已儲存` toast 尚未消失，Phase B 的 `waitForToast('已儲存')` 會立刻誤匹配殘留 toast，導致 Phase B 的 save 尚未完成就往下執行斷言。

同時，E2E Pusher stub 不實作 `socket_id` 發送者排除，GM save 後觸發的 `role.updated` WebSocket 事件會被同一 browser 收到，可能觸發 `discardStatsAndRefresh()` 丟棄 dirty state。

**對策**：每次 save 後、下一個 Phase 操作前，等待 toast 全部消失：

```ts
await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });
```

這同時解決兩個問題：(1) 防止 stale toast 誤匹配、(2) 留出 role.updated 事件處理時間。

### 規則 20：`hasText` 不匹配 `<input value>`

Playwright `filter({ hasText })` 只匹配 DOM `textContent`，不匹配 `<input>` 的 `value` 屬性。當元件從 view mode（文字在 `<p>` 標籤）切換到 edit mode（文字搬進 `<input value>`）時，原本的 `hasText` 定位器會失效。

**對策**：view mode 和 edit mode 使用不同定位策略：
- View mode：`page.locator('div.bg-card').filter({ hasText: '生命值' })`
- Edit mode：`page.locator('div.bg-card').filter({ has: page.getByRole('button', { name: '完成編輯' }) })`

### 規則 21：Radix Select combobox 用 `filter({ hasText })` 定位

shadcn/ui Select 渲染的 `<button role="combobox">` 通常沒有 accessible name（`<label>` 未用 `htmlFor` 關聯）。`getByRole('combobox', { name })` 不可用。

**對策**：用 placeholder 或當前選中值的文字做 filter：

```ts
// 用 placeholder 定位未選擇的 combobox
await dialog.getByRole('combobox').filter({ hasText: '選擇數值' }).click();
// 用當前值定位已選擇的 combobox
await dialog.getByRole('combobox').filter({ hasText: '數值變更' }).click();
```

### 規則 22：Dialog heading 避免 sr-only 重複

shadcn/ui `DialogContent` 會同時產生 sr-only `<h2>` (DialogTitle) 和元件內部的可見 `<h1>`，兩者文字相同。`getByRole('heading', { name })` 在 strict mode 下會匹配兩個元素而失敗。

**對策**：用 `dialog.locator('h1', { hasText: '新增技能' })` 精確定位可見的 heading。

### 規則 23：Wizard「新增效果」後自動選取新效果

Wizard Step 4 點「新增效果」後，`selectedEffectIndex` 會自動更新到新效果，右側面板已切換。不需要手動點 sidebar 的效果按鈕。若嘗試用 `getByText('效果 2')` 點 sidebar，會因 sidebar button 子元素 + 面板 paragraph 兩處匹配而觸發 strict mode 失敗。

**對策**：用 `getByRole('paragraph').filter({ hasText: '效果 2' })` 確認面板已切換即可。

### 規則 24：`hasPinLock` 是 readOnly 的隱性前置條件

`useLocalStorageUnlock` hook 有 early return：`if (!hasPinLock) return { isUnlocked: true, fullAccess: true }`。沒有 PIN 鎖的角色永遠是 `fullAccess=true`，無論 localStorage 或 `asPlayer({ readOnly: true })` 怎麼設定。

**對策**：任何測試 readOnly 行為的 E2E（如 #5.5 預覽模式），seed 資料必須包含 `hasPinLock: true, pin: '...'`，且 character 和 characterRuntime 都要設。

### 規則 25：Spec doc 的 server-side error code 假設必須先驗證

Spec 設計階段容易假設 server action 有某個 guard check（如 `GAME_INACTIVE`），但很多 action 只做最基本的 session 驗證。假設錯誤時整個 test case 的 seed + 斷言邏輯都要重來。

**對策**：寫 E2E spec 中的 error/auth case 時，先 `grep 'ERROR_CODE_NAME'` 或讀 server action 原始碼確認 error code 存在，再設計測試步驟。

### 規則 26：`networkidle` 在 SSE 環境中永遠不可用

SSE EventSource 保持連線永遠不關閉，`page.waitForLoadState('networkidle')` 會永遠 timeout。這不只影響 `page.goto()` — `page.reload()` 也受影響。

**對策**：全面禁止使用 `networkidle`。Playwright 的 `page.goto()` / `page.reload()` 預設等待 `load` 事件已足夠，後續用 element locator 的隱式等待處理剩餘載入。

### 規則 27：成功操作不一定有 Sonner toast

部分 server action 成功後不顯示 Sonner toast，而是透過 WebSocket 發送通知到通知面板。例如 `skill-use.ts` 成功後只有 `notify.error()` 用於失敗，成功路徑無 toast。

**對策**：斷言操作成功時，優先用 dialog 關閉（`await expect(dialog).not.toBeVisible()`）或 WebSocket 事件作為 success indicator，不要預設有 toast。寫 spec 前先讀 hook 確認 notify 呼叫點。

### 規則 28：WS 事件需 `.payload` 取業務資料

`trigger()` 函數將 payload 包裝為 `BaseEvent { type, timestamp, payload }`。`waitForWebSocketEvent` 回傳的是 `BaseEvent`（即 `parsed.data`），不是內層的業務資料。

**對策**：`const wsRaw = await wsPromise; const wsEvent = wsRaw.payload;` — 永遠多取一層 `.payload`。

### 規則 29：`getByText` 預設 substring 匹配 — seed 命名衝突

Playwright `getByText('繳械')` 使用 **substring matching**，會同時匹配「繳械」（技能卡）和「繳械攻擊者」（角色名稱 banner）。`.first()` 不保證命中目標元素，靜默點錯位置後整條 test 連鎖失敗。

**對策**：
1. **一律用 `{ exact: true }`**：`page.getByText('繳械', { exact: true })`
2. **seed 命名規範**：角色名稱不可包含技能/道具名稱作為前綴或子字串（如「竊取者」✅ vs「竊取攻擊者」❌）
3. **優先用 `getByRole`**：`getByRole('button', { name: '使用技能' })` 比 `getByText` 更穩定

### 規則 30：`waitForWebSocketEvent` timeout 預算 — 重量級操作必須提前

`waitForWebSocketEvent` 建立 EventSource 後啟動固定 10s 計時器。若 listener 建立後才執行 `page.goto()`（5-8s 頁面載入），事件實際只有 2-5s 的窗口，容易 timeout。

**對策**：將 `page.goto()` 等重量級操作放在 `waitForWebSocketEvent` **之前**完成。listener 只應框住「UI 互動 → 事件抵達」的輕量區間：

```typescript
// ✅ 正確：先載入頁面，再建 listener，再操作
await page.goto(`/c/${charId}`);
await page.locator('button[aria-label*="通知"]').waitFor({ state: 'visible' });

const wsPromise = waitForWebSocketEvent(page, { event: 'skill.contest', ... });
await page.getByRole('button', { name: '使用技能' }).click();
const wsEvent = await wsPromise;

// ❌ 錯誤：listener 建立後才載入頁面，page load 消耗 timeout 預算
const wsPromise = waitForWebSocketEvent(page, { event: 'skill.contest', ... });
await page.goto(`/c/${charId}`);  // 5-8s 消耗在這裡
await page.getByRole('button', { name: '使用技能' }).click();
const wsEvent = await wsPromise;  // 剩餘時間不足 → timeout
```

### 規則 31：Radix Select / Dialog 內操作 — 用 `page.evaluate` 取代 Playwright locator

**問題**：Radix Select 的 dropdown 通過 Portal 渲染到 `<body>`，trigger 使用 `pointerdown`（mouse）/ `click`（touch）雙路徑開啟。在 Dialog 內使用時，React re-render + AnimatePresence 動畫導致元素持續 detach/reattach，使 Playwright 所有 locator 方法都不可靠：

| 嘗試方法 | 失敗原因 |
|----------|---------|
| `locator.click()` | actionability 檢查失敗（not stable / detached） |
| `locator.click({ force: true })` | 跳過 stable 但不跳過 attached，且可能 click 到已 detach 的 DOM |
| `locator.dispatchEvent('click')` | 仍等待 locator resolve，受 detach 影響 |
| keyboard（ArrowDown + Enter） | Enter 被 Dialog 攔截，觸發 confirm 按鈕 |
| `filter({ hasText })` 精確定位 | 不解決時序問題，且可能影響前序步驟 |

**對策**：在 Dialog 內操作 Radix Select 時，全程使用 `page.evaluate()` 直接操作 DOM：

```typescript
// ✅ 正確：page.evaluate 直接 DOM 操作
await page.evaluate(() => {
  const dialogEl = document.querySelector('[role="dialog"]');
  const triggers = dialogEl?.querySelectorAll('[data-slot="select-trigger"]');
  (triggers![1] as HTMLElement).click();
});

// ❌ 錯誤：任何 Playwright locator API
await dialog.getByText('選擇物品').click();  // timeout / detached
```

**例外**：Dialog 內的第一個 combobox（條件類型選擇器）如果在 re-render 穩定期之前操作，可用標準 `getByRole('combobox').click()`，因為此時 DOM 尚未進入不穩定狀態。

### 規則 32：TOCTOU 防護 — wait 與 click 必須在同一次 browser JS 執行中

**問題**：`waitForFunction()`（browser→Playwright IPC）和 `evaluate()`（Playwright→browser IPC）之間有數十毫秒的 IPC 間隙。React re-render 可在此間隙中移除目標元素。

```typescript
// ❌ TOCTOU 競爭：waitForFunction 確認 2 個 trigger，evaluate 執行時只剩 1 個
await page.waitForFunction(() => {
  const triggers = dialog?.querySelectorAll('[data-slot="select-trigger"]');
  return triggers && triggers.length >= 2;  // ← check
});
await page.evaluate(() => {
  const triggers = dialog!.querySelectorAll('[data-slot="select-trigger"]');
  (triggers[1] as HTMLElement).click();  // ← use（可能已 undefined）
});
```

**對策**：

- **非 toggle 操作**（option select、button click）：在 `waitForFunction` 內同時執行 find + click，只 return true 一次即停止 polling：

```typescript
await page.waitForFunction(() => {
  const btn = [...(dialogEl?.querySelectorAll('button') || [])]
    .find(b => b.textContent?.trim() === '添加');
  if (btn && !btn.disabled) {
    btn.click();
    return true;
  }
  return false;
}, { timeout: 5000 });
```

- **toggle 操作**（Select trigger 開/關 dropdown）：用 `page.evaluate(async)` + 手動 retry loop，保證只 click 一次。`waitForFunction` 的 polling 可能在 dropdown 開啟動畫期間再次觸發 callback，造成 toggle 關閉：

```typescript
await page.evaluate(async () => {
  for (let i = 0; i < 50; i++) {
    const triggers = dialogEl?.querySelectorAll('[data-slot="select-trigger"]');
    if (triggers && triggers.length >= 2) {
      (triggers[1] as HTMLElement).click();
      return;  // 只 click 一次，立即退出
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Item picker trigger not found after 5s');
});
```

### 規則 33：SaveBar「全部儲存」按鈕 — `page.evaluate` 取代 Playwright click

**問題**：StickySaveBar 使用 Framer Motion spring animation（`damping=25, stiffness=300`）進場。進場期間按鈕持續 detach/reattach，Playwright 的 `click()`、`click({ force: true })`、`scrollIntoViewIfNeeded()` 都會失敗。

**對策**：

```typescript
// ✅ 等待按鈕出現 + JS 直接 click
await page.waitForFunction(() => {
  return [...document.querySelectorAll('button')]
    .some(b => b.textContent?.includes('全部儲存'));
}, { timeout: 10000 });
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(b => b.textContent?.includes('全部儲存'));
  btn?.scrollIntoView({ block: 'center' });
  btn?.click();
});
```

搭配規則 12 的修正，save 後用 `waitForToast(page, '個分頁的變更')` 等待聚合 toast。

### 規則 34：E2E 失敗時 — 先判斷問題層級再動手

反覆失敗的主因往往是在錯誤的層級嘗試修復。Flow #10 的 #10.5 test 在「換 Playwright locator 選擇器」這一層級反覆嘗試了 5+ 次，但問題根因在時序層和 production code 層。

**決策樹**（失敗時依序判斷）：

1. **選擇器問題**（找不到元素）：看 page snapshot 確認元素是否存在、text/role 是否正確。最多試 2 次。
2. **時序/穩定性問題**（detached / not stable / outside viewport）：這不是選擇器問題，換選擇器無用。直接跳到 `page.evaluate()` 方案。
3. **Production code 問題**（UI 顯示正確但 DB 不對、狀態丟失）：檢查 stale closure、render-time sync。這需要修 production code，不是改 test。
4. **斷言匹配問題**（test 通過但驗證錯誤的東西）：檢查 toast text、locator 是否匹配到非預期元素。

**反模式清單**：
- ❌ 連續換 3+ 種不同的 locator 選擇器 → 停下來，問題可能不在選擇器
- ❌ 加 `force: true` 後仍失敗 → 問題在 DOM 層級，需 `page.evaluate`
- ❌ 加 `waitForTimeout` 後時好時壞 → 改用 `waitForFunction` 等待明確狀態
