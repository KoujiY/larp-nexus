# Item Effects & Tags

## Effect Types
```typescript
// types/character.ts — 共用基底型別
interface BaseEffect {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete';
  targetType?: 'self' | 'other' | 'any';  // Per-effect target
  requiresTarget?: boolean;                // Derived: targetType !== 'self'
  // stat_change fields:
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;       // Also modify value when changing maxValue
  duration?: number;         // Seconds; 0/undefined = permanent
  // item_take / item_steal:
  targetItemId?: string;     // Selected by player at execution time
  // task_reveal / task_complete (skill only):
  targetTaskId?: string;
  description?: string;
}
type ItemEffect = BaseEffect;  // type alias
type SkillEffect = BaseEffect; // type alias
```

> 道具實際只使用 `stat_change | custom | item_take | item_steal` 四種 type。`task_reveal | task_complete` 為技能專屬，但型別層已統一為 `BaseEffect`。

## Target Dispatch (per-effect)
每個效果獨立指定 `targetType`，執行時會分派到對應角色（與技能系統規則相同，見 [../skills/skill-effects-and-tags.md](../skills/skill-effects-and-tags.md)）：
- `self` → 使用物品的角色
- `other` → 選到的對象（不含自己）
- `any` → 選到的對象（可含自己）

**混合目標範例**：物品可以同時包含「補自己 HP +10」和「扣對方 HP -5」兩個效果，executor 會各自累積並分別同步。`item_take` / `item_steal` 則永遠是「從對手拿 → 給自己」，Wizard 擋住這兩類效果的 `self` 選項。

## Wizard 目標選擇規則
與技能相同，同一張卡片的 effects 陣列遵守兩條硬性規則：

1. **對抗檢定目標限制**：`checkType = contest | random_contest` 時效果只能選 `self` 或 `other`
2. **Mutex 規則**：`other` 與 `any` 不可並存於同一張卡片

玩家端下拉選單由 effects 陣列整體推導 targetType（`other` 優先 > `any` > 純 self 不顯示下拉）。

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
