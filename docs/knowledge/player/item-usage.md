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

## 使用條件 (Usage Conditions, Feature 3)

物品/技能可由 GM 設定**使用前置條件**（數值門檻/成本、持有物品）。玩家端行為：

- **未滿足**：詳情對話框可正常開啟（顯示條件與效果），但「使用」按鈕停用、顯示「未滿足使用條件」。卡片仍可點開。
- **顯示**：詳情中「使用條件」區塊位於「效果」與「檢定資訊」之間，以寫法直覺表達 —— 消耗型 `10MP`／`炸彈 ×1`，門檻型 `MP ≥ 10`／`炸彈`（無「消耗」標籤）。
- **成本扣除**：`consume=true` 的條件在「提交使用」時扣除（對抗類為發起對抗當下；隨機/一般檢定即使失敗仍扣）。物品成本扣到 0 時整個條目移除（同偷竊/移除效果）。
- 機制與資料結構詳見 [../gm/items/item-concepts.md](../gm/items/item-concepts.md#使用條件-usage-conditions-feature-3)。

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
- **裝備類物品不可用於對抗回應**（被動增益，前後端均過濾）

## Related
- [../shared/contest/contest-flow.md](../shared/contest/contest-flow.md)
- [../gm/items/item-concepts.md](../gm/items/item-concepts.md) — item types & equipment lifecycle
- [../gm/items/item-effects-and-tags.md](../gm/items/item-effects-and-tags.md)
