# LARP Nexus - 重構計劃文件

## 版本：v1.3
## 建立日期：2025-01-XX
## 最後更新：2025-01-XX
## 狀態：✅ **重構完成** - 所有 Phase 已完成並測試通過

---

## 重構目標

本次重構的主要目標是：
1. **降低文件複雜度**：將過於龐大的文件拆分為更小、更專注的模組
2. **減少耦合**：將緊密耦合的邏輯分離，提高可維護性
3. **提高可重用性**：提取共用邏輯到可重用的 hooks 和 utils
4. **保持功能完整性**：重構過程中不破壞現有功能

---

## 需要重構的文件清單

### 1. `components/player/character-card-view.tsx` (1320行) ⚠️ **優先級：高**

**問題分析**：
- 文件過於龐大（1320行），包含多種職責
- 通知系統邏輯與 UI 渲染耦合
- WebSocket 事件處理邏輯複雜且冗長
- 多個事件映射函數混雜在主組件中

**職責劃分**：
1. PIN 解鎖邏輯
2. 通知系統（載入、儲存、去重、映射）
3. WebSocket 事件處理
4. 對抗檢定狀態管理
5. UI 渲染

**重構方案**：

#### 1.1 提取通知系統到 Hook ✅ **已完成**
- **新文件**：`hooks/use-notification-system.ts` ✅
- **職責**：
  - 通知狀態管理（notifications, unreadCount）✅
  - localStorage 持久化（載入、儲存）✅
  - 通知去重邏輯✅
  - 通知 TTL 和限制管理✅
- **導出**：
  ```typescript
  export function useNotificationSystem(characterId: string) {
    return {
      notifications,
      unreadCount,
      addNotification,
      clearNotifications,
      markAsRead,
    };
  }
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 1.2 提取事件映射函數到 Utils ✅ **已完成**
- **新文件**：`lib/utils/event-mappers.ts` ✅
- **職責**：
  - 將 WebSocket 事件轉換為通知格式✅
  - 包含所有 `map*` 函數（mapRoleUpdated, mapInventoryUpdated, mapItemTransferred, mapSkillContest, mapSkillUsed, mapCharacterAffected, mapRoleMessage）✅
- **導出**：
  ```typescript
  export function createEventMappers(characterId: string, recentTransferredItemsRef: RecentTransferTracker) {
    return {
      mapRoleUpdated,
      mapInventoryUpdated,
      mapItemTransferred,
      mapSkillContest,
      mapSkillUsed,
      mapCharacterAffected,
      mapRoleMessage,
      mapEventToNotifications,
    };
  }
  ```
- **狀態**：✅ 已完成並通過 lint 檢查
- **注意**：需要傳入 `recentTransferredItemsRef` 參數以追蹤轉移事件

#### 1.3 提取 WebSocket 事件處理到 Hook
- **新文件**：`hooks/use-character-websocket-handler.ts`
- **職責**：
  - 處理角色專屬頻道的 WebSocket 事件
  - 整合通知系統和事件映射
  - 處理對抗檢定事件
  - 處理其他事件（role.updated, inventoryUpdated, etc.）
- **導出**：
  ```typescript
  export function useCharacterWebSocketHandler(
    characterId: string,
    options: {
      onNotification: (notifications: Notification[]) => void;
      onContestRequest: (event: SkillContestEvent) => void;
      onContestResult: (event: SkillContestEvent) => void;
      onTabChange?: (tab: string) => void;
    }
  ) {
    // WebSocket 事件處理邏輯
  }
  ```

#### 1.4 提取對抗檢定處理邏輯
- **新文件**：`hooks/use-contest-handler.ts`
- **職責**：
  - 處理對抗檢定請求事件（防守方）
  - 處理對抗檢定結果事件（攻擊方/防守方）
  - 管理對抗檢定狀態持久化
  - 處理跨分頁切換邏輯
- **導出**：
  ```typescript
  export function useContestHandler(
    characterId: string,
    options: {
      onTabChange: (tab: string) => void;
      onDefenderContestRequest: (event: SkillContestEvent) => void;
    }
  ) {
    // 對抗檢定處理邏輯
  }
  ```

#### 1.5 簡化主組件
- **保留職責**：
  - UI 渲染（角色卡、Tabs、Dialog）
  - 組合各個 hooks
  - 道具使用和轉移的 callback
- **預期行數**：約 300-400 行

---

### 2. `app/actions/contest-respond.ts` (1110行) ⚠️ **優先級：高**

**問題分析**：
- 文件過於龐大（1110行），包含複雜的對抗檢定邏輯
- 技能和道具的處理邏輯重複
- 數值計算邏輯可以提取
- 效果執行邏輯可以提取

**職責劃分**：
1. 對抗檢定 ID 解析和驗證
2. 技能/道具查找和驗證
3. 防守方道具/技能驗證
4. 數值計算（攻擊方、防守方、加成）
5. 對抗結果計算
6. 效果執行
7. WebSocket 事件推送

**重構方案**：

#### 2.1 提取對抗檢定驗證邏輯 ✅ **已完成**
- **新文件**：`lib/contest/contest-validator.ts` ✅
- **職責**：
  - 驗證對抗檢定 ID 格式✅
  - 驗證角色存在且在同一劇本✅
  - 驗證技能/道具是否存在且為對抗檢定類型✅
  - 驗證防守方道具/技能可用性✅
- **導出**：
  ```typescript
  export async function validateContestRequest(...): Promise<ValidationResult> ✅
  export function validateContestSource(...): {...} ✅
  export function validateDefenderItems(...): {...} ✅
  export function validateDefenderSkills(...): {...} ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 2.2 提取數值計算邏輯 ✅ **已完成**
