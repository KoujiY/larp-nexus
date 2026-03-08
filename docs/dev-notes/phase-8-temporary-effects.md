# Phase 8: 時效性效果系統 - 開發筆記

## 專案資訊
- **Phase**: Phase 8
- **功能名稱**: 時效性效果系統 (Temporary Effects System)
- **建立日期**: 2026-02-16
- **技術規格**: SPEC-temporary-effects-2026-02-12.md

---

## 功能概述

實作時間限制的 `stat_change` 效果系統。當技能或道具的效果附帶 `duration`（持續時間），該效果到期後會自動恢復數值。

### 核心概念
- **永久效果**: `duration` 為 `undefined` 或 `0`
- **時效性效果**: `duration > 0`（秒），到期後自動恢復數值
- **效果記錄對象**: 儲存在**被影響方**角色上
- **效果堆疊**: 同一數值可被多個效果同時影響
- **恢復邏輯**: 反向恢復 `deltaValue`/`deltaMax`，並 clamp 至 `[0, maxValue]`

---

## 任務拆解

### ✅ Phase 8.1: 型別定義與 Schema 擴展
**狀態**: 已完成

**修改的檔案**:
- `types/character.ts` - 新增 `TemporaryEffect` 介面、擴展 `SkillEffect`
- `types/event.ts` - 新增 `EffectExpiredEvent`
- `lib/db/models/Character.ts` - 新增 Schema 定義

### ✅ Phase 8.2: 效果執行器整合
**狀態**: 已完成

**修改的檔案**:
- `lib/effects/create-temporary-effect.ts` (新建) - 建立效果記錄工具
- `lib/skill/skill-effect-executor.ts` - 整合 duration 檢查
- `lib/item/item-effect-executor.ts` - 整合 duration 檢查
- `lib/contest/contest-effect-executor.ts` - 整合 duration 檢查

**關鍵邏輯**:
```typescript
// 在 stat_change 成功套用後
if (effect.duration && effect.duration > 0) {
  await createTemporaryEffectRecord(targetCharacterId, sourceInfo, statChange, effect.duration);
}
```

### ✅ Phase 8.3: Server Actions 與 API Route
**狀態**: 已完成

**新增的檔案**:
- `app/actions/temporary-effects.ts` - Server Actions
  - `checkExpiredEffects(characterId?)` - 檢查並處理過期效果
  - `getTemporaryEffects(characterId)` - 取得角色的活躍效果（GM 專用）
- `app/api/cron/check-expired-effects/route.ts` - Cron Job API
- `lib/effects/check-expired-effects.ts` - 核心過期處理邏輯

**關鍵決策**:
- 使用 MongoDB 原子操作避免並發問題
- 過期檢查時清理超過 24 小時的已過期記錄

### ✅ Phase 8.4: WebSocket 事件處理
**狀態**: 已完成

**修改的檔案**:
- `lib/websocket/events.ts` - 新增 `emitEffectExpired()`
- `hooks/use-character-websocket-handler.ts` - 新增 `effect.expired` 處理
- `lib/utils/event-mappers.ts` - 新增事件映射

**事件 Payload**:
```typescript
{
  targetCharacterId, effectId, sourceType, sourceId,
  sourceCharacterId, sourceCharacterName, sourceName,
  effectType, targetStat, restoredValue, restoredMax,
  deltaValue, deltaMax, statChangeTarget, duration
}
```

### ✅ Phase 8.5: 前端觸發整合
**狀態**: 已完成

**修改的檔案**:
- `app/actions/public.ts` - 在 `getPublicCharacter()` 中觸發檢查
- `app/actions/skill-use.ts` - 在 `useSkill()` 中觸發檢查
- `app/actions/item-use.ts` - 在 `useItem()` 中觸發檢查

**觸發時機**:
1. 頁面載入（`getPublicCharacter`）
2. 技能使用前（`useSkill`）
3. 道具使用前（`useItem`）
4. Cron Job（生產環境，每分鐘）

### ✅ Phase 8.6: GM 端 UI
**狀態**: 已完成

#### Step 8.6.1: 建立開發筆記 ✅
- 本文件

#### Step 8.6.2: 實作 `temporary-effects-card.tsx` 組件 ✅

**檔案**: `components/gm/temporary-effects-card.tsx`

**功能需求**:
- 顯示角色所有活躍的時效性效果
- 每個效果卡片包含：
  - 來源資訊（技能/道具名稱、施放者）
  - 目標數值、變化量
  - 剩餘時間倒數（每秒更新）
- 效果過期後自動從列表移除
- **預留擴展空間**：「暫停」、「延長時間」按鈕位置（Phase 8 暫不實作）

**技術實作**:
- 使用 `getTemporaryEffects` Server Action 獲取資料
- 使用 `useEffect` + `setInterval` 實現倒數計時
- 使用 shadcn/ui Card、Badge 組件

