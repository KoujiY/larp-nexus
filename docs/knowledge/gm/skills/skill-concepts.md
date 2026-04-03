# Skill Concepts (技能)

## Overview
Skills are character abilities. Structurally similar to items but with additional effect types (task reveal/complete, item give). Skills always have a `checkType` (required field).

## Core Fields
```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  tags?: string[];
  checkType: 'none' | 'contest' | 'random' | 'random_contest';  // required
  contestConfig?: ContestConfig;
  randomConfig?: RandomConfig;
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  effects?: SkillEffect[];
}
```

## Check Types (same as items)
| Type | Behavior |
|------|----------|
| `none` | Target is self; effect may still require a check at execution — not guaranteed auto-success |
| `random` | Roll random number, must meet threshold |
| `contest` | Contest against another character using a shared stat |
| `random_contest` | Both sides roll random number, compare results |

## Skill vs Item Comparison
| Feature | Skill | Item |
|---------|-------|-------|
| Persistent | Yes (always in skills tab) | Yes (in inventory) |
| Transferable | No | Yes (if `isTransferable`) |
| `checkType` | Required | Optional |
| Unique effect types | `task_reveal`, `task_complete`, `item_give` | — |
| After uses exhausted | Unusable but remains | Unusable but remains |

## GM UI
- **⚡ 技能管理 tab**: Add/edit/remove skills
- Component: `components/gm/skills-edit-form.tsx`

## Related
- [skill-effects-and-tags.md](./skill-effects-and-tags.md) — effects and tags