- **新文件**：`lib/contest/contest-calculator.ts` ✅
- **職責**：
  - 計算攻擊方數值（基礎值 + 道具/技能加成）✅
  - 計算防守方數值（基礎值 + 道具/技能加成）✅
  - 計算對抗結果（攻擊方獲勝/防守方獲勝/雙方平手）✅
  - 處理平手裁決規則✅
- **導出**：
  ```typescript
  export function calculateAttackerValue(...): number ✅
  export function calculateDefenderValue(...): number ✅
  export function calculateContestResult(...): 'attacker_wins' | 'defender_wins' | 'both_fail' ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 2.3 提取效果執行邏輯 ✅ **已完成**
- **新文件**：`lib/contest/contest-effect-executor.ts` ✅
- **職責**：
  - 執行對抗檢定獲勝後的效果✅
  - 處理 item_take 和 item_steal 效果✅
  - 更新角色資料✅
  - 推送 WebSocket 事件✅
- **導出**：
  ```typescript
  export async function executeContestEffects(
    attacker: CharacterDocument,
    defender: CharacterDocument,
    source: SkillType | ItemType,
    targetItemId?: string
  ): Promise<ContestEffectExecutionResult> ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 2.4 簡化主函數
- **保留職責**：
  - 協調各個模組
  - 錯誤處理
  - 返回結果
- **預期行數**：約 200-300 行

---

### 3. `app/actions/character-update.ts` (1314行) ⚠️ **優先級：中**

**問題分析**：
- 文件過於龐大（1314行），包含多種欄位的更新邏輯
- 驗證邏輯與更新邏輯混合
- 各種欄位的更新邏輯可以分離

**職責劃分**：
1. 角色基本資訊更新
2. Stats 更新
3. Skills 更新
4. Items 更新
5. Tasks 更新
6. Secrets 更新
7. PublicInfo/SecretInfo 更新

**重構方案**：

#### 3.1 提取欄位更新邏輯 ✅ **已完成**
- **新文件**：`lib/character/field-updaters.ts` ✅
- **職責**：
  - 各個欄位的更新邏輯（stats, skills, items, tasks, secrets）✅
  - 資料驗證和清理✅
