# Data Models (資料模型)

## Collections Overview
| Collection | Purpose |
|-----------|---------|
| `gm_users` | GM accounts (email + displayName) |
| `games` | Game (劇本) baseline data |
| `characters` | Character baseline data |
| `character_runtimes` | Live character state during active game |
| `game_runtimes` | Live game state during active game |
| `magic_links` | Short-lived auth tokens |
| `pending_events` | Offline event queue for reconnecting players |
| `logs` | Operation audit log |

## Key Model Files
- `lib/db/models/Character.ts` — Character mongoose model (~708 lines, Phase A target)
- `lib/db/models/CharacterRuntime.ts` — CharacterRuntime mongoose model (~706 lines, ~90% duplicate of Character.ts)
- TypeScript types: `types/character.ts`, `types/event.ts`

## Baseline vs Runtime
- **Baseline** (`characters`): GM's designed state. Editable anytime.
- **Runtime** (`character_runtimes`): Created from Baseline snapshot when game starts. Receives all in-game changes. Deleted when game ends.
- Player in Full Access mode reads from Runtime. Player in Preview mode reads from Baseline.

## Refactoring Note (Phase A)
`Character.ts` and `CharacterRuntime.ts` share ~90% identical schema definitions. Phase A will extract a shared base schema to eliminate ~600 lines of duplication.
See `docs/refactoring/REFACTOR_PROGRESS.md` Phase A-3.
