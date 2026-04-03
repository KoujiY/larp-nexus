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
- `lib/db/models/Character.ts` — Character mongoose model（Phase A 已重構，共用 `createBaseCharacterSchemaFields()` factory）
- `lib/db/models/CharacterRuntime.ts` — CharacterRuntime mongoose model（與 Character.ts 共用 schema factory）
- `lib/db/models/Game.ts` / `GameRuntime.ts` — Game mongoose model（`publicInfo.blocks: BackgroundBlock[]`）
- TypeScript types: `types/character.ts`（含 `BackgroundBlock`）、`types/game.ts`、`types/event.ts`

## Baseline vs Runtime
- **Baseline** (`characters`): GM's designed state. Editable anytime.
- **Runtime** (`character_runtimes`): Created from Baseline snapshot when game starts. Receives all in-game changes. Deleted when game ends.
- Player in Full Access mode reads from Runtime. Player in Preview mode reads from Baseline.

## Refactoring Note
- Phase A（已完成）：Character/CharacterRuntime schema 透過 `createBaseCharacterSchemaFields()` factory 共用，消除 ~1292 行重複。
- Phase D（已完成）：Game `publicInfo` 從 `{ worldSetting, intro, chapters }` 改為 `{ blocks: BackgroundBlock[] }`，Character `publicInfo.background` 從 `string` 改為 `BackgroundBlock[]`，兩者共用同一段落結構。PIN 從 4-6 位數字縮減為固定 4 位數字。
- 詳見 `docs/refactoring/REFACTOR_PROGRESS.md`。