- **導出**：
  ```typescript
  export function updateCharacterStats(stats: Stat[]): Stat[] ✅
  export function updateCharacterSkills(skills: Skill[]): Array<Record<string, unknown>> ✅
  export function updateCharacterItems(items: Item[], currentItems?: MongoItem[]): {...} ✅
  export function updateCharacterTasks(tasks: Task[], currentTasks?: MongoTask[]): Array<Record<string, unknown>> ✅
  export function updateCharacterSecrets(secrets: Secret[], currentSecrets?: MongoSecret[]): Array<Record<string, unknown>> ✅
  export function updateCharacterPublicInfo(publicInfo: {...}, currentPublicInfo?: {...}): Record<string, unknown> ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 3.2 提取驗證邏輯 ✅ **已完成**
- **新文件**：`lib/character/character-validator.ts` ✅
- **職責**：
  - 角色資料驗證✅
  - 各個欄位的驗證邏輯✅
- **導出**：
  ```typescript
  export function validateCharacterData(data: {...}): ValidationResult ✅
  export async function validateCharacterAccess(characterId: string, gmUserId: string): Promise<{...}> ✅
  export function validateStats(stats: Stat[]): ValidationResult ✅
  export function validateSkills(skills: Skill[]): ValidationResult ✅
  export function validateItems(items: Item[]): ValidationResult ✅
  export function validateTasks(tasks: Task[]): ValidationResult ✅
  export function validateSecrets(secrets: Secret[]): ValidationResult ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 3.3 簡化主函數
- **保留職責**：
  - 協調各個欄位更新
  - 錯誤處理
  - WebSocket 事件推送
- **預期行數**：約 300-400 行

---

### 4. `app/actions/skill-use.ts` (800行) ⚠️ **優先級：中**

**問題分析**：
- 文件包含多種檢定類型的處理邏輯
- 效果執行邏輯可以提取
- 對抗檢定處理邏輯可以提取

**職責劃分**：
1. 技能驗證（存在、冷卻、使用次數）
2. 檢定處理（none, random, contest）
3. 效果執行
4. 對抗檢定處理

**重構方案**：

#### 4.1 提取檢定處理邏輯 ✅ **已完成**
- **新文件**：`lib/skill/check-handler.ts` ✅
- **職責**：
  - 處理不同類型的檢定（none, random, contest）✅
  - 對抗檢定處理（創建請求、計算初步結果）✅
- **導出**：
  ```typescript
  export async function handleSkillCheck(
    skill: SkillType,
    character: CharacterDocument,
    checkResult?: number,
    targetCharacterId?: string
  ): Promise<CheckResult> ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 4.2 提取效果執行邏輯 ✅ **已完成**
- **新文件**：`lib/skill/skill-effect-executor.ts` ✅
- **職責**：
  - 執行技能效果（stat_change, task_reveal, task_complete, custom, item_take, item_steal）✅
  - 處理跨角色效果✅
- **導出**：
  ```typescript
  export async function executeSkillEffects(
    skill: SkillType,
    character: CharacterDocument,
    targetCharacterId?: string,
    targetItemId?: string
  ): Promise<SkillEffectExecutionResult> ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 4.3 簡化主函數
- **保留職責**：
  - 技能驗證
  - 協調檢定和效果執行
  - 錯誤處理
- **預期行數**：約 200-300 行

---

### 5. `app/actions/item-use.ts` (952行) ⚠️ **優先級：中**

**問題分析**：
- 與 `skill-use.ts` 有相似的結構
- 檢定處理和效果執行邏輯可以提取

**重構方案**：

