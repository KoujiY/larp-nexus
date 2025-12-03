# API 規格文件

## 版本：v1.0
## 更新日期：2025-11-29

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

### 2.4 事件推送 (app/actions/events.ts)

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

