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

## 5.5. 控制台 UI 微調 ✅

**目標**：E2E 測試建置前先修正控制台頁面的小問題，避免測試錄製後又因 UI 變更重錄。

### 需求

#### 5.5-1. 角色狀態卡片互動改為 click → Dialog ✅
- **現況**：`components/gm/character-status-overview.tsx` 的角色狀態卡片使用 hover 效果展開詳情，在觸控裝置與 GM 大量卡片並排時體驗不佳
- **變更**：
  - 移除所有 hover 相關樣式（`:hover`、`group-hover` 等）
  - 整張卡片改為可點擊按鈕，點擊後開啟 Dialog 顯示完整狀態詳情
  - Dialog 樣式與既有 GM Dialog token（`GM_DIALOG_CONTENT_CLASS`）對齊
  - 考慮共用 `character-status-detail-dialog`（若 player 端已有類似元件，評估共用）

#### 5.5-2. 遊戲開始歷史事件追加 Game Code ✅
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

**進度**：5.6-2 / 5.6-3 / 5.6-4 / 5.6-5 ✅ 已完成（17 warnings 全數清除）。5.6-1（5 errors）依計畫延後至 #6 E2E 建置完成後處理。

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

## 6. E2E 測試 🚧（Infra 完成，Fixtures/Specs 待做）

**目標**：建立端對端測試覆蓋關鍵使用者流程，作為後續 refactor（特別是 §5.6-1 React 19 `set-state-in-effect` 重構）的安全網。

### 執行定位

- **純地端執行**：目前專案無 CI/CD pipeline，E2E 僅在本機執行，由開發者在 commit / PR 前手動跑過守門。未來若導入 GitHub Actions，再把 E2E workflow 當獨立項目處理，不綁進本階段
- **非 production 監控**：E2E 目標是「code 進 production 前能有信心」，不是「測真正的 production 環境」。所有外部服務（MongoDB Atlas、Pusher、SMTP）在 E2E 模式下皆以本地替身取代

### Runtime 拓樸

E2E 跑起來時由 Playwright orchestrate 三個 process，開發者只需一條指令（`pnpm test:e2e`）：

| Process | 角色 | 啟動者 |
|---|---|---|
| Playwright test runner | 跑 spec、控制 Chromium、收拾周邊 | `pnpm test:e2e` |
| Next.js server（E2E build）| 被測物，與 production 同一份 code；透過 webpack alias 把 Pusher client/server 替換為 in-process stub | Playwright `webServer` config |
| Chromium | 真實瀏覽器分頁 | Playwright 每個 test 自己開 |

加上一個寄生於 Playwright `globalSetup` 的 `mongodb-memory-server` subprocess（真 mongod、非持久化、按需啟動），URI 透過 `process.env.MONGODB_URI` 傳給 Next.js webServer。

**沒有 soketi**：我們原本規劃用 soketi 作 Pusher 協定相容的本地 WebSocket server，但 `@soketi/soketi@1.6.1`（最新版）依賴 2022 年 pinned 的 `uWebSockets.js` git commit，只打包 Node 14/16/18 的 Windows native binary，與本專案的 Node 24 + Next.js 16 環境完全不相容（連 `--help` 都無法執行）。且 soketi 專案自 2023 年初後沒有實質更新。改走 **Pusher stub**（以 webpack alias 把 `pusher-server.ts` / `pusher-client.ts` 替換為 in-process event bus），詳見下方「Pusher stub 策略」。

### 技術選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| 測試框架 | **Playwright** | 社群成熟、內建 fixture / webServer / trace viewer、跨瀏覽器 |
| 測試資料庫 | **`mongodb-memory-server`** | 真 mongod binary，非持久化，零外部依賴，per-suite 單 instance + per-test database reset 做隔離 |
| Pusher 替身 | **in-process stub**（webpack alias）| soketi 因 Node 24 相容性問題不可用；改以 stub 模組在 E2E build 時替換 `pusher-server.ts` / `pusher-client.ts`。stub 走 in-memory event bus，保留完整事件語義 |
| 登入 bypass | **test-only login API**（`/api/test/login`，`E2E=1` env guard）| 避免 E2E 依賴真 SMTP；production build 此路由回 404 |
| Magic link / SMTP | **不測** | Magic link 是登入入口非核心玩法；業務邏輯由 unit test 覆蓋，E2E 透過 test-only login bypass 直接進主畫面。避免為此引入 SMTP catcher 基礎設施 |

**`mongodb-memory-server` 的定位說明**：名稱中的「memory」指的是資料存放策略（非持久化 tmpfs / 臨時目錄），不是 mock 實作。它實際上下載並 spawn 真正的 `mongod` binary，行為與 Atlas 完全一致（包括 index、transaction、aggregation）。第一次執行會下載並快取 binary（約 100 MB），後續啟動約 1–2 秒。

**Pusher stub 策略**：新增 `lib/websocket/pusher-server.e2e.ts` 與 `lib/websocket/pusher-client.e2e.ts` 兩個 stub 模組，在 `next.config.ts` 的 webpack config 中以 alias 設定：當 `process.env.E2E === '1'` 時，`@/lib/websocket/pusher-server` 與 `@/lib/websocket/pusher-client` 的 import 都會被指向 stub 版本。production bundle 完全看不到 stub 程式碼（tree-shaken away）。stub 內部維護一個 in-memory pub/sub（例如 `Map<channelName, Set<callback>>`），`trigger()` → 直接呼叫對應 channel 的 subscribers；`subscribe()` → 註冊 callback。因為 Next.js webServer 與 browser 在同一台機器上，server-side 寫入的 event 會透過 Next.js 內部事件機制（或 HTTP long-poll 作為 fallback）傳到 browser 端 stub。詳細 IPC 機制留待 step 1 實作時決定。

