# Phase 7.7 開發筆記：自動揭露條件系統 + 道具展示功能

## 規格文件
- `docs/specs/SPEC-auto-reveal-item-showcase-2026-02-09.md` (v1.2)

## 任務拆解

### Phase 7.7-A: 資料模型與類型定義
- [x] 步驟 1: `types/character.ts` — 新增 `AutoRevealConditionType`、`AutoRevealCondition`、`ViewedItem`
- [x] 步驟 2: `types/character.ts` — 擴展 `Secret` 介面，新增 `autoRevealCondition`
- [x] 步驟 3: `types/character.ts` — 擴展 `Task` 介面，新增 `autoRevealCondition`
- [x] 步驟 4: `lib/db/models/Character.ts` — 擴展 Secret Schema `autoRevealCondition` 子文檔
- [x] 步驟 5: `lib/db/models/Character.ts` — 擴展 Task Schema `autoRevealCondition` 子文檔
- [x] 步驟 6: `lib/db/models/Character.ts` — 新增 `viewedItems` 陣列欄位
- [x] 步驟 7: `types/event.ts` — 新增 `SecretRevealedEvent`、`TaskRevealedEvent`、`ItemShowcasedEvent`，更新 `WebSocketEvent`

### Phase 7.7-B: 自動揭露條件評估引擎
- [x] 步驟 8: 建立 `lib/reveal/auto-reveal-evaluator.ts`（條件評估 + 連鎖揭露）
- [x] 步驟 9: 建立 `lib/reveal/reveal-event-emitter.ts`（揭露/展示事件發送）

### Phase 7.7-C: 道具展示與檢視記錄 Server Action
- [x] 步驟 10: 建立 `app/actions/item-showcase.ts` — `showcaseItem()`
- [x] 步驟 10.5: `app/actions/item-showcase.ts` — `recordItemView()`

### Phase 7.7-D: 整合自動揭露到既有流程
- [x] 步驟 11: 修改 `app/actions/item-use.ts` — 道具轉移後呼叫自動揭露引擎
- [x] 步驟 12: 修改 `app/actions/character-update.ts` — GM 新增/更新道具後觸發
- [x] 步驟 13: 修改 `lib/contest/contest-effect-executor.ts` — item_steal/item_take 後觸發
- [x] 步驟 14: 修改 `app/actions/character-update.ts` — GM 手動揭露隱藏資訊時連鎖觸發

### Phase 7.7-E: GM 端 UI — 隱藏資訊揭露條件設定
- [x] 步驟 15: 建立 `components/gm/auto-reveal-condition-editor.tsx` 通用條件編輯器
- [x] 步驟 16: 修改 `components/gm/character-edit-form.tsx` — 整合條件編輯器
- [x] 步驟 17: `app/actions/games.ts` — 新增 `getGameItems()` API

### Phase 7.7-F: GM 端 UI — 隱藏目標揭露條件設定
- [x] 步驟 18: 修改 `components/gm/tasks-edit-form.tsx` — 整合條件編輯器

### Phase 7.7-G: GM 端條件健全性清理
- [x] 步驟 19: 建立 `lib/reveal/condition-cleaner.ts`
- [x] 步驟 20: 在 GM 端切換分頁時觸發清理

### Phase 7.7-H: 玩家端 — 道具展示 UI
- [x] 步驟 21: 修改 `components/player/item-list.tsx` — 新增展示按鈕 + recordItemView
- [x] 步驟 22: 建立 `components/player/item-showcase-dialog.tsx`（唯讀道具 Dialog）

### Phase 7.7-I: 玩家端 — 事件處理與通知
- [x] 步驟 23: 修改 `hooks/use-character-websocket-handler.ts` — 新事件處理
- [x] 步驟 24: 修改 `lib/utils/event-mappers.ts` — 新事件映射
- [x] 步驟 25: 修改 `components/player/character-card-view.tsx` — 管理展示 Dialog 狀態

### Phase 7.7-J: 更新 character-update action 與 public action
- [x] 步驟 26: 修改 `app/actions/character-update.ts` — 處理 autoRevealCondition 儲存
- [x] 步驟 27: 修改 `app/actions/public.ts` — 過濾 GM 專用欄位

## 開發進度