#### Step 8.6.3: 修改 Stats Tab 整合組件 ✅

**檔案**: `app/(gm)/games/[gameId]/characters/[characterId]/page.tsx`

**整合方式**:
- 在 `<TabsContent value="stats">` 中
- 在 `<StatsEditForm>` 下方新增 `<TemporaryEffectsCard>`
- 傳入 `characterId` prop

### ✅ Phase 8.7: 玩家端 UI
**狀態**: 已完成

**新增的檔案**:
- `components/player/active-effects-panel.tsx` - 活躍效果面板組件

**修改的檔案**:
- `components/player/character-card-view.tsx` - 整合活躍效果面板到 Stats Tab
- `app/actions/public.ts` - 加入 temporaryEffects 資料回傳

**實作細節**:
- 建立 `ActiveEffectsPanel` 組件，使用 Badge 風格顯示活躍效果
- 每個效果顯示：來源名稱、數值變化、剩餘時間倒數
- 使用 `useEffect` + `setInterval` 實現每秒倒數更新
- 效果過期後自動從列表移除（倒數至 0 時）
- Badge 顏色根據剩餘時間變化：
  - 少於 1 分鐘：紅色（destructive）
  - 少於 5 分鐘：灰色（secondary）
  - 5 分鐘以上：藍色（default）
- 修改 `getPublicCharacter` 回傳未過期的 `temporaryEffects` 資料

### ✅ Phase 8.8: GM 設定介面擴展
**狀態**: 已完成

**修改的檔案**:
- `components/gm/effect-editor.tsx` - 新增 duration 輸入欄位

**實作細節**:
- 發現 `effect-editor.tsx` 是技能和道具效果的**共用編輯器**
- 在 `stat_change` 效果區塊中新增「持續時間（分鐘）」輸入欄位
- 輸入單位為**分鐘**（整數），儲存時自動轉換為秒（`minutes * 60`）
- 空值或 0 表示永久效果（`duration = undefined`）
- 顯示時將秒轉回分鐘：`Math.round(effect.duration / 60)`

---

## 技術決策記錄

### 1. 效果記錄對象
**決策**: 效果記錄儲存在**被影響方**角色上

**理由**:
- 恢復數值時直接在目標角色上操作，避免跨角色查詢
- 對抗檢定中的 `effectTarget` 動態決定記錄位置

### 2. 恢復邏輯
**決策**: 使用「反向 delta」而非「快照」

**理由**:
- 允許 GM 在效果期間手動調整數值
- 恢復時只反向該效果的影響，不會覆蓋 GM 的調整

**實作**:
```typescript
// value 恢復
newValue = currentValue - deltaValue;
clampedValue = Math.max(0, Math.min(maxValue, newValue));

// maxValue 恢復
newMax = currentMax - deltaMax;
clampedMax = Math.max(1, newMax);
```

### 3. 過期檢查機制
**決策**: 雙重觸發 - 前端 + Cron Job

**理由**:
- 前端觸發：即時性，確保操作時數值正確
- Cron Job：定期清理，避免離線角色效果堆積

### 4. 並發安全
**決策**: MongoDB 原子操作 + `isExpired` 標記

**理由**:
- 使用 `findOneAndUpdate` 配合 `isExpired: false` 查詢條件
- 確保同一效果只被處理一次

---

## 測試案例

### 功能測試
- [x] AC-1: GM 設定帶 duration 的技能效果
- [x] AC-2: 玩家使用技能後，效果正常套用
- [x] AC-3: 效果記錄在被影響方的 `temporaryEffects` 陣列
- [x] AC-4: 效果過期後，數值自動恢復
- [x] AC-5: GM 端顯示活躍效果與倒數計時
- [x] AC-6: 效果過期後，卡片自動移除

### 錯誤處理測試
- [x] ERR-1: 恢復時數值正確 clamp
- [x] ERR-2: 目標數值被刪除時，效果標記為已過期
- [x] ERR-3: 並發觸發時，效果只處理一次

---

## 遺留問題與待辦

### 已知限制
1. **Cron Job 精度**: 每分鐘執行，效果過期可能有最多 60 秒延遲
   - **緩解**: 前端觸發補償，操作時立即檢查

2. **隱匿標籤處理**: `effect.expired` 事件中的 `sourceCharacterName` 尚未處理隱匿標籤
   - **待辦**: 在 Phase 8.7 實作玩家端 UI 時處理

### 未來擴展
- [ ] GM 手動「暫停」效果
- [ ] GM 手動「延長時間」
- [ ] 效果「堆疊限制」（同類效果不可重複）

---

## 參考資料
- SPEC: `docs/specs/SPEC-temporary-effects-2026-02-12.md`
- WebSocket Events: `docs/specs/04_WEBSOCKET_EVENTS.md`
- 專案結構: `docs/specs/01_PROJECT_STRUCTURE.md`
