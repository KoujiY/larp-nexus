# 下一階段開發規劃

> 本文件整理 Phase E 合併後的功能開發項目，所有項目在同一分支上依序開發。

## 分支與開發策略

所有項目在 `feat/minor_features_and_E2E` 分支上依序開發，每完成一個項目即 commit。

---

## 0. 已知問題修正 ✅

**目標**：修正目前已知的 UI 問題，隨本分支一併處理。

### 0-1. 劇本頁 / 角色列表空狀態 ✅ `5ca2b98`

- 統一空狀態 CTA 按鈕使用 `DashedAddButton` 樣式
- 為 `CreateGameButton` / `CreateCharacterButton` 新增 `empty-state` variant

### 0-2. 頁面 Loading 狀態 ✅ `d8e27e2`

- 新增 `NavLink` 元件：`useTransition` + `router.push` 提供即時導航回饋（解決點擊後畫面凍結）
- 新增 6 個 `loading.tsx`：5 個 skeleton + 1 個 spinner（profile）
- 新增 `PageLoadingSpinner` 共用元件

---

## 1. 角色標語欄位（Slogan） ✅

**目標**：為角色新增「標語」欄位，讓玩家在角色卡 Hero 區看到一句角色定位/扮演提示。

### 需求
- Character schema 新增 `slogan?: string` 欄位（非必填）
- GM 編輯頁面的「基本設定」分頁新增 slogan 輸入欄位
- 玩家角色卡 Hero 區：slogan 取代現有的 `description` 位置（角色名稱下方）
- Baseline / Runtime 均需同步

### 欄位定義釐清
- **`description`**（角色描述）：給其他人看的角色簡介，屬於公開資訊
- **`slogan`**（角色標語）：給玩家自己看的扮演提示，可能涉及角色真面目、隱藏動機等劇透內容，與「人格特質」同屬玩家視角的角色設定

### 影響範圍
- `types/character.ts`
- `lib/db/schemas/` — Character / CharacterRuntime schema
- `components/gm/character-edit-form.tsx` — 基本設定 tab
- `components/player/character-card-view.tsx` — Hero 區域（slogan 取代 description）
- `lib/character/field-updaters/` — 新增或擴充 basic-info updater

---

## 2. 圖片上傳系統 ✅

**目標**：建立統一的圖片上傳機制，整合前端壓縮，取代目前各處分散的圖片 URL 輸入。

### 前置修正
- `Skill.iconUrl` → `Skill.imageUrl`：統一所有實體的圖片欄位命名（11 檔案）
- 修正現有上傳 bug：前端送 `'file'`、後端收 `'image'`（form field 不一致）
- 移除過時的 `NEXT_PUBLIC_BLOB_TOKEN_CONFIGURED` 檢查

### 需求

#### 前端壓縮（Canvas API，零額外套件）
使用者選圖後，自動在瀏覽器端壓縮再上傳：

| 實體 | 最大尺寸 | 品質 | Blob 路徑 |
|------|---------|------|-----------|
| 角色圖片 | 1200×1200px | 0.85 | `characters/{id}/{ts}-{name}` |
| 道具圖片 | 600×600px | 0.80 | `items/{charId}/{itemId}/{ts}-{name}` |
| 技能圖片 | 600×600px | 0.80 | `skills/{charId}/{skillId}/{ts}-{name}` |
| GM 頭像 | 400×400px | 0.80 | `gm-avatars/{userId}/{ts}-{name}` |
| 劇本封面 | 1200×800px | 0.85 | `games/{gameId}/{ts}-{name}` |

#### 後端驗證
Server Action 不做壓縮，只驗證：檔案類型 `image/*`、大小上限 2MB。

#### 共用上傳元件
- 選圖 → 自動壓縮 → 預覽 → 上傳
- 支援傳入 `maxSize`、`quality`、`onUpload` callback

#### 新增 Schema 欄位
- `GMUser.avatarUrl`（新欄位）
- `Game.coverUrl`（新欄位）

#### 舊圖清理
上傳新圖時，使用 `del(oldUrl)` 刪除 Vercel Blob 上的舊圖，避免 orphan blobs。

