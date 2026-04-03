# LARP Nexus Refactoring Progress

> Resume instruction: Read this file and continue from the first `[ ]` item in the current phase.

## Refactoring Roadmap

- [x] Phase 0: Documentation & Knowledge Base ✅ 2026-03-23 — 0-3 all 27 knowledge base files confirmed ✅ 2026-03-24
  - [x] Deleted `docs/specs/05_GM_PAGES_ARCHITECTURE.md` and `06_PLAYER_PAGES_ARCHITECTURE.md` ✅ 2026-03-24
- [x] Phase A: Test Infrastructure + Type Consolidation ✅ 2026-03-23
- [x] Phase B+C: Backend & Frontend Refactoring ✅ 2026-03-24 — B-2, C-1 complete; B-1 GM form patterns done; useUsageFlow + RevealableItem deferred to Phase D
- [x] Phase D: Full UI Redesign (Google Stitch) ✅ 2026-04-03 — 玩家端 + GM 端全畫面重設計完成
- [ ] Phase E: Test Coverage + Cleanup

---

## Phase 0: Documentation & Knowledge Base

### 0-1. Archive historical docs → `docs/archive/`
- [x] `requirements/LARP_NEXUS_PRD.md` → `archive/product-requirements.md` (summarized)
- [x] `requirements/LARP_NEXUX_REQUIREMENTS_UPDATE.md` → `archive/requirements-update.md` (summarized)
- [x] `requirements/CONTEST_SYSTEM_SPIKE_NOTE.md` → `archive/contest-system-spike.md` (summarized)
- [x] `refactoring/CONTEST_SYSTEM_CONTINUE.md` → `archive/contest-refactor-progress.md` (summarized)
- [x] `specs/01_PROJECT_STRUCTURE.md` → `archive/project-structure-legacy.md` (summarized)

### 0-2. Delete completed feature docs
- [x] `dev-notes/phase-8-temporary-effects.md`
- [x] `dev-notes/phase-9-offline-event-queue.md`
- [x] `dev-notes/phase-10-game-state-layers.md`
- [x] `dev-notes/phase8-10-remote-dependency-analysis.md`
- [x] `dev-notes/auto-reveal-item-showcase.md`
- [x] `dev-notes/fix-item-steal-and-contest-bugs.md`
- [x] `specs/SPEC-auto-reveal-item-showcase-2026-02-09.md`
- [x] `specs/SPEC-contest-stealth-tag-2026-02-09.md`
- [x] `specs/SPEC-game-state-layers-2026-02-17.md`
- [x] `specs/SPEC-offline-event-queue-2026-02-12.md`
- [x] `specs/SPEC-phase11-remote-services-deployment-2026-02-18.md`
- [x] `specs/SPEC-phase8-10-integration-testing-workflow-2026-02-19.md`
- [x] `specs/SPEC-temporary-effects-2026-02-12.md`
- [x] `specs/SPEC-unsaved-changes-guard-2026-03-04.md`

### 0-3. Build knowledge base skeleton → `docs/knowledge/`
Structure:
```
docs/knowledge/
  gm/
    character/
      character-card.md
      basic-info.md
      public-info.md
      hidden-info.md
      stats.md
    tasks/
      task-management.md
      hidden-tasks-and-auto-reveal.md
    items/
      item-concepts.md
      item-effects-and-tags.md
    skills/
      skill-concepts.md
      skill-effects-and-tags.md
    game/
      game-settings.md
      broadcast-system.md
      game-states.md
  player/
    character-card-view.md
    item-usage.md
    skill-usage.md
  shared/
    contest/
      contest-flow.md
      check-mechanism.md
      tag-rules.md
    auto-reveal-system.md
    notification-system.md
    websocket-events.md
  architecture/
    data-models.md
    api-reference.md
    deployment-and-env.md
    tech-stack.md
```

