# Phase 10 開發筆記 - 遊戲狀態分層與歷史保留

## 📋 基本資訊

- **規格文檔**：[SPEC-game-state-layers-2026-02-17.md](../specs/SPEC-game-state-layers-2026-02-17.md)
- **開始日期**：2026-02-17
- **預計工期**：2-3 週
- **當前狀態**：🔶 部分完成 (76%)

---

## 🎯 Phase 10 目標概述

### 核心目標
實作遊戲狀態分層系統，將「設定階段」（Baseline）與「遊戲進行中」（Runtime）的狀態分離，支援遊戲的啟動、進行、結束與歷史保留功能。

### 六大核心功能
1. **Game Code 系統**：為每場遊戲生成唯一識別碼
2. **狀態分層**：Baseline（設定）、Runtime（遊戲中）、Snapshot（歷史）
3. **遊戲生命週期管理**：開始 → 進行 → 結束
4. **多種訪問模式**：Game Code + PIN / 只有 PIN / 直接 URL
5. **操作日誌**：記錄所有遊戲中的變更
6. **唯一性檢查**：Game Code 全域唯一、PIN 同遊戲內唯一

---

## 🏗️ 技術架構摘要

### 資料層設計

```
Baseline Layer (設定階段)
├── games (Game collection)
└── characters (Character collection)

Runtime Layer (遊戲進行中)
├── game_runtime (type: 'runtime')
└── character_runtime (type: 'runtime')

Snapshot Layer (歷史保留)
├── game_runtime (type: 'snapshot')
└── character_runtime (type: 'snapshot')

Logs Layer (操作記錄)
└── logs (Log collection)
```

### 關鍵技術決策
1. **完全複製策略**：Runtime 完全複製 Baseline（簡化讀寫邏輯）
2. **共用 Collection**：Runtime 和 Snapshot 共用 collection，用 `type` 欄位區分
3. **手動回滾**：不使用 Transaction，改用手動回滾邏輯（降低部署複雜度）
4. **彈性 Logs**：`details` 使用 `Record<string, any>`（方便未來擴展）

---

## 📝 任務拆解與實作計劃

### Phase 10.1 - 資料模型層 (7 tasks)

#### ✅ 任務進度
- [x] 10.1.1 - 建立 GameRuntime Model ✅
- [x] 10.1.2 - 建立 CharacterRuntime Model ✅
- [x] 10.1.3 - 建立 Log Model ✅
- [x] 10.1.4 - 擴展 Game Model ✅
- [x] 10.1.5 - 擴展 Character Model ✅
- [x] 10.1.6 - 更新 models/index.ts ✅
- [x] 10.1.7 - 更新 TypeScript 類型定義 ✅

---

#### 🔧 10.1.1 建立 GameRuntime Model

**檔案**：`lib/db/models/GameRuntime.ts`

**實作步驟**：
1. 定義 `GameRuntimeDocument` 介面（繼承所有 GameDocument 欄位）
2. 新增 `refId`、`type`、`snapshotName`、`snapshotCreatedAt` 欄位
3. 定義 `GameRuntimeSchema`（複製 GameSchema 的欄位定義）
4. 建立索引：
   - `{ refId: 1, type: 1 }`
   - `{ gameCode: 1 }`
   - `{ type: 1, snapshotCreatedAt: -1 }`
5. 匯出 Model

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] Schema 欄位與 SPEC 一致
- [ ] 索引正確建立

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.1.2 建立 CharacterRuntime Model

**檔案**：`lib/db/models/CharacterRuntime.ts`

**實作步驟**：
1. 定義 `CharacterRuntimeDocument` 介面（繼承所有 CharacterDocument 欄位）
2. 新增 `refId`、`type`、`snapshotGameRuntimeId` 欄位
3. 定義 `CharacterRuntimeSchema`（複製 CharacterSchema 的完整欄位定義）
4. 建立索引：
   - `{ refId: 1, type: 1 }`
   - `{ gameId: 1, type: 1 }`
   - `{ gameId: 1, pin: 1 }`
5. 匯出 Model

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] Schema 欄位包含所有 Character 欄位（publicInfo, secretInfo, tasks, items, stats, skills, viewedItems, temporaryEffects）
- [ ] 索引正確建立

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.1.3 建立 Log Model

**檔案**：`lib/db/models/Log.ts`

**實作步驟**：
1. 定義 `LogDocument` 介面
   - `timestamp`, `gameId`, `characterId?`, `actorType`, `actorId`, `action`, `details`
2. 定義 `LogSchema`
   - `actorType` enum: `['gm', 'system', 'character']`
   - `details` 使用 `Schema.Types.Mixed`
3. 建立複合索引：
   - `{ gameId: 1, timestamp: -1 }`
   - `{ characterId: 1, timestamp: -1 }`
4. 匯出 Model

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] `details` 欄位支援任意結構
- [ ] 索引正確建立

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.1.4 擴展 Game Model

**檔案**：`lib/db/models/Game.ts`

**實作步驟**：
1. 在 `GameDocument` 介面中新增 `gameCode: string`
2. 在 `GameSchema` 中新增 `gameCode` 欄位定義：
   ```typescript
   gameCode: {
     type: String,
     required: true,
     unique: true,
     uppercase: true,
     trim: true,
     match: /^[A-Z0-9]{6}$/,
   }
   ```
