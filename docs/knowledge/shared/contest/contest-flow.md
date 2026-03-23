# Contest Flow (對抗流程)

## Overview
A contest occurs when a player uses a skill/item with `checkType: 'contest'` or `checkType: 'random_contest'`. The key files are:
- `lib/contest/contest-handler.ts` — unified handler for both skills and items
- `lib/contest/contest-event-emitter.ts` — event sending
- `lib/contest/contest-notification-manager.ts` — notification logic
- `app/actions/contest-respond.ts` — defender response
- `app/actions/contest-select-item.ts` — target item selection step

## Contest Flow Steps

```
1. Attacker uses skill/item with contest checkType
        ↓
2. System sends 'skill.contest' (subType: 'request') to defender
        ↓
3. Defender sees notification, opens contest response dialog
   - Can choose to respond with combat-tagged skills/items (if attacker has combat tag)
   - Has 3 minutes to respond (timeout = attacker wins)
        ↓
4. System resolves contest
   - contest: compare both sides' stat values
   - random_contest: both roll 1–randomContestMaxValue, compare
        ↓
5. If winner needs to select target item (item_steal / item_take):
   - Winner selects from loser's inventory
        ↓
6. Effects execute → notifications sent to both parties
```

## Event Subtype Pattern
```
skill.contest (subType: 'request')  → defender only
skill.contest (subType: 'result')   → both attacker and defender
skill.contest (subType: 'effect')   → after target item selection
character.affected                  → affected character
skill.used                          → attacker result
```

## Timeout
- 3 minutes for defender to respond
- If no response: attacker wins by default

## Key Decisions (from archive)
1. Contest state is NOT persisted to DB — in-memory only
2. Defender win reverses effect direction (effects apply to attacker)
3. Only the first skill/item effect executes when defender wins
4. Two-phase notification: immediate result → final with effectsApplied

## Related
- [check-mechanism.md](./check-mechanism.md) — random and stat check details
- [tag-rules.md](./tag-rules.md) — combat and stealth tag behavior