- [x] gm/character/character-card.md
- [x] gm/character/basic-info.md
- [x] gm/character/public-info.md
- [x] gm/character/hidden-info.md
- [x] gm/character/stats.md
- [x] gm/tasks/task-management.md
- [x] gm/tasks/hidden-tasks-and-auto-reveal.md
- [x] gm/items/item-concepts.md
- [x] gm/items/item-effects-and-tags.md
- [x] gm/skills/skill-concepts.md
- [x] gm/skills/skill-effects-and-tags.md
- [x] gm/game/game-settings.md
- [x] gm/game/broadcast-system.md
- [x] gm/game/game-states.md
- [x] player/character-card-view.md
- [x] player/item-usage.md
- [x] player/skill-usage.md
- [x] shared/contest/contest-flow.md
- [x] shared/contest/check-mechanism.md
- [x] shared/contest/tag-rules.md
- [x] shared/auto-reveal-system.md
- [x] shared/notification-system.md
- [x] shared/websocket-events.md
- [x] architecture/data-models.md
- [x] architecture/api-reference.md
- [x] architecture/deployment-and-env.md
- [x] architecture/tech-stack.md

### 0-4. Update .claude/CLAUDE.md with development norms
- [x] Add knowledge base maintenance rule
- [x] Add knowledge base directory reference

---

## Phase A: Test Infrastructure + Type Consolidation

> TDD order: Vitest setup → write failing tests → refactor types → compose schemas

### A-1. Install and configure Vitest ✅ 2026-03-23
- [x] Add vitest to package.json
- [x] Create vitest.config.ts
- [x] Add `npm test` script

### A-2. Write unit tests for core logic ✅ 2026-03-23
- [x] contest-calculator.ts (8 tests — pure functions, fully GREEN)
- [x] contest-validator.ts (22 tests — pure validators + mock-based)
- [x] auto-reveal-evaluator.ts (6 tests — vi.mock for DB/Pusher)
- [x] item-effect-executor.ts (2 tests — vi.mock skeleton)
- [x] skill-effect-executor.ts (2 tests — vi.mock skeleton)
- [x] character-cleanup.ts (27 tests — pure functions, fully GREEN)
- [x] field-updaters.ts (11 tests — pure functions, fully GREEN)

### A-3. Centralize type definitions ✅ 2026-03-23
- [x] Create `lib/db/types/mongo-helpers.ts` (MongoSecret, MongoTask, MongoItem, MongoStat, MongoSkill)
- [x] Create `lib/db/types/character-types.ts` (SkillType, ItemType — eliminated 10+ duplicates)
- [x] Create `lib/db/schemas/shared-schemas.ts` (autoRevealConditionSchema — eliminated 2x duplication)
- [x] Update 13 consumer files to import from centralized types
- [x] 95 tests passing, type-check clean

### A-4. Compose Character/CharacterRuntime schemas ✅ 2026-03-23
- [x] Create `lib/db/types/character-document-base.ts` (CharacterDocumentBase — shared interface ~160 lines)
- [x] Expand `lib/db/schemas/shared-schemas.ts` with `createBaseCharacterSchemaFields()` factory
- [x] Refactor `Character.ts`: 708 → 54 lines (−654)
- [x] Refactor `CharacterRuntime.ts`: 706 → 68 lines (−638)
- [x] Eliminated ~1292 lines of duplication; 95 tests passing, type-check clean

### A-5. Code Review ✅ 2026-03-23
- [x] `/code-review` on all Phase A changes
  - Fixed HIGH: createBaseCharacterSchemaFields factory (prevent Mongoose schema mutation)
  - Fixed HIGH: normalizeCheckConfig missing contestConfig downgraded to error log
  - Fixed HIGH: field-updaters public functions return strong types (MongoSkill[], MongoItem[], MongoTask[], MongoSecret[])
  - Fixed HIGH: MongoItemEffect/MongoSkillEffect exported from mongo-helpers; CharacterDocumentBase uses them
  - Fixed MEDIUM/LOW: test assertions strengthened, mockReturnValueOnce, globals:true removed, circular-dep comment added

---

## Phase B+C: Backend & Frontend Refactoring

### B-1. Identify and extract shared logic
- [x] Shared effect executor core → `lib/effects/shared-effect-executor.ts` (`computeStatChange`, `applyItemTransfer` — 14 tests)
- [x] Shared GM edit form patterns → `CheckConfigSection`, `UsageLimitSection`, `TagsSection` (achieved via C-1) ✅ 2026-03-24
- ~~⏳ Deferred to Phase D: `useUsageFlow` hook~~ → 不執行（~80% 重疊但差異在業務層面，premature abstraction）✅ 2026-04-03
- ~~⏳ Deferred to Phase D: `RevealableItem` component~~ → 不執行（Phase D 重設計後 secrets/tasks UI 已分化）✅ 2026-04-03

