# Phase 9: 離線事件佇列系統 - 開發筆記

## 文件資訊
- **建立日期**: 2026-02-17
- **開發者**: RD Agent
- **SPEC 參考**: `docs/specs/SPEC-offline-event-queue-2026-02-12.md`

---

## 功能概述

解決玩家離線（瀏覽器關閉、手機休眠、網路中斷）時漏接 WebSocket 事件的問題。實作 Server-side 事件佇列，確保玩家重新上線後能接收到所有錯過的事件通知。

### 核心機制
- **推送 + 寫入**: WebSocket 事件推送同時寫入 `pendingEvents` 集合
- **拉取 + 送達**: 玩家頁面載入時查詢並標記為已送達
- **逐一顯示**: 前端按時間排序逐一觸發通知/dialog
- **24 小時過期**: 事件保留 24 小時後自動清理

---

## 任務拆解

### Phase 9.1: 資料模型與 Schema ✅
- [x] 9.1.1 在 `types/event.ts` 新增 `PendingEvent` 介面
- [x] 9.1.2 建立 `lib/db/models/PendingEvent.ts` Mongoose model
- [x] 9.1.3 建立複合索引與 `targetGameId` 欄位

### Phase 9.2: 事件寫入層 ✅
- [x] 9.2.1 建立 `lib/websocket/pending-events.ts` 寫入輔助函式
- [x] 9.2.2 修改 `lib/websocket/events.ts` 整合 pending events 寫入
- [x] 9.2.3 處理雙頻道事件（skill.contest, item.transferred, item.showcased）
- [x] 9.2.4 處理 game.broadcast 事件（使用 targetGameId）
- [x] 9.2.5 排除不需要佇列的事件（role.updated, skill.cooldown, skill.used）

### Phase 9.3: 事件拉取 Server Action ✅
- [x] 9.3.1 建立 `app/actions/pending-events.ts`（fetchPendingEvents）
- [x] 9.3.2 修改 `app/actions/public.ts` 整合 pending events 拉取
- [x] 9.3.3 修改 `types/character.ts` 新增 `pendingEvents` 欄位

### Phase 9.4: 前端整合 ✅
- [x] 9.4.1 建立 `hooks/use-pending-events.ts` Hook
- [x] 9.4.2 修改 `components/player/character-card-view.tsx` 整合 pending events 處理
- [x] 9.4.3 實作事件去重邏輯

### Phase 9.5: 定期清理 ✅
- [x] 9.5.1 建立 lib/websocket/clean-pending-events.ts 清理函式
- [x] 9.5.2 修改 Cron Job 新增 pending events 清理邏輯

---

## 實作記錄

### 2026-02-17: Phase 9.1 完成

#### 9.1.1 新增 PendingEvent 介面
**檔案**: `types/event.ts`

在 `types/event.ts` 新增 `PendingEvent` 介面定義：
```typescript
export interface PendingEvent {
  id: string;
  targetCharacterId?: string;
  targetGameId?: string;
  eventType: string;
  eventPayload: Record<string, unknown>;
  createdAt: Date;
  isDelivered: boolean;
  deliveredAt?: Date;
  expiresAt: Date;
}
```

**關鍵設計**:
- `targetCharacterId` 和 `targetGameId` 均為可選，支援 character-level 和 game-level 事件
- `eventType` 使用 string 類型，對應 `WebSocketEvent['type']`
- `eventPayload` 使用 `Record<string, unknown>` 保存原始事件的 payload
- `expiresAt` 固定為 `createdAt + 24h`

#### 9.1.2 建立 PendingEvent Mongoose Model
**檔案**: `lib/db/models/PendingEvent.ts`

建立 Mongoose Schema 並設定 3 個複合索引：
1. `{ targetCharacterId: 1, isDelivered: 1, expiresAt: 1 }` - character-level 事件查詢
2. `{ targetGameId: 1, isDelivered: 1, expiresAt: 1 }` - game-level 事件查詢
3. `{ isDelivered: 1, expiresAt: 1 }` - 清理已送達或過期事件

#### 9.1.3 匯出 PendingEvent Model
**檔案**: `lib/db/models/index.ts`

新增 PendingEvent 的匯出與類型定義。

---

### 2026-02-17: Phase 9.2 完成

#### 9.2.1 建立 pending events 寫入輔助函式
**檔案**: `lib/websocket/pending-events.ts`

實作 3 個核心函式：
1. `writePendingEvent()` - 單一角色寫入
2. `writePendingEvents()` - 批次寫入（用於雙頻道事件）
3. `writePendingGameEvent()` - game-level 事件寫入

