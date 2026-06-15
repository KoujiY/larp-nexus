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

## 離線補送（Pending Events）
玩家離線期間累積的事件（對抗請求、被偷取、廣播等）存於 `PendingEvent` collection，重連時補送：
- **SSR 拉取**：`getPublicCharacter()` 呼叫 `fetchPendingEvents()`（**破壞性讀取**：一抓即原子標記 `isDelivered`），嵌入 `character.pendingEvents`，由 `hooks/use-pending-events.ts` 逐一投遞。
- **歷史導航 / 前景恢復重抓**：`fetchPendingEvents()` 僅在 SSR 執行，歷史導航返回不重跑 SSR → 漏接。`hooks/use-pending-events-refetch.ts` 於三種時機重抓並餵進同一投遞管線（server action 直打 DB，繞過 Router Cache）：**mount**（SPA 客戶端導航如「世界觀」連結 `router.push` 返回時角色頁 remount，server component 不重跑且 pageshow/visibilitychange 皆不觸發——in-app 返回的主要修復路徑）、`pageshow`(persisted，bfcache 整頁還原)、`visibilitychange`(→ visible，分頁/App 切回前景)。
  - **非破壞性讀取 + 投遞後 ack**：client 重抓以 `fetchPendingEvents(..., { markDelivered: false })` 讀取但不消費，**投遞到 UI 後**才 `acknowledgePendingEvents(ids)` 標記 delivered。理由：破壞性讀取放 client 端會在投遞失敗（如 dev StrictMode mount→cleanup→mount 把 in-flight fetch 跨過、`isActive` 守衛擋下投遞）時消費卻未投遞 → 連刷新都撈不回。非破壞性讓被擋下的投遞不消費（DB 仍 undelivered），remount/刷新可救回。去重在投遞當下；跨通道去重由 `handleWebSocketEvent` 的 `_eventId` 負責。代價：ack 失敗時最多重顯示一次（重顯示 > 遺失）。
- 詳見 `docs/specs/04_WEBSOCKET_EVENTS.md`「前端處理流程」。

## GM 歷史紀錄（Log collection）
玩家/系統動作寫入 `Log` collection，GM 於 Runtime 控制台「歷史紀錄」面板檢視（`components/gm/event-log.tsx` 依 `action` 分類顯示）：
- **物品流動**：偷取/移除（`item_steal` / `item_take`）經效果執行器寫 `item_use` / `skill_use` / `contest_result`（含「偷竊了 X」訊息）；**轉移（give）** 寫 `action: 'item_transfer'`（記在轉出方，details 帶 itemName/quantity/目標角色）。新增 log action 時須同步 `getEventCategory` 與 `EventDescription` 兩處。

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