3. 修改 `isActive` 預設值為 `false`
4. 建立唯一索引：`GameSchema.index({ gameCode: 1 }, { unique: true })`

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] `gameCode` 欄位支援 6 位英數字驗證
- [ ] 唯一索引正確建立

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.1.5 擴展 Character Model

**檔案**：`lib/db/models/Character.ts`

**實作步驟**：
1. 新增複合索引（在 Schema 定義之後）：
   ```typescript
   CharacterSchema.index(
     { gameId: 1, pin: 1 },
     {
       unique: true,
       sparse: true,
       partialFilterExpression: {
         pin: { $exists: true, $ne: null, $ne: '' }
       }
     }
   );
   ```

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 複合索引正確建立
- [ ] `sparse: true` 允許 pin 為 null 的角色存在

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.1.6 更新 models/index.ts

**檔案**：`lib/db/models/index.ts`

**實作步驟**：
1. 匯入並匯出 `GameRuntime`
2. 匯入並匯出 `CharacterRuntime`
3. 匯入並匯出 `Log`

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 其他檔案可正確引用新 Models

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.1.7 更新 TypeScript 類型定義

**檔案**：
- `types/game.ts`（擴展）
- `types/runtime.ts`（新增）
- `types/log.ts`（新增）

**實作步驟**：
1. **types/game.ts**：
   - 在現有類型中新增 `gameCode: string`
2. **types/runtime.ts**（新增）：
   - 定義 `GameRuntimeType`（包含 runtime 和 snapshot）
   - 定義 `CharacterRuntimeType`
3. **types/log.ts**（新增）：
   - 定義 `LogType`
   - 定義 `ActorType = 'gm' | 'system' | 'character'`
   - 定義常見 action 類型的 `details` 介面（可選，提供型別提示）

**驗收標準**：
- [x] TypeScript 編譯通過
- [x] 類型定義與 Schema 一致

**實作註記**：
- ✅ 已完成 `types/game.ts` 擴展（新增 `gameCode?: string`）
- ✅ 已建立 `types/runtime.ts`（定義 GameRuntimeData, CharacterRuntimeData）
- ✅ 已建立 `types/log.ts`（定義 LogData, ActorType, 詳細 Details 介面）
- ✅ 已更新 `types/index.ts`（匯出 runtime 和 log）

**⚠️ 技術決策**：
- **問題**：在 Phase 10.1.7 新增 `gameCode` 類型定義後，現有的 `app/actions/games.ts` 尚未實作此欄位，導致 TypeScript 編譯錯誤
- **決策**：將 `gameCode` 暫時標記為**可選欄位**（`gameCode?: string`），等到 Phase 10.2.2 實作 gameCode 生成邏輯後再改回必填
- **TODO 標記位置**：
  - `types/game.ts` 第 11 行（GameData 介面）
  - `types/game.ts` 第 47 行（Game 介面）
- **未來行動**：在 **Phase 10.2.2** 完成 `generateUniqueGameCode()` 和 `app/actions/games.ts` 修改後，記得將 `gameCode?: string` 改回 `gameCode: string`

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.2 - Game Code 系統 (4 tasks)

#### ✅ 任務進度
- [x] 10.2.1 - 建立 Game Code 生成邏輯 ✅
- [ ] 10.2.2 - 修改 games Server Actions
- [ ] 10.2.3 - 修改 GM 端遊戲建立頁面
- [ ] 10.2.4 - 修改 GM 端遊戲詳情頁面

---

#### 🔧 10.2.1 建立 Game Code 生成邏輯

**檔案**：`lib/game/generate-game-code.ts`

**實作步驟**：
1. 實作 `generateGameCode(): string`
   - 使用 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' 字符集
   - 隨機生成 6 位英數字
2. 實作 `isGameCodeUnique(gameCode: string): Promise<boolean>`
   - 查詢 `Game.findOne({ gameCode })`
   - 返回是否不存在
3. 實作 `generateUniqueGameCode(): Promise<string>`
   - 最多重試 10 次
   - 如果 10 次都重複，拋出錯誤

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 生成的 Game Code 符合 `/^[A-Z0-9]{6}$/` 格式
- [ ] 唯一性檢查正確運作

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.2.2 修改 games Server Actions

**檔案**：`app/actions/games.ts`

**實作步驟**：
1. 修改 `createGame()` Server Action：
   - 調用 `generateUniqueGameCode()` 生成 `gameCode`
   - 在建立 Game 時包含 `gameCode` 欄位
2. 新增 `updateGameCode(gameId: string, newGameCode: string)` Server Action：
   - 驗證 `newGameCode` 格式（`/^[A-Z0-9]{6}$/`）
   - 檢查唯一性（調用 `isGameCodeUnique()`）
   - 如果重複，返回錯誤：「此遊戲代碼已被使用」
   - 更新 Game

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 建立遊戲時自動生成唯一 Game Code
- [ ] `updateGameCode()` 正確驗證格式和唯一性

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.2.3 修改 GM 端遊戲建立頁面

**檔案**：`app/(gm)/games/new/page.tsx`