**關鍵設計**:
- 使用 `generatePendingEventId()` 生成唯一識別碼：`pevt-{timestamp}-{random}`
- 24 小時過期時間設定
- Best-effort 錯誤處理：寫入失敗不阻塞主流程

#### 9.2.2-9.2.5 整合 pending events 到 WebSocket 事件推送
**檔案**: `lib/websocket/events.ts`

修改 10 個 WebSocket 事件推送函式，整合 pending events 寫入：
- **單頻道事件**（6 個）：`emitCharacterAffected`, `emitTaskUpdated`, `emitInventoryUpdated`, `emitSecretRevealed`, `emitTaskRevealed`, `emitEffectExpired`
- **雙頻道事件**（3 個）：`emitSkillContest`, `emitItemTransferred`, `emitItemShowcased`
- **Game-level 事件**（1 個）：`emitGameBroadcast`

使用 `Promise.all` 並行執行 WebSocket 推送和 pending events 寫入。

**排除的事件**（3 個）：
- `emitSkillUsed` - 自己使用技能的結果，一定在線
- `emitRoleUpdated` - 頁面載入時已有最新資料
- `emitSkillCooldown` - 自己使用技能後的冷卻通知，一定在線

---

### 2026-02-17: Phase 9.3 完成

#### 9.3.1-9.3.2 實作 fetchPendingEvents Server Action
**檔案**: `app/actions/pending-events.ts`

建立 `fetchPendingEvents(characterId, gameId?)` Server Action：

**查詢條件**:
```typescript
{
  $or: [
    { targetCharacterId: characterId },
    ...(gameId ? [{ targetGameId: gameId }] : []),
  ],
  isDelivered: false,
  expiresAt: { $gt: now },
}
```

**原子操作**:
使用 `PendingEvent.updateMany()` 批次標記為 `isDelivered = true`，防止重複拉取。

**回傳格式**:
```typescript
{
  success: true,
  data: { events: PendingEvent[] }
}
```

#### 9.3.3 整合到 getPublicCharacter
**檔案**:
- `app/actions/public.ts` - 呼叫 `fetchPendingEvents()` 並加入回傳資料
- `types/character.ts` - `CharacterData` 新增 `pendingEvents?: PendingEvent[]` 欄位

**Graceful Degradation**:
```typescript
const pendingEventsResult = await fetchPendingEvents(characterId, character.gameId.toString());
const pendingEvents = pendingEventsResult.success ? pendingEventsResult.data?.events : [];
```

拉取失敗時不阻塞主流程，回傳空陣列。

**執行順序**:
1. `checkExpiredEffects(characterId)` - Phase 8 過期效果檢查
2. `fetchPendingEvents(characterId, gameId)` - Phase 9 離線事件拉取
3. 回傳角色資料 + pending events

---

### 2026-02-17: Phase 9.4 完成

#### 9.4.1 建立 use-pending-events Hook
**檔案**: `hooks/use-pending-events.ts`

實作 `usePendingEvents` Hook，負責處理離線期間的事件：

**核心功能**:
```typescript
export function usePendingEvents(options: UsePendingEventsOptions): void {
  const { pendingEvents, handleWebSocketEvent, delayBetweenEvents = 500 } = options;

  // 追蹤已處理的 event IDs（去重）
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // 追蹤是否已經處理過這一批 pending events
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // 1. 過濾出尚未處理的事件
    // 2. 按 createdAt 排序
    // 3. 使用 setTimeout 逐一處理（間隔 500ms）
    // 4. 調用 handleWebSocketEvent 處理每個事件
  }, [pendingEvents, handleWebSocketEvent, delayBetweenEvents]);
}
```

**關鍵設計**:
- **去重邏輯**: 使用 `Set<string>` 追蹤已處理的 event IDs，避免與即時 WebSocket 事件重複
- **逐一處理**: 使用 `setTimeout` 間隔處理，避免一次性全部彈出通知
- **復用現有邏輯**: 調用 `handleWebSocketEvent` 處理每個事件，完全復用現有的 WebSocket 事件處理邏輯
- **單次處理**: 使用 `hasProcessedRef` 確保每批 pending events 只處理一次

#### 9.4.2-9.4.3 整合到玩家端頁面
**檔案**: `components/player/character-card-view.tsx`

在 `CharacterCardView` 組件中整合 `usePendingEvents` Hook：

```typescript
// Phase 3.1: 使用 WebSocket 事件處理 Hook
const { handleWebSocketEvent } = useCharacterWebSocketHandler({ ... });

// Phase 3.1: 使用 WebSocket 事件處理 Hook（已整合通知系統和事件映射）
useCharacterWebSocket(character.id, handleWebSocketEvent);

// Phase 9: 處理離線事件佇列（復用 handleWebSocketEvent）
usePendingEvents({
  pendingEvents: character.pendingEvents,
  handleWebSocketEvent,
  delayBetweenEvents: 500, // 每個事件間隔 500ms
});
```

