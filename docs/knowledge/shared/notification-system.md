# Notification System (通知系統)

## Overview
Players receive in-app notifications when events happen to their character (skill used on them, item changes, secrets revealed, etc.).

## Constraints
- **TTL**: 24 hours — notifications expire automatically
- **Limit**: 50 notifications per character — oldest removed when limit exceeded
- Hook: `hooks/use-notification-system.ts`
- **Storage**: 玩家通知存於各自瀏覽器 **localStorage**（`character-{id}-notifs`），**不入 DB**。

## Stat 變化通知格式（delta-only）
數值變化通知一律以**變化量**呈現，不顯示絕對值：
- `role.updated` 映射器（`lib/utils/event-mappers/role-events.ts`）只在有 delta 時產生通知；無 delta = 無實質變化 = 不通知（不再以絕對值 fallback，避免撞上限時誤報無關數值）。
- **撞上限仍提示**：全體/預設事件改數值時，若實際 delta 因 clamp 為 0（例如 MP+1 但 MP 已滿），通知改用「設定的變化量」（仍顯示「MP +1」），由 `resolveNotifyDelta`（`lib/utils/format-stat-delta.ts`）決定。數值同步另由 `router.refresh` 自 DB 讀取，不受通知 delta 影響。

## 一鍵清除通知顯示
GM 可於 Runtime 控制台「歷史紀錄」面板按「清除顯示」一鍵清空前端顯示（**不刪除任何 DB 資料**）：
- **玩家端**：廣播 `notifications.cleared`（遊戲頻道），各玩家 client 呼叫 `clearNotifications()` 清空 localStorage 通知面板。
- **GM 端**：以 localStorage **水位線**（`gm-eventlog-{gameId}-clearedBefore`）過濾顯示，隱藏清除點之前的歷史紀錄；DB `Log` collection 完整保留，刷新後仍維持清空。
- Server action：`app/actions/clear-notifications.ts`（限該遊戲 GM；對 DB 零寫入）。
- 限制：純即時訊號，不寫 pending events，故離線玩家重連後不會被補清。

## Notification Triggers
| Event | Recipient |
|-------|-----------|
| Skill/item used on character | Defender (character.affected) |
| Skill/item use result | Attacker (skill.used) |
| Hidden info revealed | Character owner |
| Hidden task revealed | Character owner |
| Skill revealed (`skill.revealed`) | Character owner — 訊息：「你習得了新的技能：{name}」 |
| Skill hidden (`skill.hidden`) | Character owner — 訊息：「你的技能已消失：{name}」 |
| Item revealed (`item.revealed`) | Character owner — 訊息：「你獲得了新的物品：{name}」 |
| Item hidden (`item.hidden`) | Character owner — 訊息：「你的物品已消失：{name}」 |
| Game broadcast | All characters in game |
| Private message | Specific character |
| Stat changed | Character owner |
| Item received/removed | Character owner |
| Temporary effect expired | Character owner |
| Preset event broadcast | Target characters |
| Preset event stat change | Target characters |

## GM Broadcast
GM can send broadcasts from the game detail page or via preset events.
- Game broadcast → all players
- Character message → specific character
- Preset event broadcast → all or selected characters
See [../gm/game/broadcast-system.md](../gm/game/broadcast-system.md)

## Preset Event Display Name
When `showName` is enabled on a preset event, players see the event name in notifications and active effects. When disabled (default), they see「未知來源」instead. See [../gm/game/preset-events.md](../gm/game/preset-events.md)