**實作步驟**：
1. 表單中顯示自動生成的 Game Code
2. 允許 GM 手動編輯 Game Code
3. 實作即時唯一性檢查（防抖 500ms）：
   - 輸入後顯示「檢查中...」
   - 如果重複，顯示錯誤提示
   - 如果唯一，顯示綠色勾勾
4. 提交表單時再次驗證（後端檢查）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] UI 顯示 Game Code 欄位
- [ ] 即時檢查正常運作（防抖、狀態提示）
- [ ] 提交時後端驗證正確

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.2.4 修改 GM 端遊戲詳情頁面

**檔案**：`app/(gm)/games/[gameId]/page.tsx`

**實作步驟**：
1. 在頁面顯著位置顯示 Game Code（大字體、高對比）
2. 提供「複製 Game Code」按鈕（點擊後複製到剪貼簿，顯示 Toast）
3. 提供「編輯 Game Code」功能：
   - 點擊後顯示編輯對話框
   - 即時檢查唯一性
   - 確認後調用 `updateGameCode()` Server Action

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] Game Code 顯著顯示
- [ ] 複製功能正常運作
- [ ] 編輯功能正常運作（即時檢查、更新）

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.9 - 唯一性檢查 (4 tasks)

**說明**：與 Phase 10.2 同步進行

#### ✅ 任務進度
- [x] 10.9.0 - 建立驗證基礎設施（框架 ✅，DB 實作待 Phase 11）
- [ ] 10.9.1 - 修改 games.ts 唯一性檢查（待 Phase 11）
- [ ] 10.9.2 - 修改 characters.ts 唯一性檢查（待 Phase 11）
- [ ] 10.9.3 - 前端表單即時驗證（待 Phase 11）

---

#### 🔧 10.9.0 建立驗證基礎設施

**實作狀態**：✅ 框架完成（TODO 標記 DB 邏輯）

**已完成**：
1. ✅ 建立 `types/validation.ts`
   - `UniquenessCheckResult` 介面
   - `GameCodeUniquenessParams` 介面
   - `PinUniquenessParams` 介面
   - `ValidationErrorType` 類型
   - `ValidationError` 介面

2. ✅ 建立 `lib/validation/uniqueness.ts`
   - `checkGameCodeUniqueness()` 函數框架
   - `checkPinUniqueness()` 函數框架
   - `validateGameCodeFormat()` 格式驗證（完整實作 ✅）
   - `validatePinFormat()` 格式驗證（完整實作 ✅）
   - 完整的 JSDoc 註解和使用範例
   - 清晰的 TODO Phase 11 標記

**Phase 11 待補充**：
- TODO: 實作 `checkGameCodeUniqueness()` 的 DB 查詢邏輯
- TODO: 實作 `checkPinUniqueness()` 的 DB 查詢邏輯

**驗收標準**：
- [x] TypeScript 編譯通過 ✅
- [ ] 實際唯一性檢查正常運作（待 Phase 11 DB 環境）

**暫停點**：✋ 框架完成，等待人類驗收

---

#### 🔧 10.9.1 修改 games.ts 唯一性檢查

**檔案**：`app/actions/games.ts`

**實作步驟**：
1. 在 `createGame()` 和 `updateGame()` 中檢查 `gameCode` 唯一性
2. 如果重複，返回：
   ```typescript
   {
     success: false,
     message: '此遊戲代碼已被使用，請選擇其他代碼'
   }
   ```

**驗收標準**：
- [ ] 重複時正確返回錯誤
- [ ] 前端顯示錯誤訊息

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.9.2 修改 characters.ts 唯一性檢查

**檔案**：`app/actions/characters.ts`

**實作步驟**：
1. 在 `createCharacter()` 和 `updateCharacter()` 中檢查 `{ gameId, pin }` 唯一性
2. 查詢 `Character.findOne({ gameId, pin, _id: { $ne: characterId } })`
3. 如果存在，返回：
   ```typescript
   {
     success: false,
     message: '此 PIN 在本遊戲中已被使用，請選擇其他 PIN'
   }
   ```

**驗收標準**：
- [ ] 同遊戲內 PIN 重複時返回錯誤
- [ ] 不同遊戲可以使用相同 PIN（不報錯）
- [ ] 編輯角色時，排除自己（`_id: { $ne: characterId }`）

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.9.3 前端表單即時驗證

**檔案**：
- `app/(gm)/games/new/page.tsx`（已在 10.2.3 完成）
- `app/(gm)/characters/new/page.tsx`
- `app/(gm)/characters/[characterId]/edit/page.tsx`

**實作步驟**：
1. GM 端角色表單：輸入 PIN 後即時檢查唯一性（防抖 500ms）
2. 顯示檢查狀態：「檢查中...」、「可用」、「已被使用」
3. 前端防止提交重複 PIN

**驗收標準**：
- [ ] 即時檢查正常運作
- [ ] 防抖正確（不過度查詢）
- [ ] 狀態提示清晰

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.3 - 遊戲狀態管理 (4 tasks)

#### ✅ 任務進度
- [x] 10.3.1 - 建立 start-game.ts ✅
- [x] 10.3.2 - 建立 end-game.ts ✅
- [x] 10.3.3 - 建立 game-lifecycle Server Actions ✅
- [ ] 10.3.4 - 修改 GM 端遊戲詳情頁面 UI

