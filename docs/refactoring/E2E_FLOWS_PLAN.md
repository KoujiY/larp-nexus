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
- **每個 test 開始前** `db-fixture` 會呼叫 `/api/test/reset` 清空 DB
- **每個 test 開始前** `db-fixture` 也需清空 `lib/contest-tracker` 的 in-memory state（contest state **不進 DB**，是獨立 module-level 變數，會跨 test 污染）

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

上述 8 個 flows 規劃完成後，本節總結 fixture 與 helper 的設計需求。每條結論都標註來源 flow，寫 fixture 時要回頭驗證沒有遺漏。

### `seed-fixture` builder API shape

從 #3-#8 歸納出的最小 API：

```
seed.gmUser({ email?, displayName? }) → { gmUserId, email }
seed.game({ gmUserId, isActive?, gameCode?, randomContestMaxValue? }) → { gameId, gameCode }
seed.character({ gameId, name?, hasPinLock?, pin?, stats?, skills?, items? }) → { characterId }
```

鏈式 convenience：

```
seed.gmWithGame({ isActive? }) → { gmUserId, gameId }
seed.gmWithGameAndCharacter({ isActive?, characterOverrides? }) → { gmUserId, gameId, characterId }
```

**關鍵約束**：
- `seed.character` 必須支援塞 skills / items / stats 的 overrides（#5、#7 需要特定類型的 skill/item）
- `seed.game` 的 `isActive` 預設 `false`（呼應 `createGame` 預設行為），但 #5、#6、#7、#8 都需要 `true`
- 所有 ID 回傳**字串格式**（ObjectId toString），避免 test code 混用

### `auth-fixture` API

```
asGm({ gmUserId?, email? }) → 注入 iron-session GM cookie 到當前 context
asPlayer({ characterId, readOnly?: boolean }) → 同時設 session.unlockedCharacterIds + addInitScript localStorage
  readOnly: false (預設) → session unlocked + localStorage unlocked + localStorage fullAccess (完整互動)
  readOnly: true         → session unlocked + localStorage unlocked only (預覽模式，不設 fullAccess)
asGmAndPlayer(...) → 雙 context 時的 convenience（回傳 { gmPage, playerPage }）
```

**Flow #6 確認**：需要 `browser.newContext()` 建立雙獨立 context，`asPlayer()` 必須可分別套用到不同 context。不能用單一 context 切換 page。

**Flow #2 確認**：`asPlayer()` 必須**雙重繞過**（full-access 模式，`readOnly:false`）：
- 設 `session.unlockedCharacterIds` 陣列（繞過 server-side 授權）
- `page.addInitScript` 預先塞 `localStorage['character-{id}-unlocked'] = 'true'`（繞過 client-side UI 閘門）
- `page.addInitScript` 預先塞 `localStorage['character-{id}-fullAccess'] = 'true'`（解除唯讀）
- 只設 session 不設 localStorage → 瀏覽器進 `/c/{id}` 仍會看到 PIN 畫面
- 只設 localStorage 不設 session → UI 進得去但 server action 被拒

**預覽模式 `readOnly:true` 規格**（來源：§Flow #2 E6/K1 橫切延伸，服務於「待評估新 Flow — 預覽模式 baseline 讀取分流」）：
- 僅塞 session `unlockedCharacterIds` + `localStorage['character-{id}-unlocked'] = 'true'`
- **不**塞 `fullAccess` localStorage key → `storageFullAccess=false` → `isReadOnly=true`
- 此模式下 `character-card-view.tsx:95` 會讀 `character.baselineData`，需前置 `game.isActive:true` 才能使 `getPublicCharacter` 填入 `baselineData`
- Flow #5/#6/#7/#8 **不使用**此模式（它們測完整互動），僅「預覽模式 display 分流」flow 使用
- Flow #2 本身**不使用**此 API（Flow #2 走真實 PIN input 流，不走 fixture 繞過）

### `wait-for-*` helpers 抽象層級

從各 flow 的等待點歸納：

```
waitForToast(page, text) — UI 層（所有 flows）
waitForWebSocketEvent({ channel, event, subType?, filter?, timeout? }) — #5/#6/#7/#8
waitForDbState({ query, timeout }) — #3/#4/#8（PendingEvent）
waitForContestStage(context, stage: 'request' | 'result' | 'effect') — #6 專用 wrapper
```

**設計原則**：
- `waitForWebSocketEvent` 回傳**已收到的 event payload**，讓後續斷言可以直接 assert payload 欄位
- 必須支援「從某個時間點後」的事件匹配，避免抓到前一個 test 遺留的 event
- `waitForDbState` 需有合理 timeout（預設 5 秒），超時 fail 並印出最近一次 query 結果

### `db-fixture` reset 粒度

從 #6 contest-tracker 踩雷學到的教訓：

```
dbFixture.beforeEach:
  1. POST /api/test/reset → 清 DB collections
  2. POST /api/test/contest-tracker-reset → 清 lib/contest-tracker in-memory state
  3. (可選) POST /api/test/cache-reset → 清 next/cache（若 revalidate 行為影響測試）
```

`/api/test/contest-tracker-reset` 需要在 `lib/contest-tracker` 新增 `__testResetAll()` function 才能呼叫（Phase 3 的 task）。

**不需要**清 localStorage — Playwright 的 `context.clearCookies()` + `page.evaluate(() => localStorage.clear())` 會在 `beforeEach` 自動跑，或透過 `context()` 每次重建達成。

### `/api/test/*` endpoint 清單

支撐 fixture 所需的 test-only API（只在 `E2E === '1'` 啟用）：

```
POST /api/test/login           — 寫 iron-session cookie（已在 Phase 1 實作）
POST /api/test/reset           — drop collections（已在 Phase 1 實作）
POST /api/test/contest-tracker-reset — 新增，#6 依賴
POST /api/test/seed            — batch seed helper（可選，node-side fixture 也可直接呼叫 Mongoose）
GET  /api/test/events          — SSE IPC for WebSocket event collector（已在 Phase 1 實作）
GET  /api/test/db-query?collection=xxx&filter=yyy — 斷言用的 DB read helper
GET  /api/test/session-dump    — （可選）debug 時 dump 當前 session
```

**安全性檢查**：所有 endpoint 必須在檔案頂端做 `if (process.env.E2E !== '1') return NextResponse.json({}, { status: 404 })`，不可有例外。