**stub 會損失什麼**：Pusher SDK 的傳輸層（WebSocket frame 打包、重連、心跳）。這些是 Pusher 自己的單元測試範圍，不是 LARP Nexus 的覆蓋對象。所有業務邏輯（event handler、UI 更新、state 同步、race condition）都不受影響。

### 需要對 production code 的最小變動

E2E 基礎設施透過 webpack alias 替換 Pusher 模組，production code **零改動**：

1. `next.config.ts` — 新增 `webpack` config，當 `process.env.E2E === '1'` 時，把 `@/lib/websocket/pusher-server` alias 到 `@/lib/websocket/pusher-server.e2e`，`@/lib/websocket/pusher-client` alias 到 `@/lib/websocket/pusher-client.e2e`
2. `lib/websocket/pusher-server.e2e.ts`（新檔）— stub 版本，`getPusherServer()` 回傳一個 fake Pusher 物件，其 `trigger()` 寫入 in-memory event bus
3. `lib/websocket/pusher-client.e2e.ts`（新檔）— stub 版本，`getPusherClient()` 回傳一個 fake Pusher 物件，其 `subscribe()` 從 in-memory event bus 讀取

**production 環境完全不經過 alias**：`E2E` 環境變數不設定 → webpack config 分支不啟用 → import 路徑仍指向原始 `pusher-server.ts` / `pusher-client.ts`，bundle 不含 stub 程式碼。

**pusher-server.ts / pusher-client.ts 本身不需要修改**——這是 stub 方案相對於 self-hosted env 方案的關鍵優勢：原始檔案零變動，新增兩個 `.e2e.ts` 側邊檔，lint / type-check / build 行為都不受影響。

### 目錄結構

```
e2e/
├── fixtures/                       # Playwright fixtures
│   ├── db-fixture.ts                   # per-worker mongodb-memory-server lifecycle + per-test DB reset
│   ├── auth-fixture.ts                 # 透過 test-only login API 注入 GM/Player session
│   └── seed-fixture.ts                 # 劇本/角色/道具/技能 seed builder
├── helpers/
│   ├── login-as-gm.ts
│   ├── login-as-player.ts
│   ├── wait-for-toast.ts
│   ├── wait-for-stat-change.ts         # WebSocket 非同步事件的 UI-level 等待 helper
│   └── wait-for-contest-result.ts
├── smoke/                          # 快速 smoke，commit 前跑
│   ├── infrastructure.spec.ts          # pipeline 活體檢查（SSE + test-login，不依賴任何業務頁面）
│   ├── gm-can-login.spec.ts
│   └── player-can-unlock.spec.ts
├── flows/                          # 完整功能流程，PR 合併前跑（依賴鏈順序）
│   ├── game-creation.spec.ts           # #3 劇本建立（最先，其他 flows 都依賴它）
│   ├── character-creation.spec.ts      # #4 角色建立（依賴 game）
│   ├── skill-use.spec.ts               # #5 技能使用（依賴 character + skills）
│   ├── item-operations.spec.ts         # #7 道具操作（與 #5 並列，依賴 character）
│   ├── broadcast.spec.ts               # #8 廣播（需 GM + Player 多 context）
│   └── contest.spec.ts                 # #6 對抗（最複雜，需雙方 WebSocket 同步）
├── global-setup.ts                 # 啟 mongodb-memory-server、seed 共享資料
└── global-teardown.ts              # 關 mongodb-memory-server
```

stub 模組位於 production code 樹內（不在 `e2e/` 底下），因為它們透過 webpack alias 參與 Next.js build：

```
lib/websocket/
├── pusher-server.ts            # 原始（production 使用）
├── pusher-server.e2e.ts        # stub（E2E 使用，webpack alias 指向此）
├── pusher-client.ts            # 原始
└── pusher-client.e2e.ts        # stub
```

### 優先測試流程

兩層分類（對應目錄結構），原計畫的 8 個流程重新歸類如下：

**smoke 層（< 1 分鐘，commit 前跑）**
1. GM 透過 test-only login 進入 → 看得到劇本列表
2. 玩家 PIN 解鎖 → 進入角色卡

**flows 層（PR 合併前跑）**
3. 劇本建立 → 填寫基本資訊 → 儲存
4. 角色建立 → 基本資訊 → 數值 → 技能/道具 → 儲存
5. 技能使用 → 無檢定 / 隨機檢定 → 效果套用 → UI 即時更新
6. 對抗流程 → 攻擊方發起 → 防守方回應 → 結果通知 → 雙方 UI 一致
7. 道具操作 → 使用 / 展示 / 轉移
8. 廣播訊息 → GM 發送 → 玩家接收 notification

Magic link 登入流程本身不納入 E2E——透過 test-only login API 直接開綠燈進主畫面，業務邏輯（token 生成、過期、驗證）由 unit test 覆蓋即可。

### WebSocket 等待策略

LARP Nexus 大量依賴即時事件（`character.affected`、`item.used`、`contest.*`、`role.updated`、`broadcast.*`）。典型 race：玩家按「使用技能」→ server action 執行 → emit event → 玩家端 UI 更新。若直接 assert DOM，會在事件抵達前失敗。

**原則**：統一等「使用者最終看到的結果」，不等 network。寫成可複用 helper：

- `waitForToast(page, text)` — 等 sonner toast 出現
- `waitForStatChange(page, statName, expectedValue)` — 等某個 stat 變成預期值（封裝 `page.waitForFunction`）
- `waitForContestResult(page)` — 等對抗結果 dialog / toast 出現

禁止用 `page.waitForTimeout()` 這類固定時間等待——會隨機 flaky。

### 實作順序

**Phase 0 — 前置規劃** ✅
   - ✅ NEXT_DEVELOPMENT_PLAN.md §6 初版規劃（soketi 方案）`45dece4`
   - ✅ 切換方向至 Pusher stub 方案（soketi `uWebSockets.js` 與 Node 24 不相容）`94215d6`
   - ✅ 拓樸、技術選型、目錄結構、影響範圍、驗收條件已寫定