### 2026-02-09
- 建立開發筆記
- 完成 Phase 7.7-A ~ 7.7-E
- 完成 Phase 7.7-F（Step 18）：
  - `lib/character/field-updaters.ts` — MongoTask 介面、updateCharacterTasks 函式新增 autoRevealCondition 支援
  - `app/actions/character-update.ts` — tasks 型別定義新增 autoRevealCondition
  - `components/gm/tasks-edit-form.tsx` — 整合 AutoRevealConditionEditor（含 secrets_revealed 條件支援）、載入道具列表、更新使用說明
- 完成 Phase 7.7-G（Steps 19-20）：
  - `lib/reveal/condition-cleaner.ts` — 新增 cleanSecretConditions / cleanTaskConditions，清理無效引用並在引用陣列為空時自動重設為 none
  - `components/gm/character-edit-form.tsx` — useEffect 載入道具後執行隱藏資訊條件清理
  - `components/gm/tasks-edit-form.tsx` — useEffect 載入道具後執行隱藏目標條件清理（含 secretIds 清理）
- 完成 Phase 7.7-H（Steps 21-22）：
  - `components/player/item-showcase-dialog.tsx`（NEW）— 唯讀道具展示 Dialog，僅顯示名稱、描述、圖片、類型、數量、標籤，不含效果/檢定等敏感資訊
  - `components/player/item-list.tsx` — 新增展示相關狀態（isShowcaseSelectOpen、showcaseTargets 等 6 個 useState）
  - `components/player/item-list.tsx` — 卡片 onClick 新增 `recordItemView()` fire-and-forget 呼叫（消耗品 + 裝備）
  - `components/player/item-list.tsx` — 新增 `handleOpenShowcase()`（複用 getTransferTargets）和 `handleShowcase()` 函式
  - `components/player/item-list.tsx` — DialogFooter 新增「展示」按鈕（Eye icon），位於使用按鈕和轉移按鈕之間
  - `components/player/item-list.tsx` — 新增展示目標選擇 Dialog（與轉移選擇 Dialog 同級結構）
- 完成 Phase 7.7-I（Steps 23-25）：
  - `lib/utils/event-mappers.ts` — 新增 mapSecretRevealed / mapTaskRevealed / mapItemShowcased 三個映射函式，加入 mapEventToNotifications switch 和 return 物件
  - `hooks/use-character-websocket-handler.ts` — 新增 onItemShowcased 回調選項；switch 新增 secret.revealed（toast + refresh）、task.revealed（toast + refresh）、item.showcased（toast + 被展示方觸發回調）
  - `components/player/character-card-view.tsx` — import ItemShowcaseDialog / ShowcasedItemInfo；新增 3 個 useState（showcaseDialogOpen、showcaseFromName、showcaseItemInfo）；傳入 onItemShowcased 回調；底部渲染 ItemShowcaseDialog

### 2026-02-12
- 完成 Phase 7.7-J（Steps 26-27）：
  - `lib/character-cleanup.ts` — MongoSecret / MongoTask 介面新增 `autoRevealCondition?: AutoRevealCondition`；cleanSecretData / cleanTaskData 新增 autoRevealCondition 輸出映射
  - `app/actions/character-update.ts` — 處理 autoRevealCondition 欄位儲存（secrets + tasks）
  - `app/actions/public.ts` — revealedSecrets 和 visibleTasks 改為顯式欄位映射（取代 spread），排除 `revealCondition`、`autoRevealCondition`、`gmNotes`
- Bug 修正 #1：WebSocket 事件訂閱遺漏
  - `hooks/use-websocket.ts` — `CHARACTER_EVENT_TYPES` 陣列缺少 Phase 7.7 的三個新事件（`secret.revealed`、`task.revealed`、`item.showcased`），導致 Pusher client 未綁定處理器，目標角色無法收到展示 Dialog 和通知
- Bug 修正 #2：自動揭露條件不會重新觸發
  - 問題：GM 將已揭露的隱藏資訊/目標改回未揭露後，再次滿足條件不會重新觸發揭露
  - 根因：`recordItemView` 中 `alreadyViewed` 時直接 return，完全跳過 `executeAutoReveal` 呼叫；`showcaseItem` 中 `executeAutoReveal` 被 `!alreadyViewed` guard 包住
  - 修正：`app/actions/item-showcase.ts` — DB 寫入去重保持不變，但 `executeAutoReveal` 改為無條件執行（無論 viewedItems 是否已記錄）
- 所有 Phase 完成，type-check 和 lint 通過
- 實際測試驗收通過
