# LARP Nexus Refactoring Progress

> Resume instruction: Read this file and continue from the first `[ ]` item in the current phase.

## Refactoring Roadmap

- [x] Phase 0: Documentation & Knowledge Base ✅ 2026-03-23 — 0-3 all 27 knowledge base files confirmed ✅ 2026-03-24
  - [x] Deleted `docs/specs/05_GM_PAGES_ARCHITECTURE.md` and `06_PLAYER_PAGES_ARCHITECTURE.md` ✅ 2026-03-24
- [x] Phase A: Test Infrastructure + Type Consolidation ✅ 2026-03-23
- [x] Phase B+C: Backend & Frontend Refactoring ✅ 2026-03-24 — B-2, C-1 complete; B-1 GM form patterns done; useUsageFlow + RevealableItem deferred to Phase D
- [ ] Phase D: Full UI Redesign (evaluate Google Stitch)
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
- ⏳ Deferred to Phase D: `useUsageFlow` hook — hooks already clean; item/skill flows have enough divergence; full refactor premature before UI redesign
- ⏳ Deferred to Phase D: `RevealableItem` component — no existing duplication to extract; Phase D will redesign reveal UI

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
- [ ] 合併至 `main`

---

## Phase E: Test Coverage + Cleanup

- [ ] Add component tests (post-UI stabilization)
- [ ] Add E2E tests for critical user flows
- [ ] Remove unused Jotai dependency (or adopt it)
- [ ] Resolve lib/utils.ts vs lib/utils/ ambiguity
- [ ] Complete JSDoc coverage
- [ ] Final `/code-review`

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
