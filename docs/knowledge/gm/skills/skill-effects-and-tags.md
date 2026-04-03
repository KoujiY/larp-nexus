# Skill Effects & Tags

## Effect Types
```typescript
interface SkillEffect {
  type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' |
        'task_reveal' | 'task_complete' | 'custom';
  targetType?: 'self' | 'other' | 'any';
  requiresTarget?: boolean;
  // stat_change:
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;        // Seconds; 0/undefined = permanent
  // item operations:
  targetItemId?: string;
  // task operations:
  targetTaskId?: string;
}
```

| Effect Type | Behavior |
|-------------|----------|
| `stat_change` | Modify stat value. Supports timed effects (`duration`). |
| `item_give` | Give an item to target character |
| `item_take` | **Remove** specific item from target (disappears) |
| `item_steal` | **Transfer** specific item from target to self |
| `task_reveal` | Reveal a hidden task on target character |
| `task_complete` | Mark a task as completed on target character |
| `custom` | Free-text description; no mechanical effect |

## Tags
Same system as items. See [../items/item-effects-and-tags.md](../items/item-effects-and-tags.md) for tag rules.

Key tags:
- `combat` — restricts contest responses to combat-tagged skills/items only
- `stealth` — hides attacker identity from defender

## Contest Config
```typescript
interface ContestConfig {
  relatedStat: string;              // Stat name used for contest
  opponentMaxItems?: number;        // Max items defender can use (default 0)
  opponentMaxSkills?: number;       // Max skills defender can use (default 0)
  tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
}
```
