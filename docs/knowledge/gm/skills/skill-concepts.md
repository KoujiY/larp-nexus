# Skill Concepts (技能)

## Overview
Skills are character abilities. Structurally similar to items but with additional effect types (task reveal/complete, item give). Skills always have a `checkType` (required field).

## Core Fields
```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
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
| Unique effect types | `task_reveal`, `task_complete` | — |
| After uses exhausted | Unusable but remains | Unusable but remains |

## 隱藏技能 (Hidden Skills)

技能支援可見性系統，讓 GM 控制玩家是否能看到某個技能。

### 欄位
| 欄位 | 型別 | 說明 |
|------|------|------|
| `isHidden` | boolean | `true` 時玩家端看不到此技能 |
| `hiddenAt` | Date (optional) | 最後一次可見性狀態變更的時間戳 |
| `autoRevealCondition` | `AutoRevealCondition` (optional) | 自動揭露條件（與隱藏資訊共用型別，見下方） |

### GM 操作
- **AbilityEditWizard**（Baseline 編輯器）：隱藏開關開啟時，顯示 `AutoRevealConditionEditor`（條件選擇器）
- **Runtime 控制台**：技能卡片上有可見性切換按鈕
- **Server Action**：`toggleVisibility(characterId, 'skill', targetId)` — GM 手動切換

### 自動揭露條件（與隱藏資訊共用）
每個隱藏技能最多設定**一個** `autoRevealCondition`，為 **reveal-only**（條件滿足時揭露，不支援自動隱藏）。條件透過兩層下拉選單編輯（先選角色，再選該角色的物品 / 技能），儲存值為 ID（轉移後仍可正確比對）。支援的 condition type 詳見 [../../shared/auto-reveal-system.md](../../shared/auto-reveal-system.md)。

### 伺服器端過濾
隱藏技能在玩家端 API 回應中被過濾，玩家無法感知其存在。

## GM UI
- **⚡ 技能管理 tab**: Add/edit/remove skills
- Component: `components/gm/skills-edit-form.tsx`

## Related
- [skill-effects-and-tags.md](./skill-effects-and-tags.md) — effects and tags
