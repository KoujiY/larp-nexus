# Phase 8-10 Remote 服務依賴分析

**建立日期**: 2026-02-17
**更新日期**: 2026-02-17 (補充 Phase 9)
**目的**: 識別所有需要 remote 服務（DB、Pusher、外部 API）的開發任務，以便重新組織開發階段

---

## 分析結果總覽

| Phase | 總任務數 | 已完成 | 無需 Remote | 需要 Remote | 待分離到 Phase 11 |
|-------|---------|--------|------------|------------|------------------|
| Phase 8 | ~35 | ✅ 全部 | ~25 | ~10 | 1 (Cron 實測) |
| Phase 9 | ~15 | ✅ 全部 | ~3 | ~12 | 1 (Cron 實測) |
| Phase 10.1 | 7 | ✅ 全部 | 7 | 0 | 0 |
| Phase 10.2 | 4 | ✅ 2 | 1 | 3 | 3 |
| Phase 10.3 | 4 | ✅ 2 | 0 | 4 | 2 |
| Phase 10.4 | 5 | ✅ 4 | 0 | 5 | 1 |
| Phase 10.5 | 4 | ✅ 全部 | 2 | 2 | 0 |
| Phase 10.6 | 3 | ✅ 全部 | 0 | 3 | 0 |
| Phase 10.7 | 5 | ✅ 全部 | 2 | 3 | 0 |
| Phase 10.8 | 2 | 🔶 1 | 0 | 2 | 1 |
| Phase 10.9 | 4 | 🔶 1 | 0 | 4 | 3 |

**重點發現**:
- ✅ **已完成的 Phase 大多僅通過 type-check 驗收**，未進行 DB 連接測試
- ⚠️ **需要移到 Phase 11 的任務**: 共 **12 個** (含 Phase 8+9 Cron 測試)
- ✅ **Phase 10.8-10.9 框架已完成**: 遷移腳本 + 唯一性驗證基礎設施（TODO 標記 DB 邏輯）

---

## 詳細任務分析

### Phase 8 - 時效性效果系統 ✅

**狀態**: 已完成 (2026-02-16)
**驗收方式**: type-check + 部分功能測試

#### 無需 Remote 服務 ✅ (25 tasks)
- [x] 型別定義擴展 (types/character.ts, types/event.ts)
- [x] Mongoose Schema 擴展 (lib/db/models/)
- [x] 效果執行器整合 (lib/skill, lib/item, lib/contest)
- [x] WebSocket 事件處理 (lib/websocket/events.ts, hooks/)
- [x] 前端 UI 組件 (components/gm/, components/player/)

#### 需要 Remote 服務 ⚠️ (10 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `lib/effects/check-expired-effects.ts` - **需要 DB**
  - `lib/effects/create-temporary-effect.ts` - **需要 DB**
  - `app/actions/temporary-effects.ts` - **需要 DB**
  - `app/api/cron/check-expired-effects/route.ts` - **需要 DB + CRON_SECRET**

- [ ] ⏸️ **待 Phase 11 測試**:
  - Cron Job 實際觸發測試 (需要 Vercel Cron 或本地模擬)

---

### Phase 9 - 離線事件佇列系統 ✅

**狀態**: 已完成 (2026-02-17)
**驗收方式**: type-check + 部分功能測試

#### 無需 Remote 服務 ✅ (3 tasks)
- [x] 型別定義 (types/event.ts - PendingEvent 介面)
- [x] 前端 Hook (hooks/use-pending-events.ts)
- [x] 前端整合邏輯 (components/player/character-card-view.tsx)

#### 需要 Remote 服務 ⚠️ (12 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `lib/db/models/PendingEvent.ts` - **需要 DB**
  - `lib/websocket/pending-events.ts` - **需要 DB**
    - `writePendingEvent()` - 寫入單一事件
    - `writePendingEvents()` - 批次寫入
    - `writePendingGameEvent()` - 遊戲級別事件
  - `lib/websocket/clean-pending-events.ts` - **需要 DB**
    - `cleanupPendingEvents()` - 清理過期/已送達事件
  - `app/actions/pending-events.ts` - **需要 DB**
    - `fetchPendingEvents(characterId)` - 拉取未送達事件
  - 修改 `lib/websocket/events.ts` - **需要 DB + Pusher**
    - 所有 emitXXX 函數同時推送 + 寫入佇列
  - 修改 `app/actions/public.ts` - **需要 DB**
    - `getPublicCharacter()` 調用 fetchPendingEvents
  - 修改 `app/api/cron/check-expired-effects/route.ts` - **需要 DB + CRON_SECRET**
    - 整合 cleanupPendingEvents