**Phase 1 — 基礎設施（Infra）** ✅ `pnpm test:e2e` smoke 全綠（2 passed）`59b874b`、`d35555a`、`193d225`
   - ✅ 安裝 devDeps：`@playwright/test`、`mongodb-memory-server`、`cross-env`
   - ✅ 下載 Playwright Chromium binary
   - ✅ `lib/websocket/__e2e__/event-bus.ts` — 共享 EventEmitter（`globalThis` guard HMR-safe）
   - ✅ `lib/websocket/pusher-server.e2e.ts` — server stub，`trigger()` 寫入 event bus
   - ✅ `lib/websocket/pusher-client.e2e.ts` — client stub，EventSource 連 `/api/test/events`，維護 channel→event→Set<callback> 註冊表
   - ✅ `app/api/test/events/route.ts` — SSE route（Node runtime + heartbeat 15s + `E2E=1` guard）
   - ✅ `app/api/test/login/route.ts` — test-only login（GM / Player 兩種模式，zod 驗證）
   - ✅ `next.config.ts` — 條件式 webpack alias（`E2E=1` 啟用，exact-match `$` anchor）
   - ✅ `playwright.config.ts` — `next build --webpack && next start`、globalSetup、webServer
   - ✅ `e2e/global-setup.ts` — 啟動 in-memory MongoDB，注入 `MONGODB_URI` / `SESSION_SECRET`
   - ✅ `e2e/global-teardown.ts` — 關閉 in-memory MongoDB
   - ✅ `e2e/smoke/infrastructure.spec.ts` — pipeline smoke（EventSource onopen + test-login）
   - ✅ `package.json` 新增 `test:e2e` / `test:e2e:ui` scripts（透過 `cross-env` 設 `E2E=1`）
   - ✅ `.gitignore` 加入 Playwright 輸出目錄
   - ✅ `pnpm test:e2e` 兩個 smoke 全綠驗證通過 `d35555a`
   - ✅ NEXT_DEVELOPMENT_PLAN.md §6.1 標記完成 + 實作筆記（7 項踩坑紀錄）`193d225`

   **實作筆記（踩過的坑，供未來 maintainer 參考）**：
   - **Next.js 16 預設 Turbopack**：`next build` 現在預設走 Turbopack，**不讀 `webpack` config**。必須在 `webServer.command` 顯式加 `--webpack` flag 才會走 webpack pipeline，alias 才會生效。production `pnpm build` 維持預設 Turbopack 不動
   - **`next.config.ts` 必須純 CJS-相容**：專案 `package.json` 無 `"type": "module"`，Next.js 編譯 config 時若夾 `import.meta.url` 等 ESM-only 語法會噴 `exports is not defined in ES module scope`。改用 `process.cwd()` 取代 `__dirname`
   - **`E2E=1` inline env 語法**：Windows `cmd.exe` 不支援 `E2E=1 cmd` 這種 POSIX 風格 inline env，必須透過 `cross-env` wrapper 跨平台設定
   - **SSE 不能用 `request.get()`**：Playwright 的 APIRequest 會等整個 response body 讀完才 resolve，SSE 是長連線會直接 timeout。正確做法是 `page.evaluate` 跑 `new EventSource(...)` 等 `onopen`
   - **webpack alias exact-match**：key 結尾加 `$` 代表「完整路徑完全匹配」，避免 `pusher-server` prefix 誤 match 到 `pusher-server.e2e` 造成遞迴 alias
   - **`mongodb-memory-server` 首次下載**：第一次 `pnpm test:e2e` 會下載 ~100 MB mongod binary 到 `~/.cache/mongodb-binaries/`，之後 cache 不重複。pnpm 10 會提示 `Ignored build scripts: mongodb-memory-server`——這個 postinstall 只印 cache 位置不下載 binary，可忽略
   - **`DYNAMIC_SERVER_USAGE` warning**：E2E build 期間 log 會出現 `/games` 與 `/profile` 的 `cookies()` dynamic-render 錯誤——這是 Next.js 16 新嚴格判定下的既有技術債，不影響 E2E 測試（最終 build 成功），會另開 commit 修
   - **`baseline-browser-mapping` 兩月過期警告**：Next.js 的 transitive dep，僅 dev 體驗問題，會另開 chore commit 處理

**Phase 1.5 — 執行中發現的連帶修復** ✅（infra 綠燈後從 build log 捕捉的技術債）
   - ✅ `/games` + `/profile` 加 `force-dynamic`（`DYNAMIC_SERVER_USAGE` fix）`d1bb7d0` — 兩個頁面依 session 讀資料，Next.js 16 嚴格 prerender 檢查會噴 `DYNAMIC_SERVER_USAGE`
   - ✅ `next.config.ts` 條件式 spread webpack key（Turbopack regression fix）`d1bb7d0` — 首次 commit 把 `webpack` key 無條件寫進 config，導致 production `pnpm build`（Turbopack pipeline）也被迫進 webpack 檢查並炸掉；改用 `...(isE2E ? { webpack: ... } : {})` 條件式 spread
   - ✅ `package.json` build script 強制 `NODE_ENV=production`（React 19 dev-mode prerender fix）`d119902` — Next.js 16 不再覆寫 shell `NODE_ENV=development`（只印 warning），React 19 dev SSR assertions 會在 build pipeline 撞 `useContext null`
   - ✅ `baseline-browser-mapping` via `pnpm.overrides` 升至 `^2.10.16` `307f819` — transitive dep 版本過舊的 stale-data warning
   - **學到的 pipeline smoke 價值**：這四個 bug 都在業務 spec 還沒開始寫時就被 `infrastructure.spec.ts` 和後續 build 引出，印證了「分層 smoke + 早期 build 綠燈」是比「一次衝到 flows」更安全的節奏

