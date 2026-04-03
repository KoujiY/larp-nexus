# Item Effects & Tags

## Effect Types
```typescript
interface ItemEffect {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal';
  targetType?: 'self' | 'other' | 'any';
  requiresTarget?: boolean;
  // stat_change fields:
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;       // Also modify value when changing maxValue
  duration?: number;         // Seconds; 0/undefined = permanent
  // item_take / item_steal:
  targetItemId?: string;     // Selected by player at execution time
}
```

| Effect Type | Behavior |
|-------------|----------|
| `stat_change` | Modify a target stat by `value`. Can be timed (`duration > 0`). |
| `item_take` | **Remove** a specific item from target (item disappears from target's inventory) |
| `item_steal` | **Transfer** a specific item from target to self |
| `custom` | Free-text description only; no mechanical effect |

> **Key distinction**: `item_take` removes the item entirely. `item_steal` moves it to the user.

## Tags
Tags control **gameplay rules**, not just display labels.

| Tag | Rule Effect |
|-----|-------------|
| `combat` (戰鬥) | Attacker with combat tag → defender can only respond with combat-tagged items/skills; both sides must use the same stat |
| `stealth` (隱匿) | Attacker's identity hidden from defender notifications — shown as "某人" |

- Items can have multiple tags
- Tags are free-text strings; `combat` and `stealth` have special system behavior

## Multiple Effects
Items support an array of effects (`effects: ItemEffect[]`). All effects execute on success. For items with `item_steal`/`item_take`, a target selection step occurs before final resolution.