- [ ] ⏸️ **待 Phase 11 測試**:
  - Cron Job 定期清理測試 (需要 Vercel Cron 或本地模擬)
  - 離線事件拉取功能測試 (需要 DB)
  - 雙頻道事件佇列測試 (skill.contest, item.transferred, item.showcased)

**說明**: Phase 9 與 Phase 8 深度整合，共用 Cron Job，確保離線玩家上線後能收到所有錯過的事件。

---

### Phase 10.1 - 資料模型層 ✅

**狀態**: 已完成
**驗收方式**: type-check

#### 無需 Remote 服務 ✅ (7 tasks)
- [x] GameRuntime, CharacterRuntime, Log 模型定義
- [x] Game, Character Schema 擴展
- [x] TypeScript 類型定義

**說明**: 模型定義不需要 DB 連接，僅需 type-check 驗收

---

### Phase 10.2 - Game Code 系統 🔶

**狀態**: 部分完成 (2/4)
**驗收方式**: type-check (已完成部分)

#### 無需 Remote 服務 ✅ (1 task)
- [x] 建立 `lib/game/generate-game-code.ts` - 純邏輯函數

#### 需要 Remote 服務 ⚠️ (3 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `generateGameCode()` 生成邏輯 - 無需 DB
  - `isGameCodeUnique()` - **需要 DB**
  - `generateUniqueGameCode()` - **需要 DB**

- [ ] ⏸️ **待 Phase 11**:
  - 修改 `app/actions/games.ts` 整合 gameCode 生成 - **需要 DB**
  - GM 端遊戲建立/編輯頁面即時驗證 - **需要 Server Actions (DB)**

---

### Phase 10.3 - 遊戲狀態管理 🔶

**狀態**: 部分完成 (2/4)
**驗收方式**: type-check (已完成部分)

#### 需要 Remote 服務 ⚠️ (4 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `lib/game/start-game.ts` - **需要 DB + Pusher**
  - `lib/game/end-game.ts` - **需要 DB + Pusher**

- [ ] ⏸️ **待 Phase 11**:
  - `app/actions/game-lifecycle.ts` - **需要 DB** (已存在，待測試)
  - GM 端遊戲詳情頁面 UI (開始/結束按鈕) - **需要 Server Actions**

---

### Phase 10.4 - 讀寫邏輯重構 🔶

**狀態**: 部分完成 (4/5)
**驗收方式**: type-check (已完成部分)

#### 需要 Remote 服務 ⚠️ (5 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `lib/game/get-character-data.ts` - **需要 DB**
  - `lib/game/update-character-data.ts` - **需要 DB**
  - `lib/game/get-character-by-game-code-pin.ts` - **需要 DB**
  - `lib/game/get-characters-by-pin.ts` - **需要 DB**

- [ ] ⏸️ **待 Phase 11**:
  - 重構所有 Server Actions 使用新讀寫邏輯 - **需要 DB 測試**

---

### Phase 10.5 - 玩家端訪問 ✅

**狀態**: 已完成
**驗收方式**: type-check + lint

#### 無需 Remote 服務 ✅ (2 tasks)
- [x] `app/unlock/page.tsx` - 前端 UI
- [x] `app/c/[characterId]/page.tsx` - 前端邏輯

#### 需要 Remote 服務 ⚠️ (2 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `app/actions/unlock.ts` - **需要 DB**
  - `components/player/character-card-view.tsx` - 調用 Server Actions

---

### Phase 10.6 - Logs 系統 ✅

**狀態**: 已完成
**驗收方式**: type-check

#### 需要 Remote 服務 ⚠️ (3 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `lib/logs/write-log.ts` - **需要 DB**
  - 整合到各處 (start-game, end-game, 效果執行器) - **需要 DB**
  - `app/actions/logs.ts` - **需要 DB**

