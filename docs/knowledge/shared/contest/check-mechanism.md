# Check Mechanism (檢定機制)

## Check Types
```typescript
type CheckType = 'none' | 'contest' | 'random' | 'random_contest';
```

### none
- No randomness involved
- Effect executes directly
- If `targetType` is 'other'/'any', player still selects a target character
- Does NOT guarantee auto-success — effect type determines the actual action

### random
Uses `RandomConfig`:
```typescript
interface RandomConfig {
  maxValue: number;    // Roll range: 1 to maxValue
  threshold: number;  // Must roll >= threshold to succeed
}
```
- Attacker rolls, if roll >= threshold → success
- Only attacker rolls; no defender involvement

### contest
Uses `ContestConfig`:
```typescript
interface ContestConfig {
  relatedStat: string;              // Both sides use this stat
  opponentMaxItems?: number;        // How many items defender can use (default 0)
  opponentMaxSkills?: number;       // How many skills defender can use (default 0)
  tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
}
```
- Attacker's stat value vs defender's stat value (+ any defense bonuses)
- Higher value wins
- Tie resolved by `tieResolution` setting

### random_contest
- Both attacker AND defender each roll 1 to `game.randomContestMaxValue` (default 100)
- Higher roll wins
- Neither skills nor items affect the roll value
- Defender can only respond with `random_contest` skills/items (same check type rule)

## Defender Response Rules
When attacker uses combat-tagged skill/item:
- Defender can only respond with items/skills that also have the combat tag
- Defender must use the same stat (contest) or same check type (random_contest)