#### 5.1 提取檢定處理邏輯 ✅ **已完成**
- **新文件**：`lib/item/check-handler.ts` ✅
- **職責**：類似 `skill/check-handler.ts`，但針對道具✅
- **導出**：
  ```typescript
  export async function handleItemCheck(
    item: ItemType,
    character: CharacterDocument,
    checkResult?: number,
    targetCharacterId?: string
  ): Promise<CheckResult> ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 5.2 提取效果執行邏輯 ✅ **已完成**
- **新文件**：`lib/item/item-effect-executor.ts` ✅
- **職責**：類似 `skill/skill-effect-executor.ts`，但針對道具✅
- **導出**：
  ```typescript
  export async function executeItemEffects(
    item: ItemType,
    character: CharacterDocument,
    targetCharacterId?: string,
    targetItemId?: string
  ): Promise<ItemEffectExecutionResult> ✅
  ```
- **狀態**：✅ 已完成並通過 lint 檢查

#### 5.3 簡化主函數
- **預期行數**：約 200-300 行

---

## 重構執行計劃

### Phase 1：準備階段（1-2天）

1. **建立新的目錄結構**
   ```
   lib/
   ├── contest/
   │   ├── contest-validator.ts
   │   ├── contest-calculator.ts
   │   └── contest-effect-executor.ts
   ├── character/
   │   ├── character-validator.ts
   │   └── field-updaters.ts
   ├── skill/
   │   ├── check-handler.ts
   │   └── skill-effect-executor.ts
   ├── item/
   │   ├── check-handler.ts
   │   └── item-effect-executor.ts
   └── utils/
       └── event-mappers.ts
   
   hooks/
   ├── use-notification-system.ts
   ├── use-character-websocket-handler.ts
   └── use-contest-handler.ts
   ```

2. **建立測試環境**
   - 確保現有功能正常運作
   - 準備測試用例

### Phase 2：提取共用邏輯（3-5天）

#### 2.1 提取 Utils 和 Lib 模組（優先）
- [x] `lib/utils/event-mappers.ts` - 事件映射函數 ✅ **已完成**
- [x] `lib/contest/contest-validator.ts` - 對抗檢定驗證 ✅ **已完成**
- [x] `lib/contest/contest-calculator.ts` - 對抗檢定計算 ✅ **已完成**
- [x] `lib/contest/contest-effect-executor.ts` - 對抗檢定效果執行 ✅ **已完成**
- [x] `lib/skill/check-handler.ts` - 技能檢定處理 ✅ **已完成**
- [x] `lib/skill/skill-effect-executor.ts` - 技能效果執行 ✅ **已完成**
- [x] `lib/item/check-handler.ts` - 道具檢定處理 ✅ **已完成**
- [x] `lib/item/item-effect-executor.ts` - 道具效果執行 ✅ **已完成**
- [x] `lib/character/character-validator.ts` - 角色驗證 ✅ **已完成**
- [x] `lib/character/field-updaters.ts` - 欄位更新邏輯 ✅ **已完成**

#### 2.2 提取 Hooks（其次）
- [x] `hooks/use-notification-system.ts` - 通知系統 ✅ **已完成**
- [x] `hooks/use-character-websocket-handler.ts` - WebSocket 事件處理 ✅ **已完成**
- [x] `hooks/use-contest-handler.ts` - 對抗檢定處理 ✅ **已完成**

### Phase 3：重構主文件（5-7天）

#### 3.1 重構 `character-card-view.tsx` ✅ **已完成**
- [x] 移除事件映射函數，改用 `lib/utils/event-mappers.ts` ✅
- [x] 移除通知系統邏輯，改用 `hooks/use-notification-system.ts` ✅
- [x] 移除 WebSocket 事件處理邏輯，改用 `hooks/use-character-websocket-handler.ts` ✅
- [x] 移除對抗檢定處理邏輯，改用 `hooks/use-contest-handler.ts` ✅
- [x] 簡化主組件，只保留 UI 渲染和 hooks 組合 ✅
- **結果**：文件從 1320 行減少到 490 行（減少約 63%）

#### 3.2 重構 `contest-respond.ts` ✅ **已完成**
- [x] 移除驗證邏輯，改用 `lib/contest/contest-validator.ts` ✅
- [x] 移除計算邏輯，改用 `lib/contest/contest-calculator.ts` ✅
- [x] 移除效果執行邏輯，改用 `lib/contest/contest-effect-executor.ts` ✅
- [x] 簡化主函數 ✅
- **結果**：文件從 1110 行減少到 355 行（減少約 68%）

#### 3.3 重構 `character-update.ts` ✅ **已完成**
- [x] 移除欄位更新邏輯，改用 `lib/character/field-updaters.ts` ✅
- [x] 移除驗證邏輯，改用 `lib/character/character-validator.ts` ✅
- [x] 簡化主函數 ✅
- **結果**：文件從 1171 行減少到 713 行（減少約 39%）

#### 3.4 重構 `skill-use.ts` ✅ **已完成**
- [x] 移除檢定處理邏輯，改用 `lib/skill/check-handler.ts` ✅
- [x] 移除效果執行邏輯，改用 `lib/skill/skill-effect-executor.ts` ✅
- [x] 簡化主函數 ✅
- **結果**：文件從 800 行減少到 365 行（減少約 54%）

#### 3.5 重構 `item-use.ts` ✅ **已完成**
- [x] 移除檢定處理邏輯，改用 `lib/item/check-handler.ts` ✅
- [x] 移除效果執行邏輯，改用 `lib/item/item-effect-executor.ts` ✅
- [x] 簡化主函數 ✅
- **結果**：文件從 953 行減少到 544 行（減少約 43%）

### Phase 3.6：已知問題與後續修復

#### 問題 1：通知系統實例不一致導致通知無法顯示 ✅ **已修復**

**問題描述**：
- 重構後所有通知（技能/道具使用、數值變化、偷竊等）都不會顯示
- 包括自己使用技能/道具的狀態變化通知，以及跨角色影響的通知

**根本原因**：
- `character-card-view.tsx` 和 `use-character-websocket-handler.ts` 各自創建了獨立的 `useNotificationSystem` 實例
- `use-character-websocket-handler.ts` 中的 `addNotification` 操作的是實例 A
- `character-card-view.tsx` 中顯示的 `notifications` 來自實例 B
- 導致通知被添加到錯誤的實例，UI 無法顯示

**影響範圍**：
- 所有 WebSocket 事件產生的通知都無法顯示
- 包括：`role.updated`、`character.affected`、`role.inventoryUpdated`、`item.transferred` 等

**修復方案**：

1. **修改 `hooks/use-character-websocket-handler.ts`**：
   - ✅ 移除內部的 `useNotificationSystem` 調用
   - ✅ 更新 `UseCharacterWebSocketHandlerOptions` 接口，添加 `addNotification` 參數
   - ✅ 更新函數簽名，從 options 中獲取 `addNotification`
   - ✅ 添加 `Notification` 類型的導入

2. **修改 `components/player/character-card-view.tsx`**：
   - ✅ 在 `useCharacterWebSocketHandler` 調用中傳入 `addNotification` 參數

**相關文件**：
- `hooks/use-character-websocket-handler.ts`（第 20-25 行、第 34-41 行）
- `components/player/character-card-view.tsx`（第 71 行、第 204 行）

**狀態**：✅ 已修復並測試完成

---

#### 問題 1.1：GM 端道具轉移時資料不同步 ✅ **已修復**

**問題描述**：
- GM 端在非道具管理分頁時，道具轉移事件無法觸發頁面刷新
- 只有在道具管理分頁時才會收到更新

**根本原因**：
- `ItemsEditForm` 組件中的 WebSocket 監聽只在該組件掛載時生效
- 當 GM 切換到其他分頁（基本資訊、數值、任務、技能）時，`ItemsEditForm` 組件未掛載，無法接收事件

**修復方案**：
- ✅ 創建 `components/gm/character-websocket-listener.tsx` 組件
- ✅ 在角色編輯頁面層級統一處理 WebSocket 事件
- ✅ 監聽 `role.updated`、`item.transferred`、`role.inventoryUpdated` 事件
- ✅ 無論在哪個分頁都能收到更新並自動刷新頁面

**相關文件**：
- `components/gm/character-websocket-listener.tsx`（新建）
- `app/(gm)/games/[gameId]/characters/[characterId]/page.tsx`（第 89 行）

**狀態**：✅ 已修復並測試完成

---

#### 問題 2：`mapCharacterAffected` 函數缺少 `items` 處理 ✅ **已修復**

**問題描述**：
- `character.affected` 事件中的 `items` 變化（偷竊、移除道具）不會產生通知
- 只有 `stats` 變化會產生通知

**根本原因**：
- `lib/utils/event-mappers.ts` 中的 `mapCharacterAffected` 函數（第 245-306 行）只處理 `stats` 變化
- 缺少對 `items` 變化的處理邏輯
- `hooks/use-character-websocket-handler.ts` 中的 `character.affected` 處理（第 120-162 行）也只處理 `stats`

**修復方案**：

1. **修改 `lib/utils/event-mappers.ts` 中的 `mapCharacterAffected` 函數**（第 245-306 行）：
   - ✅ 添加 `items` 變化的處理邏輯
   - ✅ 處理 `stolen` 和 `removed` 兩種動作
   - ✅ 生成對應的通知訊息

2. **修改 `hooks/use-character-websocket-handler.ts` 中的 `character.affected` 處理**（第 120-162 行）：
   - ✅ 添加 `items` 變化的處理邏輯
   - ✅ 顯示 toast 通知
   - ✅ 觸發頁面刷新

**相關文件**：
- `lib/utils/event-mappers.ts`（第 245-306 行）
- `hooks/use-character-websocket-handler.ts`（第 120-162 行）
- `types/event.ts`（第 135-158 行，`CharacterAffectedEvent` 類型定義）

**狀態**：✅ 已修復並測試完成

---

### Phase 4：測試與優化 ✅ **已完成**

1. **功能測試** ✅
   - ✅ 測試所有現有功能
   - ✅ 確保沒有回歸問題
   - ✅ 修復發現的 bug（通知系統實例不一致、GM 端資料同步問題、mapCharacterAffected 缺少 items 處理）

2. **效能測試** ✅
   - ✅ 檢查是否有效能退化
   - ✅ 優化必要的地方

3. **程式碼審查** ✅
   - ✅ 檢查程式碼品質
   - ✅ 確保符合專案規範

---

## 重構原則

### 1. 保持向後兼容
- 所有公開的 API 保持不變
- 內部實作可以改變，但外部介面不變

### 2. 逐步遷移
- 一次只重構一個模組
- 每個模組重構後立即測試
- 確保功能正常後再繼續下一個

### 3. 測試優先
- 重構前先確保有足夠的測試覆蓋
- 重構過程中持續測試
- 重構後進行完整回歸測試

### 4. 文檔更新
- 重構後更新相關文檔
- 記錄重構決策和原因

---

## 預期成果

### 文件大小減少
- `character-card-view.tsx`: 1320行 → 約 300-400行（減少約 70%）
- `contest-respond.ts`: 1110行 → 約 200-300行（減少約 75%）
- `character-update.ts`: 1314行 → 約 300-400行（減少約 70%）
- `skill-use.ts`: 800行 → 約 200-300行（減少約 70%）
- `item-use.ts`: 952行 → 約 200-300行（減少約 70%）

### 可維護性提升
- 每個模組職責單一，易於理解和維護
- 共用邏輯提取，減少重複程式碼
- 測試更容易編寫

### 可重用性提升
- 提取的 hooks 和 utils 可以在其他地方重用
- 檢定處理邏輯可以在其他場景使用

---

## 風險評估

### 高風險項目
1. **WebSocket 事件處理重構**
   - 風險：可能影響即時更新功能
   - 緩解：充分測試，逐步遷移

2. **對抗檢定邏輯重構**
   - 風險：可能影響對抗檢定功能
   - 緩解：詳細測試各種場景

### 中風險項目
1. **通知系統重構**
   - 風險：可能影響通知顯示
   - 緩解：測試各種通知類型

2. **效果執行邏輯重構**
   - 風險：可能影響技能/道具效果
   - 緩解：測試所有效果類型

---

## 注意事項

1. **不要同時重構多個文件**
   - 一次只重構一個文件，確保穩定後再繼續

2. **保持 Git 提交清晰**
   - 每個重構步驟都應該有清晰的 commit message
   - 便於回滾和追蹤

3. **與團隊溝通**
   - 重大重構決策應該與團隊討論
   - 確保所有人都理解重構計劃

4. **監控效能**
   - 重構後監控應用程式效能
   - 確保沒有效能退化

---

## 後續優化建議

重構完成後，可以考慮以下優化：

1. **統一錯誤處理**
   - 建立統一的錯誤處理機制
   - 減少重複的錯誤處理程式碼

2. **類型安全加強**
   - 加強 TypeScript 類型定義
   - 減少 any 類型的使用

3. **測試覆蓋**
   - 為提取的模組編寫單元測試
   - 提高測試覆蓋率

4. **效能優化**
   - 優化 WebSocket 事件處理
   - 優化狀態更新邏輯

---

---

## 驗收指南

### Phase 2.1 驗收清單（已完成部分）

#### ✅ 1. `lib/utils/event-mappers.ts` 驗收

**驗收項目**：
- [ ] 文件存在且無 lint 錯誤
- [ ] 所有事件映射函數都已實現（mapRoleUpdated, mapInventoryUpdated, mapItemTransferred, mapSkillContest, mapSkillUsed, mapCharacterAffected, mapRoleMessage）
- [ ] `createEventMappers` 函數正確導出所有映射器
- [ ] 類型定義正確（Notification, RecentTransferTracker）
- [ ] 與原 `character-card-view.tsx` 中的邏輯一致

**驗收方法**：
```bash
# 1. 檢查文件是否存在
ls -la lib/utils/event-mappers.ts

