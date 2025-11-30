# 資料庫 Schema 設計

## 版本：v1.0
## 更新日期：2025-11-29
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

```typescript
interface Game {
  _id: ObjectId;
  gmId: ObjectId;                   // 關聯到 gm_users._id
  title: string;                    // 劇本標題
  description: string;              // 劇本簡介（公開）
  coverImage?: string;              // 封面圖片 URL（Vercel Blob）
  publicInfo: {
    intro: string;                  // 前導故事
    worldSetting: string;           // 世界觀
    chapters: Array<{
      title: string;
      content: string;
      order: number;
    }>;
  };
  status: 'draft' | 'active' | 'completed';  // 劇本狀態
  createdAt: Date;
  updatedAt: Date;
}
```

#### 索引

```javascript
db.games.createIndex({ gmId: 1 });
db.games.createIndex({ status: 1 });
db.games.createIndex({ createdAt: -1 });
```

#### 範例文件

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "gmId": ObjectId("507f1f77bcf86cd799439011"),
  "title": "迷霧莊園",
  "description": "一場神秘的謀殺案即將展開...",
  "coverImage": "https://xxx.vercel-storage.com/cover-xxx.jpg",
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
  "status": "active",
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
  pinHash?: string;                 // PIN 的 bcrypt hash（僅當 hasPinLock=true）
  
  // 公開資訊（無需解鎖）
  publicInfo: {
    background: string;             // 角色背景
    personality: string;            // 性格特徵
    relationships: Array<{
      targetName: string;           // 關係對象
      description: string;          // 關係描述
    }>;
  };
  
  // 秘密資訊（需解鎖或 GM 控制開放）
  secretInfo: {
    isUnlocked: boolean;            // 秘密區是否已解鎖
    secrets: Array<{
      title: string;
      content: string;
      revealedAt?: Date;            // 揭露時間（可選）
    }>;
    hiddenGoals: string;            // 隱藏目標
  };
  
  // 任務與物品
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed';
    createdAt: Date;
  }>;
  
  items: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    acquiredAt: Date;
  }>;
  
  // WebSocket 頻道 ID（用於推送事件）
  wsChannelId: string;              // 格式：character-{characterId}
  
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
  "pinHash": "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890",
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
- `pinHash`：當 `hasPinLock=true` 時必填
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

- PIN 必須使用 bcrypt hash（salt rounds = 10）
- `wsChannelId` 格式統一為 `character-{ObjectId}`
- 所有日期使用 UTC 時區
- 圖片 URL 使用 Vercel Blob Storage

此文件將隨需求變更持續更新。

