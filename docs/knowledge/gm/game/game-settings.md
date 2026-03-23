# Game Settings (遊戲設定)

## Game Data Model
```typescript
interface Game {
  _id: ObjectId;
  gmUserId: ObjectId;
  name: string;
  description: string;
  isActive: boolean;           // Controls Runtime layer read/write
  gameCode: string;            // 6-char alphanumeric, unique, auto-generated
  publicInfo?: {
    intro: string;
    worldSetting: string;
    chapters: Array<{ title: string; content: string; order: number }>;
  };
  randomContestMaxValue?: number;  // Default 100; shared across all characters in game
}
```

## Game States
See [game-states.md](./game-states.md) for the full state machine.

## Game Code
- Auto-generated 6-char alphanumeric code
- Used by players on game day to unlock full access (Runtime mode)
- **Do not reuse the same Game Code across different game sessions** — could allow players from a previous session to re-enter

## Public Info
The game's public info (world setting, intro, chapters) is accessible at `/g/[gameId]` — a public page all players can view regardless of their character card unlock state.

## randomContestMaxValue
- Sets the upper bound for `random_contest` check type
- Applies to all characters in the game
- Default: 100