### B-2. Server-side decomposition ✅ 2026-03-23
- [x] Create service layer for item-use, skill-use, character-update (`withAction` wrapper applied; contest-respond kept as-is due to cleanup logic in catch)
- [x] Create action wrapper utility → `lib/actions/action-wrapper.ts` (eliminates try/catch + dbConnect boilerplate; 5 tests)
- [x] Split field-updaters.ts by domain → `lib/character/field-updaters/` (stats/skills/items/tasks/secrets/public-info + shared + index barrel; −757 lines)
- [x] Split event-mappers.ts by event domain → `lib/utils/event-mappers/` (item-events/role-events/skill-events/misc-events + types + index facade; −773 lines)

### C-1. Client-side decomposition
- [x] Decompose item-list.tsx (1,449 → 955 lines) → ItemCard, ItemDetailDialog, ItemTransferDialog, ItemShowcaseSelectDialog ✅ 2026-03-24
- [x] Decompose skill-list.tsx (1,059 → ~755 lines) → SkillCard, SkillDetailDialog ✅ 2026-03-24
- [x] Decompose items-edit-form.tsx (1,011 → ~450 lines) → CheckConfigSection, UsageLimitSection, TagsSection + pure utils ✅ 2026-03-24
- [x] Decompose skills-edit-form.tsx (839 → ~310 lines) → reuses CheckConfigSection, UsageLimitSection, TagsSection ✅ 2026-03-24
- [x] Decompose character-card-view.tsx (780 → 702 lines) → CharacterModeBanner, NotificationButton, GameEndedDialog ✅ 2026-03-24

### B+C Code Review
- [x] `/code-review` on all Phase B-2 changes ✅ 2026-03-24
  - Fixed HIGH: normalizeCheckConfig 改為純函數（回傳新物件，不 mutate 參數）
  - Fixed HIGH: withAction 型別修正（`any` → `ApiResponse<unknown>`，移除 eslint-disable，補充說明）
  - Fixed HIGH: 補充 field-updaters 測試（updateCharacterItems/Skills/Secrets/PublicInfo）
  - Fixed HIGH: setTimeout 副作用從 mapItemTransferred 移至 hook（use-character-websocket-handler.ts）
  - Fixed MEDIUM: shared-effect-executor.ts 的 `delete` mutation 改用 Object.fromEntries 過濾
  - Fixed MEDIUM: mapSkillContest 175 行拆分為 mapAttackerResult + mapDefenderResult
  - Fixed MEDIUM: withAction console.error 只記錄 message 避免洩漏使用者資料
  - Fixed MEDIUM: 補充 event-mappers 子模組測試（role / item / skill / misc）
  - 212 tests passing, type-check clean, 0 lint errors
- [x] Deleted `docs/specs/05_GM_PAGES_ARCHITECTURE.md` and `06_PLAYER_PAGES_ARCHITECTURE.md` — outdated after Phase C; knowledge base is authoritative reference ✅ 2026-03-24
- [x] Fixed HIGH (security): Player authorization for `useItem` / `useSkill` / `transferItem` — added `validatePlayerAccess()` + `unlockedCharacterIds` session field; unlock action writes to session on PIN success ✅ 2026-03-24

---

## Phase D: Full UI Redesign

> 詳細計畫見 `docs/refactoring/PHASE_D_PLAN.md`
> 分支：`feat/phase-d-ui-redesign`（從 `main` 分岐，Phase B+C 合併後開始）

