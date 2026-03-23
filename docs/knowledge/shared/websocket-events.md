# WebSocket Events

## Infrastructure
- Provider: **Pusher** (free tier: 100 simultaneous connections)
- Cluster: `ap3` (Asia-Pacific)
- All channels are **private** (require Pusher auth endpoint)

## Channels
| Channel | Format | Subscribers |
|---------|--------|-------------|
| Character channel | `private-character-{characterId}` | One player |
| Game channel | `private-game-{gameId}` | All players in game |

## Event Types

### Character Events
| Event | Description |
|-------|-------------|
| `role.updated` | GM updated character data (name, avatar, publicInfo) |
| `character.stat_changed` | Stat value changed |
| `character.item_changed` | Item added/removed/modified |
| `character.affected` | Character was affected by skill/item (with effect details) |
| `character.secret_revealed` | Hidden info was revealed |
| `character.task_revealed` | Hidden task was revealed |
| `character.temporary_effect_expired` | Timed effect expired |

### Skill/Item Events
| Event | Description |
|-------|-------------|
| `skill.used` | Skill use result (attacker notification) |
| `skill.contest` | Contest flow events (subType: request/result/effect) |

### Game Events
| Event | Description |
|-------|-------------|
| `game.broadcast` | GM broadcast to all players |
| `role.message` | Private message to one character |
| `game.started` | Game became active |
| `game.ended` | Game ended |

## Base Event Structure
```typescript
interface BaseEvent {
  type: string;
  timestamp: number;   // Unix ms
  payload: any;
}
```

## Frontend Handler
`hooks/use-character-websocket-handler.ts` — processes all incoming events
`lib/utils/event-mappers.ts` — maps raw events to display notifications