### 影響範圍
- 新增 `lib/image/compress.ts` — 前端壓縮工具
- 新增 `lib/image/upload.ts` — 共用上傳 Server Action
- 重構 `components/gm/upload-character-image-button.tsx` → `components/shared/image-upload-dialog.tsx`
- `components/gm/ability-edit-wizard.tsx` — 道具/技能圖片
- `components/gm/game-info-tab.tsx` — 劇本封面
- `app/(gm)/profile/page.tsx` — GM 頭像
- `lib/db/schemas/shared-schemas.ts` — Skill `iconUrl` → `imageUrl`
- `lib/db/models/GMUser.ts` — 新增 `avatarUrl`
- `lib/db/schemas/game-schema.ts` — 新增 `coverUrl`（如有獨立 schema）
- `next.config.ts` — `images.remotePatterns` 允許 Vercel Blob 域名

### 技術考量
- Vercel Blob 免費方案：單檔 4.5MB、總儲存 500MB、月流量 1GB
- 前端壓縮後單圖約 100-500KB，足夠使用
- `@vercel/blob` 和 `sharp` 均已安裝，壓縮以前端為主、後端不做壓縮

---

## 3. 裝備系統擴充 ✅

**目標**：將現有的「道具」類型體系從 `消耗品 | 裝備` 擴充為 `消耗品 | 道具 | 裝備`，其中：
- **消耗品**（consumable）：維持現行行為，使用次數歸零後不可再使用
- **道具**（tool）：原本的「裝備」改名而來，保留原行為
- **裝備**（equipment）：全新類別，玩家可主動勾選啟用，啟用後持續生效

### 實作摘要
- Item `type` enum 擴充為 `consumable | tool | equipment`；新增 `equipped` / `statBoosts` 欄位與 `StatBoost` 介面（`target: value|maxValue|both`）
- `app/actions/item-equip.ts` — `toggleEquipment` server action，使用 arrayFilters + `$inc` delta 原子更新，並發安全（無 itemIndex TOCTOU、無 stats lost-write）
- `lib/item/apply-equipment-boosts.ts` — 提供 `buildEquipmentBoostUpdates`（legacy）與 `buildEquipmentBoostDeltas`（新 delta 流程）；卸除時採「最大值恢復規則」與時效性效果過期邏輯對齊
- `lib/utils/compute-effective-stats.ts` — 供玩家端 breakdown 顯示使用
- `components/player/equipment-effects-panel.tsx` / `item-detail-dialog.tsx`（穿戴裝備按鈕）/ `stats-display.tsx`（加成明細）
- `lib/websocket/events.ts` — 新增 `equipment.toggled` 事件
- 頂層大類「道具 → 物品」改名（避免與子類別 `tool` 名稱衝突），影響 event mapper 與通知文案

### 需求

#### Schema 變更
- Item type enum：`consumable | tool | equipment`
- Equipment 新增欄位：
  - `equipped: boolean` — 是否已裝備
  - `statBoosts: Array<{ statName: string; value: number }>` — 裝備提供的數值加成
- 資料遷移：現有 `equipment` type 改名為 `tool`

#### GM 側
- AbilityEditWizard 新增 equipment type 選項
- Equipment 編輯時可設定數值加成
- GM Dashboard 角色檢視中顯示裝備狀態

#### 玩家側
- 道具列表區分三種類型的視覺呈現
- Equipment 卡片新增「裝備/卸除」toggle
- 裝備時數值自動加成，卸除時自動移除
- 數值頁面顯示裝備加成的 breakdown

#### Runtime 邏輯
- 角色數值計算需考慮裝備加成
- 裝備狀態變更需觸發 WebSocket 事件通知 GM
- 裝備效果需與現有效果系統（時效性效果）共存

### 影響範圍
- `types/character.ts` — Item type 定義
- `lib/db/schemas/` — Item sub-schema
- `lib/item/` — 道具使用邏輯
- `app/actions/` — Server actions for equip/unequip
- `components/player/item-card.tsx` — 玩家道具卡
- `components/player/item-detail-dialog.tsx` — 道具詳情
- `components/gm/ability-edit-wizard.tsx` — GM 編輯
- `hooks/use-item-usage.ts` — 道具使用 hook
- WebSocket events — 新增 equip/unequip 事件

---

## 3.5. `_statsSync` 雙重訂閱根治

**目標**：把「`_statsSync` 旗標只服務單一出口」的隱藏耦合打散，避免未來新增 WebSocket 訂閱者時又踩到 sticky bar / 重複 toast / 偽 dirty state 的坑。

### 背景

