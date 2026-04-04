# 資料庫 Schema 設計

## 版本：v1.5
## 更新日期：2026-04-03（Phase D 重構同步：publicInfo BackgroundBlock 結構、PIN 4 位數字）
## 資料庫：MongoDB Atlas

---

## 1. 總覽

本專案使用 MongoDB 作為主要資料庫，採用以下 Collections：

1. `gm_users` - GM 使用者資料
2. `games` - 劇本資料（Baseline 層）
3. `characters` - 角色卡資料（Baseline 層）
4. `magic_links` - Magic Link Token（短期儲存）
5. `game_runtimes` - 遊戲運行時/快照資料（Phase 10）
6. `character_runtimes` - 角色運行時/快照資料（Phase 10）
7. `logs` - 操作日誌（Phase 10）
8. `pending_events` - 離線事件佇列（Phase 9）

---

## 2. Collection Schemas

### 2.1 gm_users

GM 使用者基本資料。

```typescript
interface GMUser {
  _id: ObjectId;
  email: string;                    // 唯一，用於登入
  displayName: string;              // 顯示名稱
  createdAt: Date;
  updatedAt: Date;
}
```

#### 索引

```javascript
db.gm_users.createIndex({ email: 1 }, { unique: true });
```

#### 範例文件

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "email": "gm@example.com",
  "displayName": "主持人小明",
  "createdAt": ISODate("2025-11-29T10:00:00Z"),
  "updatedAt": ISODate("2025-11-29T10:00:00Z")
}
```

---

### 2.2 games

劇本資料，包含公開資訊等。

**Phase 3 擴展**：加入 `publicInfo`（使用 BackgroundBlock[] 統一結構）

```typescript
interface Game {
  _id: ObjectId;
  gmUserId: ObjectId;                // 關聯到 gm_users._id（Phase 2）
  name: string;                      // 劇本名稱（Phase 2）
  description: string;               // 劇本簡介（Phase 2）
  isActive: boolean;                  // 遊戲是否進行中（Phase 10：控制 Runtime 層讀寫）

  // Phase 10：Game Code 系統
  gameCode: string;                   // 唯一遊戲代碼（6 位英數字，自動生成）
  
  // Phase 3 擴展 → Phase D 重構：公開資訊（BackgroundBlock 統一結構）
  publicInfo?: {
    blocks: Array<{
      type: 'title' | 'body';         // title = 段落標題，body = 段落內文
      content: string;
    }>;
  };
  
  // Phase 7.6：隨機對抗檢定設定
  randomContestMaxValue?: number;     // 隨機對抗檢定的上限值（劇本共通，預設 100）
  
  createdAt: Date;
  updatedAt: Date;
}
```

#### 索引

```javascript
db.games.createIndex({ gmUserId: 1 });
db.games.createIndex({ createdAt: -1 });
// Phase 10: gameCode 欄位層級 unique: true（Schema 定義中設定，無需額外 createIndex）
```

#### 範例文件

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "gmUserId": ObjectId("507f1f77bcf86cd799439011"),
  "name": "迷霧莊園",
  "description": "一場神秘的謀殺案即將展開...",
  "isActive": true,
  "gameCode": "ABC123",
  "publicInfo": {
    "blocks": [
      { "type": "title", "content": "序章：邀請函" },
      { "type": "body", "content": "1920年代，你收到了一封神秘的邀請函，邀請你前往一座古老的莊園..." },
      { "type": "title", "content": "世界觀" },
      { "type": "body", "content": "歐洲古典莊園，充滿神秘色彩，四處瀰漫著不安的氣息。" }
    ]
  },
  "createdAt": ISODate("2025-11-29T10:00:00Z"),
  "updatedAt": ISODate("2025-11-29T10:30:00Z")
}
```

---

### 2.3 characters

角色卡資料，玩家透過 characterId 存取。