2. **Phase 2 — Flows 層詳細規劃（docs only，無程式碼）** ✅（獨立文件產出完成）

   **產出**：`docs/archive/e2e-flows-plan.md` — 8 個 flows 各自的進入點 / 前置 seed / 操作步驟 / 非同步等待點 / 斷言 / 反向驗證 / 已知陷阱，以及從 flows 反推的 fixture / helper / test API 設計結論

   **內容**：為 **8 個 flows** 逐一展開規劃。每個 flow 必須寫清楚：
   - 進入點（使用者角色、URL）
   - 前置狀態（需要 seed 的資料 shape）
   - 操作步驟（使用者動作序列）
   - 非同步等待點（哪些 WebSocket 事件、哪些 UI 變化）
   - 斷言（最終驗證的狀態）

   **8 個 flows**：
   - [x] #1 GM test-login → 劇本列表（smoke 層）
   - [x] #2 玩家 PIN 解鎖 → 角色卡（smoke 層）
   - [x] #3 劇本建立 → 填寫基本資訊 → 儲存
   - [x] #4 角色建立 → 基本資訊 → 數值 → 技能/道具 → 儲存
   - [x] #5 技能使用 → 無檢定 / 隨機檢定 → 效果套用 → UI 即時更新
   - [x] #6 對抗流程 → 攻擊方發起 → 防守方回應 → 結果通知 → 雙方 UI 一致
   - [x] #7 道具操作 → 使用 / 展示 / 轉移
   - [x] #8 廣播訊息 → GM 發送 → 玩家接收 notification

   **從 flows 需求反向推導**（在同一份規劃文件內產出）：
   - [x] `seed-fixture` 的 builder API shape（哪些欄位必填、哪些可選、是否支援 override）
   - [x] `auth-fixture` 是否需支援 multi-context（GM + Player 同時在線，例如 flow #6 對抗）
   - [x] `wait-for-*` helpers 的抽象層級（event-level vs state-level vs UI-level，哪一層最穩）
   - [x] `db-fixture` 的 reset 粒度（per-test 還是 per-describe；會影響 seed 重用策略）

   **為什麼 Phase 2 必須是純 docs**：fixture API shape 不能憑空設計。若先寫 fixture 再寫 flows，flows 的真實需求會反覆回頭改 fixture，白工。先把 8 個 flows 的「前置 seed」欄位全部列出，再一次歸納 builder shape，Fixture 就能一版到位

3. **Phase 3 — Fixtures 實作（程式碼）** ✅

   依 Phase 2 規劃反推結論實作。與原規劃的差異：fixture 統一為單一 `e2e/fixtures/index.ts`（`test.extend()` pattern），不拆成多個檔案；reset 三層合併為單一 endpoint；auth 整合進 fixture 而非獨立 helper。

   - [x] **`lib/contest-tracker.ts`** — 新增 `__testResetAll()` 供 reset endpoint 呼叫
   - [x] **`app/api/test/reset/route.ts`** — 三合一 reset（DB `deleteMany` + contest-tracker + event bus listeners）
   - [x] **`app/api/test/seed/route.ts`** — 批次 seed（Mongoose `.create()` 觸發 schema 驗證 + ObjectId 自動轉換）
   - [x] **`app/api/test/db-query/route.ts`** — DB 查詢（collection allowlist + ObjectId 自動轉換）
   - [x] **`e2e/fixtures/index.ts`** — 統一 Playwright custom fixtures：
     - `resetDb`（auto, per-test）、`seed`（builder pattern）、`dbQuery`、`asGm`、`asPlayer`、`asGmAndPlayer`（雙 BrowserContext + teardown）
   - [x] **`e2e/helpers/wait-for-toast.ts`** — Sonner `[data-sonner-toast]` + `hasText`
   - [x] **`e2e/helpers/wait-for-websocket-event.ts`** — browser 端 EventSource 監聽 SSE stream
   - [x] **`e2e/helpers/wait-for-db-state.ts`** — polling `/api/test/db-query`（200ms 間隔 + predicate + timeout）
   - [x] **Dogfood 驗證** — `e2e/smoke/infrastructure.spec.ts` 改用 `e2e/fixtures` import + 新增 reset/seed/dbQuery round-trip tests
   - ⏳ `waitForContestStage` — Flow #6 專用 wrapper，延後到 Phase 4 實作 contest spec 時新增
   - ⏳ `session-dump` — 可選 debug endpoint，有需求再加
   - **禁止**：任何固定時間 `page.waitForTimeout()`

4. **Phase 4 — Smoke 層 specs**
   - [x] `e2e/smoke/infrastructure.spec.ts` — pipeline smoke（SSE onopen + test-login 200）✅ Phase 1 已完成，Phase 3 重構為使用 `e2e/fixtures` + 新增 reset/seed/dbQuery dogfood tests
   - [x] **`e2e/smoke/gm-can-login.spec.ts`**（對應 flow #1）✅
     - [x] #1.1 未認證 redirect + test-login + 空狀態顯示
     - [x] #1.2 非空狀態 grid 渲染 + 排序（newer-first）+ 卡片導航
     - [x] #1.3 跨 GM 資料隔離
   - [x] **`e2e/smoke/player-can-unlock.spec.ts`**（對應 flow #2）✅
     - [x] #2.1 PIN 正確 → 預覽模式（banner、read-only、localStorage 雙 key）
     - [x] #2.2 PIN 錯誤 → error path（不洩漏狀態）
     - [x] #2.3 hasPinLock:false → 直接進入完整互動模式
   - [x] 驗證 smoke 層整層跑綠（10/10 tests passed），確認 fixtures 穩定 ✅
   - [x] 撰寫規範更新至 `../archive/e2e-flows-plan.md`（Locator 選擇優先序、RSC streaming 對策等 6 條規則）

