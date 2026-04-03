# Tag Rules (標籤規則)

## combat Tag (戰鬥)

**Rule**: When attacker uses a skill/item with the `combat` tag:
- Defender can **only** respond with skills/items that also have the `combat` tag
- Both sides must use the same stat for the check
- The system enforces this in the defender's response UI — only combat-tagged options are shown

**Use case**: Represent official combat actions that have structured rules about how they can be countered.

## stealth Tag (隱匿)

**Rule**: When attacker uses a skill/item with the `stealth` tag:
- Defender's notification shows "某人" instead of the attacker's actual name
- Attacker's `character.affected` notification also uses "某人"
- The identity remains hidden throughout the contest flow

**Implementation**: `sourceHasStealthTag` boolean field is carried in all related events.
- `lib/contest/contest-handler.ts` — sets flag on contest request
- `lib/contest/contest-notification-manager.ts` — propagates to result/effect notifications
- `lib/utils/event-mappers.ts` — maps name to "某人" based on flag
- `hooks/use-contest-handler.ts` — toast notification respects flag

**Use case**: Represent covert actions where the character doesn't know who acted on them.

## Tag Checking Logic
Source: `lib/contest/contest-validator.ts`

Tags are checked at:
1. Attacker use time — determines if defender response is restricted
2. Defender response time — validates selected items/skills against attacker's tags
