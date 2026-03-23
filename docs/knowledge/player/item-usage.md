# Item Usage (Player Side)

## Component
`components/player/item-list.tsx`

## Usage Flow
1. Player taps item → opens item detail dialog
2. If item has effects and `checkType !== 'none'` → check flow initiates
3. Check resolves → effects execute

## Check Type Flows
| Check Type | Flow |
|------------|------|
| `none` | Immediate execution (target selection if needed) |
| `random` | Roll displayed, compared to threshold |
| `contest` | Sends contest request to defender; defender must respond within 3 minutes |
| `random_contest` | Both sides roll; system compares automatically |

## Actions Available
| Action | Condition |
|--------|-----------|
| Use Item | Full access mode, uses remaining, not on cooldown |
| Transfer | `isTransferable=true`, full access mode |
| Showcase | Full access mode (shows item to another character) |

## Consumable Rules
- After `usageCount >= usageLimit`: item becomes **unusable** but remains in inventory
- Item card is still tappable (can transfer), only "使用道具" button is disabled
- Item does NOT disappear from inventory

## Contest Behavior
When item has `checkType: 'contest'`:
- Attacker sends contest request
- Defender sees notification and can respond within 3 minutes
- If combat tag: defender can only respond with combat-tagged items/skills
- Stealth tag: defender sees "某人" instead of attacker name
- After resolution: effects applied to winner's target

## Related
- [../shared/contest/contest-flow.md](../shared/contest/contest-flow.md)
- [../gm/items/item-effects-and-tags.md](../gm/items/item-effects-and-tags.md)
