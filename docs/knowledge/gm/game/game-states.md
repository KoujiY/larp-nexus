# Game States (遊戲狀態)

## Two-Layer Architecture
The system uses a **Baseline / Runtime** separation:

| Layer | Collection | Purpose |
|-------|-----------|---------|
| **Baseline** | `characters`, `games` | Original design data. Editable by GM at any time. |
| **Runtime** | `character_runtimes`, `game_runtimes` | Live game state. Created when game starts, deleted when game ends. |

## Game Lifecycle

```
Game Created → [Baseline only]
     ↓ GM starts game (isActive = true)
Game Active → [Runtime created from Baseline snapshot]
     ↓ GM ends game (isActive = false)
Game Ended → [Runtime deleted, Baseline preserved]
```

## Player Access Modes

| Mode | Condition | Data Source | Interactions |
|------|-----------|-------------|-------------|
| **Preview** (唯讀) | PIN-only unlock | Baseline | Read-only, no actions |
| **Full Access** (遊戲進行中) | Game Code + PIN unlock, `isActive=true` | Runtime | Full interactions enabled |
| **Post-game Preview** | Game ended | Baseline | Read-only, preview only |

## localStorage Keys
- `character-{id}-unlocked` — whether PIN was entered
- `character-{id}-fullAccess` — whether Game Code was entered

## Access Flow
```
Player opens /c/[characterId]
  → hasPinLock?
      Yes → Show unlock screen
              → PIN only → Preview mode (Baseline)
              → Game Code + PIN → Full Access (Runtime, if isActive)
      No → Full Access or Baseline depending on isActive
```

## Runtime Banner (Player Side)
- 🟡 **👁 預覽模式** — PIN-only or game not active
- 🟢 **🎮 遊戲進行中** — Full access, Runtime mode
