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