---

#### 🔧 10.3.1 建立 start-game.ts

**檔案**：`lib/game/start-game.ts`

**實作步驟**：
1. 實作 `startGame(gameId: string): Promise<Result>`
2. **步驟 1**：查詢 Baseline Game 和所有 Characters
   ```typescript
   const game = await Game.findById(gameId);
   const characters = await Character.find({ gameId });
   ```
3. **步驟 2**：檢查 `isActive` 狀態
   - 如果 `isActive = true` 且 Runtime 已存在，記錄警告（前端應已確認覆蓋）
4. **步驟 3**：複製 Baseline → Runtime
   - 建立 `GameRuntime`（使用 `findOneAndUpdate` + `upsert: true`）
   - 批次建立所有 `CharacterRuntime`（使用 `insertMany`）
   - **錯誤處理**：如果失敗，刪除已建立的 Runtime（手動回滾）
5. **步驟 4**：設定 `Game.isActive = true`
6. **步驟 5**：記錄 Log（action: 'game_start'）
7. **步驟 6**：推送 WebSocket 事件（暫時註解，Phase 10.7 實作）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 成功複製 Baseline → Runtime
- [ ] `Game.isActive` 正確設為 true
- [ ] 錯誤處理正確（失敗時回滾）

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.3.2 建立 end-game.ts

**檔案**：`lib/game/end-game.ts`

**實作步驟**：
1. 實作 `endGame(gameId: string, snapshotName?: string): Promise<Result>`
2. **步驟 1**：查詢 Runtime
   ```typescript
   const gameRuntime = await GameRuntime.findOne({ refId: gameId, type: 'runtime' });
   const characterRuntimes = await CharacterRuntime.find({ gameId, type: 'runtime' });
   ```
3. **步驟 2**：建立 Snapshot
   - 複製 `gameRuntime`，設定 `type = 'snapshot'`
   - 設定 `snapshotName`（使用參數或 timestamp）
   - 設定 `snapshotCreatedAt = new Date()`
   - 批次複製所有 `characterRuntimes`
4. **步驟 3**：刪除 Runtime
   ```typescript
   await GameRuntime.deleteOne({ _id: gameRuntime._id });
   await CharacterRuntime.deleteMany({ gameId, type: 'runtime' });
   ```
5. **步驟 4**：設定 `Game.isActive = false`
6. **步驟 5**：記錄 Log（action: 'game_end'）
7. **步驟 6**：推送 WebSocket 事件（暫時註解，Phase 10.7 實作）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 成功建立 Snapshot
- [ ] Runtime 正確刪除
- [ ] `Game.isActive` 正確設為 false

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.3.3 建立 game-lifecycle Server Actions

**檔案**：`app/actions/game-lifecycle.ts`

**實作步驟**：
1. 實作 `startGameAction(gameId: string)`：
   - 驗證 GM 權限（gameId 屬於當前 GM）
   - 調用 `startGame(gameId)`
   - 返回結果
2. 實作 `endGameAction(gameId: string, snapshotName?: string)`：
   - 驗證 GM 權限
   - 調用 `endGame(gameId, snapshotName)`
   - 返回結果

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 權限檢查正確
- [ ] 成功調用底層邏輯

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.3.4 修改 GM 端遊戲詳情頁面 UI

**檔案**：`app/(gm)/games/[gameId]/page.tsx`

**實作步驟**：
1. 顯示當前遊戲狀態（待機 / 進行中 / 已結束）：
   - 使用 Badge 組件，顏色區分（灰色 / 綠色 / 藍色）
2. **開始遊戲按鈕**：
   - 當 `isActive = false` 時顯示
   - 點擊前檢查是否有 Runtime，如有則顯示確認對話框：
     「現有進度將被覆蓋，是否繼續?」
   - 確認後調用 `startGameAction()`
   - 顯示 Loading 狀態（防止重複點擊）
3. **結束遊戲按鈕**：
   - 當 `isActive = true` 時顯示
   - 點擊後顯示確認對話框（可選輸入 Snapshot 名稱）
   - 確認後調用 `endGameAction()`
   - 顯示 Loading 狀態
4. 操作成功後：
   - 顯示 Toast 提示（「遊戲已開始」或「遊戲已結束」）
   - 執行 `router.refresh()` 重新載入頁面

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] UI 顯示正確（狀態 Badge、按鈕）
- [ ] 確認對話框正常運作
- [ ] Loading 狀態正確
- [ ] Toast 提示正常

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.6 - Logs 系統 (3 tasks)

**說明**：在 Phase 10.3 完成後立即實作

#### ✅ 任務進度
- [x] 10.6.1 - 建立 write-log.ts ✅
- [x] 10.6.2 - 整合 Logs 到變更操作 ✅
- [x] 10.6.3 - 建立 logs Server Actions ✅

---

#### 🔧 10.6.1 建立 write-log.ts

**檔案**：`lib/logs/write-log.ts`

**實作步驟**：
1. 實作 `writeLog(params)` 函數：
   ```typescript
   interface WriteLogParams {
     gameId: string;
     characterId?: string;
     actorType: 'gm' | 'system' | 'character';
     actorId: string;
     action: string;
     details: Record<string, any>;
   }

   export async function writeLog(params: WriteLogParams): Promise<void> {
     await Log.create({
       timestamp: new Date(),
       ...params,
     });
   }
   ```

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 成功寫入 Log

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.6.2 整合 Logs 到變更操作