`_statsSync: true` 原本只在 [lib/utils/event-mappers/role-events.ts](../../lib/utils/event-mappers/role-events.ts) 一處被檢查（用來抑制玩家端通知），所有 GM 端的 `role.updated` 訂閱者都直接讀 `payload.updates.items` / `stats`，沒人意識到該尊重這個旗標。

裝備系統（#3）是第一個同時 emit `stats` 與 `items` 並設定 `_statsSync` 的場景，因而把這個 fan-out 後遺症暴露出來：

| 訂閱者 | 觸發行為 | 副作用 |
|---|---|---|
| `character-websocket-listener.tsx` | `router.refresh()` + toast「道具列表已同步」 | 假冒「外部變更」通知 |
| `character-edit-tabs.tsx` | `router.refresh()` | 重複 refresh |
| `items-edit-form.tsx` | `setItems(payload)` | WS payload 與 RSC payload 序列化差異 → 偽 dirty → sticky bar |

當前修法只是在這三個訂閱者各自加上 `if (payload._statsSync) return`，是 hot-fix 而非根治。

### 需求

#### 核心原則
**`_statsSync: true` 的事件不應抵達 GM client listener** — 因為它的語意是「內部資料同步，不是 GM 觸發的編輯」。讓事件分發層在到達 client 之前就分流，比讓每個 listener 各自過濾更安全。

#### 設計選項（擇一）

**選項 A：Channel 區隔**
- 在 [lib/websocket/push-event-to-game.ts](../../lib/websocket/push-event-to-game.ts) 把 `_statsSync` 事件推到獨立 channel（例：`character-{id}-sync`）
- 玩家端訂閱主 channel 收通知；GM Console 同時訂閱主 + sync channel
- GM 角色編輯頁**只**訂閱 sync channel 並走 props refresh 路徑

**選項 B：統一 hook 預設過濾**
- 建立 `useRoleUpdated(handler, opts?)` hook 包裝 `useCharacterWebSocket`
- 預設過濾 `payload._statsSync === true`
- 想接收同步事件的呼叫端要顯式 `useRoleUpdated(handler, { includeSync: true })`
- 把現有三個訂閱者改用這個 hook

**建議**：先做選項 B（成本低、影響面小），選項 A 留給之後若 channel 數量需要進一步整理時。

#### 命名澄清
順手把 `_statsSync` 改成更精準的名稱（例如 `silentSync` 或 `internalSync`），目前底線開頭只是約定俗成，不是 TypeScript 私有欄位機制。

#### 文件補強
在 [docs/specs/04_WEBSOCKET_EVENTS.md](../specs/04_WEBSOCKET_EVENTS.md) 的 `role.updated` 一節明確標示 `_statsSync` 的語意與訂閱者責任，並把「新增 listener 時必須處理 `_statsSync`」寫入。

### 影響範圍
- `lib/websocket/push-event-to-game.ts` — 事件分發（若採選項 A）
- `hooks/use-websocket.ts` — 新增 `useRoleUpdated` wrapper（若採選項 B）
- `components/gm/character-websocket-listener.tsx`
- `components/gm/character-edit-tabs.tsx`
- `components/gm/items-edit-form.tsx`
- `components/gm/runtime-console-ws-listener.tsx` — 順便檢查是否有同樣問題
- `lib/item/item-effect-executor.ts` / `lib/skill/skill-effect-executor.ts` / `lib/effects/check-expired-effects.ts` / `app/actions/item-equip.ts` — 若改名 `_statsSync`，所有 emit 端跟著動
- `types/event.ts` — `RoleUpdatedEvent` 型別欄位
- `lib/utils/event-mappers/role-events.ts` — 既有的玩家端通知過濾
- `docs/specs/04_WEBSOCKET_EVENTS.md` — 規格更新

### 技術考量
- 需要做一輪「所有 WebSocket listener 對 `role.updated` 的處理」清查，避免漏改
- 既有測試應該大致涵蓋，但建議補一個 e2e 案例：玩家裝備切換時，GM 角色編輯頁不應出現 sticky bar 也不應出現外部變更 toast
- 此重構不改變對外行為（玩家通知、GM Console 顯示），只改變內部訊息流，回歸風險低

---

## 4. 目標選擇改進（自身效果）

**目標**：解決當前對抗檢定無法同時設定「影響對方」和「影響自己」效果的限制。