**執行流程**:
1. 頁面載入時，`getPublicCharacter()` 回傳角色資料 + pending events
2. `usePendingEvents` 自動觸發，按時間排序並逐一處理事件
3. 每個事件調用 `handleWebSocketEvent`，觸發通知、Toast、Dialog
4. 已處理的事件 ID 被記錄，避免重複處理

---

### 2026-02-17: Phase 9.5 完成

#### 9.5.1 建立 clean-pending-events 清理函式
**檔案**: `lib/websocket/clean-pending-events.ts`

實作 `cleanupPendingEvents()` 函式，用於定期清理過期或已送達的 pending events：

**清理策略**:
```typescript
export async function cleanupPendingEvents(): Promise<{
  deletedExpired: number;
  deletedDelivered: number;
  totalDeleted: number;
}> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // 1. 刪除已過期的 pending events（expiresAt < now）
  const expiredResult = await PendingEvent.deleteMany({
    expiresAt: { $lt: now },
  });

  // 2. 刪除已送達且送達時間超過 1 小時的 pending events（加速清理）
  const deliveredResult = await PendingEvent.deleteMany({
    isDelivered: true,
    deliveredAt: { $lt: oneHourAgo },
  });

  return {
    deletedExpired,
    deletedDelivered,
    totalDeleted,
  };
}
```

**關鍵設計**:
- **清理過期事件**: 刪除 `expiresAt < now` 的所有記錄（無論是否已送達）
- **加速清理已送達**: 刪除 `isDelivered === true && deliveredAt < now - 1h` 的記錄
- **Best-effort**: 清理失敗不拋出異常，只記錄錯誤並返回空結果

#### 9.5.2 修改 Cron Job 整合清理邏輯
**檔案**: `app/api/cron/check-expired-effects/route.ts`

修改現有的 Cron Job，新增 pending events 清理：

```typescript
// Phase 8: 處理所有角色的過期效果
const result = await processExpiredEffects();

// Phase 8: 清理超過 24 小時的已過期記錄
await cleanupOldExpiredEffects();

// Phase 9: 清理過期或已送達的 pending events
const pendingEventsCleanup = await cleanupPendingEvents();

return NextResponse.json({
  success: true,
  data: {
    // Phase 8: 過期效果處理統計
    processedCount: result.processedCount,
    // Phase 9: Pending events 清理統計
    pendingEventsDeleted: pendingEventsCleanup.totalDeleted,
    pendingEventsExpired: pendingEventsCleanup.deletedExpired,
    pendingEventsDelivered: pendingEventsCleanup.deletedDelivered,
    processedAt: new Date().toISOString(),
  },
});
```

**執行頻率**:
- Vercel Cron Jobs 每分鐘呼叫一次
- 清理邏輯執行頻率與 Phase 8 過期效果檢查相同

---

## 技術決策

### 決策 1: 獨立 Collection vs Character 嵌入陣列
**選擇**: 獨立 `pending_events` collection

**理由**:
- 事件量可能很大，嵌入會讓 Character document 膨脹
- 獨立 collection 方便建立索引和批次清理
- 不影響現有的 Character 查詢效能

### 決策 2: game.broadcast 處理方式
**選擇**: 使用 `targetGameId` 欄位（方案 B）

**理由**:
- 避免查詢劇本下所有角色並逐一寫入
- 拉取時同時查詢 character-level 和 game-level events
- 更簡潔且效能更好

### 決策 3: 不寫入佇列的事件
**排除**: `role.updated`, `skill.cooldown`, `skill.used`

**理由**:
- `role.updated`: 頁面載入時 `getPublicCharacter()` 已回傳最新資料
- `skill.cooldown`: 自己使用技能後的冷卻通知，使用時一定在線
- `skill.used`: 自己使用技能的結果，使用時一定在線

---

## 遇到的問題與解決方案

（待記錄）

---

## 驗收清單

### Phase 9.1 驗收 ✅
- [x] `PendingEvent` 介面定義完整
- [x] Mongoose Schema 正確建立
- [x] 索引設定正確
- [x] TypeScript 類型檢查通過

### Phase 9.2 驗收 ✅
- [x] 寫入函式實作完成（3 個函式）
- [x] 所有需要寫入的事件都已整合（10 個事件）
- [x] 雙頻道事件正確處理（skill.contest, item.transferred, item.showcased）
- [x] game.broadcast 正確使用 targetGameId
- [x] 排除不需要佇列的事件（3 個事件）