```typescript
interface Character {
  _id: ObjectId;
  gameId: ObjectId;                 // 關聯到 games._id
  name: string;                     // 角色名稱
  avatar?: string;                  // 頭像 URL（Vercel Blob）
  
  // PIN 鎖定機制
  hasPinLock: boolean;              // 是否需要 PIN
  pin?: string;                     // PIN 明文（4 位數字，僅 GM 可查看）
  
  // 公開資訊（PIN 解鎖後可見）- Phase 3 → Phase D 重構
  publicInfo: {
    background: Array<{             // 角色背景（BackgroundBlock 統一結構）
      type: 'title' | 'body';       // title = 段落標題，body = 段落內文
      content: string;
    }>;
    personality: string;            // 性格特徵
    relationships: Array<{
      targetName: string;           // 關係對象
      description: string;          // 關係描述
    }>;
  };
  
  // 隱藏資訊（GM 控制開放）- Phase 3.5
  secretInfo?: {
    secrets: Array<{
      id: string;                   // 唯一識別碼（用於追蹤閱讀狀態）
      title: string;                // 隱藏資訊標題
      content: string;              // 隱藏資訊內容
      isRevealed: boolean;          // 是否已揭露（由 GM 控制，獨立於其他隱藏資訊）
      revealCondition: string;     // 揭露條件描述（僅供 GM 參考，玩家不會看到）
      revealedAt?: Date;            // 揭露時間（當 isRevealed 從 false 變為 true 時自動設定）
    }>;
  };
  
  // 任務系統 - Phase 4.5
  tasks: Array<{
    id: string;                     // 唯一識別碼
    title: string;                  // 任務標題
    description: string;            // 任務描述（支援多行）
    
    // 隱藏目標機制
    isHidden: boolean;              // 是否為隱藏目標
    isRevealed: boolean;            // 隱藏目標是否已揭露（isHidden=true 時有效）
    revealedAt?: Date;              // 揭露時間
    
    // 完成狀態
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    completedAt?: Date;             // 完成時間
    
    // GM 專用欄位（玩家端不顯示）
    revealCondition?: string;       // 揭露條件描述（僅 GM 參考）
    
    createdAt: Date;                // 建立時間
  }>;
  
  // 道具系統 - Phase 4.5
  items: Array<{
    id: string;                     // 唯一識別碼
    name: string;                   // 道具名稱
    description: string;            // 道具描述
    imageUrl?: string;              // 道具圖片（Vercel Blob）
    
    // 道具類型與數量
    type: 'consumable' | 'equipment';  // 消耗品 / 非消耗品（裝備）
    quantity: number;               // 數量（消耗品每次使用減 1，為 0 時移除）
    
    // 使用效果（可選，由技能系統擴展）
    effect?: {
      type: 'stat_change' | 'custom' | 'item_take' | 'item_steal';  // Phase 7: 添加 item_take 和 item_steal
      
      // 目標設定（Phase 6.5 方案 A）- ✅ 已實作
      targetType?: 'self' | 'other' | 'any';  // 目標對象類型（GM 設定）
      requiresTarget?: boolean;               // 是否需要玩家選擇目標角色
      
      targetStat?: string;          // 目標數值名稱（如：HP、MP）
      value?: number;               // 變化值（正數增加，負數減少）
      // 數值變化目標：'value' 修改目前值，'maxValue' 修改最大值（需要該數值有 maxValue）- ✅ 已實作
      statChangeTarget?: 'value' | 'maxValue';
      // 當 statChangeTarget === 'maxValue' 時，是否同步修改目前值 - ✅ 已實作
      syncValue?: boolean;
      description?: string;         // 效果描述（custom 類型用）
      // Phase 7: 目標道具 ID（用於 item_take 和 item_steal，由玩家在執行時選擇，不儲存在資料庫）
      targetItemId?: string;
      // Phase 8: 時效性效果設定
      duration?: number;            // 持續時間（秒，undefined/0 = 永久效果）
    };
    
    // Phase 7.6：標籤系統
    tags?: string[];                 // 標籤陣列，支援多標籤
                                      // 支援的標籤：'combat'（戰鬥）、'stealth'（隱匿）
    
    // 使用限制（GM 可選擇是否啟用）
    usageLimit?: number;            // 使用次數限制（undefined/0 = 無限制）
    usageCount?: number;            // 已使用次數（達到 usageLimit 時無法使用）
    cooldown?: number;              // 冷卻時間（秒，undefined/0 = 無冷卻）
    lastUsedAt?: Date;              // 上次使用時間（計算冷卻用）
    
    // 流通性
    isTransferable: boolean;        // 是否可轉移給其他玩家
    
    // Phase 7.6：標籤系統
    tags?: string[];                // 標籤陣列，支援多標籤
                                      // 支援的標籤：'combat'（戰鬥）、'stealth'（隱匿）
    
    // Phase 7.6：檢定系統擴展
    checkType?: 'none' | 'contest' | 'random' | 'random_contest';  // 檢定類型（新增 random_contest）
    contestConfig?: {                // 對抗檢定設定（checkType === 'contest' 時使用）
      relatedStat: string;          // 使用的數值名稱
      opponentMaxItems?: number;     // 對方最多可使用道具數
      opponentMaxSkills?: number;    // 對方最多可使用技能數
      tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
    };
    randomConfig?: {                 // 隨機檢定設定（checkType === 'random' 時使用）
      maxValue: number;              // 隨機數值上限
      threshold: number;            // 門檻值
    };
    // 注意：random_contest 使用劇本共通的 randomContestMaxValue，不需要額外設定
    
    acquiredAt: Date;               // 獲得時間
  }>;
  
  /**
   * 道具/技能使用條件判斷：
   * 1. 冷卻檢查：若 cooldown > 0 且 (now - lastUsedAt) < cooldown 秒，則無法使用
   * 2. 次數檢查：若 usageLimit > 0 且 usageCount >= usageLimit，則無法使用
   * 3. 消耗品檢查：若 type = 'consumable' 且 quantity <= 0，則無法使用
   */
  
  // 數值系統 - Phase 4
  stats?: Array<{
    id: string;                     // 唯一識別碼
    name: string;                   // 數值名稱（如：血量、魔力、力量）
    value: number;                  // 目前數值
    maxValue?: number;              // 最大值（可選）
  }>;
  
  // 技能系統 - Phase 5 ✅ 已完成基礎功能
  skills?: Array<{
    id: string;                     // 唯一識別碼
    name: string;                   // 技能名稱
    description: string;            // 技能描述
    imageUrl?: string;              // 技能圖片
    
    // 檢定系統
    checkType: 'none' | 'contest' | 'random' | 'random_contest';  // 檢定類型（Phase 7.6: 新增 random_contest）
    // 對抗檢定設定（checkType === 'contest' 時使用）- Phase 6.5 實作邏輯
    contestConfig?: {
      relatedStat: string;          // 使用的數值名稱
      opponentMaxItems?: number;     // 對方最多可使用道具數（預設 0）
      opponentMaxSkills?: number;    // 對方最多可使用技能數（預設 0）
      tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';  // 平手裁決方式
    };
    // 隨機檢定設定（checkType === 'random' 時使用）- ✅ 已實作
    randomConfig?: {
      maxValue: number;              // 隨機數值上限（預設 100）
      threshold: number;            // 門檻值（必須 <= maxValue）
    };
    // Phase 7.6：隨機對抗檢定使用劇本共通的 randomContestMaxValue，不需要額外設定
    
    // Phase 7.6：標籤系統
    tags?: string[];                 // 標籤陣列，支援多標籤
                                      // 支援的標籤：'combat'（戰鬥）、'stealth'（隱匿）
    
    // 使用限制（GM 可選擇是否啟用）- ✅ 已實作
    usageLimit?: number;            // 使用次數限制（undefined/0 = 無限制）
    usageCount?: number;            // 已使用次數（達到 usageLimit 時無法使用）
    cooldown?: number;              // 冷卻時間（秒，undefined/0 = 無冷卻）
    lastUsedAt?: Date;              // 上次使用時間（計算冷卻用）
    
    // 效果定義（可多個）- ✅ 部分已實作
    effects?: Array<{
      type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' | 
            'task_reveal' | 'task_complete' | 'custom';
      
      // 目標設定（Phase 6.5 方案 A）- ✅ 已實作
      targetType?: 'self' | 'other' | 'any';  // 目標對象類型（GM 設定）
      requiresTarget?: boolean;               // 是否需要玩家選擇目標角色
      
      targetStat?: string;          // 目標數值（stat_change 用）
      value?: number;               // 變化值
      // 數值變化目標：'value' 修改目前值，'maxValue' 修改最大值（需要該數值有 maxValue）- ✅ 已實作
      statChangeTarget?: 'value' | 'maxValue';
      // 當 statChangeTarget === 'maxValue' 時，是否同步修改目前值 - ✅ 已實作
      syncValue?: boolean;
      targetItemId?: string;        // Phase 7: 目標道具 ID（用於 item_take 和 item_steal，由玩家在執行時選擇，不儲存在資料庫）
      targetTaskId?: string;        // 目標任務 ID - ✅ 已實作
      description?: string;         // 效果描述（custom 用）- ✅ 已實作
      // Phase 8: 時效性效果設定
      duration?: number;            // 持續時間（秒，undefined/0 = 永久效果）
    }>;
  }>;
  
  // Phase 8: 時效性效果追蹤
  temporaryEffects?: Array<{
    id: string;                    // 效果唯一識別碼（UUID）
    sourceType: 'skill' | 'item';  // 來源類型
    sourceId: string;              // 技能/道具 ID
    sourceCharacterId: string;      // 施放者角色 ID
    sourceCharacterName: string;    // 施放者角色名稱（用於顯示）
    sourceName: string;             // 技能/道具名稱（用於顯示）
    effectType: 'stat_change';     // 效果類型（Phase 1 僅支援 stat_change）
    targetStat: string;            // 目標數值名稱
    deltaValue?: number;           // 數值變化量（正數增加，負數減少）
    deltaMax?: number;             // 最大值變化量
    statChangeTarget: 'value' | 'maxValue'; // 變化目標
    appliedAt: Date;               // 效果應用時間
    expiresAt: Date;              // 效果過期時間
    duration: number;             // 持續時間（秒）
    isExpired: boolean;            // 是否已過期（用於標記，實際檢查用 expiresAt）
  }>;
  
  // WebSocket 頻道 ID（用於推送事件）- Phase 6
  wsChannelId?: string;             // 格式：character-{characterId}
  
  createdAt: Date;
  updatedAt: Date;
}
```

