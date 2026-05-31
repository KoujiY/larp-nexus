# Auto-Reveal System (自動揭露系統)

## Overview
The auto-reveal system automatically reveals hidden info (隱藏資訊), hidden tasks (隱藏目標), hidden skills (隱藏技能), and hidden items (隱藏物品) when specified conditions are met. All four entity types share the same unified `AutoRevealCondition` model — **reveal-only** (conditions can only reveal, never auto-hide).

## Core Files
- `lib/reveal/auto-reveal-evaluator.ts` — condition evaluation + chain reveals
- `lib/reveal/reveal-event-emitter.ts` — sends reveal events to player

## Unified Condition Types
```typescript
type AutoRevealConditionType =
  | 'none'             // No auto-reveal trigger
  | 'items_viewed'     // Player viewed specific items (showcase or self-view)
  | 'items_acquired'   // Player acquired specific items
  | 'secrets_revealed' // Specific hidden info entries were already revealed
  | 'skills_revealed'  // Specific hidden skills were revealed
  | 'items_revealed'   // Specific hidden items were revealed
  | 'skill_used'       // A specific skill was used
  | 'item_used'        // A specific item was used
```

## Condition Structure
```typescript
interface AutoRevealCondition {
  type: AutoRevealConditionType;
  itemIds?: string[];      // For items_viewed / items_acquired / item_used / items_revealed
  secretIds?: string[];    // For secrets_revealed
  skillIds?: string[];     // For skills_revealed / skill_used
  matchLogic?: 'and' | 'or';  // For items conditions; secrets_revealed always AND
}
```

## Trigger Points
Auto-reveal is evaluated at:
- `app/actions/skill-use.ts` — after skill used (`usedSkillId` context)
- `app/actions/item-use.ts` — after item used (`usedItemId` context)
- `app/actions/character-update.ts` — after character stat/item update
- `lib/contest/contest-effect-executor.ts` — after contest effects applied
- `app/actions/item-showcase.ts` — after item showcased

## Chain Reveals

### 隱藏資訊 / 任務（secrets & tasks）
A secret/task reveal can trigger another secret/task reveal:
- Secret A has `autoRevealCondition: { type: 'secrets_revealed', secretIds: ['secret-A-id'] }`
- When secret A is revealed → evaluator checks if secret B's condition is now met → reveals secret B

### 技能 / 物品（Same-layer Chain）
`skills_revealed` / `items_revealed` 條件觸發時，系統執行**第二輪評估**（limited to one round），讓被揭露的技能 / 物品有機會連鎖觸發同層其他項目的條件。

## items_viewed Logic
"Viewed" means either:
1. Another character showcased the item to you
2. You opened your own item detail dialog (self-view)

Matching uses item ID directly. GM should include all relevant item IDs (including same-name items from different characters) when setting conditions.

## 條件主體（subject）
所有條件都以「**設定此條件的角色**」為主體判定（GM 端編輯器標示「以此角色為主體」）。例如某隱藏物品設 `items_acquired` 條件，意指「**此物品的擁有者**取得了指定物品時揭露」。`skill_used` / `item_used` 的 UI 文案為被動語態「被使用了某幾樣技能 / 物品」。

## skill_used / item_used 觸發說明
- `skill_used` / `item_used`：指定技能 / 物品被使用時揭露隱藏技能 / 物品，由技能使用、物品使用、對抗流程等觸發點注入 context。
- **評估對象依觸發路徑而異（已知語意不一致，目前為刻意保留）**：
  - 一般技能 / 物品使用（`skill-use.ts` / `item-use.ts`）：在**使用者本人**身上評估（語意：「我使用了 X」）。
  - 對抗（`contest-effect-executor.ts`）：在**對抗敗方**身上評估（語意：「我被 X 擊敗」）。
- GM 手動切換可見性（Runtime 控制台）會發出 `skill_visibility_changed` / `item_visibility_changed` 事件作為鏈式觸發信號，**不使用** `skill_used` / `item_used` 事件，避免手動揭露誤觸使用型條件。

## skills_revealed / items_revealed 選擇器限制
- 比對池為「目前可見（`isHidden === false`）的技能 / 物品」。
- GM 編輯器的選擇器對這兩種條件類型**僅列出隱藏項目**（`GameItemInfo` / `GameSkillInfo` 帶 `isHidden`），避免選到本來就可見的項目導致條件永遠立即成立。
