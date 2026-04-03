# Item Concepts (道具)

## Item Types
```typescript
type ItemType = 'consumable' | 'equipment';
```
- **consumable**: Has `usageLimit`. After all uses are exhausted, item remains in inventory but becomes unusable (does NOT disappear).
- **equipment**: No usage limit by default; stays in inventory.

## Core Fields
```typescript
interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity: number;
  effects?: ItemEffect[];
  tags?: string[];
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: ContestConfig;
  randomConfig?: RandomConfig;
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;        // Seconds between uses
  lastUsedAt?: Date;
  isTransferable: boolean;
}
```

## Check Types
| Type | Behavior |
|------|----------|
| `none` | No check required; effect executes immediately (may still target self/other) |
| `random` | Roll random number, must meet threshold |
| `contest` | Contest against another character using a shared stat |
| `random_contest` | Both sides roll random number (up to game's `randomContestMaxValue`), compare results |

## Transferability
- `isTransferable: true` → player can transfer item to another character
- Transfer action: `item_give` via player UI

## GM UI
- **🎒 道具管理 tab**: Add/edit/remove items
- Component: `components/gm/items-edit-form.tsx`

## Related
- [item-effects-and-tags.md](./item-effects-and-tags.md) — effects and tags detail