### 現況問題
目前技能設定對抗檢定後，效果目標只能是對方。無法實現「對抗成功後，除了扣對方血，同時補自己血」這類常見 RPG 技能。

### 需求
- 效果（Effect）新增 `target` 欄位：`opponent | self | both`
- 每個效果可獨立指定目標方向
- 對抗成功後，`opponent` 效果套用到對方，`self` 效果套用到自己
- GM 編輯界面需直覺地表達此設計

### 影響範圍
- `types/character.ts` — Effect type 定義
- `lib/db/schemas/` — Effect sub-schema
- `lib/contest/` — 對抗結算邏輯
- `lib/skill/` / `lib/item/` — 使用效果套用
- `components/gm/ability-edit-wizard.tsx` — 效果編輯步驟
- `app/actions/` — skill-usage / item-usage actions

### 技術考量
- 需向下相容：現有效果預設 `target: 'opponent'`（無 self 效果的行為不變）
- 資料遷移：為現有效果補上 `target: 'opponent'` 預設值
- 對抗失敗時 self 效果是否生效？建議預設不生效，但可設計為可配置

---

## 5. 預設事件系統（Preset Events） ✅

**目標**：讓 GM 在準備階段預先編排事件腳本，遊戲進行時從控制台一鍵觸發，減少即時操作壓力。

### 概念

GM 在劇本設計時，往往已經知道「遊戲進行到某個時間點，要推送什麼劇情、改變什麼數值」。目前這些操作必須在 Runtime 中即時手動執行（手動打廣播文案、手動調數值），容易遺漏或打錯。預設事件讓 GM 把這些操作預先寫好，遊戲中只需要按下「發送」。

### 需求

#### 事件結構
每個預設事件包含：
- **名稱**：GM 自用的識別名稱（如「第二幕開場」、「BOSS 登場」）
- **描述**（選填）：備忘用途
- **動作列表**（可多個，依序執行）：
  - **廣播通知**：向全體或指定角色推送訊息（標題 + 內容）
  - **數值變更**：修改指定角色的數值（如全體扣血、指定角色加魔力）
  - **揭露隱藏資訊**：揭露指定角色的特定隱藏資訊
  - **揭露隱藏任務**：揭露指定角色的特定隱藏任務

#### GM 側（Baseline — 編輯）
- 劇本管理新增「事件」分頁或區塊
- 事件編輯器：新增/編輯/刪除/排序預設事件
- 每個事件可新增多個動作，動作可排序
- 動作編輯時可選擇目標角色（支援「全體」和個別角色）

#### GM 側（Runtime — 執行）
- 控制台新增「預設事件」區域，列出所有未發送的事件
- 每個事件有「發送」按鈕，點擊後依序執行所有動作
- 已發送的事件標記為「已執行」，可選擇重複發送
- 發送前可預覽事件內容

#### 玩家側
- 無新 UI，玩家端透過現有機制接收效果（通知、數值變化、隱藏資訊揭露等）

### 影響範圍
- `types/game.ts` — 新增 PresetEvent type
- `lib/db/schemas/` — Game schema 新增 presetEvents 欄位
- `lib/db/models/Game.ts` / `GameRuntime.ts` — schema 更新
- `components/gm/` — 新增事件編輯元件、控制台事件列表
- `app/actions/` — 新增事件 CRUD actions、事件執行 action
- `lib/websocket/events.ts` — 可能新增事件執行相關的 WebSocket 通知

### 技術考量
- 預設事件存在 Game（Baseline）中，GameRuntime 複製一份並追蹤執行狀態
- 動作執行應複用現有 server actions（廣播、數值修改、揭露等），避免重複邏輯
- 事件執行需為原子操作：所有動作全部成功或全部回滾，避免部分執行的不一致狀態
- 數值變更動作需指定「絕對值」或「相對值」（+10 vs 設為 10）

---

## 5.5. 控制台 UI 微調

**目標**：E2E 測試建置前先修正控制台頁面的小問題，避免測試錄製後又因 UI 變更重錄。

### 需求

#### 5.5-1. 角色狀態卡片互動改為 click → Dialog
- **現況**：`components/gm/character-status-overview.tsx` 的角色狀態卡片使用 hover 效果展開詳情，在觸控裝置與 GM 大量卡片並排時體驗不佳
- **變更**：
  - 移除所有 hover 相關樣式（`:hover`、`group-hover` 等）
  - 整張卡片改為可點擊按鈕，點擊後開啟 Dialog 顯示完整狀態詳情
  - Dialog 樣式與既有 GM Dialog token（`GM_DIALOG_CONTENT_CLASS`）對齊
  - 考慮共用 `character-status-detail-dialog`（若 player 端已有類似元件，評估共用）

