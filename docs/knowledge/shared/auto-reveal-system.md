# Auto-Reveal System (自動揭露系統)

## Overview
The auto-reveal system automatically reveals hidden info (隱藏資訊) and hidden tasks (隱藏目標) when specified conditions are met.

## Core Files
- `lib/reveal/auto-reveal-evaluator.ts` — condition evaluation + chain reveals
- `lib/reveal/reveal-event-emitter.ts` — sends reveal events to player

## Condition Types
```typescript
type AutoRevealConditionType =
  | 'none'             // No auto-reveal trigger
  | 'items_viewed'     // Player viewed specific items (showcase or self-view)
  | 'items_acquired'   // Player acquired specific items
  | 'secrets_revealed' // Specific hidden info entries were already revealed
```

## Condition Structure
```typescript
interface AutoRevealCondition {
  type: AutoRevealConditionType;
  itemIds?: string[];      // For items_viewed / items_acquired
  secretIds?: string[];    // For secrets_revealed
  matchLogic?: 'and' | 'or';  // For items conditions; secrets_revealed always AND
}
```

## Trigger Points
Auto-reveal is evaluated at:
- `app/actions/item-use.ts` — after item used
- `app/actions/character-update.ts` — after character stat/item update
- `lib/contest/contest-effect-executor.ts` — after contest effects applied
- `app/actions/item-showcase.ts` — after item showcased

## Chain Reveals
A hidden info reveal can trigger another reveal:
- Secret A has `autoRevealCondition: { type: 'secrets_revealed', secretIds: ['secret-A-id'] }`
- When secret A is revealed → evaluator checks if secret B's condition is now met → reveals secret B

## items_viewed Logic
"Viewed" means either:
1. Another character showcased the item to you
2. You opened your own item detail dialog (self-view)

Matching uses item ID directly. GM should include all relevant item IDs (including same-name items from different characters) when setting conditions.

## 技能 / 物品可見性評估（第三層）

隱藏技能與隱藏物品使用與隱藏資訊 / 任務相同的自動揭露框架，但有以下差異：

### 支援的 Condition Types（擴充）
```typescript
type AutoRevealConditionType =
  | 'none'
  | 'items_viewed'
  | 'items_acquired'
  | 'secrets_revealed'
  | 'skill_used'        // 使用了指定技能（新增）
  | 'item_used'         // 使用了指定物品（新增）
  | 'skills_revealed'   // 指定技能已揭露（新增）
  | 'items_revealed'    // 指定物品已揭露（新增）
```

### ConditionContext
```typescript
interface ConditionContext {
  usedSkillId?: string;   // 觸發點為技能使用時填入
  usedItemId?: string;    // 觸發點為物品使用時填入
}
```

### 雙向切換
技能 / 物品可見性可**雙向**切換（不像隱藏資訊 / 任務僅能揭露），同一技能 / 物品可被條件反覆觸發。

### Same-layer Chain（同層鏈式評估）
`skills_revealed` / `items_revealed` 條件觸發時，系統執行**第二輪評估**（limited to one round），讓被揭露的技能 / 物品有機會連鎖觸發同層其他項目的條件。

### 觸發點（Trigger Points）
| 觸發位置 | Context |
|---------|---------|
| `app/actions/skill-use.ts` — 技能使用後 | `{ usedSkillId }` |
| `app/actions/item-use.ts` — 物品使用後 | `{ usedItemId }` |
| `lib/contest/contest-effect-executor.ts` — 對抗效果套用後（防禦方被動） | 無 context |
| `app/actions/character-update.ts` — 角色數值/物品更新後 | 無 context |
| `app/actions/item-showcase.ts` — 物品展示後 | 無 context |
