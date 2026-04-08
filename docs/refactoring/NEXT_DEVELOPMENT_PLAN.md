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

## 3.5. `silentSync` 雙重訂閱根治 ✅

**目標**：把「`_statsSync` 旗標只服務單一出口」的隱藏耦合打散，避免未來新增 WebSocket 訂閱者時又踩到 sticky bar / 重複 toast / 偽 dirty state 的坑。

### 實作摘要
- 旗標重新命名 `_statsSync` → `silentSync`（語意更精準，且擺脫 TypeScript 的下底線約定誤導）
- 新增 `useRoleUpdated(characterId, handler, { includeSilentSync? })` hook（[hooks/use-websocket.ts](../../hooks/use-websocket.ts)）：
  - 預設過濾 `payload.silentSync === true` 的事件
  - 想接收同步事件的呼叫端要顯式 `includeSilentSync: true`
- 三個 GM listener 全部遷移：
  - `character-websocket-listener.tsx` → 預設過濾（移除 hot-fix）
  - `items-edit-form.tsx` → 預設過濾（移除 hot-fix）
  - `character-edit-tabs.tsx` → `includeSilentSync: true`（**它就是統一處理 silentSync 的單一入口**）
- 玩家端 mapper（`mapRoleUpdated`）跟著改名 `silentSync`
- emit 端跟著改名：`item-equip.ts` / `check-expired-effects.ts` / `item-effect-executor.ts` / `skill-effect-executor.ts`
- `runtime-console-ws-listener.tsx` 不動 — 它直接用原生 Pusher，**刻意**接收 silentSync 來做增量 stats / items 更新
- WebSocket 規格文件補上 silentSync 旗標的訂閱者責任表

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

### 驗收輪次補丁（2026-04-08）

§3.5 主體合併後，使用者多輪驗收陸續發現以下問題並依序修復／立案：

#### Issue 1 — 物品轉移重複 toast ✅
**症狀**：玩家轉移物品時 GM 端出現兩個一樣的「物品已轉移」toast。
**根因**：[components/gm/character-websocket-listener.tsx](../../components/gm/character-websocket-listener.tsx) 與 [character-edit-tabs.tsx](../../components/gm/character-edit-tabs.tsx) 同時訂閱 `item.transferred`，各自跳一個 toast。
**修法**：刪除 `character-websocket-listener.tsx`，由 `character-edit-tabs.tsx` 作為角色編輯頁的**單一 WS 訂閱入口**統一處理 toast 與 refresh。同步從 [page.tsx](<../../app/(gm)/games/[gameId]/characters/[characterId]/page.tsx>) 移除元件掛載點。

#### Issue 2 / 4 — 物品轉移與 GM 暫存衝突 ✅
**症狀**：GM 編輯物品 X 時玩家把 X 轉給 B，GM 按儲存後 A、B 兩端會同時擁有 X（陣列覆寫造成的副本）。
**設計決策**：採「玩家動作 trump GM 暫存」策略 — Runtime 期間 GM 物品操作風險高（整個 items 陣列覆寫），讓玩家動作主動取消 GM 的未儲存編輯比讓 GM 編輯落地更安全。
**修法**：
- [hooks/use-character-edit-state.ts](../../hooks/use-character-edit-state.ts) 新增 `discardOne(tabKey)` API，可單一 Tab 捨棄而不誤殺其他 Tab 的編輯
- [character-edit-tabs.tsx](../../components/gm/character-edit-tabs.tsx) 收到 `item.transferred` 時若 items Tab dirty → `discardOne('items')` + warning toast「未儲存的物品變更已取消」+ info toast「物品已轉移」
- 中間曾嘗試「Route 2：跨角色 itemId 重定向」（`lib/character/relocate-items.ts`），但後續決議放棄並 revert（理由：Runtime 期間 GM 不應頻繁編輯物品狀態，「玩家動作優先」是更安全的 default）