**檔案**：
- `lib/game/start-game.ts`
- `lib/game/end-game.ts`
- `lib/item/item-effect-executor.ts`
- `lib/skill/skill-effect-executor.ts`
- `lib/contest/contest-effect-executor.ts`（或類似檔案）
- `app/actions/character-update.ts`

**實作步驟**：
1. **start-game.ts**：記錄 `game_start`
   ```typescript
   await writeLog({
     gameId: game._id.toString(),
     actorType: 'gm',
     actorId: gmUserId,
     action: 'game_start',
     details: {
       gameName: game.name,
       characterCount: characters.length,
     },
   });
   ```
2. **end-game.ts**：記錄 `game_end`
3. **item-effect-executor.ts**：記錄 `item_use` 和 `stat_change`
4. **skill-effect-executor.ts**：記錄 `skill_use`
5. **contest-effect-executor.ts**：記錄 `contest_result`
6. **character-update.ts**（GM 手動修改）：記錄 `gm_update`

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 每個操作正確記錄 Log
- [ ] `details` 欄位包含有用的資訊

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.6.3 建立 logs Server Actions

**檔案**：`app/actions/logs.ts`

**實作步驟**：
1. 實作 `getGameLogs(gameId: string, limit?: number)` Server Action：
   - 驗證 GM 權限
   - 查詢 `Log.find({ gameId }).sort({ timestamp: -1 }).limit(limit || 100)`
   - 返回日誌列表

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 正確查詢並返回日誌
- [ ] 權限檢查正確

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.4 - 讀寫邏輯重構 (5 tasks)

#### ✅ 任務進度
- [x] 10.4.1 - 建立 get-character-data.ts ✅
- [x] 10.4.2 - 建立 update-character-data.ts ✅
- [ ] 10.4.3 - 重構所有 Server Actions
- [x] 10.4.4 - 建立 get-character-by-game-code-pin.ts ✅
- [x] 10.4.5 - 建立 get-characters-by-pin.ts ✅

---

#### 🔧 10.4.1 建立 get-character-data.ts

**檔案**：`lib/game/get-character-data.ts`

**實作步驟**：
1. 實作 `getCharacterData(characterId: string): Promise<CharacterDocument | CharacterRuntimeDocument>`
2. **步驟 1**：查詢 Baseline Character，取得 `gameId`
3. **步驟 2**：查詢 Game，取得 `isActive`
4. **步驟 3**：
   - 如果 `isActive = true`，查詢 `CharacterRuntime.findOne({ refId: characterId, type: 'runtime' })`
   - 如果找到 Runtime，返回 Runtime
   - 如果找不到 Runtime（異常情況），返回 Baseline（並記錄警告）
5. **步驟 4**：
   - 如果 `isActive = false`，返回 Baseline Character

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 遊戲進行中返回 Runtime
- [ ] 遊戲未開始返回 Baseline

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.4.2 建立 update-character-data.ts

**檔案**：`lib/game/update-character-data.ts`

**實作步驟**：
1. 實作 `updateCharacterData(characterId: string, updates: any): Promise<void>`
2. **步驟 1**：查詢 Baseline Character，取得 `gameId`
3. **步驟 2**：查詢 Game，取得 `isActive`
4. **步驟 3**：
   - 如果 `isActive = true`，更新 `CharacterRuntime.findOneAndUpdate({ refId: characterId, type: 'runtime' }, updates)`
   - 如果 `isActive = false`，更新 `Character.findByIdAndUpdate(characterId, updates)`

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 遊戲進行中更新 Runtime
- [ ] 遊戲未開始更新 Baseline

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.4.3 重構所有 Server Actions

**檔案**：
- `app/actions/character-update.ts`
- `app/actions/item-use.ts`
- `app/actions/skill-use.ts`
- `app/actions/contest-*.ts`
- `app/actions/public.ts`

**實作步驟**：
1. 將所有直接查詢 `Character` 的地方改為調用 `getCharacterData()`
2. 將所有直接更新 `Character` 的地方改為調用 `updateCharacterData()`
3. **特別注意**：`getPublicCharacter()` Server Action 也需要使用 `getCharacterData()`

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 所有 Server Actions 正確使用新的讀寫邏輯
- [ ] 遊戲進行中的操作寫入 Runtime

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.4.4 建立 get-character-by-game-code-pin.ts

**檔案**：`lib/game/get-character-by-game-code-pin.ts`

**實作步驟**：
1. 實作 `getCharacterByGameCodeAndPin(gameCode: string, pin: string): Promise<Result>`
2. **步驟 1**：查詢 `Game.findOne({ gameCode })`
   - 如果不存在，返回錯誤：「遊戲代碼錯誤」
3. **步驟 2**：取得 `gameId` 和 `isActive`
4. **步驟 3**：
   - 如果 `isActive = true`，查詢 `CharacterRuntime.findOne({ gameId, pin, type: 'runtime' })`
   - 如果 `isActive = false`，查詢 `Character.findOne({ gameId, pin })`