5. **Phase 5 — Flows specs（12 個 flow，依依賴鏈順序實作）** ✅

   > Phase 2 規劃已從原始 6 個擴展為 12 個 flow（#3–#12，含 #4b 和 #6b），詳見 `../archive/e2e-flows-plan.md` 各獨立檔案。

   實作順序刻意讓後者依賴前者的 seed / 操作，避免重複 setup 程式碼：
   1. [x] `e2e/flows/gm-game-lifecycle.spec.ts` — 對應 flow #3 ✅
     - [x] #3.1 create game + validation（名稱必填、gameCode 唯一性）
     - [x] #3.2 game code change + uniqueness（Dialog reset 驗證）
     - [x] #3.3 game info edit（名稱/最大檢定值/世界觀 blocks CRUD/I2 未儲存保護）
     - [x] #3.4 preset events CRUD broadcast（建立/編輯/刪除確認 Dialog）
     - [x] #3.5 game lifecycle start/end（Runtime 建立/清除、J1 控制台 Tab、J3 角色鎖定）
     - [x] #3.6 cascade delete（連鎖刪除完整性 + 跨 GM 隔離驗證）
   2. [x] `e2e/flows/gm-character-crud.spec.ts` — 對應 flow #4 + #4b，依賴 #3 的 game ✅
     - [x] #4.1a create character in empty game + validation（名稱必填、PIN 格式）
     - [x] #4.1b PIN uniqueness within same game
     - [x] #4.2 basic settings CRUD + PIN change（四欄位修改 + PIN 啟用 + reverse validation）
     - [x] #4.3 background blocks + relationships CRUD（兩欄式 blocks + relationship 新增/刪除）
     - [x] #4.4 secrets CRUD + soft delete（多段落 secret + soft delete → undo → re-delete → persist）
     - [x] #4.5 tasks CRUD + soft delete（一般/隱藏任務 + UI-only soft delete 驗證）
     - [x] #4.6 dirty state + discard + beforeunload（SaveBar 全流程 + native beforeunload 攔截）
     - [x] #4.7 delete character gate（inactive 可刪 + active 不可刪 isActive gate）
     - [x] #4b.1 stats inline CRUD + validator（新增/修改/刪除 + 空 name 驗證攔截）
     - [x] #4b.2 items wizard happy path（4 步驟 Wizard + stat_change 效果）
     - [x] #4b.3 items wizard interlock（contest checkType 強制 relatedStat）
     - [x] #4b.4 skills wizard + exclusive effects（stat_change + task_reveal 雙效果）
     - [x] #4b.5 skills wizard edit mode（載入既有 → Stepper 跳步 → 覆蓋更新）
   3. [x] `e2e/flows/player-use-skill.spec.ts` — 對應 flow #5，依賴 #4 的 character+skill ✅
     - [x] #5.1 happy path: self-target stat_change + baseline/runtime 隔離
     - [x] #5.2 cross-target random check: pass + fail 雙分支
     - [x] #5.3 multi-effect sequential execution + empty effects 反向驗證
     - [x] #5.4 usageLimit exhaustion + cooldown gate（UI + server 雙層）
     - [x] #5.5 readOnly mode + TemporaryEffect creation（需 hasPinLock）
     - [x] #5.6 PIN-locked character blocks unauthorized skill access
   4. [x] `e2e/flows/item-operations.spec.ts` — 對應 flow #7，依賴 #4 的 character+item ✅
     - [x] #7.1 happy path: consumable self-target stat_change + quantity decrement + baseline/runtime 隔離
     - [x] #7.2 cross-target random check: pass (stat_change) + fail (效果未執行) 雙分支
     - [x] #7.3 equip/unequip toggle: stat boost apply + revert + max recovery rule
     - [x] #7.4 showcase: sender triggers + receiver readonly dialog (safe fields only)
     - [x] #7.5 transfer: isTransferable guard + partial quantity + equipment auto-unequip + stat boost revert
     - [x] #7.6 usage limit + cooldown + readOnly: UI guards prevent usage
   5. [x] `e2e/flows/gm-broadcast.spec.ts` — 對應 flow #8，依賴 #3 的 game ✅
     - [x] #8.1 broadcast happy path: GM 全體廣播 → Player 通知 + PendingEvent + Log
     - [x] #8.2 character message: GM 指定角色 → Player 通知 + Log + PendingEvent 反向驗證
     - [x] #8.3 form validation + mode toggle: PillToggle 切換 + 必填欄位守門
     - [x] #8.4 authorization guard: Player session → redirect to login + DB 無寫入
   6. [x] `e2e/flows/contest-flow.spec.ts` — 對應 flow #6，最複雜（multi-context） ✅
     - [x] #6.1 happy path: contest + no defense → attacker_wins + stat_change applied
     - [x] #6.2 skill defense + attacker_wins + combat tag filtering
     - [x] #6.3 item defense + defender_wins + combat/equipment filtering
     - [x] #6.4 random_contest + conditional DB assertion (non-deterministic result)
     - [x] #6.5 single-select + item/skill mutual exclusion
     - [x] #6.6 stealth tag: attacker name hidden + effect source hidden
   6b. [x] `e2e/flows/item-transfer-effects.spec.ts` — 對應 flow #6b（item_take/item_steal 延遲物品選擇，3 test cases）
     - [x] #6b.1 item_take: contest + delayed selection → item destroyed (not transferred)
     - [x] #6b.2 item_steal: contest + delayed selection → item transferred to attacker
     - [x] #6b.3 item_steal: non-contest + delayed selection → item transferred
   7. [x] `e2e/flows/preset-event-runtime.spec.ts` — 對應 flow #9，依賴 #3 的 game runtime ✅
     - [x] #9.1 baseline copy + execute + executionCount tracking
     - [x] #9.2 Runtime CRUD — create, edit, delete preset events (runtimeOnly badge)
     - [x] #9.3 broadcast (all + specific targets) — dual broadcast + PendingEvent=0 negative assertion
     - [x] #9.4 stat_change — HP delta + role.updated WS + DB + Log
     - [x] #9.5 reveal_secret + reveal_task — WS events + DB isRevealed/revealedAt + Log
     - [x] #9.6 partial failure/skip — mixed results toast (1 success + 2 skipped)
   8. [x] `e2e/flows/auto-reveal.spec.ts` — 對應 flow #10，依賴 #4 的 character+items+secrets
     - [x] #10.1 items_viewed — showcase triggers secret auto-reveal (dual player context)
     - [x] #10.2 items_acquired — transfer triggers task auto-reveal (dual player context)
     - [x] #10.3 secrets_revealed chain — GM manual reveal triggers task auto-reveal (GM+Player)
     - [x] #10.4 AND/OR matchLogic — AND needs all items, OR needs any one (dual player context)
     - [x] #10.5 condition editor UI — GM sets auto-reveal condition on secret (GM only)
   9. [x] `e2e/flows/preview-mode.spec.ts` — 對應 flow #11，依賴 baseline/runtime 分歧 seed ✅
     - [x] #11.1 preview mode displays baseline data (HP=100, 1 item, usageCount=0, 1 secret, 1 task) + DB 層驗證
     - [x] #11.2 preview → full access switch via relock + PIN+GameCode re-unlock (HP=60, 2 items, usageCount=2, 2 secrets, 2 tasks) + localStorage 驗證
     - [x] #11.3 preview mode disables item/skill use buttons (顯示「預覽模式」disabled)
     - [x] #11.4 inactive game — baselineData undefined, ?? fallback works without crash
   10. [x] `e2e/flows/time-dependent-edges.spec.ts` — 對應 flow #12，依賴 temporaryEffects + cooldown + PendingEvent seed ✅
     - [x] #12.1 expired temporary effect — stat rollback via Cron + DB + Log + UI 驗證
     - [x] #12.2 multi-effect stacking — selective rollback (A/C expired, B alive) + DB + UI
     - [x] #12.3 skill cooldown — expired cooldown allows reuse, new cooldown starts after (overlay + DB)
     - [x] #12.4 item cooldown — expired cooldown allows reuse, new cooldown starts after (dialog + DB)
     - [x] #12.5 pending event TTL — expired/delivered events cleaned, fresh kept (Cron + DB)

   **Phase 5 穩定化** ✅ — Flows specs 全部實作完成後的 flaky test 根治

   針對 #3.3、#4.2、#4.3、#10.3、#10.5 五個 flaky test 進行根因分析並系統性修復。產出三個根治方法（詳見 `../archive/e2e-flows-plan.md §E2E Flaky Test 根治策略`）：
   - [x] 方法 1：`retries: 1`（`playwright.config.ts`）— 兜底層
   - [x] 方法 2：穩定信號取代 `waitForTimeout` — toast wait（4 處）+ `expect.poll` DB 輪詢（6 處）
   - [x] 方法 3：`clickSaveBar` helper（`e2e/helpers/click-save-bar.ts`）— AnimatePresence 元素改用 evaluate retry loop（14 處）
   - [x] 附帶修復：`IconActionButton` 新增 `type="button"`（production bug，`<form>` 內 button 預設 submit）
   - [x] 附帶修復：`#3.5` strict mode violation — `getByText` 限縮至 `main` scope
   - [x] 新增 `../archive/e2e-flows-plan.md` 規則 35–36 + 根治策略章節
   - [x] 3 輪全測試通過驗證

