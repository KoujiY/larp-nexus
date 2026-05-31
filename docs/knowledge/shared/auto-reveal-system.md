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
  | 'skill_used'       // 主動：此角色「使用了」某技能（施術者）
  | 'item_used'        // 主動：此角色「使用了」某物品
  | 'skill_targeted'   // 被動：此角色「被使用了」某技能（目標）
  | 'item_targeted'    // 被動：此角色「被使用了」某物品
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

## 使用型條件：主動 vs 被動（skill_used / item_used / skill_targeted / item_targeted）
使用型條件明確區分「**我使用了**」與「**我被使用了**」兩個方向：
- `skill_used` / `item_used`（**主動**）：在**使用者本人**身上評估，由 `skill-use.ts` / `item-use.ts` 對施術者觸發。
- `skill_targeted` / `item_targeted`（**被動**）：在**目標**身上評估，由 `skill-use.ts` / `item-use.ts` 對 `目標 ?? 施術者` 觸發。

觸發矩陣（A 對某對象使用技能 S）：
| 情境 | 觸發 |
|------|------|
| A 對 B 使用 | A 的 `skill_used:[S]`、B 的 `skill_targeted:[S]` |
| A 對 A 使用（或無目標自我技能）| A 的 `skill_used:[S]` **與** `skill_targeted:[S]` 同時觸發 |

對抗（`contest-effect-executor.ts`）：`actualSource` 的**擁有者**（sourceOwner，依勝負可能為攻或守方）觸發**主動**、其**對手**觸發**被動**——依 source 歸屬判定，與固定攻守方無關。

GM 手動切換可見性（Runtime 控制台）發出 `skill_visibility_changed` / `item_visibility_changed` 作為鏈式觸發信號，**不使用**使用型事件，避免手動揭露誤觸。

## skills_revealed / items_revealed 選擇器限制
- 比對池為「目前可見（`isHidden === false`）的技能 / 物品」。
- GM 編輯器的選擇器對這兩種條件類型**僅列出隱藏項目**（`GameItemInfo` / `GameSkillInfo` 帶 `isHidden`），避免選到本來就可見的項目導致條件永遠立即成立。