5. **步驟 4**：
   - 如果角色不存在，返回錯誤：「PIN 錯誤」
   - 如果角色存在，返回角色資料（包含 characterId）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 正確查詢角色（根據遊戲狀態）
- [ ] 錯誤處理正確

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.4.5 建立 get-characters-by-pin.ts

**檔案**：`lib/game/get-characters-by-pin.ts`

**實作步驟**：
1. 實作 `getCharactersByPinOnly(pin: string): Promise<Result>`
2. **步驟 1**：查詢 `Character.find({ pin })`（只查詢 Baseline）
3. **步驟 2**：對每個角色，查詢所屬的 Game：
   ```typescript
   const results = await Promise.all(
     characters.map(async (char) => {
       const game = await Game.findById(char.gameId);
       return {
         characterId: char._id.toString(),
         characterName: char.name,
         gameId: char.gameId.toString(),
         gameName: game?.name || 'Unknown',
         gameCode: game?.gameCode || '',
       };
     })
   );
   ```
4. 返回角色列表

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 正確返回所有匹配的角色
- [ ] 包含 gameCode 和 gameName

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.5 - 玩家端訪問 (4 tasks)

#### ✅ 任務進度
- [x] 10.5.1 - 建立 unlock Server Actions ✅
- [x] 10.5.2 - 建立 /unlock 頁面 ✅
- [x] 10.5.3 - 修改 /c/[characterId]/page.tsx ✅
- [x] 10.5.4 - 修改 character-card-view 組件 ✅

---

#### 🔧 10.5.1 建立 unlock Server Actions

**檔案**：`app/actions/unlock.ts`

**實作步驟**：
1. 實作 `unlockByGameCodeAndPin(gameCode: string, pin: string)` Server Action：
   - 調用 `getCharacterByGameCodeAndPin(gameCode, pin)`
   - 返回角色資料（包含 characterId, characterName, gameId, gameName, isActive）
2. 實作 `unlockByPinOnly(pin: string)` Server Action：
   - 調用 `getCharactersByPinOnly(pin)`
   - 返回角色列表

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 正確返回角色資料

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.5.2 建立 /unlock 頁面

**檔案**：`app/unlock/page.tsx`

**實作步驟**：
1. **UI 設計**：
   - 標題：「角色解鎖」
   - 輸入方式 1：合併輸入（單一欄位，支援 `ABC123-1234` 或 `ABC1231234`）
   - 輸入方式 2：分開輸入（Game Code + PIN 兩個欄位）
   - 輸入方式 3：只輸入 PIN（顯示「或只輸入 PIN 預覽角色」）
2. **邏輯處理**：
   - 解析輸入（判斷是 Game Code + PIN 或只有 PIN）
   - 如果有 Game Code，調用 `unlockByGameCodeAndPin()`：
     - 成功：導航到 `/c/[characterId]`
     - 失敗：顯示錯誤提示
   - 如果只有 PIN，調用 `unlockByPinOnly()`：
     - 0 個：顯示「PIN 不存在」
     - 1 個：導航到 `/c/[characterId]?readonly=true`
     - 多個：顯示遊戲列表（Game Code、遊戲名稱、角色名稱），讓玩家選擇
3. **選擇遊戲後**：
   - 自動填入選中的 Game Code
   - 重新調用 `unlockByGameCodeAndPin()`

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] UI 清晰易用
- [ ] 三種輸入方式都正常運作
- [ ] 錯誤提示友善

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.5.3 修改 /c/[characterId]/page.tsx

**檔案**：`app/c/[characterId]/page.tsx`

**實作步驟**：
1. 檢查 URL 參數 `?readonly=true`
2. 如果為 true：
   - 設定 `isReadOnly = true`
   - 顯示「預覽模式」提示（黃色 Banner）
   - 傳遞 `isReadOnly` prop 給 `CharacterCardView`
3. 如果為 false：
   - 正常顯示（完整互動）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 正確解析 URL 參數
- [ ] 預覽模式提示顯示正確

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.5.4 修改 character-card-view 組件

**檔案**：`components/player/character-card-view.tsx`

**實作步驟**：
1. 接收 `isReadOnly?: boolean` prop
2. 如果 `isReadOnly = true`：
   - 禁用所有互動按鈕（使用道具、技能、對抗檢定）
   - 按鈕顯示為 disabled 狀態（灰色）
   - Hover 時顯示 Tooltip：「預覽模式無法互動，請輸入 Game Code」
   - 隱藏未揭露的秘密（`secretInfo.isRevealed = false` 的項目）
3. 如果 `isReadOnly = false` 或 undefined：
   - 正常顯示（完整互動）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 唯讀模式正確禁用互動
- [ ] Tooltip 顯示正確
- [ ] 未揭露秘密正確隱藏

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.7 - WebSocket 事件 (5 tasks)

#### ✅ 任務進度
- [x] 10.7.1 - 擴展 types/event.ts ✅
- [x] 10.7.2 - 修改 start-game.ts 推送事件 ✅
- [x] 10.7.3 - 修改 end-game.ts 推送事件 ✅
- [x] 10.7.4 - 建立 push-event-to-game.ts ✅
- [x] 10.7.5 - 修改前端 WebSocket 處理邏輯 ✅

---

#### 🔧 10.7.1 擴展 types/event.ts

