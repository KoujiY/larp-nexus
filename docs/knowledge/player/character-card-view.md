# Player Character Card View

## Route
`/c/[characterId]`
Component: `components/player/character-card-view.tsx`

## 5 Tabs
| Tab | Emoji | Content |
|-----|-------|---------|
| 資訊 | 📋 | Public info + revealed hidden info |
| 數值 | 📊 | Stats + active temporary effects |
| 任務 | ✅ | Normal tasks + revealed hidden tasks |
| 道具 | 🎒 | Item inventory + usage |
| 技能 | ⚡ | Skills + usage |

## Mode Banners
- 🟡 **👁 預覽模式** — Read-only. PIN-only unlock or game not active.
- 🟢 **🎮 遊戲進行中** — Full interactive mode. Game Code + PIN + `isActive=true`.

In preview mode, all action buttons (use item, use skill, transfer, showcase) are disabled.

## Real-time Updates
Character card connects to Pusher WebSocket on mount:
- Channel: `private-character-{characterId}` + `private-game-{gameId}`
- Receives: stat changes, item changes, skill changes, revealed secrets, revealed tasks, notifications, game state changes
- Hook: `hooks/use-character-websocket-handler.ts`

## Related
- [item-usage.md](./item-usage.md)
- [skill-usage.md](./skill-usage.md)
