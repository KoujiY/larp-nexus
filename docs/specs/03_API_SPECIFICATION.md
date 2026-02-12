# API 規格文件

## 版本：v1.6
## 更新日期：2026-02-09（Phase 7.7 自動揭露條件 + 道具展示）

---

## 1. API 架構總覽

本專案採用以下兩種 API 實作方式：

1. **Server Actions**：用於 GM 端的 CRUD 操作（劇本、角色管理）
2. **API Routes**：用於公開 API、WebSocket 認證、圖片上傳

### 1.1 架構選擇原則

| 功能 | 實作方式 | 原因 |
|------|----------|------|
| GM 劇本管理 | Server Actions | 與 Next.js 表單整合更佳 |
| GM 角色管理 | Server Actions | 簡化狀態管理 |
| 玩家端查詢 | API Routes | 需公開 URL，便於外部存取 |
| PIN 解鎖 | API Routes | 獨立驗證邏輯 |
| 圖片上傳 | API Routes | 需處理 multipart/form-data |
| 事件推送 | API Routes | 與 WebSocket 整合 |
| Webhook | API Routes | 第三方服務回呼 |

---

## 2. Server Actions 規格

### 2.1 認證相關 (app/actions/auth.ts)

#### `sendMagicLink(email: string)`

發送 Magic Link 到 GM Email。

**參數**
```typescript
{
  email: string;  // GM Email
}
```

**回傳**
```typescript
{
  success: boolean;
  message?: string;
}
```

**錯誤碼**
- `INVALID_EMAIL`：Email 格式錯誤
- `SEND_FAILED`：郵件發送失敗

**實作邏輯**
1. 驗證 Email 格式
2. 檢查或建立 GMUser
3. 生成 UUID token
4. 儲存至 `magic_links` collection（15分鐘過期）
5. 發送 Email（使用 Resend 或 Nodemailer）
6. 回傳成功訊息

---

#### `verifyMagicLink(token: string)`

驗證 Magic Link Token 並建立 Session。

**參數**
```typescript
{
  token: string;  // Magic Link Token (UUID)
}
```

**回傳**
```typescript
{
  success: boolean;
  gmId?: string;
  message?: string;
}
```

**錯誤碼**
- `INVALID_TOKEN`：Token 無效
- `EXPIRED_TOKEN`：Token 已過期
- `USED_TOKEN`：Token 已使用

**實作邏輯**
1. 查詢 `magic_links` by token
2. 驗證 `expiresAt` 與 `used` 狀態
3. 標記 token 為已使用
4. 建立 Session（使用 iron-session 或 JWT）
5. 回傳 GM 資訊

---

#### `logout()`

登出並清除 Session。

**回傳**
```typescript
{
  success: boolean;
}
```

---

### 2.2 劇本管理 (app/actions/games.ts)

#### `createGame(data: CreateGameInput)`

建立新劇本。

**參數**
```typescript
interface CreateGameInput {
  title: string;
  description?: string;
  coverImage?: string;  // Blob URL
  publicInfo: {
    intro: string;
    worldSetting: string;
    chapters: Array<{
      title: string;
      content: string;
      order: number;
    }>;
  };
}
```

**回傳**
```typescript
{
  success: boolean;
  gameId?: string;
  message?: string;
}
```

**認證需求**：需 GM Session

---

#### `updateGame(gameId: string, data: UpdateGameInput)`

更新劇本。

**參數**
```typescript
interface UpdateGameInput {
  title?: string;
  description?: string;
  coverImage?: string;
  publicInfo?: {
    intro?: string;
    worldSetting?: string;
    chapters?: Array<{
      title: string;
      content: string;
      order: number;
    }>;
  };
  status?: 'draft' | 'active' | 'completed';
}
```