**檔案**：`types/event.ts`

**實作步驟**：
1. 新增 `game.started` 事件類型：
   ```typescript
   export interface GameStartedEvent extends BaseEvent {
     type: 'game.started';
     payload: {
       gameId: string;
       gameCode: string;
       gameName: string;
     };
   }
   ```
2. 新增 `game.ended` 事件類型：
   ```typescript
   export interface GameEndedEvent extends BaseEvent {
     type: 'game.ended';
     payload: {
       gameId: string;
       gameCode: string;
       gameName: string;
       snapshotId?: string;
     };
   }
   ```
3. 更新 `Event` 聯合類型（加入新事件）

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 事件類型正確定義

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.7.2 修改 start-game.ts 推送事件

**檔案**：`lib/game/start-game.ts`

**實作步驟**：
1. 在遊戲開始成功後，推送 `game.started` 事件：
   ```typescript
   await pushEventToGame(gameId, {
     type: 'game.started',
     timestamp: Date.now(),
     payload: {
       gameId: game._id.toString(),
       gameCode: game.gameCode,
       gameName: game.name,
     },
   });
   ```

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 事件正確推送

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.7.3 修改 end-game.ts 推送事件

**檔案**：`lib/game/end-game.ts`

**實作步驟**：
1. 在遊戲結束成功後，推送 `game.ended` 事件：
   ```typescript
   await pushEventToGame(gameId, {
     type: 'game.ended',
     timestamp: Date.now(),
     payload: {
       gameId: game._id.toString(),
       gameCode: game.gameCode,
       gameName: game.name,
       snapshotId: snapshot._id.toString(),
     },
   });
   ```

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 事件正確推送

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.7.4 建立 push-event-to-game.ts

**檔案**：`lib/websocket/push-event-to-game.ts`

**實作步驟**：
1. 實作 `pushEventToGame(gameId: string, event: BaseEvent): Promise<void>`
2. **步驟 1**：查詢所有屬於該遊戲的角色（Baseline）
   ```typescript
   const characters = await Character.find({ gameId });
   ```
3. **步驟 2**：逐一推送事件
   ```typescript
   await Promise.all(
     characters.map((char) =>
       pushEventToCharacter(char._id.toString(), event)
     )
   );
   ```
4. **步驟 3**：同時寫入 Pending Events（Phase 9 整合）
   ```typescript
   await Promise.all(
     characters.map((char) =>
       createPendingEvent({
         characterId: char._id.toString(),
         event,
       })
     )
   );
   ```

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 事件正確推送到所有玩家
- [ ] Pending Events 正確寫入

**暫停點**：✋ 完成後暫停，等待人類驗收

---

#### 🔧 10.7.5 修改前端 WebSocket 處理邏輯

**檔案**：`hooks/use-character-websocket-handler.ts`

**實作步驟**：
1. 新增 `game.started` 處理：
   ```typescript
   case 'game.started':
     toast({
       title: '遊戲已開始',
       description: '正在重新載入...',
     });
     router.refresh();
     break;
   ```
2. 新增 `game.ended` 處理：
   ```typescript
   case 'game.ended':
     toast({
       title: '遊戲已結束',
       description: '感謝參與！',
     });
     router.refresh();
     break;
   ```

**驗收標準**：
- [ ] TypeScript 編譯通過
- [ ] 收到事件時正確顯示 Toast
- [ ] 頁面自動重新載入

**暫停點**：✋ 完成後暫停，等待人類驗收

---

### Phase 10.8 - 資料遷移 (2 tasks)

**說明**：最後執行

#### ✅ 任務進度
- [x] 10.8.1 - 建立遷移腳本（框架 ✅，DB 實作待 Phase 11）
- [ ] 10.8.2 - 執行遷移腳本（待 Phase 11）

---

#### 🔧 10.8.1 建立遷移腳本

**檔案**：`scripts/migrate-phase10.ts`

**實作狀態**：✅ 框架完成（TODO 標記 DB 邏輯）

**已完成**：
1. ✅ 建立腳本檔案結構
2. ✅ 定義 `MigrationStats` 和 `PinConflict` 介面
3. ✅ 實作 5 步驟框架（連接 DB → 查詢遊戲 → 生成 Game Code → 檢查 PIN 衝突 → 輸出報告）
4. ✅ 在 package.json 新增 `migrate:phase10` 命令
5. ✅ 加入清晰的 TODO Phase 11 標記（標註所有需要 DB 的地方）
6. ✅ 提供完整的錯誤處理和日誌輸出

**Phase 11 待補充**：
- TODO: 實作 DB 連接邏輯（`dbConnect()`）
- TODO: 實作遊戲查詢邏輯（`Game.find()`）
- TODO: 實作 Game Code 生成邏輯（`generateUniqueGameCode()`）
- TODO: 實作 PIN 衝突檢測邏輯（`Character.aggregate()`）

**驗收標準**：
- [x] TypeScript 編譯通過 ✅
- [ ] 所有遊戲成功生成 Game Code（待 Phase 11 DB 環境）
- [ ] 衝突正確記錄（待 Phase 11 DB 環境）

**暫停點**：✋ 框架完成，等待人類驗收

---

#### 🔧 10.8.2 執行遷移腳本