- [ ] 執行 `PHASE_D_PLAN.md` 的所有項目
  - [x] D-5b-2 P1：角色編輯頁框架 + Sticky Save Bar + 7-Tab 導航 + 設計稿融合 ✅ 2026-04-02
  - [x] D-5b-2 P2：道具/技能編輯 Wizard ✅ 2026-04-02
  - [x] D-5b-2 P3：劇本管理頁 Baseline ✅ 2026-04-02
  - [x] D-5b-2 P4：Runtime 控制台 + Event Log API ✅ 2026-04-02
  - [x] D-5b-2 P5：7 個角色 Tab 內容 ✅ 2026-04-02
    - [x] P5-1：基本設定 Tab（basic-settings-tab.tsx）✅ 2026-04-02
    - [x] P5-2：背景故事 Tab（background-story-tab.tsx）✅ 2026-04-02
    - [x] P5-3：隱藏資訊 Tab（secrets-tab.tsx）✅ 2026-04-02
    - [x] P5-4：數值 Tab — 卡片 grid 佈局 + 百分比水印 + GmEmptyState ✅ 2026-04-02
    - [x] P5-5：任務 Tab — 雙欄佈局 + 展開/收合卡片 ✅ 2026-04-02
    - [x] P5-6：道具 Tab — AbilityCard grid + 圖片背景 + 展開/收合 ✅ 2026-04-02
    - [x] P5-7：技能 Tab — AbilityCard grid（與道具統一） ✅ 2026-04-02
  - [x] D-5b-2 P5-polish：7 Tab 統一收尾 ✅ 2026-04-03
    - [x] AbilityCard 展開內容重構（左側邊線資訊卡、GmInfoLine、效果詳情）
    - [x] 軟刪除 + 狀態 badge 統一（stats/tasks/items/skills/secrets 全數對齊）
    - [x] 共用元件抽取（GmInfoLine、GM_DETAIL_HEADER_CLASS、GM_ACCENT_CARD_CLASS）
    - [x] 空狀態統一（tasks 雙欄、secrets、relationships、角色列表 → GmEmptyState）
    - [x] GmEmptyState 支援 children slot（適配 CreateCharacterButton 等複合元件）
    - [x] Tab cursor-pointer 修正
    - [x] 知識庫同步更新（character-card / hidden-info / task-management）
  - [x] D-5b-2 P6：劇本列表頁 + 砍 Dashboard + 主題切換按鈕 ✅ 2026-04-03
    - [x] 側邊導航欄重設計：收合/展開雙模式（72px ↔ w-72）、localStorage 記憶、Tooltip
    - [x] 移除 Dashboard 頁面（重導向至 /games）、更新 proxy / verify redirect
    - [x] 導航項目精簡為 2 項（劇本管理 + 個人設定）
    - [x] 主題切換整合：GM layout 包裹 PlayerThemeWrapper、sidebar 加入 Sun/Moon 切換
    - [x] 劇本列表頁重設計：自訂卡片（金色角落裝飾、hover lift、pill badge、角色數量）
    - [x] getGames() 加入 characterCount（MongoDB aggregate 一次查完）
    - [x] CreateGameButton 支援 card variant（DashedAddButton 虛線卡片，Grid 第一位）
    - [x] 統一 DashedAddButton icon 為預設 PlusCircle（全系統 10+ 處一致）
  - [x] D-5b-2 P7：Dialog 群 ✅ 2026-04-03
    - [x] 共用 Dialog 樣式常量（GM_DIALOG_CONTENT_CLASS 等）加入 gm-form.ts
    - [x] DialogOverlay 全域加入 backdrop-blur-sm
    - [x] PinField 共用元件抽取（pin-field.tsx）— create-character-button + basic-settings-tab 共用
    - [x] §4.2 建立新劇本 Dialog 重設計（+ randomContestMaxValue 欄位、Input error 樣式）
    - [x] §4.6 新增角色 Dialog 重設計（PinField、填充式 Input、PIN 開關區塊）
    - [x] §4.17 結束遊戲 Dialog 重設計（頂部漸層條、居中警告、設計稿警告文案）
    - [x] createGame action 支援 randomContestMaxValue 參數
  - [x] D-5b-2 P8：個人設定頁 ✅ 2026-04-03
    - [x] PageLayout 新增 contentMaxWidth prop（header/content 獨立寬度控制）
    - [x] 頭像 camera badge（absolute 定位 + hover scale）
    - [x] INFO_ROWS 資料驅動的帳號資訊卡片
  - [x] D-5b-2 P9：登入頁（Magic Link 登入 + 驗證）✅ 2026-04-03
    - [x] Login 頁：Brand icon 圓形容器、glassmorphism 卡片、左側 icon input、漸層 CTA 按鈕、feature pills
    - [x] Verify 頁：CSS ring spinner（3s 慢轉）、三狀態視覺（verifying/success/error）、bouncing dots、返回按鈕 arrow hover
    - [x] 兩頁皆使用瀏覽器主題偏好（語意 token），移除 shadcn Card 改用原生 glassmorphism
    - [x] Profile 頁頭像與卡片間距修正（space-y-8 → space-y-10，移除多餘 mb-4）
  - [x] D-5b-2 P10：儲存按鈕功能盤點（不需設計稿，純邏輯）✅ 2026-04-03
    - [x] StickySaveBar「全部儲存」與「捨棄變更」接線至 7 個 Tab 的 save/discard handler
    - [x] 各 Tab 透過 onRegisterSave / onRegisterDiscard 註冊 handler，useCharacterEditState 統一調度
    - [x] 3 個表單型 Tab（basic/background/secrets）+ 4 個陣列型 Tab（stats/tasks/items/skills）全數完成
  - [x] D-5b-2 P11：Bug 修復與功能補完 ✅ 2026-04-03
    - [x] Baseline/Runtime 資料分離修正：`getCharactersByGameId` 與 `getGameItems` 在 `game.isActive` 時讀取 Runtime 資料
    - [x] 離開未儲存頁面的瀏覽器攔截：`useFormGuard` 三層攔截（beforeunload + pushState + popstate）
    - [x] 廣播寫入 Log：`pushEvent` 同時寫入 Log collection（game-level 單筆，不重複）
    - [x] PillToggle 暗色模式修正：`bg-white` → `bg-background`
    - [x] Log 精確記錄：只記錄實際變更的欄位（before/after 比對），修正 publicInfo 部分欄位比對邏輯
    - [x] StickySaveBar + toast 時序修正：新增 `SaveHandlerOptions.silent`，批次儲存時抑制個別 toast，延遲 400ms 顯示統一摘要
    - [x] RuntimeConsole WebSocket 即時更新：僅監聯 stat 變動事件，client-side state 更新（零 DB 查詢）
  - [x] D-6 追加修正 ✅ 2026-04-03
    - [x] 規格文件同步：02_DATABASE_SCHEMA (v1.5) / 03_API_SPECIFICATION (v1.9) / 04_WEBSOCKET_EVENTS / USER_GUIDE — publicInfo BackgroundBlock 結構、PIN 4 位數字
    - [x] 知識庫同步：architecture/data-models.md Phase D 標記已完成、gm/character/basic-info.md PIN 儲存方式修正
    - [x] 登出確認 Dialog：ExpandedNavigation / CollapsedNavigation 加入 LogoutConfirmDialog
    - [x] sidebar cascading render 修正：useEffect + setState → lazy initializer