#### 索引

```javascript
db.characters.createIndex({ gameId: 1 });
db.characters.createIndex({ wsChannelId: 1 });
db.characters.createIndex({ "publicInfo.name": 1 });
// Phase 10: 同遊戲內 PIN 唯一（允許 PIN 為 null 的角色）
db.characters.createIndex({ gameId: 1, pin: 1 }, { unique: true, sparse: true, partialFilterExpression: { pin: { $exists: true, $ne: null, $ne: '' } } });
```

#### 範例文件

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439013"),
  "gameId": ObjectId("507f1f77bcf86cd799439012"),
  "name": "瑪格麗特夫人",
  "avatar": "https://xxx.vercel-storage.com/avatar-xxx.jpg",
  "hasPinLock": true,
  "pin": "1234",
  "publicInfo": {
    "background": [
      { "type": "body", "content": "莊園的女主人，優雅高貴，出身名門望族。" }
    ],
    "personality": "表面溫柔，實則心機深沉",
    "relationships": [
      {
        "targetName": "管家亨利",
        "description": "忠心的僕人，跟隨多年"
      },
      {
        "targetName": "偵探約翰",
        "description": "新來的訪客，似乎在調查什麼"
      }
    ]
  },
  "secretInfo": {
    "isUnlocked": false,
    "secrets": [
      {
        "title": "莊園的秘密",
        "content": "莊園地下室隱藏著一個古老的實驗室..."
      }
    ],
    "hiddenGoals": "必須在午夜前找到遺失的鑰匙"
  },
  "tasks": [
    {
      "id": "task-001",
      "title": "探索圖書館",
      "description": "在圖書館中尋找線索",
      "status": "pending",
      "createdAt": ISODate("2025-11-29T11:00:00Z")
    }
  ],
  "items": [
    {
      "id": "item-001",
      "name": "神秘信件",
      "description": "一封署名不明的信件",
      "acquiredAt": ISODate("2025-11-29T11:30:00Z")
    }
  ],
  "wsChannelId": "character-507f1f77bcf86cd799439013",
  "createdAt": ISODate("2025-11-29T10:00:00Z"),
  "updatedAt": ISODate("2025-11-29T11:30:00Z")
}
```

---

### 2.4 magic_links

Magic Link Token 短期儲存（用於 Email 登入驗證）。

```typescript
interface MagicLink {
  _id: ObjectId;
  email: string;                    // GM Email
  token: string;                    // 驗證 Token（UUID）
  expiresAt: Date;                  // 過期時間（預設 15 分鐘）
  used: boolean;                    // 是否已使用
  createdAt: Date;
}
```

#### 索引

```javascript
db.magic_links.createIndex({ token: 1 }, { unique: true });
db.magic_links.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL Index
```

#### 範例文件

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439014"),
  "email": "gm@example.com",
  "token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expiresAt": ISODate("2025-11-29T10:15:00Z"),
  "used": false,
  "createdAt": ISODate("2025-11-29T10:00:00Z")
}
```