6. **Phase 6 — 開發者體驗 / 維運** ✅
   - [x] README 段落：如何跑 E2E、常見失敗排查
   - [x] `docs/knowledge/architecture/e2e-testing.md`：E2E 測試架構知識庫（Pusher stub 原理、SSE IPC 設計、fixture 使用指南、flaky test 防治策略）
   - [x] CI workflow draft：`docs/refactoring/ci-e2e-workflow-draft.md`（GitHub Actions 草稿，僅參考）
   - [x] `pnpm test:e2e:headed` script — 瀏覽器可視模式
   - [x] `pnpm test:e2e:debug` script — Playwright Inspector debug 模式（`PWDEBUG=1`）

   **Phase 6b — Code Review 修復** ✅

   Code review 發現的問題，按優先順序修復：

   - [x] **Round 1**：`wait-for-websocket-event.ts` — `eval()` 改用結構化 `FilterMatcher`，`onerror` 加 readyState 檢查
   - [x] **Round 2**：`fixtures/index.ts` — `asGmAndPlayer` 加 login error check、`E2E_BASE_URL` 集中管理
   - [x] **Round 3**：提取 `setupDualPlayerContext` 到 `e2e/helpers/`，統一 3 個 spec 的實作
   - [x] **Round 4**：個別 spec 斷言品質修復（H5–H10）+ TS/ESLint 錯誤清零
   - [x] **Round 5**：MEDIUM 層改善（M2 5xx 拋錯、M5 pageerror 位置、M9 精確斷言）

   **Phase 7 — Infra 修復 + Strict Mode 根治** ✅

   - [x] MongoMemoryServer URI 改用 temp file 傳遞（`resolveMongoUri()` + `.e2e-mongo-uri`），解決 Next.js `loadEnvConfig` 覆蓋問題
   - [x] DB name 安全防護（reset/seed/db-query 檢查資料庫名稱含 `e2e` 或 `test`，否則 403）
   - [x] Radix UI Tabs 重複 DOM 造成的 strict mode violation 全面修復（52+ 處 `.first()`）

   <details>
   <summary>完整 Code Review 發現清單</summary>

   **CRITICAL（1）**
   - C1: `wait-for-websocket-event.ts:69` — `eval()` 執行字串 filter，錯誤被 `catch {}` 靜默吞掉

   **HIGH（10）**
   - H1: `fixtures/index.ts:337-358` — `asGmAndPlayer` login 無 response.ok() 檢查
   - H2: `fixtures/index.ts:331,347` + 3 個 spec — `baseURL` 硬編碼，與 config 脫鈎
   - H3: `wait-for-websocket-event.ts:81-85` — `es.onerror` 無條件 reject
   - H4: 3 個 spec 各自定義 `setupDualPlayerContext`，實作有差異
   - H5: `player-use-skill.spec.ts:296`、`item-operations.spec.ts:247` — `Math.random` 未還原
   - H6: `gm-game-lifecycle.spec.ts:333` — `waitForTimeout(500)` 無確定性信號
   - H7: `gm-can-login.spec.ts:60-97` — 同毫秒 `createdAt` 排序不確定
   - H8: `infrastructure.spec.ts:65-76` — test 標題說 reset 但沒斷言
   - H9: `player-can-unlock.spec.ts:99` — CSS class 做 error 斷言
   - H10: `gm-broadcast.spec.ts:344-350` — DB 查詢無 gameId filter

   **MEDIUM（精選 10）**
   - M1: `fixtures/index.ts:129-131` — `callSeed` 回傳 input data 非 DB 值
   - M2: `wait-for-db-state.ts:54-59` — HTTP 5xx 靜默 retry
   - M3: `gm-broadcast.spec.ts:199-212` — payload fallback 掩蓋 schema 歧義
   - M4: `contest-flow.spec.ts:983-1006` — CSS opacity 斷言耦合 Tailwind
   - M5: `preview-mode.spec.ts:334-342` — `pageerror` listener 在 goto 後註冊
   - M6: `auto-reveal.spec.ts:809` — `waitForTimeout(500)` 可被 clickSaveBar retry 取代
   - M7: `item-transfer-effects.spec.ts:400,539` — 用 `.name` 找物品無唯一性保護
   - M8: `time-dependent-edges.spec.ts:100-106` — cron 後 dbQuery 無 polling
   - M9: `gm-game-lifecycle.spec.ts:570` — `toBeGreaterThanOrEqual(1)` 太弱
   - M10: `app/actions/item-use.ts:521-578` — `targetUpdates` 混用 `$push`

   </details>