### 設計決策備註

- **`ContestConfig.opponentMaxItems` / `opponentMaxSkills` 維持 number 型別**（2026-03-30）：不轉換為 boolean/checkbox，因轉換成本過高（型別、schema、validator、測試涉及 10+ 檔案）。現行 `0` = 不允許、`>0` = 允許 的邏輯已正確運作。
- **玩家對抗回應類型互斥**（2026-03-30）：即使 GM 同時允許道具與技能，玩家只能選擇一種回應類型（道具 OR 技能）。此限制在 `contest-response-dialog.tsx` 前端強制執行。
- **統一目標道具選擇 Dialog**（2026-03-31）：將對抗場景（`selectTargetItemForContest`）和非對抗場景（`selectTargetItemAfterUse`）的道具選擇 UI 統一為 `TargetItemSelectionDialog`（`mode: 'contest' | 'post-use'`），移除了 bottom sheet 內嵌的 Select 下拉 UI。刪除 `usePostUseTargetItemSelection` hook 和 `target-selection-section.tsx` 空殼組件。
- **移除全域 toast，改用 notify 工具**（2026-03-31）：玩家側所有 `toast` 調用替換為 `notify.error` / `notify.warning`，遊戲機制結果僅透過通知面板呈現。刪除 `UseResultDisplay` 和 `GameWebSocketSubscriber`。`Toaster` 掛載於 `PlayerThemeWrapper`，position top-center。
- **Game publicInfo 資料模型統一**（2026-04-01）：`publicInfo.{ worldSetting, intro, chapters }` 改為 `publicInfo.{ blocks: BackgroundBlock[] }`，與角色背景共用同一段落結構。GM 端公開資訊編輯器從 textarea 改為 `BackgroundBlockEditor`（拖拉排序的標題/內文區塊）。已執行一次性遷移腳本轉換既有資料。
- **共用元件抽取**（2026-04-01）：從角色卡與世界觀頁面抽取 4 個共用元件 — `ThemeToggleButton`（fixed/inline 雙模式）、`CollapsibleSection`（琥珀標題 + 摺疊）、`BackgroundBlockRenderer`（BackgroundBlock[] 渲染器）、`CharacterAvatarList`（橫向捲動頭像選擇器）。角色卡的故事 Tab 和人物關係 Tab 已改用這些共用元件。
- **GM 側共用樣式與元件系統**（2026-04-03）：建立 `lib/styles/gm-form.ts` 集中管理 GM 側所有表單/卡片/badge 樣式常數（label、input、select、error、section、scrollbar、badge variants、展開區塊）。新增共用元件 `GmInfoLine`（label:value 資訊行）、`GmEmptyState`（統一空狀態，支援 actionLabel 或 children slot）。所有 7 個 tab 統一採用軟刪除模式（`deletedIds: Set` + `effectiveData`）與狀態 badge 系統（NEW / MODIFIED）。
- **GM 側導航與主題系統**（2026-04-03）：側邊欄支援收合/展開雙模式（`gm-sidebar-collapsed` localStorage），收合態 72px icon-only + shadcn Tooltip，展開態 w-72 含文字標籤。GM layout 包裹 `PlayerThemeWrapper`，共用玩家端主題 context（同一 localStorage key `player-theme`），未來 P8 再評估是否拆分兩端主題。Dashboard 頁面已移除，登入後直接導向 `/games`。
- **GM Dialog 統一設計系統**（2026-04-03）：三個 GM Dialog（建立劇本、新增角色、結束遊戲）統一使用 warm cream 背景（`oklch(0.975 0.008 80)`）、無 border、`rounded-xl shadow-2xl`、隱藏 X 按鈕。共用常量定義在 `lib/styles/gm-form.ts`（`GM_DIALOG_CONTENT_CLASS`、`GM_CTA_BUTTON_CLASS`、`GM_CANCEL_BUTTON_CLASS` 等）。Input 統一採用填充式（`bg-muted border-none`），新增 `GM_INPUT_ERROR_CLASS` 供錯誤狀態使用。PIN 輸入邏輯（debounce 500ms + 5-state 可用性檢查）抽取為 `PinField` 共用元件（`components/gm/pin-field.tsx`），由建立角色 Dialog 和角色編輯頁基本設定 Tab 共用。
- **劇本卡片角色數量**（2026-04-03）：`getGames()` 使用 MongoDB `aggregate` + `$group` 一次查完所有劇本的角色數量，避免 N+1 查詢。`GameData.characterCount` 為 optional 欄位，僅列表頁回傳。