---

### 2.5 game_runtimes（Phase 10）

遊戲運行時和快照資料。Runtime 在遊戲開始時從 Baseline 完全複製，Snapshot 在遊戲結束時從 Runtime 轉換。

```typescript
interface GameRuntime {
  _id: ObjectId;
  refId: ObjectId;                   // 關聯到 games._id（Baseline 參照）
  type: 'runtime' | 'snapshot';      // runtime = 進行中，snapshot = 歷史紀錄

  // 以下欄位完全複製自 Game（Baseline）
  gmUserId: ObjectId;
  name: string;
  description: string;
  isActive: boolean;
  gameCode: string;
  publicInfo?: { /* 同 Game */ };
  randomContestMaxValue?: number;

  // Snapshot 專用欄位
  snapshotName?: string;             // 快照名稱（GM 可自訂）
  snapshotCreatedAt?: Date;          // 快照建立時間

  createdAt: Date;
  updatedAt: Date;
}
```

#### 索引

```javascript
db.game_runtimes.createIndex({ refId: 1, type: 1 });
db.game_runtimes.createIndex({ gameCode: 1 });
db.game_runtimes.createIndex({ type: 1, snapshotCreatedAt: -1 });
```

---

### 2.6 character_runtimes（Phase 10）

角色運行時和快照資料。與 GameRuntime 對應，完全複製 Character 的所有欄位。