---

### Phase 10.7 - WebSocket 事件 ✅

**狀態**: 剛完成 (2026-02-17)
**驗收方式**: type-check + lint

#### 無需 Remote 服務 ✅ (2 tasks)
- [x] 擴展 `types/event.ts` - 類型定義
- [x] 修改 `hooks/use-character-websocket-handler.ts` - 前端邏輯

#### 需要 Remote 服務 ⚠️ (3 tasks)
- [x] ✅ **已實作，未完整測試**:
  - `lib/websocket/push-event-to-game.ts` - **需要 DB + Pusher**
  - `lib/websocket/events.ts` 新增 emit 函數 - **需要 Pusher**
  - 修改 start-game.ts, end-game.ts 調用 emit - **需要 Pusher**

---

### Phase 10.8 - 資料遷移 🔶

**狀態**: 部分完成 (1/2)
**驗收方式**: type-check (框架已完成)

#### 需要 Remote 服務 ⚠️ (2 tasks)
- [x] ✅ **10.8.1 已實作框架**（TODO 標記 DB 邏輯）:
  - `scripts/migrate-phase10.ts` - **框架完成 ✅，DB 實作待 Phase 11**
    - 5 步驟遷移流程框架
    - MigrationStats 和 PinConflict 介面定義
    - 為現有遊戲生成 gameCode（TODO Phase 11）
    - 檢查 PIN 衝突（TODO Phase 11）
    - 輸出報告和衝突清單
  - 已在 package.json 新增 `migrate:phase10` 命令

- [ ] ⏸️ **10.8.2 待 Phase 11**:
  - 執行遷移腳本 - **需要 DB 環境**

---

### Phase 10.9 - 唯一性檢查 🔶

**狀態**: 部分完成 (1/4)
**驗收方式**: type-check (框架已完成)

#### 需要 Remote 服務 ⚠️ (4 tasks)
- [x] ✅ **10.9 唯一性檢查** — Phase 11.1 完成
  - ~~`types/validation.ts`、`lib/validation/uniqueness.ts`~~ — 已移除（死碼）
  - 唯一性檢查已直接實作於 Server Actions：
    - `app/actions/games.ts` → `checkGameCodeAvailability()` ✅
    - `app/actions/characters.ts` → `checkPinAvailability()` ✅
  - 格式驗證以 inline 正則實作於表單元件 ✅
  - 前端即時驗證（500ms debounce）已實作 ✅

---

## 重組建議

### ✅ 已完成 - Phase 10.8-10.9 框架 → Phase 11.1 啟用（2026-03-08）

**Phase 11.1 完成項目**：

1. ✅ **遷移腳本啟用** `scripts/migrate-phase10.ts`
   - DB 邏輯全面啟用（dbConnect、Model imports、aggregation pipeline）
   - 修正重複 `$ne` → `$nin` 語法問題

2. ✅ **死碼清理**
   - ~~`lib/validation/uniqueness.ts`~~ — 移除（從未被 import，Server Actions 已獨立實作）
   - ~~`types/validation.ts`~~ — 移除（唯一消費者為上述檔案）

3. ✅ **唯一性檢查確認**
   - `app/actions/games.ts` → `checkGameCodeAvailability()` 已有完整 DB 邏輯
   - `app/actions/characters.ts` → `checkPinAvailability()` 已有完整 DB 邏輯

**驗收結果**: type-check + lint 通過 ✅

---

### 延後到 Phase 11（需 Remote 依賴部分）

**前置條件**: 需要環境變數 (MONGODB_URI, PUSHER_*, CRON_SECRET)

#### 任務清單

##### ~~11.1 - 資料遷移與唯一性檢查~~ ✅ 已完成（2026-03-08）
- [x] ✅ 啟用 `scripts/migrate-phase10.ts` DB 邏輯
- [x] ✅ 確認 Server Actions 唯一性檢查已有完整 DB 邏輯
- [x] ✅ 移除死碼（`lib/validation/uniqueness.ts`、`types/validation.ts`）
- [ ] 執行遷移腳本（待 Production DB 環境）
- [ ] 檢查 PIN 衝突報告（待 Production DB 環境）

