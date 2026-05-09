# 隱藏技能/物品系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為技能和物品新增隱藏屬性，支援雙向切換（隱藏 ↔ 揭露），整合自動觸發引擎、預設事件、WebSocket 通知。

**Architecture:** 擴充現有自動揭露引擎，在 secrets → tasks 的兩層連鎖後新增 skills/items 第三層。使用單一 `isHidden` 布林欄位表達可見狀態，`visibilityConditions` 陣列定義觸發規則。伺服器端過濾確保隱藏資料不傳到玩家端。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + MongoDB (Mongoose) + Pusher WebSocket + Vitest + Playwright

**Design Spec:** `docs/superpowers/specs/2026-05-10-hidden-skills-items-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `lib/reveal/__tests__/visibility-toggle.test.ts` | 可見性切換邏輯的單元測試 |
| `lib/reveal/visibility-toggle.ts` | 技能/物品隱藏/揭露的 DB 更新 + 事件發射 |
| `e2e/flows/hidden-skills-items.spec.ts` | 隱藏技能/物品 E2E 全流程 |

### Modified Files
| File | Changes |
|------|---------|
| `types/character.ts` | 新增 `VisibilityCondition` 型別、擴充 `Skill`/`Item` 欄位 |
| `types/event.ts` | 新增 4 個 WebSocket 事件介面 |
| `types/game.ts` | 擴充 `PresetEventActionType` |
| `lib/db/schemas/shared-schemas.ts` | Skills/Items schema 新增欄位 |
| `lib/reveal/auto-reveal-evaluator.ts` | 擴充 `isConditionMet`、新增 skills/items 評估層 |
| `lib/reveal/reveal-event-emitter.ts` | 新增 4 個事件發射 re-export |
| `lib/reveal/__tests__/auto-reveal-evaluator.test.ts` | 新增條件類型測試 |
| `lib/websocket/events.ts` | 新增 4 個事件發射函式 |
| `lib/preset-event/execute-preset-event.ts` | 新增 4 種動作處理 |
| 玩家端資料 API / Server Action | 過濾 `isHidden` |
| `components/gm/ability-edit-wizard.tsx` | Step 1 新增隱藏開關 + 條件編輯器 |
| GM 控制台角色詳情 | 隱藏 badge + 切換按鈕 |
| `components/gm/preset-event-action-editor.tsx` | 新增 4 種動作 UI |

---

## Task 1: 型別定義

**Files:**
- Modify: `types/character.ts`
- Modify: `types/event.ts`
- Modify: `types/game.ts`

- [ ] **Step 1: 新增 VisibilityCondition 型別到 `types/character.ts`**

在 `AutoRevealCondition` 介面下方新增：

```typescript
/**
 * 技能/物品可見性觸發動作
 */
export type VisibilityAction = 'reveal' | 'hide';

/**
 * 技能/物品可見性觸發條件類型
 * 包含原有 AutoRevealConditionType 的條件 + 新增的 skill/item 條件
 */
export type VisibilityConditionType =
  | 'items_viewed'
  | 'items_acquired'
  | 'secrets_revealed'
  | 'skill_used'
  | 'item_used'
  | 'skills_revealed'
  | 'items_revealed';

/**
 * 技能/物品可見性觸發條件
 * 每個條件自帶 action 決定觸發後是揭露還是隱藏
 */
export interface VisibilityCondition {
  action: VisibilityAction;
  type: VisibilityConditionType;
  itemIds?: string[];
  secretIds?: string[];
  skillIds?: string[];
  matchLogic?: 'and' | 'or';
}
```

- [ ] **Step 2: 擴充 Skill 介面**

在 `Skill` 介面的 `effects` 欄位後新增：

```typescript
  // 隱藏技能系統
  isHidden?: boolean;
  hiddenAt?: Date;
  visibilityConditions?: VisibilityCondition[];
```

- [ ] **Step 3: 擴充 Item 介面**

在 `Item` 介面的 `statBoosts` 欄位後新增：

```typescript
  // 隱藏物品系統
  isHidden?: boolean;
  hiddenAt?: Date;
  visibilityConditions?: VisibilityCondition[];
```

- [ ] **Step 4: 新增 WebSocket 事件介面到 `types/event.ts`**

在 `TaskRevealedEvent` 下方新增：

```typescript
/**
 * 隱藏技能揭露事件
 */
export interface SkillRevealedEvent extends BaseEvent<{
  characterId: string;
  skillId: string;
  skillName: string;
  revealType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'skill.revealed';
}

/**
 * 技能隱藏事件
 */
export interface SkillHiddenEvent extends BaseEvent<{
  characterId: string;
  skillId: string;
  skillName: string;
  hideType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'skill.hidden';
}

/**
 * 隱藏物品揭露事件
 */
export interface ItemRevealedEvent extends BaseEvent<{
  characterId: string;
  itemId: string;
  itemName: string;
  revealType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'item.revealed';
}

/**
 * 物品隱藏事件
 */
export interface ItemHiddenEvent extends BaseEvent<{
  characterId: string;
  itemId: string;
  itemName: string;
  hideType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'item.hidden';
}
```

在 `WebSocketEvent` 聯合類型中新增：

```typescript
  | SkillRevealedEvent
  | SkillHiddenEvent
  | ItemRevealedEvent
  | ItemHiddenEvent
```

同時在檔案頂部的 import-like type 列表中加入這 4 個新介面的 export。

- [ ] **Step 5: 擴充 `types/game.ts` 預設事件動作類型**

修改 `PresetEventActionType`：

```typescript
export type PresetEventActionType =
  | 'broadcast'
  | 'stat_change'
  | 'reveal_secret'
  | 'reveal_task'
  | 'reveal_skill'
  | 'hide_skill'
  | 'reveal_item'
  | 'hide_item';
