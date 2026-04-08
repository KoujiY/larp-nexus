# Skill Usage (Player Side)

## Component
`components/player/skill-list.tsx`

## Usage Flow
Same pattern as item usage. See [item-usage.md](./item-usage.md) for check type flows.

`checkType` 與目標範圍是獨立概念。`none` 檢定類型的技能依然可以有 `other` / `any` 的效果；玩家端是否顯示目標下拉，取決於 effects 陣列整體推導的 targetType（見 [../gm/skills/skill-effects-and-tags.md](../gm/skills/skill-effects-and-tags.md) 的「Target Dispatch」段）。

**混合目標技能**：若 effects 同時包含 `self` 和 `other`/`any`，玩家端依然只看到單一下拉（選對象），server 會自動把 `self` 效果套用到使用者本人、`other`/`any` 效果套用到選到的對象。

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