---

## Phase E: Test Coverage + Cleanup

- [ ] Add component tests (post-UI stabilization)
- [ ] Add E2E tests for critical user flows
- [ ] Remove unused Jotai dependency (or adopt it)
- [ ] Resolve lib/utils.ts vs lib/utils/ ambiguity
- [ ] Complete JSDoc coverage
- [ ] Final `/code-review`
- [x] 清理功能性死碼：`app/unlock/page.tsx`、`app/actions/unlock.ts`、`lib/game/get-characters-by-pin.ts` ✅ 2026-03-26
- [ ] 清理 `components/gm/save-button.tsx`（Phase D 前的舊元件，目前無人使用）
- [ ] 拆分 `app/actions/character-update.ts`（`updateCharacter` 460 行，超出 50 行函式上限）
- [ ] 拆分 `app/actions/characters.ts`（833 行，超出 800 行檔案上限）
- [ ] `deleteGame` 補刪關聯角色（既有 TODO，刪除劇本後 Character/CharacterRuntime 文件成為孤兒）
- [ ] `useFormGuard` module-level mutable state 評估替代方案（ref-counting + pushState monkey-patch 在第三方 SDK 共存時可能衝突）
- [ ] 合併至 `main`（全部 Phase 完成後執行）

---

## Key File Reference

| File | Lines | Phase | Action |
|------|-------|-------|--------|
| components/player/item-list.tsx | 1,449 | C-1 | Decompose |
| components/player/skill-list.tsx | 1,059 | C-1 | Decompose |
| components/gm/items-edit-form.tsx | 1,011 | C-1 | Decompose |
| components/gm/skills-edit-form.tsx | 839 | C-1 | Decompose |
| app/actions/characters.ts | 813 | B-2 | Service layer |
| lib/db/models/Character.ts | 708 | A-4 | Compose schema |
| lib/db/models/CharacterRuntime.ts | 706 | A-4 | Compose schema |
| lib/utils/event-mappers.ts | 773 | B-2 | Split by domain |
| lib/character/field-updaters.ts | 757 | B-2 | Split by domain |
| app/actions/character-update.ts | 653 | B-2 | Service layer |
| app/actions/item-use.ts | 650 | B-2 | Service layer |
