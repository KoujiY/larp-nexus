# Item Concepts (物品)

> 「物品」為大類名稱（與技能並列），包含三種子類別：消耗品 / 道具 / 裝備。
> 以往 UI 曾將此大類稱為「道具」，現已改為「物品」以避免與子類別 `tool` 重名。

## Item Types
```typescript
type ItemType = 'consumable' | 'tool' | 'equipment';
```
- **consumable**（消耗品）：Has `usageLimit`. After all uses are exhausted, item remains in inventory but becomes unusable (does NOT disappear).
- **tool**（道具）：持久性道具，可重複使用。原本的「equipment」子類別改名而來，行為保留；通常無 `usageLimit`。
- **equipment**（裝備）：玩家可主動勾選「穿戴裝備」使其生效，提供被動 `statBoosts`；卸除時依最大值恢復規則反向。

## Core Fields
```typescript
interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'tool' | 'equipment';
  quantity: number;
  effects?: ItemEffect[];        // consumable / tool 使用
  tags?: string[];
  checkType?: 'none' | 'contest' | 'random' | 'random_contest'; // consumable / tool 使用
  contestConfig?: ContestConfig;
  randomConfig?: RandomConfig;
  usageLimit?: number;           // consumable / tool 使用
  usageCount?: number;
  cooldown?: number;             // Seconds between uses
  lastUsedAt?: Date;
  isTransferable: boolean;
  // 僅 type === 'equipment'
  equipped?: boolean;
  statBoosts?: StatBoost[];
}

interface StatBoost {
  statName: string;
  value: number;
  /** 加成對象：value（當前值）、maxValue（上限值）、both（兩者皆加）。默認 both */
  target?: 'value' | 'maxValue' | 'both';
}
```

## Check Types
| Type | Behavior |
|------|----------|
| `none` | No check required; effect executes immediately (may still target self/other) |
| `random` | Roll random number, must meet threshold |
| `contest` | Contest against another character using a shared stat |
| `random_contest` | Both sides roll random number (up to game's `randomContestMaxValue`), compare results |

## Equipment Lifecycle
- GM 在 AbilityEditWizard 中為 equipment 設定 `statBoosts`（選擇 stat 名稱、增量、target）
- 玩家點擊「穿戴裝備」→ `toggleEquipment` server action：
  - 以 arrayFilters + `$inc` delta 的方式 materialize boost 到 base stats（並發安全）
  - 推送 `equipment.toggled` WebSocket 事件
- 卸除時依「最大值恢復規則」反向：`min(current, newMax)`（見 `lib/item/apply-equipment-boosts.ts` header）
- 與時效性效果過期邏輯（`lib/effects/check-expired-effects.ts`）完全一致

## 裝備中視覺狀態（GM 物品卡片）
- `components/gm/ability-card.tsx` 對 `type === 'equipment' && equipped === true` 的道具在卡片頂部顯示綠色「裝備中」badge（`GM_BADGE_VARIANTS.success`）
- 即使 GM 正在編輯物品 tab（items dirty），badge 仍能即時跟上玩家穿脫 — 由 `items-edit-form.tsx` 的 `liveEquippedByWs` overlay 實現（見 [character-card.md WebSocket 衝突解決策略](../character/character-card.md#websocket-衝突解決策略character-edit-tabstsx)）

## Transferability
- `isTransferable: true` → player can transfer item to another character
- Transfer action: `item_give` via player UI

## GM UI
- **🎒 物品管理 tab**：Add/edit/remove items
- Component: `components/gm/items-edit-form.tsx`
- Editor: `components/gm/ability-edit-wizard.tsx`（equipment 設定 `statBoosts`）

## Related
- [item-effects-and-tags.md](./item-effects-and-tags.md) — effects and tags detail
- [../../player/item-usage.md](../../player/item-usage.md) — player-side usage & equipment toggle