**實作步驟**：
1. 執行 `npm run migrate:phase10`（需先在 package.json 中新增 script）
2. 檢查 `migration-conflicts.json`
3. 如果有衝突，提示 GM 手動解決（編輯角色 PIN）
4. 確認所有遊戲都有 `gameCode`

**驗收標準**：
- [ ] 遷移成功執行
- [ ] 所有遊戲都有唯一 Game Code
- [ ] PIN 衝突（如有）已記錄

**暫停點**：✋ 完成後暫停，等待人類驗收

---

## 🧪 測試計劃

### Phase 10.1 - 資料模型層測試
- [ ] 測試 GameRuntime 和 CharacterRuntime 建立
- [ ] 測試 Log 寫入
- [ ] 測試 Game Code 唯一性約束
- [ ] 測試 PIN 複合唯一性約束

### Phase 10.2 & 10.9 - Game Code 與唯一性測試
- [ ] 測試 Game Code 生成（唯一性、格式）
- [ ] 測試 Game Code 更新（唯一性檢查）
- [ ] 測試 PIN 唯一性檢查（同遊戲內、不同遊戲）
- [ ] 測試前端即時驗證（防抖、狀態提示）

### Phase 10.3 & 10.6 - 遊戲生命週期測試
- [ ] 測試開始遊戲（Baseline → Runtime 複製）
- [ ] 測試結束遊戲（Snapshot 建立、Runtime 刪除）
- [ ] 測試錯誤處理（複製失敗回滾）
- [ ] 測試 Logs 記錄（game_start、game_end）

### Phase 10.4 - 讀寫邏輯測試
- [ ] 測試 `getCharacterData()`（遊戲進行中 / 未開始）
- [ ] 測試 `updateCharacterData()`（Runtime / Baseline）
- [ ] 測試所有 Server Actions 重構後正常運作
- [ ] 測試 Game Code + PIN 查詢
- [ ] 測試只有 PIN 查詢

### Phase 10.5 - 玩家端訪問測試
- [ ] 測試 `/unlock` 頁面（三種輸入方式）
- [ ] 測試 Game Code + PIN 解鎖（正確 / 錯誤）
- [ ] 測試只有 PIN 解鎖（0 個 / 1 個 / 多個）
- [ ] 測試唯讀模式（禁用互動、隱藏秘密）

### Phase 10.7 - WebSocket 事件測試
- [ ] 測試 `game.started` 事件推送
- [ ] 測試 `game.ended` 事件推送
- [ ] 測試前端收到事件後的處理（Toast、refresh）
- [ ] 測試 Pending Events 整合

### Phase 10.8 - 資料遷移測試
- [ ] 測試遷移腳本執行
- [ ] 測試 Game Code 生成（現有遊戲）
- [ ] 測試 PIN 衝突檢測

---

## 🚨 技術難點與解決方案

### 難點 1：複製大量角色可能耗時較長
**解決方案**：
- 前端顯示 Loading 動畫和進度提示
- 批次處理（每次複製 10 個角色）
- 考慮使用背景 Job（Phase 11 優化）

### 難點 2：複製失敗時的回滾
**解決方案**：
- 記錄已建立的 Runtime IDs
- 如果失敗，逐一刪除已建立的 Runtime
- 提示 GM 重試

### 難點 3：WebSocket 事件遺漏
**解決方案**：
- 整合 Phase 9 的 Pending Events 系統
- 同時寫入 WebSocket 和 Pending Events
- 玩家重新上線後自動處理

### 難點 4：Runtime 與 Baseline 不一致
**解決方案**：
- GM 端顯示提示：「修改 Baseline 不影響當前遊戲」
- （可選）提供「同步 Baseline → Runtime」功能（Phase 11）

---

## 📚 參考資料

- **規格文檔**：[SPEC-game-state-layers-2026-02-17.md](../specs/SPEC-game-state-layers-2026-02-17.md)
- **專案架構**：[01_PROJECT_STRUCTURE.md](../specs/01_PROJECT_STRUCTURE.md)
- **WebSocket 事件**：[04_WEBSOCKET_EVENTS.md](../specs/04_WEBSOCKET_EVENTS.md)
- **Phase 8 時效性效果**：整合 Cron Job 檢查 `isActive`
- **Phase 9 離線事件佇列**：整合 Pending Events

---

## 📊 進度總覽

### 完成度統計
- **Phase 10.1**：7/7 tasks (100%)
- **Phase 10.2**：1/4 tasks (25%)
- **Phase 10.9**：1/4 tasks (25%)
- **Phase 10.3**：3/4 tasks (75%)
- **Phase 10.6**：3/3 tasks (100%)
- **Phase 10.4**：4/5 tasks (80%)
- **Phase 10.5**：4/4 tasks (100%)
- **Phase 10.7**：5/5 tasks (100%)
- **Phase 10.8**：1/2 tasks (50%)

**總計**：29/38 tasks (76%)

---

## 🎯 下一步行動

1. ✅ **確認開發筆記完整性**（等待人類驗收）
2. ⏭️ **開始 Phase 10.1.1**：建立 GameRuntime Model
3. 📝 **更新進度**：每完成一個任務，更新此文件的 checkbox

---

**文件結束** - 最後更新：2026-02-17