### Phase 9.3 驗收 ✅
- [x] fetchPendingEvents 實作完成
- [x] 原子操作避免重複拉取（使用 updateMany）
- [x] 整合到 getPublicCharacter（graceful degradation）
- [x] CharacterData 介面新增 pendingEvents 欄位
- [x] TypeScript 類型檢查通過
- [x] ESLint 檢查通過

### Phase 9.4 驗收 ✅
- [x] use-pending-events Hook 實作完成
- [x] 事件去重邏輯正確（使用 Set 追蹤已處理的 event IDs）
- [x] 玩家端正確處理 pending events（復用 handleWebSocketEvent）
- [x] 逐一顯示事件（間隔 500ms）
- [x] TypeScript 類型檢查通過
- [x] ESLint 檢查通過

### Phase 9.5 驗收 ✅
- [x] cleanupPendingEvents 函式實作完成
- [x] 刪除過期事件（expiresAt < now）
- [x] 刪除已送達且超過 1 小時的事件（加速清理）
- [x] 整合到 Cron Job（與 Phase 8 共用）
- [x] 清理統計回傳正確
- [x] TypeScript 類型檢查通過
- [x] ESLint 檢查通過

---

## 後續優化建議

### 效能優化
1. **索引優化**: 監控 MongoDB 查詢效能，根據實際使用情況調整複合索引
2. **批次清理**: 如果 pending events 數量過大，考慮使用批次刪除（limit + loop）避免長時間鎖定

### 功能擴展
1. **事件優先級**: 為不同類型的事件設定優先級，重要事件優先顯示
2. **事件摘要**: 如果 pending events 過多（如 10+ 個），顯示摘要而非逐一彈出
3. **手動重新拉取**: 提供按鈕讓玩家手動重新拉取 pending events

### 監控與除錯
1. **Cron Job 監控**: 設定 Vercel Cron Jobs 的監控和告警
2. **事件統計**: 記錄 pending events 的寫入和拉取統計，用於分析使用模式
3. **Debug 模式**: 提供開發環境下的 debug 面板，顯示 pending events 處理狀態

---

## 🎉 Phase 9 完成總結

**Phase 9: 離線事件佇列系統** 已於 2026-02-17 全部完成！

### 實作成果

#### 核心功能
- ✅ **推送 + 寫入雙軌機制**: WebSocket 推送同時寫入 `pending_events` 集合
- ✅ **拉取 + 送達機制**: 玩家重新上線時自動拉取並標記為已送達
- ✅ **逐一顯示**: 按時間排序，間隔 500ms 逐一觸發事件
- ✅ **24 小時過期**: 自動清理過期事件，防止集合無限增長
- ✅ **原子操作**: 避免重複拉取和重複處理

#### 技術亮點
1. **Graceful Degradation**: 所有 pending events 相關操作採用 best-effort 策略，失敗不影響主流程
2. **復用現有邏輯**: 前端完全復用 `handleWebSocketEvent`，確保一致性
3. **去重機制**: 使用 Set 追蹤已處理的 event IDs，避免重複顯示
4. **共用基礎設施**: 與 Phase 8 共用 Cron Job，減少配置和維護成本

#### 檔案清單
1. **資料模型** (Phase 9.1)
   - `types/event.ts` - PendingEvent 介面
   - `lib/db/models/PendingEvent.ts` - Mongoose Model

2. **寫入層** (Phase 9.2)
   - `lib/websocket/pending-events.ts` - 寫入輔助函式
   - `lib/websocket/events.ts` - 整合 10 個事件推送函式

3. **拉取層** (Phase 9.3)
   - `app/actions/pending-events.ts` - fetchPendingEvents Server Action
   - `app/actions/public.ts` - 整合到 getPublicCharacter

4. **前端處理** (Phase 9.4)
   - `hooks/use-pending-events.ts` - 離線事件處理 Hook
   - `components/player/character-card-view.tsx` - 整合 Hook

5. **清理機制** (Phase 9.5)
   - `lib/websocket/clean-pending-events.ts` - 清理函式
   - `app/api/cron/check-expired-effects/route.ts` - 整合到 Cron Job

### 驗收狀態

所有階段全部通過驗收：
- ✅ Phase 9.1: 資料模型與 Schema
- ✅ Phase 9.2: 事件寫入層
- ✅ Phase 9.3: 事件拉取 Server Action
- ✅ Phase 9.4: 前端整合
- ✅ Phase 9.5: 定期清理 Cron Job

### 文檔更新

- ✅ 開發筆記完整記錄實作過程和技術決策
- ✅ SPEC 文檔標記為已完成
- ✅ 專案結構文檔更新至 v1.5

---

**Phase 9 圓滿完成！🎊**
