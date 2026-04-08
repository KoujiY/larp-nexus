# Skill Effects & Tags

## Effect Types
```typescript
interface SkillEffect {
  type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' |
        'task_reveal' | 'task_complete' | 'custom';
  targetType?: 'self' | 'other' | 'any';  // Per-effect target
  requiresTarget?: boolean;                // Derived: targetType !== 'self'
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

## Target Dispatch (per-effect)
每個效果獨立指定 `targetType`，執行時會分派到對應角色：
- `self` → 使用技能的角色（caster）
- `other` → 下拉選單選到的對象（不含自己）
- `any` → 下拉選單選到的對象（可含自己）

**混合目標範例**：對抗成功後「扣對方 HP -15 + 補自己 HP +8」可以寫成單張卡片的兩個效果，一個 `targetType: 'other'`、一個 `targetType: 'self'`。Server 的 executor（`lib/skill/skill-effect-executor.ts`、`lib/contest/contest-effect-executor.ts`）會各自累積 self / target 更新並分別發送 `character.affected` / `role.updated`。

## Wizard 目標選擇規則
GM 在 `ability-edit-wizard.tsx` 設計效果時有兩條硬性規則：

1. **對抗檢定目標限制**：當 `checkType` 為 `contest` 或 `random_contest`，效果目標只能選 `self` 或 `other`，`any` 會被 disable
2. **Mutex 規則**：同一張卡片的 effects 陣列中，`other` 與 `any` 不可並存 — 已有 `other` 時後續效果的 `any` 會被 disable；反之亦然

違反時 Wizard 顯示紅色提示，玩家端下拉選單也會依據 effects 陣列整體推導出唯一的 targetType（`other` 優先 > `any` > 純 self 不顯示下拉）。

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
