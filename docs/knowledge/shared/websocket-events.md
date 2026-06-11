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
| `skill.revealed` | 技能被揭露（玩家端收到，用於通知與狀態更新） |
| `skill.hidden` | 技能被隱藏（玩家端收到，用於通知與狀態更新） |
| `item.revealed` | 物品被揭露（玩家端收到，用於通知與狀態更新） |
| `item.hidden` | 物品被隱藏（玩家端收到，用於通知與狀態更新） |

### Game Events
| Event | Description |
|-------|-------------|
| `game.broadcast` | GM broadcast to all players |
| `role.message` | Private message to one character |
| `game.started` | Game became active |
| `game.ended` | Game ended |
| `notifications.cleared` | GM 一鍵清除：全體玩家清空前端通知面板（純前端，不刪 DB；不寫 pending events） |

## 批次發送（PERF_INCIDENT_2026-06 批 2）
同一動作需通知**多個獨立收件人**時，使用批次發送函數：Pusher trigger 平行發送、pending events 合併為**單次 `insertMany`**，每個收件人注入**獨立 `_eventId`**（與逐筆發送的去重行為一致）。
- `lib/contest/contest-event-emitter.ts` → `emitContestEventsBatch(subType, targets)`：對抗結果/效果事件（通知管理器的初始結果與 select-item 效果階段使用）
- `lib/websocket/events.ts` → `emitRoleUpdatedBatch(targets)`：物品轉移的轉出方 + 接收方同步

順序原則：**跨收件人可平行；同一收件人的多個事件有順序需求時仍須依序逐筆發送**（如防守方的 `skill.contest` result 必須先於其 `skill.used`）。

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
- **log 刷新節流（PERF_INCIDENT_2026-06 批 3）**：WebSocket 事件驅動的歷史紀錄刷新（`getGameLogs`）經 `lib/utils/throttle.ts` 的 leading+trailing 節流（500ms）——閒置時首個事件立即刷新、burst 收斂為每窗口至多一次，消除「事件越多 → GM 查詢越多」的自我放大（假設 #8）。GM 主動操作（發廣播、執行預設事件）仍即時刷新，不受節流影響（`components/gm/runtime-console.tsx`）。
- `components/gm/runtime-console-ws-listener.tsx` — 輕量 WebSocket 監聽器
  - 僅監聽 3 種 stat 相關事件：`role.updated`、`character.affected`、`effect.expired`
  - 從 event payload 直接解析 stat 變動，透過 callback 更新 client state（零 DB 查詢）
  - `effect.expired` 額外觸發 `onLogRefresh` callback，自動刷新 GM 歷史紀錄面板
  - 使用 `useRef` 存取 `currentStatsMap` 和 `onStatUpdate`，避免 stat 更新時觸發頻道重新訂閱
  - Tab 切換離開控制台時自動 unmount → 清除所有訂閱（`GameEditTabs` 不使用 `forceMount`）
