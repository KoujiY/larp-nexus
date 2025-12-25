# 資料庫 Schema 設計

## 版本：v1.3
## 更新日期：2025-01-XX（Phase 8 時效性效果）
## 資料庫：MongoDB Atlas

---

## 1. 總覽

本專案使用 MongoDB 作為主要資料庫，採用以下 Collections：

1. `gm_users` - GM 使用者資料
2. `games` - 劇本資料
3. `characters` - 角色卡資料
4. `magic_links` - Magic Link Token（短期儲存）

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

劇本資料，包含公開資訊、章節等。

**Phase 3 擴展**：加入 `publicInfo`（世界觀、前導故事、章節）

```typescript
interface Game {
  _id: ObjectId;
  gmUserId: ObjectId;                // 關聯到 gm_users._id（Phase 2）
  name: string;                      // 劇本名稱（Phase 2）
  description: string;               // 劇本簡介（Phase 2）
  isActive: boolean;                  // 是否啟用（Phase 2）
  
  // Phase 3 擴展：公開資訊
  publicInfo?: {
    intro: string;                    // 前導故事
    worldSetting: string;             // 世界觀
    chapters: Array<{
      title: string;
      content: string;
      order: number;
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
```

#### 範例文件（Phase 3）

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "gmUserId": ObjectId("507f1f77bcf86cd799439011"),
  "name": "迷霧莊園",
  "description": "一場神秘的謀殺案即將展開...",
  "isActive": true,
  "publicInfo": {
    "intro": "1920年代，一座古老的莊園...",
    "worldSetting": "歐洲古典莊園，充滿神秘色彩",
    "chapters": [
      {
        "title": "序章：邀請函",
        "content": "你收到了一封神秘的邀請函...",
        "order": 1
      },
      {
        "title": "第一章：抵達",
        "content": "馬車緩緩駛入莊園...",
        "order": 2
      }
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
  pin?: string;                     // PIN 明文（4-6 位數字，僅 GM 可查看）
  
  // 公開資訊（PIN 解鎖後可見）- Phase 3
  publicInfo: {
    background: string;             // 角色背景
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
    gmNotes?: string;               // GM 筆記
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
    iconUrl?: string;               // 技能圖示
    
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
    "background": "莊園的女主人，優雅高貴...",
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

## 3. 關聯圖

```
gm_users (1) ──< (N) games
                        │
                        │ (1)
                        │
                        < (N) characters
```

- 一個 GM 可以有多個劇本
- 一個劇本可以有多個角色

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
- `pin`：當 `hasPinLock=true` 時必填，格式為 4-6 位數字（明文儲存）
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
└── MagicLink.ts
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

- **PIN 儲存方式**：採用明文儲存（4-6 位數字），僅 GM 可透過 Server Action 查看
  - **理由**：此系統為 LARP 遊戲輔助工具，PIN 主要用於防止玩家誤看其他角色卡，而非防止黑客攻擊
  - **安全措施**：玩家端 API 不會回傳 PIN，只有 GM 端 Server Action 可取得
- `wsChannelId` 格式統一為 `character-{ObjectId}`
- 所有日期使用 UTC 時區
- 圖片 URL 使用 Vercel Blob Storage

此文件將隨需求變更持續更新。