7. **Phase 7 — 驗收** ✅
   - [x] 整套 `pnpm test:e2e` 一條指令跑完所有 specs（smoke + flows）全綠（連續 3 輪）
   - [x] 離線可跑（無 Atlas、無 Pusher、無 SMTP、無 Docker、無 WSL）
   - [x] 更新 CLAUDE.md — 加入靜態分析（tsc+eslint）到 commit 前檢查流程
   - [x] E2E 開發文件封存至 `docs/archive/`，撰寫規範合併至 `docs/knowledge/architecture/e2e-testing.md`

### 決策記錄（對話中已確認）

| # | 問題 | 決定 | 備註 |
|---|------|------|------|
| Q1 | 是否要把 Phase 2–7 完整清單寫進文件？ | ✅ YES | 本節即為產出 |
| Q2 | `infrastructure.spec.ts` 保留還是合併到 smoke 其他 spec？ | **保留** | pipeline smoke 與 business smoke 關注點不同（見「infrastructure.spec.ts 的用途」段落） |
| Q3 | Flows spec 實作順序 | **依賴鏈順序** | game → character → skill → item → broadcast → contest |
| Q4 | DX / 維護文件是否納入 §6？ | **納入** | 避免「infra 完成 = 結束」的錯覺 |
| Q5 | 是否要 CI pipeline？ | **暫不** | 本機跑綠即可，未來有遠端環境再補 |
| Q6 | Phase 2 是 Flows 規劃（docs）還是 Fixtures 實作（code）？ | **Flows 規劃（docs only）** | Fixture API shape 由 flows 需求反推；先寫 code 會白工 |
| Q7 | Flows 總數 6 還是 8？ | **12**（含 2 個 smoke 層 + 10 個 flow 層） | 原 8 個，Phase 2 後期新增 #9 預設事件、#10 auto-reveal、#11 預覽模式、#12 時間依賴。統一放在 Phase 2 規劃中逐一展開，Phase 4/5 實作時再依 smoke / integration 分檔 |

### 影響範圍

- **新增（Phase 1）**：`e2e/`、`playwright.config.ts`、`e2e/global-setup.ts`、`e2e/global-teardown.ts`、`app/api/test/login/route.ts`、`app/api/test/events/route.ts`、`lib/websocket/pusher-server.e2e.ts`、`lib/websocket/pusher-client.e2e.ts`、`lib/websocket/__e2e__/event-bus.ts`
- **新增（Phase 3）**：`app/api/test/reset/route.ts`、`app/api/test/seed/route.ts`、`app/api/test/db-query/route.ts`、`e2e/fixtures/index.ts`、`e2e/helpers/wait-for-toast.ts`、`e2e/helpers/wait-for-websocket-event.ts`、`e2e/helpers/wait-for-db-state.ts`
- **修改（Phase 3）**：`lib/contest-tracker.ts`（新增 `__testResetAll()`）、`e2e/smoke/infrastructure.spec.ts`（改用 fixtures + dogfood tests）
- **新增（Phase 5 穩定化）**：`e2e/helpers/click-save-bar.ts`
- **修改（Phase 5 穩定化）**：`components/gm/icon-action-button.tsx`（`type="button"`）、`playwright.config.ts`（`retries: 1`）、所有 flow spec（`clickSaveBar` + toast wait + `expect.poll`）
- **修改（Phase 1）**：`next.config.ts`（webpack alias，條件式）、`package.json`（devDependencies + `test:e2e` script）、`.gitignore`（Playwright 輸出目錄）
- **不影響**：`lib/websocket/pusher-server.ts`、`lib/websocket/pusher-client.ts`、所有 server actions、hooks、React components、types。E2E 走的是與 production 相同的 code path（除了 Pusher 傳輸層被替換為 in-process stub）