```

- [ ] **Step 6: 執行型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors（新增型別是 additive，不影響現有程式碼）

- [ ] **Step 7: Commit**

```bash
git add types/character.ts types/event.ts types/game.ts
git commit -m "feat: add type definitions for hidden skills/items system"
```

---

## Task 2: DB Schema

**Files:**
- Modify: `lib/db/schemas/shared-schemas.ts`

- [ ] **Step 1: 在 `createSkillsSchemaField()` 新增欄位**

在 `effects` 陣列定義之後新增：

```typescript
      // 隱藏技能系統
      isHidden: { type: Boolean, default: false },
      hiddenAt: { type: Date },
      visibilityConditions: [{
        _id: false,
        action: { type: String, enum: ['reveal', 'hide'], required: true },
        type: {
          type: String,
          enum: [
            'items_viewed', 'items_acquired', 'secrets_revealed',
            'skill_used', 'item_used', 'skills_revealed', 'items_revealed',
          ],
          required: true,
        },
        itemIds: [String],
        secretIds: [String],
        skillIds: [String],
        matchLogic: { type: String, enum: ['and', 'or'], default: 'and' },
      }],
```

- [ ] **Step 2: 在 `createItemsSchemaField()` 新增相同欄位**

在 `statBoosts` 陣列定義之後新增完全相同的三個欄位（`isHidden`、`hiddenAt`、`visibilityConditions`）。

- [ ] **Step 3: 執行型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add lib/db/schemas/shared-schemas.ts
git commit -m "feat: add hidden fields to skills and items schema"
```

---

## Task 3: WebSocket 事件發射

**Files:**
- Modify: `lib/websocket/events.ts`
- Modify: `lib/reveal/reveal-event-emitter.ts`

- [ ] **Step 1: 在 `lib/websocket/events.ts` 新增 4 個事件發射函式**

在 `emitTaskRevealed` 函式下方新增：

```typescript
/** 推送「技能揭露」事件到角色頻道，同時寫入 pending events */
export async function emitSkillRevealed(characterId: string, payload: SkillRevealedEvent['payload']) {
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'skill.revealed', payloadWithId),
    writePendingEvent(characterId, 'skill.revealed', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「技能隱藏」事件到角色頻道，同時寫入 pending events */
export async function emitSkillHidden(characterId: string, payload: SkillHiddenEvent['payload']) {
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'skill.hidden', payloadWithId),
    writePendingEvent(characterId, 'skill.hidden', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「物品揭露」事件到角色頻道，同時寫入 pending events */
export async function emitItemRevealed(characterId: string, payload: ItemRevealedEvent['payload']) {
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'item.revealed', payloadWithId),
    writePendingEvent(characterId, 'item.revealed', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「物品隱藏」事件到角色頻道，同時寫入 pending events */
export async function emitItemHidden(characterId: string, payload: ItemHiddenEvent['payload']) {
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'item.hidden', payloadWithId),
    writePendingEvent(characterId, 'item.hidden', payloadWithId as Record<string, unknown>),
  ]);
}
```

在檔案頂部 import 中加入 `SkillRevealedEvent, SkillHiddenEvent, ItemRevealedEvent, ItemHiddenEvent`。

- [ ] **Step 2: 在 `lib/reveal/reveal-event-emitter.ts` re-export 新函式**

```typescript
export {
  emitSecretRevealed,
  emitTaskRevealed,
  emitItemShowcased,
  emitSkillRevealed,
  emitSkillHidden,
  emitItemRevealed,
  emitItemHidden,
} from '@/lib/websocket/events';
```

