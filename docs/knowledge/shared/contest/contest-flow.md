# Contest Flow (對抗流程)

## Overview
A contest occurs when a player uses a skill/item with `checkType: 'contest'` or `checkType: 'random_contest'`. The key files are:
- `lib/contest/contest-handler.ts` — unified handler for both skills and items
- `lib/contest/contest-event-emitter.ts` — event sending
- `lib/contest/contest-notification-manager.ts` — notification logic
- `app/actions/contest-respond.ts` — defender response
- `app/actions/contest-abort.ts` — contest abort (either side)
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
skill.contest (subType: 'abort')    → opponent only (contest aborted)
character.affected                  → affected character
skill.used                          → attacker result
```

## Timeout
- 3 minutes for defender to respond
- If no response: attacker wins by default

## Contest Abort (對抗中斷)
Either attacker or defender can abort the contest at any time via the "中斷對抗" button in their respective dialog (two-step confirmation to prevent accidental taps). Key behaviors:
- Abort does NOT execute any effects — the contest is voided
- Attacker's consumed usage count / quantity is NOT refunded (already consumed before contest start)
- Server clears `contest-tracker` state for both characters
- Client clears localStorage contest state and closes dialog
- The opponent receives `skill.contest (subType: 'abort')` via WebSocket + pending events
- Abort is idempotent: if the contest already ended, the action returns success without error
- Key files: `app/actions/contest-abort.ts`, `lib/contest/contest-event-emitter.ts` (emitContestAbort)
- **TODO**: 追加使用消耗（如 MP）後，需決定中斷對抗時消耗與冷卻是否重置。目前的設計是「不退還」（攻擊方的 usageCount/quantity/cooldown 在發起對抗前就已扣除），未來如有 MP 等資源消耗需沿用相同策略或另行設計

## Key Decisions (from archive)
1. Contest state is NOT persisted to DB — in-memory only
2. Defender win reverses the **source ownership**：`sourceOwner` 切換到 defender，所有效果以 defender 視角解讀。`targetType: 'self'` 的效果套用到 defender 自己、`targetType: 'other'` 套用到 attacker（見 `lib/contest/contest-effect-executor.ts` 的 `resolveEffectTarget`）
3. When defender wins, only the **first** skill/item in `defenderSources` is used as `actualSource`; all effects within that source still execute (per-effect dispatch)
4. Two-phase notification: immediate result → final with effectsApplied
5. **§4 per-effect 分派**：單一 skill/item 的 effects 陣列可以混合 `self` + `other`，executor 各自累積 self / target 的 stat changes 並分別發送通知（見 [check-mechanism.md](./check-mechanism.md) 的「對抗檢定的效果目標限制」段）

## Related
- [check-mechanism.md](./check-mechanism.md) — random and stat check details
- [tag-rules.md](./tag-rules.md) — combat and stealth tag behavior