#### 5.5-2. 遊戲開始歷史事件追加 Game Code
- **現況**：控制台歷史事件顯示 `遊戲「{gameName}」已開始` / `已結束`，但 GM 同時管理多場遊戲時難以分辨
- **變更**：
  - `components/gm/event-log.tsx` 的 `game_start` / `game_end` 渲染追加 Game Code 顯示，例如「遊戲『XXX』（代碼：ABC123）已開始」
  - 確認事件 payload 是否已帶 `gameCode` 欄位；若沒有，需從 `lib/utils/event-mappers/` 對應的 mapper 補上
  - 若 payload 缺欄位，需回溯確認 server 端廣播事件時的欄位是否存在（見 `docs/specs/04_WEBSOCKET_EVENTS.md`）

### 影響範圍
- `components/gm/character-status-overview.tsx`
- 新增或擴充角色狀態詳情 Dialog 元件
- `components/gm/event-log.tsx`
- 可能涉及 `lib/utils/event-mappers/game-events.ts`、`types/event.ts`

### 技術考量
- 若角色狀態 Dialog 與 player 端現有元件差異僅在樣式 token，優先抽成共用元件；若業務邏輯差異大，不強求共用
- Game Code 欄位若要新增到 event payload，需評估是否為 breaking change（歷史事件能否回填）

---

## 6. E2E 測試

**目標**：建立端對端測試覆蓋關鍵使用者流程。

### 優先測試流程
1. **GM 登入** → Magic Link 流程
2. **劇本建立** → 填寫基本資訊 → 儲存
3. **角色建立** → 基本資訊 → 數值 → 技能/道具 → 儲存
4. **玩家解鎖** → PIN 輸入 → 預覽模式 / 完整模式
5. **技能使用** → 無檢定 / 隨機檢定
6. **對抗流程** → 攻擊方發起 → 防守方回應 → 結果通知
7. **道具操作** → 使用 / 展示 / 轉移
8. **廣播訊息** → GM 發送 → 玩家接收

### 技術選型
- **Playwright** 作為 E2E 測試框架
- 需建立測試用 seed 資料
- 考慮 WebSocket 事件的等待策略

### 影響範圍
- 新增 `e2e/` 目錄
- 新增 `playwright.config.ts`
- 新增 `package.json` scripts（`test:e2e`）
- 可能需要測試用 API routes 或 seed scripts

---

## 開發順序

| 順序 | 項目 | 規模 | 理由 |
|------|------|------|------|
| ~~1~~ | ~~#0-1 空狀態修正~~ | ~~小~~ | ✅ `5ca2b98` |
| ~~2~~ | ~~#0-2 Loading 狀態~~ | ~~小~~ | ✅ `d8e27e2` |
| ~~3~~ | ~~#1 角色標語（Slogan）~~ | ~~小~~ | ✅ |
| ~~4~~ | ~~#2 圖片上傳系統~~ | ~~中~~ | ✅ |
| ~~5~~ | ~~#5 預設事件系統~~ | ~~中~~ | ✅ |
| ~~6~~ | ~~#3 裝備系統擴充~~ | ~~大~~ | ✅ schema 變更 + 新遊戲機制 |
| 6.5 | #3.5 `_statsSync` 雙重訂閱根治 | 小 | 緊接 #3 暴露出的問題，目前為 per-listener hot-fix，待收尾 |
| 7 | #4 目標選擇改進 | 中 | 與 #3 共用效果系統，適合接續開發 |
| 7.5 | #5.5 控制台 UI 微調 | 小 | E2E 建置前先穩定 UI，避免重錄測試 |
| 8 | #6 E2E 測試建置 | 中 | 所有功能完成後統一測試 |

## 注意事項

- 合併前需確保：
  - TypeScript 無型別錯誤（`npm run type-check`）
  - 單元/元件測試全部通過（`npm run test`）
  - Production build 成功（`npm run build`）
  - 若涉及 schema 變更，需附帶 migration 腳本
- 裝備系統（#3）、目標選擇（#4）和預設事件（#5）涉及 schema 變更，合併時需同步執行資料遷移