# 2. 運行 lint 檢查
npm run lint lib/utils/event-mappers.ts

# 3. 檢查 TypeScript 編譯
npx tsc --noEmit lib/utils/event-mappers.ts
```

**功能測試**：
- [ ] 測試每個事件映射函數是否能正確轉換事件為通知格式
- [ ] 測試 `recentTransferredItemsRef` 參數是否正確過濾重複通知
- [ ] 測試邊界情況（空事件、無效事件等）

#### ✅ 2. `hooks/use-notification-system.ts` 驗收

**驗收項目**：
- [ ] 文件存在且無 lint 錯誤
- [ ] Hook 正確導出所有必要的方法和狀態
- [ ] localStorage 持久化功能正常
- [ ] 通知去重邏輯正確
- [ ] TTL 和限制管理正確

**驗收方法**：
```bash
# 1. 檢查文件是否存在
ls -la hooks/use-notification-system.ts

# 2. 運行 lint 檢查
npm run lint hooks/use-notification-system.ts

# 3. 檢查 TypeScript 編譯
npx tsc --noEmit hooks/use-notification-system.ts
```

**功能測試**：
- [ ] 測試通知添加功能
- [ ] 測試 localStorage 載入和儲存
- [ ] 測試通知去重邏輯
- [ ] 測試 TTL 過期清理
- [ ] 測試通知數量限制（50 條）

#### ✅ 3. `lib/contest/contest-validator.ts` 驗收

**驗收項目**：
- [ ] 文件存在且無 lint 錯誤
- [ ] 所有驗證函數都已實現
- [ ] 驗證邏輯與原 `contest-respond.ts` 一致
- [ ] 錯誤訊息清晰明確

**驗收方法**：
```bash
# 1. 檢查文件是否存在
ls -la lib/contest/contest-validator.ts