#### Issue 3 — Runtime 控制台裝備數值不同步 ✅
**症狀**：玩家穿/卸裝備後，Runtime 控制台 (`/games/[gameId]/console`) 角色數值卡片不更新（歷史訊息正常）。
**根因**：[runtime-console-ws-listener.tsx](../../components/gm/runtime-console-ws-listener.tsx) 處理 `equipment.toggled` 時只更新 items 旗標，依賴平行抵達的 `role.updated` 帶 stats — 但抵達順序與序列化差異讓 stats 不一致。
**修法**：用 [`buildEquipmentBoostDeltas`](../../lib/item/apply-equipment-boosts.ts) 讓 `equipment.toggled` 自洽計算 stat delta，不再依賴平行 `role.updated`。

### 已知延伸 bug（追蹤至下一階段）

驗收最後發現兩個延伸 bug，本質上是 §3.5 設計取捨的「另一面」，**不在 §3.5 原 scope 內**，立案待下一階段架構解耦處理：

#### Bug A — 數值頁顯示元件 dirty 時無法同步外部變化 🟡 待解
**症狀**：GM 任一 Tab 進入 dirty → 切到數值 Tab → 玩家穿戴裝備
- ❌ `EquipmentEffectsPanel` 不更新（不顯示新裝備效果）
- ❌ `StatsEditForm` 的 effective stat 顯示不更新（不反映 statBoost）
- ✅ `TemporaryEffectsCard` 因為自己訂閱 WS + 獨立 server action fetch，可正常更新

**根因**：`StatsEditForm` 與 `EquipmentEffectsPanel` 是純 props-driven，依賴父層 `router.refresh()` 注入新 `items`/`initialStats`。`refreshIfNotDirty` 為了保護 GM 編輯而 block 了 refresh，display 與 edit 共用同一條管線就出現衝突。

**處理方向**：下一階段以「**display widget 自治化**」收斂 — 仿照 [runtime-console-ws-listener.tsx](../../components/gm/runtime-console-ws-listener.tsx) 的 delta-patch 模式，讓 `StatsEditForm` / `EquipmentEffectsPanel` 自己訂閱 `equipment.toggled` / `character.affected` / `effect.expired` 並在本地 patch state，徹底脫離 `router.refresh` 路徑。需先回答的設計問題：「GM 正在編輯 HP=50 時玩家扣 HP 10，UI 該顯示 50 / 40 / 兩者並陳？」

#### Bug B — 時效性技能 bypass `refreshIfNotDirty` ❌ 無法重現
**初次觀察症狀**：與 Bug A 同樣的初始狀態（dirty + 切到數值 Tab），玩家用「扣 HP」時效性技能 → HP 數字疑似會變動 + items dirty 被清除。當時推論違反了 `refreshIfNotDirty` 的設計。

**診斷結論（2026-04-08）**：在 [character-edit-tabs.tsx](../../components/gm/character-edit-tabs.tsx) 與 [stats-edit-form.tsx](../../components/gm/stats-edit-form.tsx) 加入 `[DIAG-§3.5]` 插樁後，請使用者重現兩次：
- 第一次 log：`refreshIfNotDirty` 兩次都正確回報 `willRefresh: false`，沒有第三條暗管事件出現
- 第二次 log（重開 dev 後）：`StatsEditForm` 的 `initialStats reset` 邊界探針**完全沒觸發**；使用者也確認 HP 數字**沒有變動**、sticky bar 也**沒有被清除**

**判定**：Bug B 為一次性的鬼影 bug — 可能是首次觀察時剛好遇到 `dirty state 設定` 與 `WS 事件抵達` 之間的瞬時 race condition（事件早於 dirty state commit），但無法穩定重現，**不視為穩定 bug**。當前 `refreshIfNotDirty` 在所有可重現場景下都正確擋下覆寫。

