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

## GM 端資料讀取策略

GM 端查詢角色資料時，必須根據 `game.isActive` 決定資料來源：

| 函式 | 檔案 | 行為 |
|------|------|------|
| `getCharacterData()` | `app/actions/characters.ts` | 自動根據 `isActive` 回傳 Runtime 或 Baseline |
| `getCharactersByGameId()` | `app/actions/characters.ts` | 查詢 Baseline 後，若 `isActive` 則覆蓋 Runtime 資料（name、stats 等） |
| `getGameItems()` | `app/actions/games.ts` | 查詢 Baseline 後，若 `isActive` 則覆蓋 Runtime 的 name + items |

**覆蓋模式**：先查 Baseline 取得所有角色 ID，再查 Runtime 建立 `Map<refId, runtimeData>`，逐一覆蓋。回傳的 `id` 始終使用 Baseline `_id`（確保路由一致性）。

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