**回傳**
```typescript
{
  success: boolean;
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證（僅劇本擁有者）

---

#### `deleteGame(gameId: string)`

刪除劇本（軟刪除或硬刪除）。

**參數**
```typescript
{
  gameId: string;
}
```

**回傳**
```typescript
{
  success: boolean;
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證

**注意**：刪除劇本時，需同時刪除相關角色卡

---

#### `getGames()`

取得目前 GM 的所有劇本。

**回傳**
```typescript
{
  success: boolean;
  games: Array<{
    _id: string;
    title: string;
    description: string;
    coverImage?: string;
    status: string;
    characterCount: number;  // 計算該劇本的角色數
    createdAt: string;
    updatedAt: string;
  }>;
}
```

**認證需求**：需 GM Session

---

### 2.3 角色管理 (app/actions/characters.ts)

#### `createCharacter(gameId: string, data: CreateCharacterInput)`

建立新角色卡。

**參數**
```typescript
interface CreateCharacterInput {
  name: string;
  avatar?: string;  // Blob URL
  hasPinLock: boolean;
  pin?: string;  // PIN 碼（4-6 位數字，明文儲存）
  publicInfo: {
    background: string;
    personality: string;
    relationships: Array<{
      targetName: string;
      description: string;
    }>;
  };
  secretInfo?: {
    secrets?: Array<{
      id: string;
      title: string;
      content: string;
      isRevealed: boolean;
      revealCondition: string;
      revealedAt?: Date;
    }>;
  };
}
```

**回傳**
```typescript
{
  success: boolean;
  characterId?: string;
  wsChannelId?: string;
  characterUrl?: string;  // 玩家端 URL
  qrCodeUrl?: string;     // QR Code URL
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證

**實作邏輯**
1. 驗證 gameId 存在且屬於當前 GM
2. 若 `hasPinLock=true`，直接儲存 PIN 明文（僅 GM 可查看）
3. 生成 `wsChannelId`
4. 儲存角色資料
5. 生成玩家端 URL 與 QR Code
6. 回傳角色資訊

---

#### `getCharacterPin(characterId: string)`

取得角色的 PIN 碼（僅限 GM）。

**參數**
```typescript
{
  characterId: string;
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    pin: string;  // 角色的 PIN 碼（明文）
  };
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證

**錯誤碼**
- `UNAUTHORIZED`：未登入或無權限
- `NOT_FOUND`：角色不存在
- `FETCH_FAILED`：查詢失敗

**實作邏輯**
1. 驗證 GM Session
2. 查詢角色資料
3. 驗證角色所屬劇本的擁有權
4. 回傳 PIN（若未設定則回傳空字串）

**注意**：此 API 僅限 GM 使用，玩家端 API 不會回傳 PIN 欄位。

---

#### `updateCharacter(characterId: string, data: UpdateCharacterInput)`

更新角色卡。

**參數**
```typescript
interface UpdateCharacterInput {
  name?: string;
  avatar?: string;
  hasPinLock?: boolean;
  pin?: string;  // 若要更新 PIN（4-6 位數字，明文儲存）
  publicInfo?: {
    background?: string;
    personality?: string;
    relationships?: Array<{
      targetName: string;
      description: string;
    }>;
  };
  secretInfo?: {
    secrets?: Array<{
      id: string;                   // 唯一識別碼
      title: string;
      content: string;
      isRevealed: boolean;          // 是否已揭露（由 GM 控制）
      revealCondition: string;       // 揭露條件描述（僅供 GM 參考）
      revealedAt?: Date;            // 揭露時間（當 isRevealed 從 false 變為 true 時自動設定）
    }>;
  };
  tasks?: Array<...>;
  items?: Array<...>;
}
```

**實作邏輯**
1. 驗證角色存在且屬於當前 GM
2. 更新角色資料
3. 處理 `secretInfo.secrets` 更新：
   - 如果 `isRevealed` 從 `false` 變為 `true`，自動設定 `revealedAt` 為當前時間
   - 保留現有 `revealedAt` 如果已存在
4. 回傳更新後的角色資料

**回傳**
```typescript
{
  success: boolean;
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證

---

#### `deleteCharacter(characterId: string)`

刪除角色卡。

**參數**
```typescript
{
  characterId: string;
}
```

**回傳**
```typescript
{
  success: boolean;
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證

---

#### `addTask(characterId: string, task: TaskInput)`

新增任務到角色卡。

**參數**
```typescript
interface TaskInput {
  title: string;
  description: string;
}
```

**回傳**
```typescript
{
  success: boolean;
  taskId?: string;
}
```

**實作邏輯**
1. 新增任務到 `characters.tasks` 陣列
2. 推送 WebSocket 事件通知玩家

---

#### `addItem(characterId: string, item: ItemInput)`

新增道具到角色卡。

**參數**
```typescript
interface ItemInput {
  name: string;
  description: string;
  imageUrl?: string;
}
```

**回傳**
```typescript
{
  success: boolean;
  itemId?: string;
}
```

---

#### `useSkill(characterId: string, skillId: string, checkResult?: number, targetCharacterId?: string, targetItemId?: string)` ✅ Phase 5 / ✅ Phase 6.5 / ✅ Phase 7 / ✅ Phase 7.6 / ✅ Phase 8

使用技能（包含檢定流程、冷卻檢查、使用次數限制、效果執行）。

**Phase 6.5 擴展**：支援跨角色效果（方案 A）
**Phase 7 擴展**：支援道具移除和偷竊效果
**Phase 7.6 擴展**：標籤系統、隨機對抗檢定
**Phase 8 擴展**：時效性效果

**參數**
```typescript
{
  characterId: string;       // 角色 ID
  skillId: string;           // 技能 ID
  checkResult?: number;      // 檢定結果（random 類型時由前端傳入）
  targetCharacterId?: string; // 目標角色 ID（Phase 6.5，requiresTarget = true 時必填）
  targetItemId?: string;      // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    skillUsed: boolean;
    checkPassed?: boolean;      // 檢定是否通過
    checkResult?: number;        // 檢定結果
    effectsApplied?: string[];  // 已執行的效果描述列表
    targetCharacterName?: string; // 🆕 目標角色名稱（Phase 6.5）
    // Phase 7: 對抗檢定相關欄位
    contestId?: string;         // 對抗請求 ID（對抗檢定時）
    attackerValue?: number;     // 攻擊方數值（對抗檢定時）
    defenderValue?: number;     // 防守方數值（對抗檢定時）
    preliminaryResult?: 'attacker_wins' | 'defender_wins' | 'both_fail'; // 初步結果（對抗檢定時）
  };
  message?: string;
}
```

**錯誤碼**
- `NOT_FOUND`：角色或技能不存在
- `USAGE_LIMIT_REACHED`：已達使用次數上限
- `ON_COOLDOWN`：技能冷卻中
- `CHECK_RESULT_REQUIRED`：需要檢定結果（random 類型）
- `INVALID_CHECK_RESULT`：檢定結果不在有效範圍內
- `TARGET_REQUIRED`：需要選擇目標角色（Phase 6.5）
- `TARGET_ITEM_REQUIRED`：Phase 7: 需要選擇目標道具（item_take 和 item_steal 效果）
- `TARGET_ITEM_NOT_FOUND`：Phase 7: 目標角色沒有此道具
- `INVALID_TARGET`：目標角色不在同一劇本內或不符合目標類型設定（Phase 6.5）
- `INVALID_CHECK`：檢定設定不完整
- `USE_FAILED`：技能使用失敗

**實作邏輯**
1. 驗證角色與技能存在
2. **Phase 7.6**：驗證技能是否具有 "戰鬥"（`combat`）標籤（對抗檢定時）
3. 檢查使用次數限制
4. 檢查冷卻時間
5. 執行檢定：
   - `none`：無檢定，直接通過
   - `random`：使用前端傳入的 `checkResult`，與 `randomConfig.threshold` 比較
   - `contest`：Phase 7: 對抗檢定流程 - ✅ 已實作
   - `random_contest`：Phase 7.6: 隨機對抗檢定流程 - ✅ 已實作
6. 若檢定通過，執行技能效果：
   - `stat_change`：修改目標角色的數值（目前值或最大值）- ✅ 已實作
   - `task_reveal`：揭露隱藏任務 - ✅ 已實作
   - `task_complete`：完成任務 - ✅ 已實作
   - `custom`：自訂效果描述 - ✅ 已實作
   - `item_take`：Phase 7: 從目標角色移除道具 - ✅ 已實作
   - `item_steal`：Phase 7: 從目標角色偷竊道具（轉移到施放者身上）- ✅ 已實作
   - `item_give`：給予目標角色道具（未實作）
7. 更新技能使用時間與次數
8. 回傳結果

**Phase 7 實作細節**：
- `item_take` 和 `item_steal` 效果需要：
  1. 選擇目標角色（`targetCharacterId` 必填）
  2. 確認目標角色（前端 UI 流程）
  3. 選擇目標道具（`targetItemId` 必填）
- 檢定成功後才會執行效果
- `item_steal` 會將道具轉移到施放者身上，`item_take` 只移除道具

**Phase 7.6 標籤系統實作細節**：
- **標籤要求**：對抗檢定（`contest` 或 `random_contest`）時，攻擊方使用的技能/道具必須具有 "戰鬥"（`combat`）標籤
- **標籤格式**：`tags` 為字串陣列，支援多標籤（如：`['combat', 'stealth']`）
- **支援標籤**：
  - `combat`：戰鬥標籤，用於對抗檢定
  - `stealth`：隱匿標籤，影響通知訊息顯示（見 WebSocket 事件規格）

**Phase 7.6 隨機對抗檢定實作細節**：
- **檢定類型**：`checkType === 'random_contest'`
- **上限值來源**：使用劇本共通的 `Game.randomContestMaxValue`（預設 100）
- **檢定流程**：
  1. 攻擊方使用隨機對抗技能/道具並選擇目標
  2. **攻擊方隨機數決定**：在選擇目標後、等待防守方回應時，攻擊方的隨機數立即決定（儲存在對抗檢定追蹤系統中）
  3. 防守方收到對抗請求事件，可選擇是否使用技能或道具
  4. **防守方隨機數決定**：防守方按下確認按鈕時，防守方的隨機數才決定
  5. 比較雙方數值，較大者獲勝
  6. 若平手，根據 `contestConfig.tieResolution` 決定結果
  7. 執行對應效果並發送結果通知
- **數值匹配規則**：防守方只能使用相同檢定類型（`random_contest`）的技能/道具回應

**Phase 8 時效性效果實作細節**：
- **效果設定**：若技能效果的 `duration` 欄位 > 0，則為時效性效果
- **效果應用**：
  1. 執行 `stat_change` 效果時，若 `duration > 0`，建立時效性效果記錄
  2. 記錄儲存在目標角色的 `temporaryEffects` 陣列中
  3. 記錄包含：效果 ID、來源資訊、變化量、應用時間、過期時間
- **效果堆疊**：允許同一數值被多個時效性效果影響，每個效果獨立追蹤
- **自動恢復**：由後端定時檢查過期效果（建議每分鐘），自動恢復數值並推送通知

---

#### `useItem(characterId: string, itemId: string, targetCharacterId?: string, checkResult?: number, targetItemId?: string)` ✅ Phase 7 / ✅ Phase 7.6 / ✅ Phase 8

使用道具（包含檢定流程、冷卻檢查、使用次數限制、效果執行）。

**Phase 7 擴展**：支援對抗檢定、道具移除和偷竊效果
**Phase 7.6 擴展**：標籤系統、隨機對抗檢定
**Phase 8 擴展**：時效性效果

**參數**
```typescript
{
  characterId: string;       // 角色 ID
  itemId: string;           // 道具 ID
  targetCharacterId?: string; // 目標角色 ID（requiresTarget = true 時必填）
  checkResult?: number;      // 檢定結果（random 類型時由前端傳入）
  targetItemId?: string;     // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    itemUsed: boolean;
    checkPassed?: boolean;      // 檢定是否通過
    checkResult?: number;       // 檢定結果
    effectApplied?: string;     // 已執行的效果描述
    targetCharacterName?: string; // 目標角色名稱
    // Phase 7: 對抗檢定相關欄位
    contestId?: string;         // 對抗請求 ID（對抗檢定時）
    attackerValue?: number;     // 攻擊方數值（對抗檢定時）
    defenderValue?: number;     // 防守方數值（對抗檢定時）
    preliminaryResult?: 'attacker_wins' | 'defender_wins' | 'both_fail'; // 初步結果（對抗檢定時）
  };
  message?: string;
}
```

**錯誤碼**
- `NOT_FOUND`：角色或道具不存在
- `USAGE_LIMIT_REACHED`：已達使用次數上限
- `ON_COOLDOWN`：道具冷卻中
- `QUANTITY_INSUFFICIENT`：道具數量不足（消耗品）
- `CHECK_RESULT_REQUIRED`：需要檢定結果（random 類型）
- `INVALID_CHECK_RESULT`：檢定結果不在有效範圍內
- `TARGET_REQUIRED`：需要選擇目標角色
- `TARGET_ITEM_REQUIRED`：Phase 7: 需要選擇目標道具（item_take 和 item_steal 效果）
- `TARGET_ITEM_NOT_FOUND`：Phase 7: 目標角色沒有此道具
- `INVALID_TARGET`：目標角色不在同一劇本內或不符合目標類型設定
- `INVALID_CHECK`：檢定設定不完整
- `USE_FAILED`：道具使用失敗

**實作邏輯**
1. 驗證角色與道具存在
2. **Phase 7.6**：驗證道具是否具有 "戰鬥"（`combat`）標籤（對抗檢定時）
3. 檢查使用次數限制
4. 檢查冷卻時間
5. 檢查道具數量（消耗品需 quantity > 0）
6. 執行檢定：
   - `none`：無檢定，直接通過
   - `random`：使用前端傳入的 `checkResult`，與 `randomConfig.threshold` 比較
   - `contest`：Phase 7: 對抗檢定流程
   - `random_contest`：Phase 7.6: 隨機對抗檢定流程
7. 若檢定通過，執行道具效果（同技能效果）
8. 更新道具使用時間與次數
9. 若為消耗品且數量為 0，移除道具
10. 回傳結果

**Phase 7.6 標籤系統實作細節**：
- **標籤要求**：對抗檢定（`contest` 或 `random_contest`）時，攻擊方使用的道具必須具有 "戰鬥"（`combat`）標籤
- **標籤格式**：`tags` 為字串陣列，支援多標籤
- **支援標籤**：同技能系統（`combat`、`stealth`）

**Phase 7.6 隨機對抗檢定實作細節**：
- 同技能系統的隨機對抗檢定流程

**Phase 8 時效性效果實作細節**：
- 同技能系統的時效性效果流程

---

### 2.4 時效性效果相關 (app/actions/temporary-effects.ts) - Phase 8

#### `checkExpiredEffects(characterId?: string)` ✅ Phase 8

檢查並處理過期的時效性效果。

**參數**
```typescript
{
  characterId?: string;  // 可選，指定角色 ID；若未提供，檢查所有角色的過期效果
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    processedCount: number;  // 處理的過期效果數量
    restoredStats: Array<{   // 恢復的數值列表
      characterId: string;
      characterName: string;
      statName: string;
      restoredValue: number;
      restoredMax?: number;
    }>;
  };
  message?: string;
}
```

**實作邏輯**
1. 查詢所有角色的 `temporaryEffects` 陣列
2. 找出 `expiresAt <= now` 且 `isExpired === false` 的效果
3. 對每個過期效果：
   - 恢復目標角色的數值（減去 `deltaValue` 或 `deltaMax`）
   - 標記效果為已過期（`isExpired = true`）
   - 推送 `effect.expired` WebSocket 事件到目標角色頻道
   - 推送通知到 GM 端（若角色有對應的劇本）
4. 回傳處理結果

**注意**：此 API 應由定時任務（Cron Job）定期呼叫，建議每分鐘執行一次。

---

#### `getTemporaryEffects(characterId: string)` ✅ Phase 8

取得角色的所有時效性效果（用於 GM 端顯示）。

**參數**
```typescript
{
  characterId: string;  // 角色 ID
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    effects: Array<{
      id: string;
      sourceType: 'skill' | 'item';
      sourceId: string;
      sourceCharacterId: string;
      sourceCharacterName: string;
      sourceName: string;
      effectType: 'stat_change';
      targetStat: string;
      deltaValue?: number;
      deltaMax?: number;
      statChangeTarget: 'value' | 'maxValue';
      appliedAt: Date;
      expiresAt: Date;
      duration: number;
      remainingSeconds: number;  // 剩餘時間（秒）
    }>;
  };
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證

**實作邏輯**
1. 驗證角色存在且屬於當前 GM
2. 查詢角色的 `temporaryEffects` 陣列
3. 過濾 `isExpired === false` 的效果
4. 計算每個效果的剩餘時間
5. 回傳效果列表

---

### 2.5 事件推送 (app/actions/events.ts)

#### `pushEvent(eventData: PushEventInput)`

推送事件到玩家端。

**參數**
```typescript
interface PushEventInput {
  type: 'broadcast' | 'character' | 'secret-unlock' | 'task' | 'item';
  target?: string;  // characterId（若 type=character）
  gameId?: string;  // 若 type=broadcast
  payload: {
    title: string;
    message: string;
    data?: any;
  };
}
```

**回傳**
```typescript
{
  success: boolean;
  message?: string;
}
```

**認證需求**：需 GM Session

**實作邏輯**
1. 驗證 GM 權限（若指定 gameId 或 characterId）
2. 呼叫 Pusher API 推送事件
3. 記錄日誌（可選）

---

## 3. API Routes 規格

### 3.1 認證 API

#### `POST /api/auth/send-magic-link`

發送 Magic Link（與 Server Action 功能相同，但提供 REST 介面）。

**Request Body**
```json
{
  "email": "gm@example.com"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Magic Link 已發送至您的信箱"
}
```

**Response (400)**
```json
{
  "success": false,
  "error": "INVALID_EMAIL",
  "message": "Email 格式錯誤"
}
```

---

### 3.2 劇本公開資訊 API（玩家端）

#### `GET /api/games/[id]/public`

取得劇本公開資訊（世界觀、前導故事、章節），所有玩家可訪問。

**Query Parameters**
- 無

**Response (200)**
```json
{
  "success": true,
  "data": {
    "id": "xxx",
    "name": "迷霧莊園",
    "description": "一場神秘的謀殺案即將展開...",
    "publicInfo": {
      "intro": "1920年代，一座古老的莊園...",
      "worldSetting": "歐洲古典莊園，充滿神秘色彩",
      "chapters": [
        {
          "title": "序章：邀請函",
          "content": "你收到了一封神秘的邀請函...",
          "order": 1
        }
      ]
    }
  }
}
```

**Response (404)**
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "劇本不存在"
}
```

**實作邏輯**
1. 查詢 Game 資料
2. 回傳公開資訊（不包含 GM 相關資訊）
3. 若 `publicInfo` 不存在，回傳空物件

---

### 3.3 角色查詢 API（玩家端）

#### `GET /api/characters/[id]`

取得角色卡資訊（玩家端使用）。

**Query Parameters**
- 無

**Response (200)**
```json
{
  "success": true,
  "data": {
    "id": "xxx",
    "gameId": "xxx",
    "name": "瑪格麗特夫人",
    "imageUrl": "https://...",
    "hasPinLock": true,
    "publicInfo": {
      "background": "...",
      "personality": "...",
      "relationships": [...]
    },
    "secretInfo": {
      "secrets": [
        {
          "id": "secret-xxx",
          "title": "隱藏的秘密",
          "content": "這是隱藏的內容...",
          "isRevealed": true,
          "revealCondition": "完成任務 A 後揭露",
          "revealedAt": "2025-11-29T10:00:00Z"
        }
      ]
    },
    "tasks": [...],
    "items": [...],
    "createdAt": "2025-11-29T10:00:00Z",
    "updatedAt": "2025-11-29T10:00:00Z"
  }
}
```

**重要說明**：
- **完全隱藏原則**：API 只返回 `isRevealed === true` 的隱藏資訊
- **未揭露的隱藏資訊**：如果沒有已揭露的隱藏資訊，`secretInfo` 欄位為 `undefined` 或不包含在回應中
- **安全性**：玩家端無法看到未揭露的隱藏資訊，也無法知道有多少隱藏資訊存在
- **揭露條件**：`revealCondition` 欄位會返回給玩家（用於說明揭露時機），但僅供參考

**Response (404)**
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "角色不存在"
}
```

**注意**：若 `secretInfo.isUnlocked=false`，不應回傳真實秘密內容

---

#### `POST /api/characters/[id]/unlock`

使用 PIN 解鎖角色秘密。

**Request Body**
```json
{
  "pin": "1234"
}
```

**Response (200)**
```json
{
  "success": true,
  "secretInfo": {
    "isUnlocked": true,
    "secrets": [
      {
        "title": "莊園的秘密",
        "content": "..."
      }
    ],
    "hiddenGoals": "..."
  }
}
```

**Response (401)**
```json
{
  "success": false,
  "error": "INVALID_PIN",
  "message": "PIN 碼錯誤"
}
```

**實作邏輯**
1. 查詢角色資料
2. 驗證 `hasPinLock` 與 `pin` 欄位
3. 簡單字串比對（明文比對）
4. 若成功，更新 `secretInfo.isUnlocked=true`
5. 回傳秘密資訊
6. 推送 WebSocket 事件 `role.secretUnlocked`

---

#### `GET /api/characters/[id]/items` (Phase 7: 取得目標角色的道具清單)

取得目標角色的道具清單（用於 `item_take` 和 `item_steal` 效果）。

**Query Parameters**
- 無（透過 Server Action `getTargetCharacterItems` 呼叫）

**實作邏輯**
- 透過 `app/actions/public.ts` 中的 `getTargetCharacterItems` Server Action 實作
- 只回傳道具的基本資訊（id、name、quantity、type），不包含詳細效果

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "id": "item-001",
      "name": "神秘信件",
      "quantity": 1,
      "type": "equipment"
    }
  ]
}
```

---

### 2.5 對抗檢定相關 (app/actions/contest-*.ts) - Phase 7

#### `respondToContest(contestId: string, defenderId: string, defenderItems?: string[], defenderSkills?: string[], targetItemId?: string)` ✅ Phase 7 / ✅ Phase 7.6

防守方回應對抗檢定請求。

**參數**
```typescript
{
  contestId: string;           // 對抗請求 ID（格式：attackerId::skillId/itemId::timestamp）
  defenderId: string;          // 防守方角色 ID
  defenderItems?: string[];     // 防守方使用的道具 ID 陣列（選填）
  defenderSkills?: string[];   // 防守方使用的技能 ID 陣列（選填）
  targetItemId?: string;       // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    contestResult: 'attacker_wins' | 'defender_wins' | 'both_fail';
    effectsApplied?: string[];  // 已執行的效果描述列表（僅成功方）
  };
  message?: string;
}
```

**錯誤碼**
- `INVALID_CONTEST_ID`：無效的對抗請求 ID
- `NOT_FOUND`：找不到角色
- `INVALID_TARGET`：角色不在同一劇本內
- `ITEM_NOT_AVAILABLE`：道具不可用（冷卻中、使用次數達上限、數量不足）
- `SKILL_NOT_AVAILABLE`：技能不可用（冷卻中、使用次數達上限）
- `INVALID_CHECK_TYPE`：Phase 7.6: 防守方使用的技能/道具檢定類型與攻擊方不匹配
- `INVALID_RELATED_STAT`：Phase 7.6: 防守方使用的技能/道具數值判定與攻擊方不匹配
- `MISSING_COMBAT_TAG`：Phase 7.6: 防守方使用的技能/道具缺少 "戰鬥" 標籤

**實作邏輯**
1. 解析對抗請求 ID，取得攻擊方和來源（技能/道具）ID
2. 驗證角色存在且在同一劇本內
3. **Phase 7.6**：驗證防守方使用的道具/技能：
   - 必須具有 "戰鬥"（`combat`）標籤
   - 檢定類型（`checkType`）必須與攻擊方相同（`contest` 或 `random_contest`）
   - 若為 `contest` 類型，`relatedStat` 必須與攻擊方相同
4. 驗證防守方使用的道具/技能是否可用（冷卻、次數限制等）
5. 計算攻擊方和防守方的數值（包含使用的道具/技能加成）
   - **Phase 7.6**：若為 `random_contest`：
     - 從對抗檢定追蹤系統中獲取攻擊方的隨機數（已在選擇目標後決定）
     - 防守方的隨機數在此時決定（按下確認按鈕時）
     - 雙方各自骰 1 到 `Game.randomContestMaxValue` 的隨機數
6. 計算對抗結果（攻擊方獲勝/防守方獲勝/雙方平手）
7. **Phase 7.6**：執行效果（僅成功方）：
   - 若攻擊方獲勝：執行攻擊方技能/道具效果
   - 若防守方獲勝：執行防守方技能/道具效果
   - 若雙方平手：不執行任何效果
8. 推送對抗結果事件到雙方角色頻道
9. 清除對抗檢定追蹤狀態

---

#### `queryContestStatus(contestId: string, characterId: string)` ✅ Phase 7

查詢對抗檢定狀態（用於攻擊方重新整理後檢查對抗檢定是否已完成）。

**參數**
```typescript
{
  contestId: string;      // 對抗請求 ID
  characterId: string;    // 角色 ID（攻擊方）
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    isActive: boolean;    // 對抗檢定是否仍在進行中
    contestInfo?: {       // 對抗檢定資訊（若仍在進行中）
      attackerId: string;
      defenderId: string;
      sourceType: 'skill' | 'item';
      sourceId: string;
      timestamp: number;
    };
  };
  message?: string;
}
```

**實作邏輯**
1. 從對抗檢定追蹤系統查詢狀態
2. 若對抗檢定不存在，返回 `isActive: false`
3. 若對抗檢定仍在進行中，返回詳細資訊

---

#### `selectTargetItemForContest(contestId: string, attackerId: string, targetItemId: string, defenderId?: string)` ✅ Phase 7

選擇目標道具（用於對抗檢定獲勝後需要選擇目標道具的情況）。

**參數**
```typescript
{
  contestId: string;      // 對抗請求 ID
  attackerId: string;     // 攻擊方角色 ID
  targetItemId: string;   // 目標道具 ID
  defenderId?: string;    // 防守方角色 ID（可選，用於防禦性檢查）
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    success: boolean;
    effectApplied?: string;  // 已執行的效果描述
  };
  message?: string;
}
```

**錯誤碼**
- `INVALID_CONTEST_ID`：無效的對抗請求 ID
- `NOT_FOUND`：找不到角色或對抗檢定
- `TARGET_ITEM_NOT_FOUND`：目標角色沒有此道具
- `CONTEST_NOT_WON`：對抗檢定未獲勝或已完成

**實作邏輯**
1. 驗證對抗檢定存在且攻擊方已獲勝
2. 驗證目標道具存在於防守方身上
3. 執行效果（`item_take` 或 `item_steal`）
4. 推送相關事件
5. 清除對抗檢定追蹤狀態

---

#### `cancelContestItemSelection(contestId: string, characterId: string)` ✅ Phase 7

取消對抗檢定（當目標角色沒有道具可選擇時）。

**參數**
```typescript
{
  contestId: string;      // 對抗請求 ID
  characterId: string;    // 攻擊方角色 ID
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    cancelled: boolean;
  };
  message?: string;
}
```

**實作邏輯**
1. 驗證對抗檢定存在且角色為攻擊方
2. 發送通知給攻擊方（目標角色沒有道具）
3. 清除對抗檢定追蹤狀態

---

### 2.6 道具展示相關 (app/actions/item-showcase.ts) - Phase 7.7

#### `showcaseItem(characterId: string, itemId: string, targetCharacterId: string)` - Phase 7.7

展示道具給其他角色查看。

**參數**
```typescript
{
  characterId: string;         // 展示方角色 ID
  itemId: string;              // 要展示的道具 ID
  targetCharacterId: string;   // 被展示方角色 ID
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    showcased: boolean;
    revealTriggered?: boolean;  // 是否觸發了自動揭露
    revealedCount?: number;     // 觸發的揭露數量
  };
  message?: string;
}
```

**錯誤碼**
- `NOT_FOUND`：角色或道具不存在
- `INVALID_TARGET`：目標角色不在同一劇本內
- `SELF_TARGET`：不能展示給自己

**實作邏輯**
1. 驗證展示方角色和道具存在
2. 驗證目標角色存在且在同一劇本內
3. 驗證不是展示給自己
4. 記錄目標角色的 `viewedItems`（道具 ID + 來源角色 ID，去重）
5. 呼叫自動揭露評估引擎
6. 發送 `item.showcased` 事件給雙方
7. 若有觸發揭露，發送揭露事件

---

#### `recordItemView(characterId: string, itemId: string)` - Phase 7.7

記錄角色自行檢視道具（玩家點開道具詳情時呼叫）。

**參數**
```typescript
{
  characterId: string;  // 檢視方角色 ID
  itemId: string;       // 被檢視的道具 ID
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: {
    recorded: boolean;
    revealTriggered?: boolean;
    revealedCount?: number;
  };
  message?: string;
}
```

**錯誤碼**
- `NOT_FOUND`：角色或道具不存在

**實作邏輯**
1. 驗證角色和道具存在
2. 記錄角色的 `viewedItems`（去重：同一道具 ID 不重複記錄）
3. 無論是否為新記錄，都呼叫自動揭露評估引擎（GM 可能已重設揭露狀態）
4. 若有觸發揭露，發送揭露事件

---

### 2.7 劇本道具查詢 (app/actions/games.ts) - Phase 7.7

#### `getGameItems(gameId: string)` - Phase 7.7

取得劇本中所有角色的所有道具列表（GM 端使用，用於揭露條件設定）。

**參數**
```typescript
{
  gameId: string;  // 劇本 ID
}
```

**回傳**
```typescript
{
  success: boolean;
  data?: Array<{
    characterId: string;
    characterName: string;
    itemId: string;
    itemName: string;
  }>;
  message?: string;
}
```

**認證需求**：需 GM Session + 權限驗證（劇本擁有者）

---

### 3.3 圖片上傳 API

#### `POST /api/upload`

上傳圖片至 Vercel Blob Storage。

**Request**
- Content-Type: `multipart/form-data`
- Field: `file`

**Response (200)**
```json
{
  "success": true,
  "url": "https://xxx.vercel-storage.com/image-xxx.jpg"
}
```

**Response (400)**
```json
{
  "success": false,
  "error": "INVALID_FILE",
  "message": "僅支援 JPG, PNG 格式"
}
```

**認證需求**：需 GM Session

**實作邏輯**
1. 驗證檔案類型（image/jpeg, image/png）
2. 驗證檔案大小（< 5MB）
3. 壓縮圖片（使用 sharp）
4. 上傳至 Vercel Blob
5. 回傳 Blob URL

---

### 3.4 WebSocket 認證 API

#### `POST /api/webhook/pusher-auth`

Pusher Private Channel 認證。

**Request Body**
```json
{
  "socket_id": "123.456",
  "channel_name": "private-character-xxx"
}
```

**Response (200)**
```json
{
  "auth": "xxx:yyy"  // Pusher auth signature
}
```

**實作邏輯**
1. 驗證 channel_name 格式
2. 使用 Pusher SDK 生成認證簽章
3. 回傳 auth token

---

### 3.5 事件推送 API

#### `POST /api/events/push`

推送事件（與 Server Action 功能相同，但提供 REST 介面）。

**Request Body**
```json
{
  "type": "character",
  "target": "507f1f77bcf86cd799439013",
  "payload": {
    "title": "新任務",
    "message": "你收到了一項新任務",
    "data": {
      "taskId": "task-002"
    }
  }
}
```

**Response (200)**
```json
{
  "success": true
}
```

**認證需求**：需 GM Session

---

## 4. 錯誤處理規範

### 4.1 標準錯誤碼

| 錯誤碼 | HTTP Status | 說明 |
|--------|-------------|------|
| `INVALID_INPUT` | 400 | 輸入資料格式錯誤 |
| `INVALID_EMAIL` | 400 | Email 格式錯誤 |
| `INVALID_PIN` | 401 | PIN 碼錯誤 |
| `UNAUTHORIZED` | 401 | 未登入或 Session 過期 |
| `FORBIDDEN` | 403 | 無權限存取資源 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `EXPIRED_TOKEN` | 410 | Token 已過期 |
| `RATE_LIMIT` | 429 | 請求過於頻繁 |
| `SERVER_ERROR` | 500 | 伺服器內部錯誤 |

### 4.2 錯誤回傳格式

```typescript
interface ErrorResponse {
  success: false;
  error: string;      // 錯誤碼
  message: string;    // 使用者友善訊息
  details?: any;      // 詳細錯誤（僅開發環境）
}
```

---

## 5. 認證與授權

### 5.1 Session 管理

使用 **iron-session** 或 **JWT** 儲存 GM Session。

**Session 資料結構**
```typescript
interface SessionData {
  gmId: string;
  email: string;
  displayName: string;
  expiresAt: number;  // Unix timestamp
}
```

**Session 過期時間**：7 天

---

### 5.2 權限驗證

所有 GM 端 Server Actions 與 API Routes 需驗證：

1. **Session 有效性**：檢查 Session 是否存在且未過期
2. **資源擁有權**：驗證 GM 是否為資源擁有者（例如：劇本、角色）

**驗證流程**
```typescript
// Middleware 範例
export async function requireAuth(req: Request) {
  const session = await getSession(req);
  if (!session || !session.gmId) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

export async function requireGameOwnership(gmId: string, gameId: string) {
  const game = await Game.findById(gameId);
  if (!game || game.gmId.toString() !== gmId) {
    throw new Error('FORBIDDEN');
  }
  return game;
}
```

---

## 6. Rate Limiting

### 6.1 限制規則

| API | 限制 | 時間窗口 |
|-----|------|----------|
| `/api/auth/send-magic-link` | 3 次 | 15 分鐘 |
| `/api/characters/[id]/unlock` | 5 次 | 5 分鐘 |
| `/api/upload` | 10 次 | 1 分鐘 |
| `/api/events/push` | 30 次 | 1 分鐘 |

### 6.2 實作建議

使用 **Upstash Redis** + `@upstash/ratelimit` 套件。

---

## 7. 測試建議

### 7.1 單元測試

- 每個 Server Action 需有測試
- 測試 happy path 與 error cases

### 7.2 整合測試

- 測試完整 API 流程（建立劇本 → 建立角色 → 推送事件）
- 使用 MongoDB Memory Server 進行測試

### 7.3 E2E 測試

- 使用 Playwright 測試 GM 登入流程
- 測試玩家端 PIN 解鎖流程

---

## 附註

- 所有 API 回傳格式統一使用 JSON
- 日期格式統一使用 ISO 8601
- 所有 API 需記錄 log（使用 Winston 或 Pino）
- 開發環境需提供 API 文件（考慮使用 Swagger/OpenAPI）

此文件將隨需求變更持續更新。