```typescript
interface CharacterRuntime {
  _id: ObjectId;
  refId: ObjectId;                   // 關聯到 characters._id（Baseline 參照）
  type: 'runtime' | 'snapshot';      // runtime = 進行中，snapshot = 歷史紀錄
  gameId: ObjectId;                  // 關聯到 games._id

  // 以下欄位完全複製自 Character（Baseline）
  name: string;
  avatar?: string;
  hasPinLock: boolean;
  pin?: string;
  publicInfo: { /* 同 Character */ };
  secretInfo?: { /* 同 Character */ };
  tasks: Array<{ /* 同 Character */ }>;
  items: Array<{ /* 同 Character */ }>;
  stats?: Array<{ /* 同 Character */ }>;
  skills?: Array<{ /* 同 Character */ }>;
  temporaryEffects?: Array<{ /* 同 Character */ }>;
  wsChannelId?: string;

  // Snapshot 專用欄位
  snapshotGameRuntimeId?: ObjectId;  // 關聯到所屬的 GameRuntime snapshot

  createdAt: Date;
  updatedAt: Date;
}
```

#### 索引

```javascript
db.character_runtimes.createIndex({ refId: 1, type: 1 });
db.character_runtimes.createIndex({ gameId: 1, type: 1 });
db.character_runtimes.createIndex({ gameId: 1, pin: 1 });
```

---

### 2.7 logs（Phase 10）

操作日誌，記錄遊戲進行中的所有變更操作。

```typescript
interface Log {
  _id: ObjectId;
  timestamp: Date;                   // 操作時間
  gameId: ObjectId;                  // 關聯到 games._id
  characterId?: ObjectId;            // 關聯到 characters._id（可選，系統層級操作無此欄位）
  actorType: 'gm' | 'system' | 'character';  // 操作者類型
  actorId: string;                   // 操作者 ID
  action: string;                    // 操作類型（如 game_start、game_end、stat_change、item_use 等）
  details: Record<string, any>;      // 操作詳情（彈性結構）
}
```

#### 索引

```javascript
db.logs.createIndex({ gameId: 1, timestamp: -1 });
db.logs.createIndex({ characterId: 1, timestamp: -1 });
```

---

## 3. 關聯圖

```
gm_users (1) ──< (N) games ──< (N) characters
                   │                  │
                   │ (Phase 10)       │ (Phase 10)
                   │                  │
                   < (1) game_runtimes < (N) character_runtimes
                   │     (runtime/snapshot)    (runtime/snapshot)
                   │
                   < (N) logs
```