##### 11.4 - GM 端 UI 整合測試
- [ ] 遊戲建立/編輯頁面功能測試
- [ ] 遊戲狀態管理（開始/結束）功能測試
- [ ] 角色建立/編輯頁面功能測試

##### 11.5 - Server Actions 重構測試
- [ ] 驗證所有 Server Actions 正確使用新讀寫邏輯
- [ ] 測試 Runtime/Baseline 切換邏輯

##### 11.6 - WebSocket 事件整合測試
- [ ] 測試 game.started 事件推送
- [ ] 測試 game.ended 事件推送
- [ ] 測試玩家端事件接收與 UI 更新

##### 11.7 - Cron Job 測試
- [ ] 本地測試過期效果檢查 (Phase 8)
- [ ] 本地測試 pending events 清理 (Phase 9)
- [ ] Vercel Cron Jobs 部署與測試

##### 11.8 - Phase 9 離線事件佇列測試
- [ ] 測試玩家離線時事件寫入佇列
- [ ] 測試玩家上線時拉取 pending events
- [ ] 測試雙頻道事件佇列 (skill.contest, item.transferred, item.showcased)
- [ ] 測試 game.broadcast 事件佇列
- [ ] 測試 24 小時過期自動清理
- [ ] 測試重複拉取防護 (isDelivered 標記)

**驗收標準**: 功能測試 + 整合測試 + E2E 測試

---

## 依賴服務清單

### MongoDB
- **用途**: 所有資料查詢和寫入
- **環境變數**: `MONGODB_URI`
- **影響範圍**: Phase 8, 10.2-10.9, 11 全部

### Pusher (WebSocket)
- **用途**: 即時事件推送
- **環境變數**: `NEXT_PUBLIC_PUSHER_KEY`, `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_CLUSTER`
- **影響範圍**: Phase 8 (部分), 10.3, 10.7

### Vercel Cron Jobs
- **用途**: 定時執行過期檢查
- **環境變數**: `CRON_SECRET`
- **影響範圍**: Phase 8 Cron route

---

## 建議的開發順序

### 階段 1: 現在（無 Remote 依賴）
1. ✅ Phase 10.1-10.7 type-check 驗收（已完成）
2. 🔄 Phase 10.8 重組：完成無 Remote 依賴部分
   - 驗證邏輯框架
   - 前端 UI
   - 遷移腳本框架

### 階段 2: 待環境變數補齊（Phase 11）
1. 資料遷移執行
2. 唯一性檢查實作
3. 前端即時驗證整合
4. 完整功能測試與整合測試

---

## 風險與對策

### 風險 1: 已實作但未測試的程式碼可能需要調整
- **對策**: Phase 11 執行時，預留時間進行 bug 修復
- **影響**: 預估需要 1-2 天額外測試時間

### 風險 2: Pusher 配置問題
- **對策**: 先在本地使用 Pusher 測試環境進行驗證
- **影響**: 低（Pusher 配置相對簡單）

### 風險 3: 資料遷移失敗或衝突
- **對策**:
  - 先在測試資料庫執行
  - 遷移前備份資料
  - 提供回滾機制
- **影響**: 中（需要謹慎處理）

---

## 總結

- **已完成 Phase**: 8, 9, 10.1-10.7, 10.8（框架）, 10.9（框架）（僅 type-check 驗收）
- **待 Phase 11 補充**: 所有 TODO Phase 11 標記的 DB 查詢邏輯 + 前端 UI 整合
- **建議行動**:
  1. ✅ Phase 10.8-10.9 框架已完成（2026-02-18）
  2. ⏸️ 待環境變數補齊後，集中完成 Phase 11 所有需要 Remote 的任務
  3. 進行完整的功能測試與整合測試

**預估工作量**:
- ✅ Phase 10.8-10.9 框架: 已完成
- ⏸️ Phase 11（需 Remote）: 1.5-2 天（含測試，Phase 8+9+10 整合測試）

**Phase 8-9-10 整合測試重點**:
- Phase 8 (時效性效果) + Phase 9 (離線佇列) + Phase 10 (遊戲狀態) 三者深度整合
- 需要測試：離線玩家收到效果過期通知、遊戲狀態變更通知、對抗檢定通知等
- Cron Job 同時處理 Phase 8 過期效果 + Phase 9 佇列清理