- [ ] **Step 3: 執行型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add lib/websocket/events.ts lib/reveal/reveal-event-emitter.ts
git commit -m "feat: add WebSocket events for skill/item visibility changes"
```

---

## Task 4: 自動揭露引擎 — 單元測試（RED）

**Files:**
- Modify: `lib/reveal/__tests__/auto-reveal-evaluator.test.ts`

- [ ] **Step 1: 擴充 `makeCharacter` helper，新增 skills/items 支援**

在現有的 `makeCharacter` 函式中加入 `skills` 和 `items` 到 overrides 型別和預設值：

```typescript
function makeCharacter(overrides: Partial<{
  secretInfo: { secrets: unknown[] }
  tasks: unknown[]
  viewedItems: Array<{ itemId: string }>
  items: Array<{ id: string; name?: string; isHidden?: boolean; visibilityConditions?: unknown[] }>
  skills: Array<{ id: string; name?: string; isHidden?: boolean; visibilityConditions?: unknown[] }>
}> = {}) {
  return {
    _id: 'char-id',
    secretInfo: { secrets: [] },
    tasks: [],
    viewedItems: [],
    items: [],
    skills: [],
    ...overrides,
  }
}
```

- [ ] **Step 2: 新增 `isConditionMet` 新條件類型測試**

在現有測試檔案中新增 describe block：

```typescript
describe('skill/item visibility conditions', () => {
  it('reveals hidden skill when skill_used condition is met (AND)', async () => {
    const character = makeCharacter({
      skills: [{
        id: 'sk1', name: 'Hidden Skill', isHidden: true,
        visibilityConditions: [{
          action: 'reveal', type: 'skill_used',
          skillIds: ['sk-trigger'], matchLogic: 'and',
        }],
      }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', {
      type: 'skill_used', skillIds: ['sk-trigger'],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'skill', action: 'reveal', id: 'sk1',
    })
  })

  it('hides visible item when item_used condition is met', async () => {
    const character = makeCharacter({
      items: [{
        id: 'it1', name: 'Visible Item', isHidden: false,
        visibilityConditions: [{
          action: 'hide', type: 'item_used',
          itemIds: ['it-trigger'], matchLogic: 'and',
        }],
      }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', {
      type: 'item_used', itemIds: ['it-trigger'],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'item', action: 'hide', id: 'it1',
    })
  })

  it('does not reveal already-visible skill (no-op)', async () => {
    const character = makeCharacter({
      skills: [{
        id: 'sk1', name: 'Visible Skill', isHidden: false,
        visibilityConditions: [{
          action: 'reveal', type: 'skill_used',
          skillIds: ['sk-trigger'], matchLogic: 'and',
        }],
      }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const result = await executeAutoReveal('char-id', {
      type: 'skill_used', skillIds: ['sk-trigger'],
    })

    expect(result).toEqual([])
  })

  it('does not hide already-hidden item (no-op)', async () => {
    const character = makeCharacter({
      items: [{
        id: 'it1', name: 'Hidden Item', isHidden: true,
        visibilityConditions: [{
          action: 'hide', type: 'item_used',
          itemIds: ['it-trigger'], matchLogic: 'and',
        }],
      }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const result = await executeAutoReveal('char-id', {
      type: 'item_used', itemIds: ['it-trigger'],
    })

    expect(result).toEqual([])
  })

  it('supports skills_revealed chain (same-layer)', async () => {
    const character = makeCharacter({
      skills: [
        {
          id: 'sk1', name: 'Skill A', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skill_used',
            skillIds: ['sk-trigger'], matchLogic: 'and',
          }],
        },
        {
          id: 'sk2', name: 'Skill B', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skills_revealed',
            skillIds: ['sk1'], matchLogic: 'and',
          }],
        },
      ],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', {
      type: 'skill_used', skillIds: ['sk-trigger'],
    })

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['sk1', 'sk2'])
  })

  it('limits same-layer chain to one round', async () => {
    const character = makeCharacter({
      skills: [
        {
          id: 'sk1', name: 'Skill A', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skill_used',
            skillIds: ['sk-trigger'], matchLogic: 'and',
          }],
        },
        {
          id: 'sk2', name: 'Skill B', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skills_revealed',
            skillIds: ['sk1'], matchLogic: 'and',
          }],
        },
        {
          id: 'sk3', name: 'Skill C', isHidden: true,
          visibilityConditions: [{
            action: 'reveal', type: 'skills_revealed',
            skillIds: ['sk2'], matchLogic: 'and',
          }],
        },
      ],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', {
      type: 'skill_used', skillIds: ['sk-trigger'],
    })

    // sk1 and sk2 revealed, sk3 NOT revealed (chain limited to one round)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['sk1', 'sk2'])
  })

  it('supports OR match logic for skill_used', async () => {
    const character = makeCharacter({
      skills: [{
        id: 'sk1', name: 'Hidden Skill', isHidden: true,
        visibilityConditions: [{
          action: 'reveal', type: 'skill_used',
          skillIds: ['sk-a', 'sk-b'], matchLogic: 'or',
        }],
      }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)
    vi.mocked(Character.findByIdAndUpdate).mockResolvedValue(null)

    const result = await executeAutoReveal('char-id', {
      type: 'skill_used', skillIds: ['sk-b'],
    })

    expect(result).toHaveLength(1)
  })

  it('does not trigger AND when only partial skillIds match', async () => {
    const character = makeCharacter({
      skills: [{
        id: 'sk1', name: 'Hidden Skill', isHidden: true,
        visibilityConditions: [{
          action: 'reveal', type: 'skill_used',
          skillIds: ['sk-a', 'sk-b'], matchLogic: 'and',
        }],
      }],
    })
    vi.mocked(getCharacterData).mockResolvedValue(character as never)

    const result = await executeAutoReveal('char-id', {
      type: 'skill_used', skillIds: ['sk-a'],
    })

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 3: 更新 mock 加入新事件發射函式**

在 `vi.mock('@/lib/reveal/reveal-event-emitter'...)` 中加入：

```typescript
vi.mock('@/lib/reveal/reveal-event-emitter', () => ({
  emitSecretRevealed: vi.fn().mockResolvedValue(undefined),
  emitTaskRevealed: vi.fn().mockResolvedValue(undefined),
  emitSkillRevealed: vi.fn().mockResolvedValue(undefined),
  emitSkillHidden: vi.fn().mockResolvedValue(undefined),
  emitItemRevealed: vi.fn().mockResolvedValue(undefined),
  emitItemHidden: vi.fn().mockResolvedValue(undefined),
}))
```

- [ ] **Step 4: 執行測試確認全部 FAIL**

Run: `pnpm vitest run lib/reveal/__tests__/auto-reveal-evaluator.test.ts`
Expected: 新增的 7 個測試全部 FAIL（`skill_used` trigger type 不存在、skills/items 評估邏輯未實作）

- [ ] **Step 5: Commit**

```bash
git add lib/reveal/__tests__/auto-reveal-evaluator.test.ts
git commit -m "test: add failing tests for skill/item visibility conditions"
```

---

## Task 5: 自動揭露引擎 — 實作（GREEN）

**Files:**
- Modify: `lib/reveal/auto-reveal-evaluator.ts`

- [ ] **Step 1: 擴充 imports 和型別**

在檔案頂部加入新的 import：

```typescript
import type { AutoRevealCondition, VisibilityCondition } from '@/types/character';
import {
  emitSecretRevealed, emitTaskRevealed,
  emitSkillRevealed, emitSkillHidden,
  emitItemRevealed, emitItemHidden,
} from './reveal-event-emitter';
```

新增 SkillEntry / ItemEntry 介面（比照現有 SecretEntry / TaskEntry）：

```typescript
/** 技能結構（簡化） */
interface SkillEntry {
  id: string;
  name: string;
  isHidden?: boolean;
  visibilityConditions?: Array<{
    action: string;
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    skillIds?: string[];
    matchLogic?: string;
  }>;
}

/** 物品結構（簡化） */
interface ItemEntry {
  id: string;
  name: string;
  isHidden?: boolean;
  equipped?: boolean;
  visibilityConditions?: Array<{
    action: string;
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    skillIds?: string[];
    matchLogic?: string;
  }>;
}
```

- [ ] **Step 2: 重構 `isConditionMet` 為 context 參數**

定義 context 介面：

```typescript
interface ConditionContext {
  viewedItemIds: Set<string>;
  ownedItemIds: Set<string>;
  revealedSecretIds: Set<string>;
  usedSkillIds: Set<string>;
  usedItemIds: Set<string>;
  revealedSkillIds: Set<string>;
  revealedItemIds: Set<string>;
}
```

修改 `isConditionMet` 簽名和內部邏輯，將散落參數改為 `context: ConditionContext`。新增 4 個條件分支：

```typescript
if (condition.type === 'skill_used') {
  const targetIds = (condition as VisibilityCondition).skillIds ?? [];
  if (targetIds.length === 0) return false;
  const matchLogic = condition.matchLogic ?? 'and';
  if (matchLogic === 'and') {
    return targetIds.every((id) => context.usedSkillIds.has(id));
  } else {
    return targetIds.some((id) => context.usedSkillIds.has(id));
  }
}

if (condition.type === 'item_used') {
  const targetIds = condition.itemIds ?? [];
  if (targetIds.length === 0) return false;
  const matchLogic = condition.matchLogic ?? 'and';
  if (matchLogic === 'and') {
    return targetIds.every((id) => context.usedItemIds.has(id));
  } else {
    return targetIds.some((id) => context.usedItemIds.has(id));
  }
}

if (condition.type === 'skills_revealed') {
  const targetIds = (condition as VisibilityCondition).skillIds ?? [];
  if (targetIds.length === 0) return false;
  const matchLogic = condition.matchLogic ?? 'and';
  if (matchLogic === 'and') {
    return targetIds.every((id) => context.revealedSkillIds.has(id));
  } else {
    return targetIds.some((id) => context.revealedSkillIds.has(id));
  }
}

if (condition.type === 'items_revealed') {
  const targetIds = condition.itemIds ?? [];
  if (targetIds.length === 0) return false;
  const matchLogic = condition.matchLogic ?? 'and';
  if (matchLogic === 'and') {
    return targetIds.every((id) => context.revealedItemIds.has(id));
  } else {
    return targetIds.some((id) => context.revealedItemIds.has(id));
  }
}
```

同時更新現有的 `evaluateSecretConditions` 和 `evaluateTaskConditions` 呼叫端，將散落參數改為傳入 context。

- [ ] **Step 3: 擴充 `RevealResult` 和 `RevealTrigger`**

```typescript
export interface RevealResult {
  type: 'secret' | 'task' | 'skill' | 'item';
  action: 'reveal' | 'hide';
  id: string;
  title: string;
  triggerReason: string;
}

export type RevealTrigger =
  | { type: 'items_viewed'; itemIds: string[] }
  | { type: 'items_acquired' }
  | { type: 'secret_revealed' }
  | { type: 'skill_used'; skillIds: string[] }
  | { type: 'item_used'; itemIds: string[] }
  | { type: 'skill_visibility_changed' }
  | { type: 'item_visibility_changed' }
  | { type: 'manual_reveal' }
  | { type: 'manual_hide' }
  | { type: 'preset_event' };
```

為現有的 secret/task reveal results 補上 `action: 'reveal'`（它們永遠是 reveal）。

- [ ] **Step 4: 新增 `evaluateSkillItemConditions` 函式**

```typescript
function evaluateSkillItemConditions(
  skills: SkillEntry[],
  items: ItemEntry[],
  context: ConditionContext,
): RevealResult[] {
  const results: RevealResult[] = [];

  for (const skill of skills) {
    if (!skill.visibilityConditions?.length) continue;
    for (const vc of skill.visibilityConditions) {
      const condition = toVisibilityCondition(vc);
      if (!condition) continue;
      // action=reveal 只對隱藏中的技能生效
      if (condition.action === 'reveal' && !skill.isHidden) continue;
      // action=hide 只對可見的技能生效
      if (condition.action === 'hide' && skill.isHidden) continue;

      if (isConditionMet(condition, context)) {
        results.push({
          type: 'skill',
          action: condition.action,
          id: skill.id,
          title: skill.name,
          triggerReason: buildTriggerReason(condition),
        });
        break; // 同一個 skill 只觸發第一個匹配的條件
      }
    }
  }

  for (const item of items) {
    if (!item.visibilityConditions?.length) continue;
    for (const vc of item.visibilityConditions) {
      const condition = toVisibilityCondition(vc);
      if (!condition) continue;
      if (condition.action === 'reveal' && !item.isHidden) continue;
      if (condition.action === 'hide' && item.isHidden) continue;

      if (isConditionMet(condition, context)) {
        results.push({
          type: 'item',
          action: condition.action,
          id: item.id,
          title: item.name,
          triggerReason: buildTriggerReason(condition),
        });
        break;
      }
    }
  }

  return results;
}
```

新增 `toVisibilityCondition` helper（比照 `toAutoRevealCondition`）：

```typescript
function toVisibilityCondition(
  raw: SkillEntry['visibilityConditions'] extends Array<infer T> ? T : never
): VisibilityCondition | null {
  if (!raw) return null;
  return {
    action: raw.action as VisibilityCondition['action'],
    type: raw.type as VisibilityCondition['type'],
    itemIds: raw.itemIds,
    secretIds: raw.secretIds,
    skillIds: raw.skillIds,
    matchLogic: raw.matchLogic as VisibilityCondition['matchLogic'],
  };
}
```

擴充 `buildTriggerReason`：

```typescript
case 'skill_used':
  return '滿足技能使用條件';
case 'item_used':
  return '滿足道具使用條件';
case 'skills_revealed':
  return '滿足技能揭露條件';
case 'items_revealed':
  return '滿足道具揭露條件';
```

- [ ] **Step 5: 擴充 `executeAutoReveal` 主函式**

在現有的 secrets → tasks 評估後，新增第三層和第四層：

```typescript
// 現有：3. 評估隱藏資訊
// 現有：4. 更新 revealedSecretIds
// 現有：5. 評估隱藏目標

// --- 新增：建構 context ---
const usedSkillIds = new Set<string>(
  trigger.type === 'skill_used' ? trigger.skillIds : []
);
const usedItemIds = new Set<string>(
  trigger.type === 'item_used' ? trigger.itemIds : []
);

const skills: SkillEntry[] = (character.skills ?? []).map((s: Record<string, unknown>) => ({
  id: s.id as string,
  name: s.name as string,
  isHidden: s.isHidden as boolean | undefined,
  visibilityConditions: s.visibilityConditions as SkillEntry['visibilityConditions'],
}));

const allItems: ItemEntry[] = (character.items ?? []).map((i: Record<string, unknown>) => ({
  id: i.id as string,
  name: i.name as string,
  isHidden: i.isHidden as boolean | undefined,
  equipped: i.equipped as boolean | undefined,
  visibilityConditions: i.visibilityConditions as ItemEntry['visibilityConditions'],
}));

const revealedSkillIds = new Set<string>(
  skills.filter((s) => !s.isHidden).map((s) => s.id)
);
const revealedItemIds = new Set<string>(
  allItems.filter((i) => !i.isHidden).map((i) => i.id)
);

const context: ConditionContext = {
  viewedItemIds, ownedItemIds, revealedSecretIds,
  usedSkillIds, usedItemIds, revealedSkillIds, revealedItemIds,
};

// 6. 第三層：評估 skills/items
const skillItemResults = evaluateSkillItemConditions(skills, allItems, context);

// 7. 第四層：同層連鎖（skills_revealed / items_revealed）
for (const r of skillItemResults) {
  if (r.action === 'reveal') {
    if (r.type === 'skill') revealedSkillIds.add(r.id);
    if (r.type === 'item') revealedItemIds.add(r.id);
  } else {
    if (r.type === 'skill') revealedSkillIds.delete(r.id);
    if (r.type === 'item') revealedItemIds.delete(r.id);
  }
}

// 再跑一輪，只評估 skills_revealed / items_revealed 條件
const chainResults = evaluateSkillItemConditions(skills, allItems, context)
  .filter((r) => !skillItemResults.some((sr) => sr.id === r.id));

const allSkillItemResults = [...skillItemResults, ...chainResults];
const allResults = [...secretResults, ...taskResults, ...allSkillItemResults];
```

- [ ] **Step 6: 擴充 DB 更新和事件發射**

在批量更新 DB 區塊新增 skills/items 的更新：

```typescript
const rawSkills = character.skills ?? [];
const rawItems = character.items ?? [];

for (const result of allSkillItemResults) {
  if (result.type === 'skill') {
    const idx = rawSkills.findIndex((s: { id: string }) => s.id === result.id);
    if (idx !== -1) {
      updateOps[`skills.${idx}.isHidden`] = result.action === 'hide';
      updateOps[`skills.${idx}.hiddenAt`] = now;
    }
  } else if (result.type === 'item') {
    const idx = rawItems.findIndex((i: { id: string }) => i.id === result.id);
    if (idx !== -1) {
      updateOps[`items.${idx}.isHidden`] = result.action === 'hide';
      updateOps[`items.${idx}.hiddenAt`] = now;
      // 隱藏裝備時自動卸除
      if (result.action === 'hide') {
        const item = rawItems[idx] as { equipped?: boolean };
        if (item.equipped) {
          updateOps[`items.${idx}.equipped`] = false;
        }
      }
    }
  }
}
```

在事件發射區塊新增：

```typescript
for (const result of allSkillItemResults) {
  const characterIdStr = characterId.toString();
  if (result.type === 'skill') {
    if (result.action === 'reveal') {
      emitSkillRevealed(characterIdStr, {
        characterId: characterIdStr,
        skillId: result.id,
        skillName: result.title,
        revealType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit skill.revealed', error)
      );
    } else {
      emitSkillHidden(characterIdStr, {
        characterId: characterIdStr,
        skillId: result.id,
        skillName: result.title,
        hideType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit skill.hidden', error)
      );
    }
  } else if (result.type === 'item') {
    if (result.action === 'reveal') {
      emitItemRevealed(characterIdStr, {
        characterId: characterIdStr,
        itemId: result.id,
        itemName: result.title,
        revealType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit item.revealed', error)
      );
    } else {
      emitItemHidden(characterIdStr, {
        characterId: characterIdStr,
        itemId: result.id,
        itemName: result.title,
        hideType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit item.hidden', error)
      );
    }
  }
}
```

- [ ] **Step 7: 執行測試確認全部 PASS**

Run: `pnpm vitest run lib/reveal/__tests__/auto-reveal-evaluator.test.ts`
Expected: 全部 PASS（含新增的 7 個測試和現有的測試）

- [ ] **Step 8: 執行型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add lib/reveal/auto-reveal-evaluator.ts
git commit -m "feat: extend auto-reveal engine with skill/item visibility evaluation"
```

---

## Task 6: 玩家端資料過濾

**Files:**
- 需先定位玩家端角色資料回傳的 Server Action 或 API，Grep `getCharacterData` 或 `getPublicCharacter` 找到過濾插入點
- 需定位 `item_steal`/`item_take` 的目標物品選取邏輯

- [ ] **Step 1: 定位過濾插入點**

Run: `grep -rn "getPublicCharacter\|getCharacterForPlayer" app/ lib/ --include="*.ts" --include="*.tsx"`

找到回傳角色資料給玩家端的函式，在回傳前加入過濾。

- [ ] **Step 2: 在玩家端角色資料回傳處過濾 skills 和 items**

在回傳 `CharacterData` 物件前，過濾掉隱藏的技能/物品並剔除 `isHidden`、`hiddenAt`、`visibilityConditions` 欄位：

```typescript
// 過濾隱藏技能/物品
const visibleSkills = (skills ?? []).filter((s) => !s.isHidden);
const visibleItems = (items ?? []).filter((i) => !i.isHidden);

// 剔除隱藏相關欄位（不傳給玩家端）
const sanitizedSkills = visibleSkills.map(({ isHidden, hiddenAt, visibilityConditions, ...rest }) => rest);
const sanitizedItems = visibleItems.map(({ isHidden, hiddenAt, visibilityConditions, ...rest }) => rest);
```

- [ ] **Step 3: 在 `item_steal`/`item_take` 目標物品選取處過濾**

找到 `select-target-item.ts` 或回傳對方物品清單的位置，加入 `.filter((i) => !i.isHidden)`。

- [ ] **Step 4: 執行型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add <affected files>
git commit -m "feat: filter hidden skills/items from player-facing data"
```

---

## Task 7: 預設事件執行

**Files:**
- Modify: `lib/preset-event/execute-preset-event.ts`

- [ ] **Step 1: 在 `executeAction` switch 中新增 4 種動作**

```typescript
case 'reveal_skill':
  return await executeRevealSkill(action, gameId, gmUserId, charByBaselineId);
case 'hide_skill':
  return await executeHideSkill(action, gameId, gmUserId, charByBaselineId);
case 'reveal_item':
  return await executeRevealItem(action, gameId, gmUserId, charByBaselineId);
case 'hide_item':
  return await executeHideItem(action, gameId, gmUserId, charByBaselineId);
```

- [ ] **Step 2: 實作 `executeRevealSkill`**

比照現有 `executeRevealSecret` 模式：

```typescript
async function executeRevealSkill(
  action: PresetEventAction,
  gameId: string,
  gmUserId: string,
  charByBaselineId: Map<string, Record<string, unknown>>,
): Promise<ActionResult> {
  const charId = action.revealCharacterId;
  const skillId = action.revealTargetId;
  if (!charId || !skillId) {
    return { actionId: action.id, type: 'reveal_skill', status: 'skipped', reason: '未指定角色或技能' };
  }

  const runtimeChar = charByBaselineId.get(charId);
  if (!runtimeChar) {
    return { actionId: action.id, type: 'reveal_skill', status: 'skipped', reason: '角色不存在' };
  }

  const runtimeId = (runtimeChar._id as { toString(): string }).toString();
  const skills = (runtimeChar.skills || []) as Array<{ id: string; name: string; isHidden?: boolean }>;
  const skillIndex = skills.findIndex((s) => s.id === skillId);
  if (skillIndex === -1) {
    return { actionId: action.id, type: 'reveal_skill', status: 'skipped', reason: '技能不存在' };
  }

  const skill = skills[skillIndex];
  if (!skill.isHidden) {
    return { actionId: action.id, type: 'reveal_skill', status: 'skipped', reason: '技能已可見' };
  }

  const now = new Date();
  await CharacterRuntime.updateOne(
    { _id: runtimeId },
    { $set: {
      [`skills.${skillIndex}.isHidden`]: false,
      [`skills.${skillIndex}.hiddenAt`]: now,
    }},
  );

  await emitSkillRevealed(charId, {
    characterId: charId,
    skillId: skill.id,
    skillName: skill.name,
    revealType: 'preset_event',
  });

  await writeLog({ gameId, characterId: charId, actorType: 'gm', actorId: gmUserId, action: 'reveal_skill', details: { skillId, skillName: skill.name } });

  return { actionId: action.id, type: 'reveal_skill', status: 'success' };
}
```

- [ ] **Step 3: 實作 `executeHideSkill`、`executeRevealItem`、`executeHideItem`**

同樣模式，差異在：
- `hideSkill`：`isHidden` 設為 `true`，emit `emitSkillHidden`，hideType `'preset_event'`
- `revealItem`：操作 `items` 陣列，emit `emitItemRevealed`
- `hideItem`：操作 `items` 陣列，emit `emitItemHidden`。如果 `equipped === true`，額外設 `equipped: false`

- [ ] **Step 4: import 新的事件發射函式**

在檔案頂部加入：

```typescript
import { emitSkillRevealed, emitSkillHidden, emitItemRevealed, emitItemHidden } from '@/lib/reveal/reveal-event-emitter';
```

- [ ] **Step 5: 執行型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add lib/preset-event/execute-preset-event.ts
git commit -m "feat: add reveal/hide skill/item actions to preset events"
```

---

## Task 8: 觸發點擴充

**Files:**
- 需 Grep 找到技能使用和物品使用的觸發點
- Modify: 技能使用入口（調用 `executeAutoReveal` 的位置）
- Modify: `app/actions/item-use.ts`（或物品使用入口）
- Modify: `lib/contest/contest-effect-executor.ts`

- [ ] **Step 1: 定位觸發點**

Run: `grep -rn "executeAutoReveal" app/ lib/ --include="*.ts"`

找到所有呼叫 `executeAutoReveal` 的位置。

- [ ] **Step 2: 修改技能使用觸發點**

在技能使用後呼叫 `executeAutoReveal` 的位置，將 trigger 改為：

```typescript
await executeAutoReveal(characterId, {
  type: 'skill_used',
  skillIds: [skillId],
});
```

- [ ] **Step 3: 修改物品使用觸發點**

在物品使用後呼叫 `executeAutoReveal` 的位置，將 trigger 改為：

```typescript
await executeAutoReveal(characterId, {
  type: 'item_used',
  itemIds: [itemId],
});
```

- [ ] **Step 4: 修改 contest-effect-executor 的被動觸發**

在效果執行完畢後，對被影響方也呼叫一輪 auto-reveal：

```typescript
// 對被影響方也執行 auto-reveal（被動觸發）
await executeAutoReveal(targetCharacterId, {
  type: sourceType === 'skill' ? 'skill_used' : 'item_used',
  ...(sourceType === 'skill' ? { skillIds: [sourceId] } : { itemIds: [sourceId] }),
});
```

注意：這裡的 `sourceId` 是施術者使用的技能/物品 ID。

- [ ] **Step 5: 執行型別檢查和現有測試**

Run: `pnpm tsc --noEmit`
Run: `pnpm vitest run`
Expected: 0 errors，所有測試 PASS

- [ ] **Step 6: Commit**

```bash
git add <affected files>
git commit -m "feat: pass skill/item usage context to auto-reveal triggers"
```

---

## Task 9: GM Baseline UI — AbilityEditWizard

**Files:**
- Modify: `components/gm/ability-edit-wizard.tsx`

此任務涉及 UI 元件修改，需要實際在瀏覽器中驗證。以下提供結構指引。

- [ ] **Step 1: 在 Step 1（基本資訊）新增隱藏開關**

在基本資訊表單區域新增 Switch：

```tsx
<div className="flex items-center gap-2">
  <Switch
    checked={formData.isHidden ?? false}
    onCheckedChange={(checked) => updateFormData({ isHidden: checked })}
  />
  <Label>隱藏（玩家不可見）</Label>
</div>
```

- [ ] **Step 2: 新增 VisibilityConditions 編輯器**

獨立的條件區塊（不依賴 `isHidden` 開關），支援新增/刪除多條件。每條包含：
1. `action` 下拉選單（揭露 / 隱藏）
2. `type` 下拉選單（7 種條件）
3. 根據 `type` 顯示對應的多選選擇器
4. `matchLogic` 切換（AND / OR）

參考現有 `autoRevealCondition` 編輯器的 UI 模式。

- [ ] **Step 3: 確保 formData 正確傳遞 `isHidden` 和 `visibilityConditions`**

在 wizard 的儲存邏輯中，確保這兩個欄位被包含在輸出中。

- [ ] **Step 4: 在瀏覽器中驗證**

啟動 dev server，到 GM 編輯角色頁面：
1. 新增技能，勾選隱藏開關 → 確認 switch 正常運作
2. 新增一個 `skill_used` 條件 → 確認下拉選單和 ID 選擇器正常
3. 儲存後重新載入 → 確認資料持久化

- [ ] **Step 5: Commit**

```bash
git add components/gm/ability-edit-wizard.tsx
git commit -m "feat: add hidden toggle and visibility conditions to ability wizard"
```

---

## Task 10: GM Runtime 控制台

**Files:**
- 需 Grep 定位 GM 角色詳情面板中的技能/物品顯示區塊
- 新增手動切換可見性的 Server Action

- [ ] **Step 1: 定位 GM 控制台的角色詳情面板**

Run: `grep -rn "SkillCard\|ItemCard" components/gm/ --include="*.tsx"`

找到 GM 端顯示技能/物品卡片的元件。

- [ ] **Step 2: 新增隱藏狀態視覺標記**

在卡片元件上加入：
- `isHidden` 為 true 時顯示半透明效果 + 眼睛斜線 icon
- 可見性切換按鈕（眼睛 ↔ 眼睛斜線）

```tsx
{skill.isHidden && (
  <Badge variant="outline" className="opacity-60">
    <EyeOff className="h-3 w-3 mr-1" />
    隱藏中
  </Badge>
)}
```

- [ ] **Step 3: 建立手動切換 Server Action**

建立 toggle visibility 的 server action（或在現有 character-update action 中新增），接收 `characterId`、`type: 'skill' | 'item'`、`targetId`、`action: 'reveal' | 'hide'`。

邏輯：
1. 更新 `isHidden` 和 `hiddenAt`
2. 隱藏裝備時自動卸除
3. 發射 WebSocket 事件
4. 觸發連鎖 auto-reveal

- [ ] **Step 4: 連接按鈕到 Server Action**

點擊切換按鈕時呼叫 toggle action，操作即時生效。

- [ ] **Step 5: 在瀏覽器中驗證**

1. GM 控制台查看角色 → 隱藏技能顯示 badge
2. 點擊揭露按鈕 → badge 消失
3. 玩家端即時收到通知 + 技能出現在清單

- [ ] **Step 6: Commit**

```bash
git add <affected files>
git commit -m "feat: add visibility toggle to GM runtime console"
```

---

## Task 11: 預設事件編輯器 UI

**Files:**
- Modify: `components/gm/preset-event-action-editor.tsx`

- [ ] **Step 1: 在動作類型下拉選單新增 4 種類型**

在 `type` 的 `<Select>` 選項中新增：

```tsx
<SelectItem value="reveal_skill">揭露技能</SelectItem>
<SelectItem value="hide_skill">隱藏技能</SelectItem>
<SelectItem value="reveal_item">揭露道具</SelectItem>
<SelectItem value="hide_item">隱藏道具</SelectItem>
```

- [ ] **Step 2: 新增對應的欄位編輯器**

比照 `reveal_secret` / `reveal_task` 的 UI：先選角色（`revealCharacterId`），再選該角色的技能/物品（`revealTargetId`）。

使用現有角色下拉選單元件，技能/物品選單依選中的角色動態載入。

- [ ] **Step 3: 在瀏覽器中驗證**

1. GM 編輯預設事件 → 新增 `reveal_skill` 動作
2. 選擇角色 → 選擇技能
3. 儲存 → 確認持久化

- [ ] **Step 4: Commit**

```bash
git add components/gm/preset-event-action-editor.tsx
git commit -m "feat: add reveal/hide skill/item actions to preset event editor"
```

---

## Task 12: 玩家端通知呈現

**Files:**
- 需 Grep 定位玩家端 WebSocket 事件處理和通知映射器
- 通常在 `lib/utils/event-mappers*.ts` 或 `hooks/` 中

- [ ] **Step 1: 定位通知映射器**

Run: `grep -rn "secret.revealed\|task.revealed" lib/utils/event-mappers --include="*.ts"`

找到現有的事件 → 通知文字映射邏輯。

- [ ] **Step 2: 新增 4 個事件的通知映射**

比照 `secret.revealed` / `task.revealed` 的映射模式：

```typescript
case 'skill.revealed':
  return `你習得了新的技能：${payload.skillName}`;
case 'skill.hidden':
  return `你的技能已消失：${payload.skillName}`;
case 'item.revealed':
  return `你獲得了新的道具：${payload.itemName}`;
case 'item.hidden':
  return `你的道具已消失：${payload.itemName}`;
```

- [ ] **Step 3: 確保玩家端 WebSocket hook 訂閱新事件**

找到玩家端的 Pusher 訂閱邏輯，確認新增的 4 個事件名稱有被綁定。

- [ ] **Step 4: Commit**

```bash
git add <affected files>
git commit -m "feat: add player notification mapping for skill/item visibility events"
```

---

## Task 13: E2E 測試

**Files:**
- Create: `e2e/flows/hidden-skills-items.spec.ts`
- Modify: `e2e/flows/preset-event-runtime.spec.ts`

- [ ] **Step 1: 建立 `e2e/flows/hidden-skills-items.spec.ts`**

參考現有 `e2e/flows/auto-reveal.spec.ts` 的結構：

```typescript
import { test, expect } from '@playwright/test';
// 使用現有的 E2E helper（登入、建立遊戲、建立角色等）

test.describe('隱藏技能/物品系統', () => {
  test('GM 設定隱藏技能後，玩家端不顯示', async ({ page }) => {
    // 1. GM 建立角色卡，新增技能並勾選隱藏
    // 2. 開始遊戲
    // 3. 玩家登入 → 技能清單不顯示隱藏技能
  });

  test('GM 手動揭露後，玩家端即時顯示', async ({ page }) => {
    // 1. 接續上面的狀態
    // 2. GM 在控制台點擊揭露按鈕
    // 3. 玩家端技能出現 + 收到通知
  });

  test('GM 手動隱藏後，玩家端即時消失', async ({ page }) => {
    // 1. GM 點擊隱藏按鈕
    // 2. 玩家端技能消失 + 收到消失通知
  });
});
```

- [ ] **Step 2: 在 `e2e/flows/preset-event-runtime.spec.ts` 新增測試**

```typescript
test('預設事件 reveal_skill 正確執行', async ({ page }) => {
  // 1. GM 建立含 reveal_skill 動作的預設事件
  // 2. GM 執行預設事件
  // 3. 驗證目標角色技能揭露 + 玩家通知
});
```

- [ ] **Step 3: 執行 E2E 測試**

Run: `pnpm playwright test e2e/flows/hidden-skills-items.spec.ts`
Expected: PASS

- [ ] **Step 4: 執行回歸測試**

Run: `pnpm playwright test e2e/flows/auto-reveal.spec.ts e2e/flows/gm-ability-wizard.spec.ts e2e/flows/item-operations.spec.ts e2e/flows/player-use-skill.spec.ts e2e/flows/item-transfer-effects.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/flows/hidden-skills-items.spec.ts e2e/flows/preset-event-runtime.spec.ts
git commit -m "test: add E2E tests for hidden skills/items system"
```

---

## Task 14: 知識庫更新

**Files:**
- Modify: `docs/knowledge/gm/skills/skill-effects-and-tags.md`
- Modify: `docs/knowledge/gm/items/item-effects-and-tags.md`
- Modify: `docs/knowledge/shared/auto-reveal-system.md`
- Modify: `docs/knowledge/gm/game/preset-events.md`

- [ ] **Step 1: 更新技能知識庫**

在 `skill-effects-and-tags.md` 新增「隱藏技能」段落：
- 說明 `isHidden`、`hiddenAt`、`visibilityConditions` 欄位
- 說明 GM 可在 Baseline 設定隱藏、Runtime 手動切換
- 說明自動觸發條件類型

- [ ] **Step 2: 更新物品知識庫**

在 `item-effects-and-tags.md` 新增「隱藏物品」段落，內容對稱。

- [ ] **Step 3: 更新自動揭露知識庫**

在 `auto-reveal-system.md` 新增：
- 第三層：skills/items 評估（含同層連鎖）
- 新增的 4 種條件類型
- `VisibilityCondition` 與 `AutoRevealCondition` 的差異（雙向 vs 單向）
- 新增的觸發點（`skill_used`、`item_used` 的被動觸發）

- [ ] **Step 4: 更新預設事件知識庫**

在 `preset-events.md` 的 Action Types 表格新增 4 種動作：
- `reveal_skill`、`hide_skill`、`reveal_item`、`hide_item`

- [ ] **Step 5: Commit**

```bash
git add docs/knowledge/
git commit -m "docs: update knowledge base for hidden skills/items system"
```

---

## Task 15: 最終驗證

- [ ] **Step 1: 全量型別檢查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: ESLint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 3: 全量單元測試**

Run: `pnpm vitest run`
Expected: 全部 PASS

- [ ] **Step 4: 中文亂碼掃描**

Run: `grep -r "��" lib/ types/ components/ app/ docs/ --include="*.ts" --include="*.tsx" --include="*.md"`
Expected: 無結果

- [ ] **Step 5: 全量 E2E 測試**

Run: `pnpm playwright test`
Expected: 全部 PASS

- [ ] **Step 6: 使用者手動驗收**

提供驗收指引，等使用者確認後再 commit（如有未 commit 的修改）。