### 技術考量

- **Windows 相容性**：`mongodb-memory-server` 在 Windows + Node 24 可正常運作（首次下載 mongod binary 後快取於 `~/.cache/mongodb-binaries/`）。Pusher stub 是純 JS in-process 實作，跨平台無差異
- **為何不用 soketi**：`@soketi/soketi` 的 `uWebSockets.js` 依賴只支援 Node 14/16/18 的 Windows binary，本專案 Node 24 + Next.js 16 完全無法執行。且 soketi 專案 2023 年後停滯。詳見上方「沒有 soketi」段落
- **stub 的 server↔client IPC**：server-side stub `trigger()` 需要把事件送到 browser-side stub。候選實作：(a) Next.js API route + SSE（server push）、(b) HTTP long-poll（browser 每秒拉一次）、(c) 共用 `globalThis` 變數（僅在 Next.js dev server 的同 process 情境有效，client bundle 拿不到）。實作時選 (a)——SSE 最接近真 WebSocket 語義且 Next.js API route 原生支援
- **Playwright trace**：failing test 自動輸出 trace zip，便於事後 debug。trace 目錄加入 `.gitignore`
- **worker 數量**：預設讓 Playwright 自動決定；對抗流程這類需要 GM + Player 兩個瀏覽器的 spec，用 `test.describe.configure({ mode: 'serial' })` 或 `context` API 開第二個頁面
- **不用 Playwright codegen 錄製**：UI 變動容易讓錄製版失效，手寫 spec 搭配 fixture 更穩

### 驗收條件

- `pnpm test:e2e` 一條指令可啟動全套（Playwright + Next.js + mongodb-memory-server + Chromium），跑完自動清乾淨
- smoke 層全綠、flows 層全綠
- **可完全離線執行**（無任何外部依賴、無 Docker、無 WSL）
- production `pnpm build` 不受影響（stub 模組被 webpack alias 的條件式隔離，production bundle 不含 E2E 程式碼）

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
| ~~7.5~~ | ~~#5.5 控制台 UI 微調~~ | ~~小~~ | ✅ E2E 建置前先穩定 UI |
| ~~7.6~~ | ~~#5.6 Lint 問題統一清理（5.6-2 ~ 5.6-5）~~ | ~~小~~ | ✅ 17 warnings 全清 |
| 8 | #6 E2E 測試建置 🚧 | 中 | 純地端；Playwright + mongodb-memory-server + Pusher stub 兩層（smoke/flows）|

### E2E 之後的待辦項目

以下項目均在 E2E 測試建置完成後執行，依優先順序排列：

| 順序 | 項目 | 規模 | 類型 |
|------|------|------|------|
| 9 | #5.6-1 React 19 set-state-in-effect 重構 | 中 | 重構 |
| 10 | #7 `item_give` 死碼移除 | 小 | 清理 |
| 11 | #8 裝備類物品對抗回應過濾 | 小 | Bug 修復 |
| 12 | #9 PIN 驗證邏輯統一 | 小 | 技術債 |
| 13 | #10 E2E Code Review 殘留 MEDIUM 修復 | 小 | 改善 |

#### #5.6-1 React 19 set-state-in-effect 重構

需要 E2E 覆蓋作為重構安全網，故排在 #6 之後。

#### #7 `item_give` 死碼移除

`item_give` 在 schema enum 中定義但 executor 未實作（空殼註解），與現有物品轉移（`item_take`/`item_steal`）無關。需從 skill effect enum、types、executor stub、UI 元件、知識庫文件中統一清除。

#### #8 裝備類物品對抗回應過濾

`contest-response-dialog.tsx` 和 `contest-validator.ts` 缺少 `item.type !== 'equipment'` 排除條件，裝備（被動增益）不應出現在對抗回應選項。前後端兩處同步修正。

#### #10 E2E Code Review 殘留 MEDIUM 修復

Phase 6b code review 中評估為低優先的 MEDIUM 項目，擇時修復：

- M1: `fixtures/index.ts` — `callSeed` 回傳 input data 而非 DB 值（需改 seed API 回傳完整 document）
- M3: `gm-broadcast.spec.ts:199-212` — broadcast payload fallback 掩蓋 schema 歧義
- M4: `contest-flow.spec.ts:983-1006` — CSS opacity 斷言耦合 Tailwind class
- M6: `auto-reveal.spec.ts:809` — `waitForTimeout(500)` 可被 clickSaveBar retry 取代
- M7: `item-transfer-effects.spec.ts:400,539` — 用 `.name` 找物品無唯一性保護
- M10: `app/actions/item-use.ts:521-578` — `targetUpdates` 混用 `$push`（production code，需謹慎）

#### #9 PIN 驗證邏輯統一

PIN 驗證規則（4 位數字 `/^\d{4}$/`）目前散落在至少 6 個檔案中，各自硬編碼 regex：
- `lib/character/character-validator.ts`（Zod schema + 手動 regex）
- `app/api/characters/[characterId]/unlock/route.ts`
- `app/actions/characters.ts`（createCharacter + checkPinAvailability）
- `components/gm/view-pin-button.tsx`
- `components/gm/pin-field.tsx`
- `components/gm/create-character-button.tsx`

應提取為單一 constant 或 Zod schema，前後端共用。可放在 `lib/character/character-validator.ts` 中 export regex + 錯誤訊息，其他檔案 import 使用。

---

## 注意事項

- 合併前需確保：
  - TypeScript 無型別錯誤（`npm run type-check`）
  - 單元/元件測試全部通過（`npm run test`）
  - Production build 成功（`npm run build`）
  - 若涉及 schema 變更，需附帶 migration 腳本
- 裝備系統（#3）、目標選擇（#4）和預設事件（#5）涉及 schema 變更，合併時需同步執行資料遷移
