# Hidden Tasks & Auto-Reveal

## Hidden Task Concept
Hidden tasks (`isHidden: true`) are objectives the player doesn't know about until revealed. Common uses: secret missions, true objectives that become visible after a plot twist.

## Auto-Reveal System
Both hidden tasks and hidden info share the same auto-reveal engine. See [../../shared/auto-reveal-system.md](../../shared/auto-reveal-system.md) for full details.

## Condition Types Available for Tasks
```typescript
type AutoRevealConditionType =
  | 'none'             // No auto-reveal
  | 'items_viewed'     // Player viewed specific items
  | 'items_acquired'   // Player acquired specific items
  | 'secrets_revealed' // Specific hidden info entries were revealed
```

## Example Use Cases
- Reveal hidden objective after player acquires a key item
- Reveal true mission after a specific hidden info is revealed (chain reveal)
- Example: "After identity revealed, chain-reveal true purpose"

## GM Workflow
1. Create task with `isHidden: true`
2. Set `autoRevealCondition` with type and target IDs
3. System evaluates condition whenever a relevant event occurs
4. When condition met → task auto-reveals → player receives notification
