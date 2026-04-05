# Stats (角色數值)

## Concept
Numeric attributes used for contest checks and skill/item targeting. Stats can be modified by skill/item effects, including temporary (timed) modifications.

## Data Structure
```typescript
interface Stat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;   // Optional upper limit
}
```

## Temporary Effects
When a stat is modified by a timed skill/item, a `TemporaryEffect` is recorded on the character. When the timer expires, the stat change is automatically reverted.

```typescript
interface TemporaryEffect {
  id: string;
  sourceType: 'skill' | 'item' | 'preset_event';
  sourceName: string;
  effectType: 'stat_change';      // Only stat_change supported
  targetStat: string;
  deltaValue?: number;            // Change to value
  deltaMax?: number;              // Change to maxValue
  duration: number;               // Seconds
  expiresAt: string | Date;
  isExpired: boolean;
}
```

## GM UI
- **📊 角色數值 tab**: View/edit stats + view active temporary effects list
- Stats panel shows remaining time for each active temporary effect
- Effects auto-remove from display when expired

## Contest Usage
- Stats are referenced by `ContestConfig.relatedStat` (string match by name)
- Both attacker and defender must use the same stat for a contest check
