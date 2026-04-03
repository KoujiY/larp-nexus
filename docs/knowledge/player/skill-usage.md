# Skill Usage (Player Side)

## Component
`components/player/skill-list.tsx`

## Usage Flow
Same pattern as item usage. See [item-usage.md](./item-usage.md) for check type flows.

Skills with `checkType: 'none'` target self — but may still require a check depending on effect configuration.

## Skill-Specific Effects
| Effect | What Happens |
|--------|-------------|
| `task_reveal` | Reveals a hidden task on target character |
| `task_complete` | Marks a task as completed on target character |
| `item_give` | Transfers an item to target character |
| `stat_change` | Modifies a stat (can be timed) |

## Key Differences from Items
- Skills are NOT transferable
- Skills always have `checkType` (required)
- Skills can affect tasks directly

## Related
- [../shared/contest/contest-flow.md](../shared/contest/contest-flow.md)
- [../gm/skills/skill-effects-and-tags.md](../gm/skills/skill-effects-and-tags.md)
