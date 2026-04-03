# Broadcast System (廣播系統)

## Overview
GM can send messages to players during the game via two channels:
- **Game broadcast** — sent to all characters in the game
- **Character message** — sent to a specific character

## GM UI
- 快速廣播面板：`components/gm/game-broadcast-panel.tsx`（Runtime 控制台內）
- 廣播類型切換：`components/gm/pill-toggle.tsx`（全體廣播 / 個別角色）

## Server Action
`app/actions/events.ts` — `pushEvent()`

### 流程
1. 驗證 GM 身份（`getCurrentGMUserId`）
2. 確認 Pusher 可用
3. 推送 WebSocket 事件
4. **寫入 Log collection**（game-level 單筆記錄）
5. `revalidatePath` 刷新 GM 頁面

### Log 行為
- **全體廣播**：寫入一筆 game-level log（action: `broadcast`），不會對每個角色各寫一筆
- **角色訊息**：寫入一筆 character-level log（action: `character_message`）
- GM 控制台的 EventLog 透過 `refreshKey` 機制在廣播送出後同步刷新

## Event Types
| Event | Channel | Description |
|-------|---------|-------------|
| `game.broadcast` | `private-game-{gameId}` | Message to all players |
| `role.message` | `private-character-{characterId}` | Private message to one character |

## Notification System
Broadcasts arrive as notifications on the player's character card.
- Notifications have a 24-hour TTL
- Max 50 notifications stored per character
- See [../../shared/notification-system.md](../../shared/notification-system.md)

## WebSocket Infrastructure
Uses Pusher private channels. See [../../shared/websocket-events.md](../../shared/websocket-events.md).
