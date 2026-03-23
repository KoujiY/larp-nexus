# LARP Nexus Refactoring Progress

> Resume instruction: Read this file and continue from the first `[ ]` item in the current phase.

## Refactoring Roadmap

- [x] Phase 0: Documentation & Knowledge Base ✅ 2026-03-23
  - ⏳ Deferred: `docs/specs/05_GM_PAGES_ARCHITECTURE.md` and `06_PLAYER_PAGES_ARCHITECTURE.md` — evaluate delete/refactor after Phase C (component architecture will change significantly)
- [ ] Phase A: Test Infrastructure + Type Consolidation
- [ ] Phase B+C: Backend & Frontend Refactoring (shared logic focus)
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

- [ ] gm/character/character-card.md
- [ ] gm/character/basic-info.md
- [ ] gm/character/public-info.md
- [ ] gm/character/hidden-info.md
- [ ] gm/character/stats.md
- [ ] gm/tasks/task-management.md
- [ ] gm/tasks/hidden-tasks-and-auto-reveal.md
- [ ] gm/items/item-concepts.md
- [ ] gm/items/item-effects-and-tags.md
- [ ] gm/skills/skill-concepts.md
- [ ] gm/skills/skill-effects-and-tags.md
- [ ] gm/game/game-settings.md
- [ ] gm/game/broadcast-system.md
- [ ] gm/game/game-states.md
- [ ] player/character-card-view.md
- [ ] player/item-usage.md
- [ ] player/skill-usage.md
- [ ] shared/contest/contest-flow.md
- [ ] shared/contest/check-mechanism.md
- [ ] shared/contest/tag-rules.md
- [ ] shared/auto-reveal-system.md
- [ ] shared/notification-system.md
- [ ] shared/websocket-events.md
- [ ] architecture/data-models.md
- [ ] architecture/api-reference.md
- [ ] architecture/deployment-and-env.md
- [ ] architecture/tech-stack.md

### 0-4. Update .claude/CLAUDE.md with development norms
- [x] Add knowledge base maintenance rule
- [x] Add knowledge base directory reference

---

## Phase A: Test Infrastructure + Type Consolidation

> TDD order: Vitest setup → write failing tests → refactor types → compose schemas

### A-1. Install and configure Vitest
- [ ] Add vitest to package.json
- [ ] Create vitest.config.ts
- [ ] Add `npm test` script

### A-2. Write unit tests for core logic (RED — failing tests first)
- [ ] contest-calculator.ts
- [ ] contest-validator.ts
- [ ] auto-reveal-evaluator.ts
- [ ] item-effect-executor.ts
- [ ] skill-effect-executor.ts
- [ ] character-cleanup.ts
- [ ] field-updaters.ts

### A-3. Centralize type definitions (GREEN — refactor under test coverage)
- [ ] Create `lib/db/types/mongo-helpers.ts` (MongoSecret, MongoTask, MongoItem, MongoStat)
- [ ] Create `lib/db/types/character-types.ts` (SkillType, ItemType — eliminate 8x duplication)
- [ ] Create `lib/db/schemas/shared-schemas.ts` (autoRevealConditionSchema — eliminate 2x duplication)

### A-4. Compose Character/CharacterRuntime schemas (GREEN — refactor under test coverage)
- [ ] Extract shared base schema fragment
- [ ] Refactor Character.ts to compose base + specific fields
- [ ] Refactor CharacterRuntime.ts to compose base + specific fields
- [ ] Target: eliminate ~600 lines of duplication

### A-5. Code Review
- [ ] `/code-review` on all Phase A changes

---

## Phase B+C: Backend & Frontend Refactoring

### B-1. Identify and extract shared logic
- [ ] Shared effect executor core (item + skill)
- [ ] Shared `useUsageFlow` hook (item + skill usage flow)
- [ ] Shared `RevealableItem` component (hidden-info + hidden-tasks reveal animation)
- [ ] Shared GM edit form patterns (items + skills forms)

### B-2. Server-side decomposition
- [ ] Create service layer for item-use, skill-use, contest-respond, character-update
- [ ] Create action wrapper utility (eliminate try/catch boilerplate)
- [ ] Split field-updaters.ts by domain (stats/skills/items/tasks/secrets)
- [ ] Split event-mappers.ts by event domain

### C-1. Client-side decomposition
- [ ] Decompose item-list.tsx (1,449 lines) → ItemCard, ItemDetailDialog, ItemTransferDialog, useItemUsageFlow
- [ ] Decompose skill-list.tsx (1,059 lines) → SkillCard, SkillDetailDialog, useSkillUsageFlow
- [ ] Decompose items-edit-form.tsx (1,011 lines)
- [ ] Decompose skills-edit-form.tsx (839 lines)
- [ ] Decompose character-card-view.tsx (780 lines)

### B+C Code Review
- [ ] `/code-review` on all Phase B+C changes
- [ ] Evaluate `docs/specs/05_GM_PAGES_ARCHITECTURE.md` and `06_PLAYER_PAGES_ARCHITECTURE.md` — delete or refactor

---

## Phase D: Full UI Redesign

- [ ] Evaluate Google Stitch for design generation
- [ ] Define design requirements (all platforms, readability focus)
- [ ] Evaluate Google Docs embedding for content-heavy sections
- [ ] Implement new UI design
- [ ] Mobile responsive verification
- [ ] `/code-review` on all Phase D changes

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