**保留作為未來監測點**：若日後再出現偶發清除，第一個懷疑方向應為「`useFormGuard` 寫入 dirty state 與 `useCharacterWebSocket` handler 觸發的時序競爭」，可考慮 `flushSync` 或 sequence number；但目前不主動修。

**設計哲學一致性**：Bug A（穩定可重現）是 §3.5-followup-1 的處理對象 — 最終採「stats 範圍 discardOne」策略，讓玩家動作 trump GM 暫存，並在卡片上加「裝備中」badge 降低 drop 後的認知成本。

### 後續追蹤項目（搬到下一階段）

| 編號 | 名稱 | 來源 | 預期動作 |
|---|---|---|---|
| **§3.5-followup-1** | Stats 玩家動作優先 | Bug A（穩定 bug） | ✅ 已於 2026-04-08 完成。改採「stats 範圍 discardOne」策略：character-edit-tabs 對 stats-affecting 事件（equipment.toggled / character.affected / effect.expired / skill.used / role.updated silentSync）主動 discardOne('stats') + toast 告知，玩家動作 trump GM 暫存；items 維持守門（dirty 時不覆蓋）。同步在 AbilityCard 加「裝備中」badge，避免 drop 後 GM 困惑。**範圍限定 stats**，secrets / tasks / skills 影響較低，未來再擴充。 |
| **§3.5-followup-2** | Bug B race monitor | Bug B（鬼影） | 保留作為 dirty + WS race 的監測點；若再出現偶發清除，從 `useFormGuard` 與 `useCharacterWebSocket` 的時序競爭著手 |
| **§3.5-followup-3** | 撤掉 [DIAG-§3.5] 插樁 | 診斷收尾 | ✅ 已於 2026-04-08 完成，所有 console.log 已清除 |
| **§3.5-followup-4** | Display widget 自治化（原 followup-1 備案） | 架構升級 | StatsEditForm / EquipmentEffectsPanel 訂閱 WS + delta patch，仿 runtime-console-ws-listener 模式。當前 discardOne 策略已解決 Bug A，此方案保留作為未來若要消除「drop 掉 GM 編輯」的 UX 摩擦時的升級路徑。 |

---

## 4. 目標選擇改進（自身效果）

**目標**：解決當前對抗檢定無法同時設定「影響對方」和「影響自己」效果的限制；同時重構效果執行路徑，讓同一張技能/道具的多個效果能獨立決定作用對象。

### 現況盤點（2026-04-08 縱向分析）

