# Player Character Card View

## Route
`/c/[characterId]`
Component: `components/player/character-card-view.tsx`

## 5 Tabs
| Tab | Icon (Lucide) | Content |
|-----|--------------|---------|
| 資訊 | `ScrollText` | Public info (story, relationships, secrets) — `BackgroundBlockRenderer` + `CollapsibleSection` |
| 數值 | `BarChart3` | Stats + active temporary effects |
| 任務 | `ListChecks` | Normal tasks + revealed hidden tasks |
| 道具 | `Backpack` | Item inventory + usage |
| 技能 | `Zap` | Skills + usage |

## Mode Banners
- **預覽模式** — Read-only. PIN-only unlock or game not active.
- **遊戲進行中** — Full interactive mode. Game Code + PIN + `isActive=true`.

In preview mode, all action buttons (use item, use skill, transfer, showcase) are disabled.

## Shared Components (Phase D 抽取)
以下元件從角色卡與世界觀頁面中抽取為共用元件（`components/player/`）：
- `ThemeToggleButton` — 主題切換按鈕（`variant: 'fixed' | 'inline'`）
- `CollapsibleSection` — 可摺疊標題區塊（琥珀垂直條 + ChevronDown toggle）
- `BackgroundBlockRenderer` — `BackgroundBlock[]` 渲染器（標題群組化 + 摺疊）
- `CharacterAvatarList` — 橫向捲動頭像選擇器（用於人物關係 Tab 和世界觀頁面）

## Real-time Updates
Character card connects to Pusher WebSocket on mount:
- Channel: `private-character-{characterId}` + `private-game-{gameId}`
- Receives: stat changes, item changes, skill changes, revealed secrets, revealed tasks, notifications, game state changes
- Hook: `hooks/use-character-websocket-handler.ts`

## Related
- [item-usage.md](./item-usage.md)
- [skill-usage.md](./skill-usage.md)