# 2. 運行 lint 檢查
npm run lint lib/contest/contest-validator.ts

# 3. 檢查 TypeScript 編譯
npx tsc --noEmit lib/contest/contest-validator.ts
```

**功能測試**：
- [ ] 測試對抗檢定 ID 格式驗證
- [ ] 測試角色存在性驗證
- [ ] 測試技能/道具類型驗證
- [ ] 測試防守方道具/技能可用性驗證（冷卻、次數限制等）

#### ✅ 4. `lib/contest/contest-calculator.ts` 驗收

**驗收項目**：
- [ ] 文件存在且無 lint 錯誤
- [ ] 所有計算函數都已實現
- [ ] 計算邏輯與原 `contest-respond.ts` 一致
- [ ] 平手裁決規則正確處理

**驗收方法**：
```bash
# 1. 檢查文件是否存在
ls -la lib/contest/contest-calculator.ts

# 2. 運行 lint 檢查
npm run lint lib/contest/contest-calculator.ts

# 3. 檢查 TypeScript 編譯
npx tsc --noEmit lib/contest/contest-calculator.ts
```

**功能測試**：
- [ ] 測試攻擊方數值計算（目前為基礎值，未來可擴展）
- [ ] 測試防守方數值計算（包含道具/技能加成）
- [ ] 測試對抗結果計算（攻擊方獲勝、防守方獲勝、平手）
- [ ] 測試平手裁決規則（attacker_wins, defender_wins, both_fail）

### 整體驗收標準

#### 1. 程式碼品質
- [ ] 所有新文件通過 ESLint 檢查
- [ ] 所有新文件通過 TypeScript 編譯檢查
- [ ] 沒有使用 `any` 類型（除非必要）
- [ ] 函數和變數命名清晰
- [ ] 註解完整且準確

#### 2. 功能完整性
- [ ] 提取的邏輯與原始邏輯功能一致
- [ ] 沒有遺漏任何邊界情況處理
- [ ] 錯誤處理完整

#### 3. 可重用性
- [ ] 模組設計良好，易於在其他地方重用
- [ ] 依賴關係清晰
- [ ] 介面設計合理

#### 4. 文檔完整性
- [ ] 每個模組都有清晰的註解
- [ ] 函數參數和返回值都有類型定義
- [ ] 複雜邏輯有說明註解

### 驗收流程

1. **自動化檢查**（必須通過）
   ```bash
   # 運行 lint
   npm run lint
   
   # 運行 TypeScript 編譯檢查
   npm run type-check
   ```

2. **手動檢查**（必須通過）
   - 檢查每個文件的程式碼結構
   - 檢查函數簽名是否正確
   - 檢查導出是否完整

3. **功能測試**（建議進行）
   - 編寫簡單的測試腳本驗證功能
   - 或等待 Phase 3 重構主文件後進行整合測試

4. **程式碼審查**（建議進行）
   - 檢查程式碼是否符合專案規範
   - 檢查是否有可以優化的地方

### 下一步行動

✅ **重構已完成** - 所有 Phase 已完成並測試通過

---

## 重構完成總結

### ✅ 已完成項目

#### Phase 2：提取共用邏輯
- ✅ `lib/utils/event-mappers.ts` - 事件映射函數
- ✅ `lib/contest/contest-validator.ts` - 對抗檢定驗證
- ✅ `lib/contest/contest-calculator.ts` - 對抗檢定計算
- ✅ `lib/contest/contest-effect-executor.ts` - 對抗檢定效果執行
- ✅ `lib/skill/check-handler.ts` - 技能檢定處理
- ✅ `lib/skill/skill-effect-executor.ts` - 技能效果執行
- ✅ `lib/item/check-handler.ts` - 道具檢定處理
- ✅ `lib/item/item-effect-executor.ts` - 道具效果執行
- ✅ `lib/character/character-validator.ts` - 角色驗證
- ✅ `lib/character/field-updaters.ts` - 欄位更新邏輯
- ✅ `hooks/use-notification-system.ts` - 通知系統
- ✅ `hooks/use-character-websocket-handler.ts` - WebSocket 事件處理
- ✅ `hooks/use-contest-handler.ts` - 對抗檢定處理

#### Phase 3：重構主文件
- ✅ `character-card-view.tsx` - 從 1320 行減少到 530 行（減少約 60%）
- ✅ `contest-respond.ts` - 從 1110 行減少到 355 行（減少約 68%）
- ✅ `character-update.ts` - 從 1171 行減少到 713 行（減少約 39%）
- ✅ `skill-use.ts` - 從 800 行減少到 365 行（減少約 54%）
- ✅ `item-use.ts` - 從 953 行減少到 544 行（減少約 43%）

#### Phase 3.6：問題修復
- ✅ 問題 1：通知系統實例不一致 - 已修復
- ✅ 問題 1.1：GM 端道具轉移時資料不同步 - 已修復
- ✅ 問題 2：`mapCharacterAffected` 函數缺少 `items` 處理 - 已修復

#### Phase 4：測試與優化
- ✅ 功能測試完成
- ✅ 效能測試完成
- ✅ 程式碼審查完成

### 📊 重構成果

#### 文件大小減少
- 總共減少約 **2000+ 行**程式碼
- 平均減少約 **50-60%** 的文件大小
- 提高了程式碼的可讀性和可維護性

#### 架構改善
- ✅ 職責分離：每個模組職責單一
- ✅ 可重用性：提取的 hooks 和 utils 可在其他地方重用
- ✅ 可測試性：模組化設計使測試更容易編寫
- ✅ 可維護性：減少重複程式碼，提高維護效率

### 🎯 達成目標

1. ✅ **降低文件複雜度**：將過於龐大的文件拆分為更小、更專注的模組
2. ✅ **減少耦合**：將緊密耦合的邏輯分離，提高可維護性
3. ✅ **提高可重用性**：提取共用邏輯到可重用的 hooks 和 utils
4. ✅ **保持功能完整性**：重構過程中不破壞現有功能

### 📝 後續建議

重構完成後，可以考慮以下優化（非必要，可選）：
- 統一錯誤處理機制
- 加強 TypeScript 類型定義
- 為提取的模組編寫單元測試
- 優化 WebSocket 事件處理效能

---

**文件維護者**：開發團隊  
**最後更新**：2025-01-XX（重構完成）