資料層其實**已經有** `effect.targetType: 'self' | 'other' | 'any'` 欄位，UI 也有「自己 / 對方 / 任意」三選項（[ability-edit-wizard.tsx:1009–1035](../../components/gm/ability-edit-wizard.tsx#L1009-L1035)）。真正的問題分散在四個地方：

1. **GM Wizard 對對抗模式的硬性封鎖**（[ability-edit-wizard.tsx:1001, 1017, 1021](../../components/gm/ability-edit-wizard.tsx#L1001)）
   - `isContestType` 時強制把顯示覆寫成 `'other'`、disable self/any 按鈕、mass-update 所有效果為 `'other'`
   - 後果：GM 根本沒有入口設計「對抗成功 → 扣對方血 + 補自己血」

2. **對抗執行器完全不讀 per-effect `targetType`**（[contest-effect-executor.ts:96](../../lib/contest/contest-effect-executor.ts#L96)）
   - 單點決定 `effectTarget = contestResult === 'defender_wins' ? attacker : defender`
   - 整個 effects 陣列一視同仁套到同一角色身上

3. **非對抗執行器也是單一目標假設**（[skill-effect-executor.ts:66–67](../../lib/skill/skill-effect-executor.ts#L66)、[item-effect-executor.ts](../../lib/item/item-effect-executor.ts)）
   - `effectTarget = targetCharacter || character`，for 迴圈內完全不讀 `effect.targetType`

4. **動作層驗證只看第一個 `requiresTarget` 效果的 targetType**（[skill-use.ts:112–131](../../app/actions/skill-use.ts#L112)、item-use.ts:182–191）
   - 整個 effects 陣列共用一個 `targetCharacterId`，無法表達「效果 1 打對方、效果 2 補自己」

5. **玩家端下拉單 target 假設**（[use-target-options.ts:54](../../hooks/use-target-options.ts#L54)）
   - `shouldIncludeSelf = targetType === 'any'` — 整張技能/道具用單一 `targetType` 決定下拉內容

### 設計決議

#### 決議 A：玩家端維持「單一目標選擇」原則
玩家端下拉 UI 只能有一種模式（包含自己 vs 不含自己），因此引入 **effects 陣列內 `other` 與 `any` 互斥** 的規則。`self` 永遠可與任何組合並存（self 不需要下拉）。

#### 決議 B：對抗模式拿掉「任意」選項
對抗模式下對抗對象早已由 contest 機制鎖定，`any` 變成冗餘語意。簡化為只允許 `self / other` 兩選項。

#### 決議 C：per-effect 分派，不引入新欄位
直接讓執行器與動作層正確讀取既有的 `targetType`，不新增 `target: 'opponent' | 'self' | 'both'` 欄位（較早提案已作廢）。

### Wizard 效果設計的兩條規則

| 規則 | 觸發條件 | UI 行為 | 提示文字 |
|------|---------|--------|---------|
| **規則 1：檢定類型限制** | `checkType === 'contest' \|\| 'random_contest'` | 「任意」按鈕 disabled；self / other 都可選 | `text-muted-foreground`：「對抗檢定類型只能選擇「自己」或「對方」作為目標」 |
| **規則 2：目標衝突限制** | 該效果切換到的 scope 與**其他效果**已選的 scope 形成 other↔any 衝突 | 衝突的 scope 按鈕 disabled | `text-destructive`（紅色）：「「對方」與「任意」不可並存於同一張卡片的效果中」，僅在實際衝突時顯示，追加在規則 1 文字後方 |

兩條規則在對抗模式下互相相容：規則 1 已擋掉 any，規則 2 的「other disable」條件（別的效果是 any）永遠不會觸發。

### 需求細項

#### 4-1. Wizard UI 重構（[ability-edit-wizard.tsx](../../components/gm/ability-edit-wizard.tsx)）
- `WizardEffectPanel` 新增 `allEffects` prop，計算 `hasOtherElsewhere` / `hasAnyElsewhere`
- 移除 `restrictedTargetType` 顯示層覆寫，`isSelected` 直接讀真實 `effect.targetType`
- 重寫 `targetScopeControl` 的 disable 與 onClick 邏輯（規則 1 + 規則 2）
- 既有提示文字更新為「只能選擇「自己」或「對方」」
- 新增紅色互斥提示（條件顯示）
- **預設值修正 1**：新增 effect 預設 `targetType: 'self', requiresTarget: false`（永遠合法），不再因 `isContestType` 而硬寫 `'other'`
- **預設值修正 2**：切換 checkType 到對抗時，mass-update 改為「僅把 `'any'` 降級為 `'other'`」，保留原本的 self / other
- **預設值修正 3**：`handleEffectTypeChange` 不再硬寫 `targetType: 'other'`，保留舊值並在與互斥規則衝突時降級為 `'self'`

#### 4-2. 對抗執行器 per-effect 分派（[contest-effect-executor.ts](../../lib/contest/contest-effect-executor.ts)）
- 移除 L96 的單點 `effectTarget` 賦值
- 在效果迴圈內逐個判斷：
  - `targetType === 'self'` → 作用於「使用技能/道具的角色」（attacker，無論 contest 勝負）
  - `targetType === 'other'` → 維持原本的勝負反轉邏輯（`defender_wins ? attacker : defender`）
  - `targetType === 'any'` → 對抗模式下不會出現（規則 1 已擋），若歷史資料有殘留則視同 `'other'` 處理
- 跨角色寫入的 `targetStatUpdates` 需改為針對「本效果的目標」而非全域共用

#### 4-3. 非對抗執行器 per-effect 分派（[skill-effect-executor.ts](../../lib/skill/skill-effect-executor.ts)、[item-effect-executor.ts](../../lib/item/item-effect-executor.ts)）
- for 迴圈內逐效果判斷 `effectTarget`：
  - `targetType === 'self'` → `character`（呼叫者）
  - `targetType === 'other' || 'any'` → `targetCharacter`（玩家下拉選的對象）
- `statUpdates` / `crossCharacterChanges` / WebSocket 事件都需要按「本效果的實際目標」發送，self 效果不應觸發 `isAffectingOthers` 分支
- 因互斥規則保證 other/any 不共存，`targetCharacter` 的解析仍可在函數入口一次完成

#### 4-4. 動作層驗證重寫（[skill-use.ts](../../app/actions/skill-use.ts)、[item-use.ts](../../app/actions/item-use.ts)）
- 從 effects 陣列推導「是否需要下拉選目標」：若有任一效果 `targetType` 屬於 `other | any` → 需要；全部 self → 不需要
- 驗證邏輯改為：若需要目標卻沒給 → `TARGET_REQUIRED`；若目標模式是 `other` 卻選到自己 → `INVALID_TARGET`；`self` 效果則忽略 `targetCharacterId` 不做匹配
- 因互斥規則，推導出的「有效 targetType」最多只有一種（other 或 any），保持單一驗證路徑

#### 4-5. 玩家端下拉推導（[use-target-options.ts](../../hooks/use-target-options.ts)、[use-target-selection.ts](../../hooks/use-target-selection.ts)）
- 改為從 effects 陣列推導「有效 targetType」，而非依賴單一 prop
- 推導邏輯：若含 `any` → `'any'`；若含 `other` → `'other'`；若全是 self → `undefined`（不顯示下拉）

### 影響範圍
- `components/gm/ability-edit-wizard.tsx` — UI 規則 + 預設值修正
- `lib/contest/contest-effect-executor.ts` — per-effect 分派
- `lib/skill/skill-effect-executor.ts` — per-effect 分派
- `lib/item/item-effect-executor.ts` — per-effect 分派
- `app/actions/skill-use.ts` / `app/actions/item-use.ts` — 動作層驗證重寫
- `hooks/use-target-options.ts` / `hooks/use-target-selection.ts` — 下拉推導
- `lib/character/__tests__/field-updaters-items-skills.test.ts` — 可能需補測試

### 技術考量
- **無 schema 變更**：`targetType` 欄位早已存在於 `types/character.ts`、`lib/db/schemas/shared-schemas.ts`，不需要資料遷移
- **向下相容**：既有角色卡的 effects 大多是 `targetType: 'other'`（wizard 對抗模式強寫的結果），執行器 per-effect 分派後行為完全不變
- **對抗失敗時 self 效果是否生效**：維持 Phase 7.6 邏輯 — 對抗執行完後，無論勝負都會跑一次效果迴圈，self 效果永遠作用於使用者，other 效果套用勝負反轉。這樣「對抗失敗 → self 補血也生效」是預設行為（設計上等同「使用技能就回血，不管打不打得過對方」），如果未來要做「對抗成功才觸發 self 效果」需另起議題
- **互斥規則的檢查一致性**：Wizard UI 僅在 GM 編輯當下即時計算，不落地到資料層做 invariant。因此若歷史資料（或直接改 DB）出現 other+any 並存，玩家端 `use-target-options` 的推導邏輯優先採 `'any'`（較寬鬆的選單），避免執行時報錯
- **測試重點**：對抗模式下混合 self/other 效果的勝負兩條路徑；非對抗模式下混合 self/other 且玩家選其他角色的情境；互斥規則的 UI 按鈕 disable 狀態

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

## 5.6. Lint 問題統一清理

**目標**：將 E2E 建置前 lint 掃描發現的所有 errors 與 warnings 集中在一個工作項目處理。共 **5 errors + 17 warnings**，分為五個子項目：React 19 新規則錯誤（需重構）、GM 控制台 unused、玩家端死碼、散落 unused、eslint config 調整。

### 需求

#### 5.6-1. React 19 `set-state-in-effect` 錯誤重構（5 errors）

**背景**：`react-hooks/set-state-in-effect` 是 React 19 eslint-plugin 新加的規則，專門抓「同步 setState 在 effect 裡」會造成 cascading render 的模式。**不能用 `eslint-disable` 掩蓋**，需 case-by-case 重構。

| # | 檔案 | 行號 | 推測用途 |
|---|---|---|---|
| 1 | `components/gm/navigation.tsx` | 94 | 路由/導航狀態同步 |
| 2 | `components/gm/pin-field.tsx` | 99 | PIN 輸入驗證狀態 |
| 3 | `components/gm/preset-event-editor.tsx` | 84 | 表單初始化 |
| 4 | `components/gm/stats-edit-form.tsx` | 282 | 數值表單同步 |
| 5 | `components/player/player-theme-wrapper.tsx` | 34 | 主題初始化 |

**重構路線圖（每個檔案依情境選擇一種）**：

1. **純衍生值** → 改用 `useMemo` 或直接 derived value（不需 state）
2. **使用者觸發的副作用** → 移到 event handler
3. **外部資料同步** → 改用 ref 或 external store subscription（React 19 的 `useSyncExternalStore`）
4. **初始化** → 改用 `useState` lazy initializer（若不影響 DOM 結構）或 `useRef` + useEffect 條件判斷

**參考專案規範**：`.claude/CLAUDE.md` 的 React 模式 1a / 1b / 2 分類。

#### 5.6-2. Unused vars 清理 — GM 控制台相關（4 warnings）

- `components/gm/basic-settings-tab.tsx` L26 — 刪除未使用的 `GM_SECTION_TITLE_CLASS` import
- `components/gm/basic-settings-tab.tsx` L46 — 刪除未使用的 `pinCheckStatus` 變數（或補回實際使用）
- `components/gm/character-status-overview.tsx` L184 — `<img>` 改為 `next/image <Image />`（需確認 src 是否為 remote，必要時於 `next.config.ts` 追加 `images.domains`）
- `components/gm/secrets-tab.tsx` L32 — 刪除未使用的 `Zap` icon import

#### 5.6-3. Unused vars 清理 — 玩家端 `skill-detail-dialog` 死碼（7 warnings）

- **現況**：`components/player/skill-detail-dialog.tsx` L83-92 有 7 個 unused warnings，集中在 target confirmation 區塊
  - `setIsTargetConfirmed`、`targetItems`、`selectedTargetItemId`、`setSelectedTargetItemId`、`isLoadingTargetItems`、`handleConfirmTarget`、`handleCancelTarget`
- **變更**：
  - 縱向分析必要 — 先確認 `SkillDetailDialog` 目前是否仍支援「選目標 → 確認」的兩階段 UI，或已完全走 `useTargetSelection` hook
  - 若是 hook 提取後的殘骸 → 一次性刪除
  - 若仍需使用 → 接回對應流程

#### 5.6-4. Unused vars 清理 — 其他散落項目（5 warnings）

- `app/actions/select-target-item.ts` L8 — 刪除未使用的 `CharacterDocument` import
- `components/player/skill-card.tsx` L46 — 刪除未使用的 `isPendingContest`（或補回實際邏輯）
- 測試檔案的 2 個 warning：
  - `hooks/__tests__/use-form-guard.component.test.tsx` L158 — `originalPushState`
  - `components/player/__tests__/pin-unlock.component.test.tsx` L148 — `user`

#### 5.6-5. Eslint config 調整 — 啟用底線前綴豁免（影響 2 warnings）

- **現況**：2 個底線前綴變數未被豁免：
  - `lib/utils/compute-effective-stats.ts` L36 — `_items`（passthrough 相容設計，**不可刪除參數**，見下方技術考量）
  - `scripts/migrate-phase-e.ts` L159 — `_`（migration script）
- **變更**：在 `eslint.config.*` 對應的 `@typescript-eslint/no-unused-vars` 規則追加：
  ```js
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  }
  ```
- **驗收**：上述 2 個 warning 自動消除，且不影響其他檔案的 unused 檢查

### 影響範圍
- React 19 重構：`components/gm/navigation.tsx`、`components/gm/pin-field.tsx`、`components/gm/preset-event-editor.tsx`、`components/gm/stats-edit-form.tsx`、`components/player/player-theme-wrapper.tsx`
- GM 控制台 unused：`components/gm/basic-settings-tab.tsx`、`components/gm/character-status-overview.tsx`、`components/gm/secrets-tab.tsx`
- 玩家端死碼：`components/player/skill-detail-dialog.tsx`、`components/player/skill-card.tsx`
- 其他：`app/actions/select-target-item.ts`、測試檔案 2 個
- Config：`eslint.config.*`、可能涉及 `next.config.ts`（`<img>` → `Image` 需註冊 remote domain）
- 若 5.6-1 需新增 util hook 抽象，可能涉及 `hooks/`

### 技術考量
- **5.6-1 每個錯誤獨立分析，不可套模板**：cascading render 的成因各異，需 case-by-case 判斷用 1~4 哪條路線
- **`compute-effective-stats.ts` 的 `_items` 參數不可直接刪除**：這是 passthrough 相容設計（見檔案頂部註解），呼叫端仍會傳入 items 陣列。**必須**走 5.6-5 的 eslint config 路線修復，不能改 source code signature
- **Commit 拆分建議**（按風險從低到高）：
  1. `chore: enable underscore prefix for unused vars` — 5.6-5 config 調整
  2. `chore: remove unused imports and dead code` — 5.6-2 / 5.6-3 / 5.6-4 清理
  3. `refactor: fix set-state-in-effect violations` — 5.6-1 重構（5 個 commit 或 1 個大 commit，視 diff 大小決定）
- **5.6-1 建議在 E2E 建置（#6）之後**：cascading render 重構有回歸風險，需 E2E 作為安全網；5.6-2 ~ 5.6-5 可立即進行（風險低）

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
| ~~6.5~~ | ~~#3.5 `silentSync` 雙重訂閱根治~~ | ~~小~~ | ✅ 收斂為單一過濾入口（`useRoleUpdated`） |
| ~~7~~ | ~~#4 目標選擇改進~~ | ~~中~~ | ✅ per-effect 分派 + Wizard mutex 規則 |
| 7.5 | #5.5 控制台 UI 微調 | 小 | E2E 建置前先穩定 UI，避免重錄測試 |
| 7.6 | #5.6 Lint 問題統一清理（5.6-2 ~ 5.6-5，低風險子項） | 小 | 可與 5.5 併行，E2E 建置前先把 warnings 降到 0 |
| 8 | #6 E2E 測試建置 | 中 | 所有功能完成後統一測試 |
| 9 | #5.6-1 React 19 set-state-in-effect 重構 | 中 | 需要 E2E 覆蓋作為重構安全網，故排在 #6 之後 |

## 注意事項

- 合併前需確保：
  - TypeScript 無型別錯誤（`npm run type-check`）
  - 單元/元件測試全部通過（`npm run test`）
  - Production build 成功（`npm run build`）
  - 若涉及 schema 變更，需附帶 migration 腳本
- 裝備系統（#3）、目標選擇（#4）和預設事件（#5）涉及 schema 變更，合併時需同步執行資料遷移
