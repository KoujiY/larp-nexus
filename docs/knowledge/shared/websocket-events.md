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

## Frontend Handlers

### 玩家端
- `hooks/use-character-websocket-handler.ts` — 處理所有收到的事件
- `lib/utils/event-mappers.ts` — 將原始事件轉換為通知顯示格式

### GM 端（Runtime 控制台）
- `components/gm/runtime-console-ws-listener.tsx` — 輕量 WebSocket 監聽器
  - 僅監聽 3 種 stat 相關事件：`role.updated`、`character.affected`、`effect.expired`
  - 從 event payload 直接解析 stat 變動，透過 callback 更新 client state（零 DB 查詢）
  - `effect.expired` 額外觸發 `onLogRefresh` callback，自動刷新 GM 歷史紀錄面板
  - 使用 `useRef` 存取 `currentStatsMap` 和 `onStatUpdate`，避免 stat 更新時觸發頻道重新訂閱
  - Tab 切換離開控制台時自動 unmount → 清除所有訂閱（`GameEditTabs` 不使用 `forceMount`）
