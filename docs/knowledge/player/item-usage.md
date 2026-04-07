# Item Usage (Player Side)

> 玩家端將「物品」作為與「技能」並列的大類名稱，涵蓋 consumable / tool / equipment 三種子類。

## Component
`components/player/item-list.tsx`

## Usage Flow
1. Player taps item → opens item detail dialog
2. **consumable / tool**：若 `checkType !== 'none'` → check flow initiates；否則直接執行效果
3. **equipment**：detail dialog 顯示「穿戴裝備 / 卸除裝備」toggle 按鈕

## Check Type Flows (consumable / tool)
| Check Type | Flow |
|------------|------|
| `none` | Immediate execution (target selection if needed) |
| `random` | Roll displayed, compared to threshold |
| `contest` | Sends contest request to defender; defender must respond within 3 minutes |
| `random_contest` | Both sides roll; system compares automatically |

## Actions Available
| Action | Condition |
|--------|-----------|
| Use Item | `consumable` / `tool`；full access mode；uses remaining；not on cooldown |
| 穿戴裝備 / 卸除裝備 | `equipment`；full access mode |
| Transfer | `isTransferable=true`；full access mode |
| Showcase | Full access mode (shows item to another character) |

## Consumable Rules
- After `usageCount >= usageLimit`: item becomes **unusable** but remains in inventory
- Item card is still tappable (can transfer), only 使用按鈕 is disabled
- Item does NOT disappear from inventory

## Equipment Rules
- 點「穿戴裝備」→ `toggleEquipment` server action
  - 伺服端以 arrayFilters + `$inc` delta 原子更新 `equipped` 旗標與對應 base stats
  - 推送 `equipment.toggled` 事件，GM 端即時同步
- 數值 breakdown：`components/player/stats-display.tsx` + `components/player/equipment-effects-panel.tsx` 顯示裝備提供的加成明細
- 裝備期間若 HP / MP 被扣減，卸除時採「最大值恢復規則」：`min(current, newMax)`，已受的傷不會被補回（與時效性效果過期一致）

## Contest Behavior
When item has `checkType: 'contest'`:
- Attacker sends contest request
- Defender sees notification and can respond within 3 minutes
- If combat tag: defender can only respond with combat-tagged items/skills
- Stealth tag: defender sees "某人" instead of attacker name
- After resolution: effects applied to winner's target

## Related
- [../shared/contest/contest-flow.md](../shared/contest/contest-flow.md)
- [../gm/items/item-concepts.md](../gm/items/item-concepts.md) — item types & equipment lifecycle
- [../gm/items/item-effects-and-tags.md](../gm/items/item-effects-and-tags.md)
