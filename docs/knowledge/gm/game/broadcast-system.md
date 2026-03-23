# Broadcast System (廣播系統)

## Overview
GM can send messages to players during the game via two channels:
- **Game broadcast** — sent to all characters in the game
- **Character message** — sent to a specific character

## GM UI
Component: `components/gm/game-broadcast-panel.tsx`
Located on the game detail page.

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