- 一個 GM 可以有多個劇本
- 一個劇本可以有多個角色
- Phase 10：每個遊戲在進行中有 1 個 GameRuntime（type: runtime），結束後轉為 snapshot
- Phase 10：每個角色有對應的 CharacterRuntime（跟隨 GameRuntime 生命週期）
- Phase 10：所有操作記錄在 logs 中（以 gameId 為主索引）

---

## 4. 資料驗證規則

### 4.1 gm_users

- `email`：必填，格式驗證，唯一
- `displayName`：必填，長度 1-50 字元

### 4.2 games

- `title`：必填，長度 1-100 字元
- `description`：選填，長度 0-500 字元
- `status`：必填，僅限 'draft' | 'active' | 'completed'
- `coverImage`：選填，必須是有效 URL

### 4.3 characters

- `name`：必填，長度 1-50 字元
- `pin`：當 `hasPinLock=true` 時必填，格式為 4 位數字（明文儲存）
- `wsChannelId`：必填，格式 `character-{ObjectId}`
- `secretInfo.isUnlocked`：預設 false

### 4.4 magic_links

- `token`：必填，UUID v4 格式
- `expiresAt`：必填，必須在未來
- `used`：預設 false

---

## 5. Mongoose Schema 實作指引

### 5.1 安裝依賴

```bash
pnpm add mongoose
pnpm add -D @types/mongoose
```

### 5.2 Schema 檔案位置

```
lib/db/models/
├── GMUser.ts
├── Game.ts
├── Character.ts
├── MagicLink.ts
├── GameRuntime.ts        # Phase 10
├── CharacterRuntime.ts   # Phase 10
├── Log.ts                # Phase 10
├── PendingEvent.ts       # Phase 9
└── index.ts              # 統一匯出
```

### 5.3 Schema 實作範例（GMUser）

```typescript
// lib/db/models/GMUser.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IGMUser extends Document {
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

const GMUserSchema = new Schema<IGMUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  displayName: {
    type: String,
    required: true,
    maxlength: 50,
  },
}, {
  timestamps: true,
});

export default mongoose.models.GMUser || mongoose.model<IGMUser>('GMUser', GMUserSchema);
```

---

## 6. 查詢優化建議

### 6.1 常用查詢

```typescript
// 取得 GM 的所有劇本（按建立時間排序）
db.games.find({ gmId: ObjectId("...") }).sort({ createdAt: -1 });

// 取得劇本的所有角色
db.characters.find({ gameId: ObjectId("...") });

// 驗證 Magic Link
db.magic_links.findOne({ 
  token: "...", 
  used: false, 
  expiresAt: { $gt: new Date() } 
});

// 取得角色資訊（玩家端）
db.characters.findById("...");
```

### 6.2 投影（Projection）

玩家端查詢時，若秘密未解鎖，不應回傳 `secretInfo`：

```typescript
// 需自行在 API 層處理
const character = await Character.findById(id);
if (!character.secretInfo.isUnlocked) {
  character.secretInfo = {
    isUnlocked: false,
    secrets: [],
    hiddenGoals: '',
  };
}
```

---

## 7. 資料遷移計畫

目前為 MVP 階段，無需資料遷移。未來若有 Schema 變更，需：

1. 撰寫 migration script（放在 `scripts/migrations/`）
2. 在 `develop` 環境測試
3. 記錄於版控
4. 更新此文件

---

## 8. 備份策略

- **MongoDB Atlas 自動備份**：每日備份（Atlas 免費層支援）
- **手動備份**：重大更新前執行 `mongodump`
- **備份保留**：7 天內可復原

---

## 附註

- **PIN 儲存方式**：採用明文儲存（4 位數字），僅 GM 可透過 Server Action 查看
  - **理由**：此系統為 LARP 遊戲輔助工具，PIN 主要用於防止玩家誤看其他角色卡，而非防止黑客攻擊
  - **安全措施**：玩家端 API 不會回傳 PIN，只有 GM 端 Server Action 可取得
- `wsChannelId` 格式統一為 `character-{ObjectId}`
- 所有日期使用 UTC 時區
- 圖片 URL 使用 Vercel Blob Storage

此文件將隨需求變更持續更新。

