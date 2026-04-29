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
| 物品 | `Backpack` | Item inventory + usage |
| 技能 | `Zap` | Skills + usage |

## Unlock / Entry Flow
所有角色（含無 PIN）統一經過入口頁面（`pin-unlock.tsx`），localStorage 控制解鎖狀態：
- **有 PIN 角色**：輸入 PIN → 預覽模式；PIN + Game Code → Runtime 模式
- **無 PIN 角色**：「直接進入」→ 預覽模式；輸入 Game Code → Runtime 模式
- Game Code 輸入區永遠顯示（選填），按鈕文字根據有無 Game Code 切換
- `useLocalStorageUnlock` hook 不再區分 `hasPinLock`，統一走 localStorage 讀寫

## Mode Banners
所有角色解鎖後統一顯示模式橫幅（`character-mode-banner.tsx`）：
- **預覽模式** — Read-only. 橫幅提供「重新解鎖」按鈕返回入口頁面
- **遊戲進行中** — Full interactive mode. 橫幅提供「重新鎖定」按鈕返回入口頁面

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
- **Loading**：`pusher-js` 透過 `getPusherClient()` 的 dynamic `import()` 延後載入，`useEffect` 內 `await` 並以 `cancelled` 旗標保護 cleanup 先於 resolve 的情形

## Lazy-loaded UI
以下子元件改以 `next/dynamic` 在使用者互動時才下載對應 chunk（減少玩家角色卡首次載入）：
- Dialogs: `ContestResponseDialog` / `ContestWaitingDialog` / `ItemDetailDialog` / `ItemSelectDialog` / `SkillDetailDialog` / `TargetItemSelectionDialog` / `ItemShowcaseDialog` / `GameEndedDialog`
- 人物關係分頁的 `CharacterAvatarList`（非預設分頁，帶走 `embla-carousel`）

## Related
- [item-usage.md](./item-usage.md)
- [skill-usage.md](./skill-usage.md)
