# 專案結構規劃

## 版本：v1.2
## 更新日期：2025-01-XX（Phase 6.5 方案 A 完成）

---

## 1. 目錄結構總覽

```
larp-nexus/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth 路由群組
│   │   ├── login/                # GM 登入頁
│   │   └── verify/               # Email 驗證頁
│   ├── (gm)/                     # GM 端路由群組（需認證）
│   │   ├── dashboard/            # GM 主控台
│   │   ├── games/                # 劇本管理
│   │   │   ├── [gameId]/         # 單一劇本詳情（含角色列表）
│   │   │   │   └── characters/   # 角色編輯子路由
│   │   │   │       └── [characterId]/  # 單一角色編輯頁（Tab 佈局）
│   │   │   └── new/              # 建立新劇本
│   │   ├── profile/              # GM 個人設定
│   │   └── layout.tsx            # GM Layout（導航列）
│   ├── (player)/                 # 玩家端路由群組（無需認證）
│   │   └── c/                    # Character 角色卡
│   │       └── [characterId]/    # 角色卡詳情頁
│   ├── api/                      # API Routes
│   │   ├── auth/                 # 認證相關 API
│   │   │   ├── send-magic-link/  # 發送 Magic Link
│   │   │   ├── verify-token/     # 驗證 Token
│   │   │   └── logout/           # 登出
│   │   ├── games/                # 劇本 CRUD API
│   │   ├── characters/           # 角色 CRUD API
│   │   │   └── [id]/
│   │   │       ├── unlock/       # PIN 解鎖 API
│   │   │       └── route.ts      
│   │   ├── events/               # 事件推送 API
│   │   │   └── push/             # 推送事件
│   │   ├── upload/               # 圖片上傳 API
│   │   └── webhook/              # Webhook (Pusher auth)
│   ├── actions/                  # Server Actions
│   │   ├── auth.ts               # 認證相關 Actions
│   │   ├── games.ts              # 劇本管理 Actions
│   │   ├── characters.ts         # 角色管理 Actions
│   │   └── events.ts             # 事件相關 Actions
│   ├── layout.tsx                # Root Layout
│   ├── page.tsx                  # Landing Page
│   └── globals.css               # 全域樣式
│
├── components/                   # React 元件
│   ├── ui/                       # shadcn/ui 基礎元件
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   └── ...                   # 其他 UI 元件
│   ├── gm/                       # GM 端專用元件
│   │   ├── navigation.tsx        # GM 導航列
│   │   ├── create-game-button.tsx      # 建立劇本按鈕（Dialog）
│   │   ├── edit-game-button.tsx        # 編輯劇本按鈕（Dialog）
│   │   ├── delete-game-button.tsx      # 刪除劇本按鈕
│   │   ├── character-card.tsx          # 角色卡片（可點擊進入編輯）
│   │   ├── character-edit-form.tsx     # 角色編輯表單（用於編輯頁）
│   │   ├── create-character-button.tsx # 建立角色按鈕（Dialog）
│   │   ├── delete-character-button.tsx # 刪除角色按鈕
│   │   ├── upload-character-image-button.tsx  # 上傳角色圖片
│   │   ├── generate-qrcode-button.tsx  # 生成 QR Code
│   │   └── view-pin-button.tsx         # 檢視/編輯 PIN
│   ├── player/                   # 玩家端專用元件
│   │   ├── character-card.tsx    # 角色卡顯示
│   │   ├── pin-unlock.tsx        # PIN 解鎖介面
│   │   ├── event-notification.tsx# 事件通知
│   │   └── info-section.tsx      # 資訊區塊
│   └── shared/                   # 共用元件
│       ├── header.tsx            # 頁首
│       ├── footer.tsx            # 頁尾
│       ├── loading.tsx           # Loading 狀態
│       └── error-boundary.tsx    # 錯誤邊界
│
├── lib/                          # 工具函式與設定
│   ├── db/                       # 資料庫相關
│   │   ├── mongodb.ts            # MongoDB 連線
│   │   ├── models/               # Mongoose Models
│   │   │   ├── Game.ts           # 劇本模型
│   │   │   ├── Character.ts      # 角色模型
│   │   │   └── GMUser.ts         # GM 使用者模型
│   │   └── queries/              # 資料查詢邏輯
│   │       ├── games.ts          # 劇本查詢
│   │       ├── characters.ts     # 角色查詢
│   │       └── gm-users.ts       # GM 查詢
│   ├── auth/                     # 認證相關
│   │   ├── session.ts            # Session 管理
│   │   ├── magic-link.ts         # Magic Link 生成
│   │   └── middleware.ts         # Auth Middleware
│   ├── storage/                  # 儲存相關
│   │   ├── blob.ts               # Vercel Blob 設定
│   │   └── image-processor.ts    # 圖片處理
│   ├── websocket/                # WebSocket 相關
│   │   ├── pusher.ts             # Pusher 設定
│   │   └── events.ts             # 事件定義
│   ├── utils/                    # 工具函式
│   │   ├── cn.ts                 # className 合併
│   │   ├── hash.ts               # Hash 工具（保留供未來使用）
│   │   ├── qr-code.ts            # QR Code 生成
│   │   └── validators.ts         # 資料驗證
│   └── constants/                # 常數定義
│       ├── routes.ts             # 路由常數
│       ├── events.ts             # WebSocket 事件類型
│       └── config.ts             # 配置常數
│
├── types/                        # TypeScript 類型定義
│   ├── game.ts                   # 劇本相關類型
│   ├── character.ts              # 角色相關類型
│   ├── event.ts                  # 事件相關類型
│   ├── api.ts                    # API 相關類型
│   └── index.ts                  # 匯出所有類型
│
├── hooks/                        # Custom React Hooks
│   ├── use-auth.ts               # 認證狀態
│   ├── use-websocket.ts          # WebSocket 連線
│   ├── use-character.ts          # 角色資料
│   └── use-toast.ts              # Toast 通知
│
├── store/                        # Jotai 狀態管理
│   ├── auth.ts                   # 認證狀態
│   ├── game.ts                   # 劇本狀態
│   ├── character.ts              # 角色狀態
│   └── notification.ts           # 通知狀態
│
├── middleware.ts                 # Next.js Middleware
├── docs/                         # 文件目錄
│   ├── requirements/             # 需求文件
│   └── specs/                    # 規格文件
├── public/                       # 靜態資源
│   └── placeholder.png           # 預設頭像等
├── .env.example                  # 環境變數範例
├── .env.local                    # 本地環境變數（不上版控）
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── README.md
```

---

## 2. 路由設計

### 2.1 GM 端路由（需認證）

| 路徑 | 說明 | 頁面類型 |
|------|------|----------|
| `/auth/login` | GM 登入頁 | Public |
| `/auth/verify?token=xxx` | Email 驗證頁 | Public |
| `/dashboard` | GM 主控台（劇本總覽） | Protected |
| `/games` | 劇本列表頁 | Protected |
| `/games/[gameId]` | 劇本詳情頁（含角色列表） | Protected |
| `/games/[gameId]/characters/[characterId]` | 角色編輯頁（Tab 佈局：基本資訊/數值/道具/技能/任務） | Protected |
| `/profile` | GM 個人設定 | Protected |

**註**：
- 建立新劇本：透過 `/games` 頁面的 Dialog 建立
- 建立新角色：透過 `/games/[gameId]` 頁面的 Dialog 建立
- 編輯劇本：透過劇本詳情頁的 Dialog 編輯
- 編輯角色：點擊角色卡片進入獨立編輯頁面（支援 Tab 切換不同模組）

### 2.2 玩家端路由（公開）

| 路徑 | 說明 | 認證需求 |
|------|------|----------|
| `/g/[gameId]` | 世界觀公開頁（所有玩家可訪問） | 無 |
| `/c/[characterId]` | 角色卡檢視頁 | 無（可能需 PIN） |
| `/c/[characterId]?unlock=true` | 顯示 PIN 解鎖介面 | 無 |

### 2.3 API 路由

| 路徑 | 方法 | 說明 | 認證 |
|------|------|------|------|
| `/api/auth/send-magic-link` | POST | 發送 Magic Link | 無 |
| `/api/auth/verify-token` | POST | 驗證 Token | 無 |
| `/api/auth/logout` | POST | 登出 | GM |
| `/api/games` | GET | 取得劇本列表 | GM |
| `/api/games` | POST | 建立劇本 | GM |
| `/api/games/[id]` | GET/PUT/DELETE | 劇本 CRUD | GM |
| `/api/games/[id]/public` | GET | 取得劇本公開資訊（世界觀） | 公開 |
| `/api/characters` | POST | 建立角色 | GM |
| `/api/characters/[id]` | GET | 取得角色資訊 | 公開 |
| `/api/characters/[id]` | PUT/DELETE | 更新/刪除角色 | GM |
| `/api/characters/[id]/unlock` | POST | PIN 解鎖 | 公開 |
| `/api/events/push` | POST | 推送事件 | GM |
| `/api/upload` | POST | 上傳圖片 | GM |
| `/api/webhook/pusher-auth` | POST | Pusher 認證 | 公開 |

---

## 3. 元件架構設計原則

### 3.1 元件分層

```
1. Page Components (app/**/page.tsx)
   ├─ 負責資料獲取（Server Component）
   └─ 傳遞資料給 Feature Components

2. Feature Components (components/gm/, components/player/)
   ├─ 商業邏輯元件
   ├─ 使用 Client Component（use client）
   └─ 組合多個 UI Components

3. UI Components (components/ui/)
   ├─ 純展示元件
   ├─ shadcn/ui 元件
   └─ 可複用、無業務邏輯

4. Shared Components (components/shared/)
   └─ 跨 GM/Player 共用的元件
```

### 3.2 資料流

```
Server Component (Page)
    ↓ (fetch data)
Database / API
    ↓ (pass as props)
Client Component (Feature)
    ↓ (state management)
Jotai Store / React State
    ↓ (render)
UI Components
```

### 3.3 狀態管理策略

- **Server State**：使用 Server Components + Server Actions
- **Client State**：使用 Jotai atoms
- **URL State**：使用 Next.js `useSearchParams` / `useRouter`
- **Form State**：使用 React Hook Form（需安裝）

---

## 4. 命名規範

### 4.1 檔案命名

- **Page/Route**：`page.tsx`, `layout.tsx`, `route.ts`
- **元件**：`kebab-case.tsx` (例：`character-form.tsx`)
- **Utils/Lib**：`kebab-case.ts` (例：`image-processor.ts`)
- **Types**：`camelCase.ts` (例：`character.ts`)
- **Constants**：大寫 SNAKE_CASE 變數，檔案 kebab-case

### 4.2 元件命名

- **React Component**：`PascalCase` (例：`CharacterForm`)
- **Hook**：`use-xxx` (例：`use-auth.ts`, `useAuth`)
- **Action**：動詞開頭 (例：`createGame`, `deleteCharacter`)

### 4.3 資料庫命名

- **Collection**：複數小寫 (例：`games`, `characters`, `gm_users`)
- **Field**：camelCase (例：`displayName`, `hasPinLock`)

---

## 5. 開發階段劃分

> ⚠️ **重要提醒**：開始開發前，請先完成 [外部設定檢查清單](./10_EXTERNAL_SETUP_CHECKLIST.md) 中的必要項目。

### Phase 1：基礎架構（Week 1）

#### 前置作業（⚠️ 需外部設定）
- [ ] MongoDB Atlas 設定（參考 `10_EXTERNAL_SETUP_CHECKLIST.md`）
- [ ] GitHub Repository 建立與分支設定
- [ ] 本地開發環境安裝（Node.js, pnpm, Git）
- [ ] `.env.local` 建立與環境變數配置

#### 開發任務
- [ ] 套件安裝與 shadcn/ui 初始化
- [ ] 資料庫連線設定（Mongoose Models）
- [ ] 認證系統實作
- [ ] 基礎 UI 元件建立

### Phase 2：GM 端核心功能（Week 2-3）

#### 前置作業（⚠️ 需外部設定）
- [ ] Resend 設定（Email 服務，實作登入功能時）
- [ ] Vercel Blob 啟用（圖片上傳功能時）

#### 開發任務
- [ ] 劇本 CRUD
- [ ] 角色卡 CRUD
- [ ] 圖片上傳（整合 Vercel Blob）
- [ ] QR Code 生成

### Phase 3：玩家端基礎功能（Week 4）

#### 開發任務
- [ ] 擴展 Character 模型：加入 `publicInfo`（背景、性格、關係）
- [ ] 擴展 Game 模型：加入 `publicInfo`（世界觀、前導故事、章節）
- [ ] 角色卡顯示（PublicInfo、任務、道具）
- [ ] PIN 解鎖功能
- [ ] Tab 切換功能（資訊、任務、道具、世界觀）
- [ ] 世界觀資訊顯示
- [ ] 響應式設計優化（Mobile First）

**注意**：
- SecretInfo 模組延後至 Phase 3.5
- 數值系統延後至 Phase 4
- 技能系統延後至 Phase 5
- WebSocket 即時更新延後至 Phase 6

### Phase 3.5：隱藏資訊模組（Week 4-5）

#### 開發任務
- [ ] 擴展 Character 模型：加入 `secretInfo.secrets` 陣列
  - 每個隱藏資訊包含：`id`, `title`, `content`, `isRevealed`, `revealCondition`, `revealedAt`
- [ ] GM 端：隱藏資訊編輯功能
  - 卡片式設計，支援新增/編輯/刪除多個隱藏資訊
  - 每個隱藏資訊獨立設定揭露條件與揭露狀態
  - Toggle 開關明確顯示「已揭露」/「未揭露」狀態
- [ ] GM 端：控制隱藏資訊揭露
  - 獨立控制每個隱藏資訊的 `isRevealed` 狀態
  - 當 `isRevealed` 從 `false` 變為 `true` 時，自動設定 `revealedAt`
- [ ] 玩家端：顯示已揭露的隱藏資訊
  - **完全隱藏原則**：未揭露的隱藏資訊完全不顯示（包括鎖定提示）
  - 只顯示 `isRevealed === true` 的隱藏資訊
  - 以卡片形式展示，點擊後顯示 Dialog
- [ ] 玩家端：閱讀狀態追蹤
  - 使用 `localStorage` 儲存已閱讀的隱藏資訊 ID
  - 未讀的隱藏資訊顯示「未讀」標籤
  - 點擊後自動標記為已閱讀

### Phase 4：數值系統（Week 5-6）

#### 開發任務
- [x] 擴展 Character 模型：加入 `stats`（自訂數值欄位）
- [x] GM 端：定義數值欄位（名稱、初始值）
- [x] GM 端：編輯角色數值
- [x] 玩家端：顯示數值
- [x] API：數值增減功能

### Phase 4.5：任務與道具管理（Week 6）

#### 開發任務 - 任務系統

- [x] 擴展 Character 模型：更新 `tasks` 結構
  - 新增隱藏目標機制（`isHidden`, `isRevealed`, `revealedAt`）
  - 新增完成狀態（`status`, `completedAt`）
  - 新增 GM 專用欄位（`gmNotes`, `revealCondition`）
- [x] GM 端：任務管理 Tab
  - 新增/編輯/刪除任務
  - 設定任務為隱藏目標
  - 控制隱藏目標揭露狀態
  - 更新任務完成狀態（待處理 → 進行中 → 已完成/失敗）
- [x] 玩家端：任務顯示
  - 卡片式陳列（一般目標 + 已揭露的隱藏目標）
  - 點擊以 Dialog 顯示詳細內容
  - 完成/失敗狀態視覺呈現
- [x] Server Actions：任務 CRUD + 狀態更新

#### 開發任務 - 道具系統

- [x] 擴展 Character 模型：更新 `items` 結構
  - 道具類型（`type`: 消耗品/非消耗品）
  - 數量系統（`quantity`）
  - 使用效果（`effect`）
  - 使用限制（`usageLimit`, `usageCount`）- GM 可選擇啟用
  - 冷卻系統（`cooldown`, `lastUsedAt`）- GM 可選擇啟用
  - 流通性（`isTransferable`）
- [x] GM 端：道具管理 Tab
  - 新增/編輯/刪除道具
  - 設定道具類型與效果
  - 可選：設定使用次數限制
  - 可選：設定冷卻時間
  - 上傳道具圖片（預留）
- [x] 玩家端：道具使用介面
  - 道具卡片顯示（含數量、剩餘使用次數、冷卻狀態）
  - 使用道具功能（含冷卻/次數限制檢查）
  - 轉移道具功能（交易/給予）
- [x] Server Actions：道具 CRUD + 使用 + 轉移
  - 使用前檢查：冷卻時間、使用次數、數量

**技能整合預留**：
- 道具效果可觸發數值變化（與 stats 整合）
- 道具轉移/偷竊可由技能觸發（Phase 5 擴展）
- 任務完成可觸發獎勵（Phase 5 擴展）

### Phase 5：技能系統（Week 7-8）✅ 已完成

#### 已實作功能
- [x] 擴展 Character 模型：加入 `skills` 陣列
  - 技能基本資訊（`id`, `name`, `description`, `iconUrl`）
  - 檢定系統（`checkType`: `none` | `contest` | `random`）
  - 隨機檢定設定（`randomConfig`: `maxValue`, `threshold`）
  - 對抗檢定設定（`contestConfig`: `relatedStat`, `opponentMaxItems`, `opponentMaxSkills`, `tieResolution`）- 資料結構已建立，邏輯待 Phase 6.5 實作
  - 使用限制（`usageLimit`, `usageCount`）- GM 可選擇啟用
  - 冷卻系統（`cooldown`, `lastUsedAt`）- GM 可選擇啟用
  - 效果定義（`effects`: 可影響 stats、tasks）
- [x] GM 端：技能管理 Tab
  - 定義技能（名稱、描述、圖示）
  - 設定檢定類型與配置
  - 可選：設定使用次數限制
  - 可選：設定冷卻時間
  - 設定技能效果（數值變化、任務觸發、自訂效果）
  - 為角色分配技能
- [x] 玩家端：技能使用介面
  - 技能列表顯示（含剩餘使用次數、冷卻狀態）
  - 使用技能（含冷卻/次數限制檢查 + 隨機檢定流程）
  - 檢定結果顯示
- [x] Server Actions：技能 CRUD + 使用技能
  - 使用前檢查：冷卻時間、使用次數
  - 隨機檢定執行
  - 效果執行（影響自己的數值、任務）

**已實作的系統整合**：
- [x] 技能可影響 `stats`（增減數值，支援修改目前值或最大值）
- [x] 技能可觸發 `tasks`（揭露隱藏目標、標記完成）
- [x] 技能檢定可基於 `stats` 數值（隨機檢定）

**未實作功能（延後至 Phase 6.5 / Phase 7）**：
- [ ] 對抗檢定系統（`contest` checkType 的邏輯實作）- 延後至 Phase 7
- [x] 影響他人的技能效果（`stat_change` with `targetCharacterId`）- Phase 6.5 方案 A 已完成
- [ ] 影響他人的道具效果（`item_give`、`item_take`、`item_steal`）- 延後至 Phase 7（方案 B）

### Phase 6：WebSocket 即時同步（Week 8-9）

#### 前置作業（⚠️ 需外部設定）
- [ ] Pusher 設定（WebSocket 服務）

#### 開發任務

##### 1. WebSocket 基礎架構
- [ ] Pusher SDK 整合
  - [ ] 安裝 `pusher-js`（前端）
  - [ ] 安裝 `pusher`（後端）
- [ ] 頻道訂閱機制
  - [ ] 角色專屬頻道（`private-character-{characterId}`）
  - [ ] 劇本廣播頻道（`private-game-{gameId}`）
- [ ] Pusher Auth Endpoint
  - [ ] 實作 `/api/webhook/pusher-auth`
  - [ ] 驗證頻道存取權限

##### 2. 基礎即時事件推送
- [ ] 角色更新事件（`role.updated`）
- [ ] 數值變化事件（`stat.changed`）
- [ ] 道具變化事件（`item.changed`）
- [ ] 任務更新事件（`task.updated`）

##### 3. 技能相關即時事件
- [ ] 技能使用事件（`skill.used`）
- [ ] 技能冷卻更新事件（`skill.cooldown`）

##### 4. 前端即時更新整合
- [ ] 玩家端：WebSocket Hook（`useWebSocket`）
- [ ] 訂閱角色專屬頻道
- [ ] 即時更新 UI 狀態（數值、道具、任務、技能）
- [ ] 即時通知（Toast）顯示

##### 5. GM 端事件推送功能
- [ ] 擴展現有 `pushEvent` Server Action
- [ ] 整合 Pusher 推送
- [ ] GM 端：事件推送介面

##### 6. 錯誤處理與重連機制
- [ ] WebSocket 連線狀態管理
- [ ] 自動重連機制
- [ ] 離線狀態提示

##### 7. 玩家端通知紀錄（不顯示來源）
- [ ] 建立「通知紀錄」UI（角色頁內面板/抽屜）
- [ ] 事件來源：`role.updated` / `role.taskUpdated` / `role.inventoryUpdated` / `skill.used` / `item.transferred` 等
- [ ] 條目內容：事件類型、簡述、時間戳，不顯示觸發者
- [ ] 儲存策略：前端狀態（可選 localStorage 緩存），保留最近 N 筆
- [ ] UX：新事件抵達時顯示徽章或輕提示；點擊開啟紀錄面板
- [ ] 未讀提示：新事件進來時顯示紅點/未讀數，開啟面板後清除未讀

### Phase 6.5：互動型技能系統（影響他人）（Week 9-10）

> **實作範圍說明**：本階段分為方案 A（簡化版）和方案 B（完整版）
> - **方案 A（本次實作）**：基礎跨角色效果，不包含對抗檢定與防守互動
> - **方案 B（延後）**：完整對抗檢定系統與道具互動效果

#### 開發任務（方案 A：簡化版）

##### 1. 資料結構擴展
- [x] 擴展技能/道具效果定義
  - [x] 新增 `targetType`: `'self'` | `'other'` | `'any'`（GM 設定目標類型）
  - [x] 新增 `requiresTarget`: `boolean`（是否需要選擇目標角色）
  - [x] `targetCharacterId` 在執行時由玩家選擇，不在定義時設定

##### 2. GM 端：技能/道具編輯表單擴展
- [x] 技能編輯：目標設定
  - [x] 新增「目標對象」選項：自己 / 其他玩家 / 任一名玩家
  - [x] 根據選擇自動設定 `targetType` 和 `requiresTarget`
  - [x] UI 提示：影響範圍說明
- [x] 道具編輯：目標設定（同技能）
  - [x] 新增「目標對象」選項
  - [x] 數值變化效果可選擇目標

##### 3. 玩家端：目標選擇介面
- [x] 技能使用時選擇目標
  - [x] 若 `requiresTarget = true`，顯示目標角色下拉選單
  - [x] 下拉選單顯示同劇本內的所有角色（排除/包含自己依 `targetType`）
  - [x] 必須選擇目標才能使用
- [x] 道具使用時選擇目標（同技能）
  - [x] 支援目標選擇的 UI
  - [x] 確認提示包含目標角色名稱

##### 4. Server Action：跨角色效果執行
- [x] 擴展 `useSkill` Server Action
  - [x] 新增參數：`targetCharacterId?: string`（選填，依 `requiresTarget` 決定）
  - [x] 驗證目標角色在同一劇本內
  - [x] 驗證目標類型符合設定（self/other/any）
  - [x] 執行跨角色資料修改（數值變化）
  - [x] 推送事件到目標角色頻道
- [x] 擴展 `useItem` Server Action（同上）
  - [x] 支援目標角色參數
  - [x] 跨角色道具效果執行

##### 5. WebSocket 事件推送
- [x] 跨角色影響事件（`character.affected`）
  - [x] 推送到目標角色頻道
  - [x] 包含：施放者名稱、技能/道具名稱、效果描述
  - [x] 目標角色收到通知與 UI 更新
- [x] 施放者確認事件（`skill.used` / `item.used`）
  - [x] 確認效果已作用於目標
  - [x] 顯示成功訊息

##### 6. 通知與 UI 回饋
- [x] 目標角色通知
  - [x] 顯示「XXX 對你使用了 YYY」
  - [x] 顯示具體效果（如「HP +5」）
  - [x] 記錄到通知面板
- [x] 施放者通知
  - [x] 顯示「已對 XXX 使用 YYY」
  - [x] 顯示效果是否成功

---

#### 延後功能（方案 B：完整版，預計 Phase 7）

##### 1. 對抗檢定系統（Contest Check）
- [ ] 實作對抗檢定邏輯
  - [ ] 新增參數：`opponentItems`、`opponentSkills`（防守方使用的道具/技能 ID 陣列）
  - [ ] 攻擊方：取得相關數值（`contestConfig.relatedStat`）
  - [ ] 防守方：可選擇使用道具/技能增強防禦
  - [ ] 計算對抗結果
  - [ ] 處理平手情況（`tieResolution`）
- [ ] 玩家端：對抗檢定 UI
  - [ ] 防守方收到對抗請求通知（WebSocket）
  - [ ] 防守方可選擇使用道具/技能
  - [ ] 顯示對抗結果（雙方）
- [ ] Server Action：對抗檢定流程
  - [ ] 驗證防守方使用的道具/技能是否可用
  - [ ] 執行對抗計算
  - [ ] 推送對抗結果事件（雙方角色頻道）

##### 2. 道具互動效果
- [ ] `item_give`：給予目標角色道具
- [ ] `item_take`：從目標角色移除道具
- [ ] `item_steal`：從目標角色偷竊道具（需對抗檢定）

##### 3. 防守互動機制
- [ ] 防守方回應 UI
- [ ] 道具/技能選擇介面
- [ ] 對抗檢定事件（`skill.contest`）

### Phase 7：戰鬥系統（對抗檢定的延伸）（Week 10-11）

#### 開發任務

##### 1. 戰鬥流程擴展
- [ ] 多輪對抗機制
- [ ] 戰鬥狀態追蹤
  - [ ] 擴展 Character 模型：加入 `combatStatus`（選用）

##### 2. 戰鬥 UI
- [ ] 玩家端：戰鬥介面
- [ ] GM 端：戰鬥管理

##### 3. 戰鬥相關技能效果
- [ ] 傷害計算
- [ ] 防禦減傷
- [ ] 狀態效果（暈眩、中毒等）

### Phase 8：遊戲狀態分層與歷史保留（Baseline / Runtime / Snapshot / Logs）（Week 11-12）

#### 目標
- 將設定階段（baseline）與遊戲進行中的狀態（runtime）分離，開始遊戲後所有變更落在 runtime，不影響 baseline。
- 支援「結束/重置」時保留當前狀態的 snapshot，並清空/重建 runtime，讓 GM 可繼續調整 baseline。
- 建立操作日誌（logs）以時間軸記錄：時間、操作者（GM/系統/角色）、動作、細節、gameId、characterId。

#### 資料模型
- baseline：沿用既有 `games` / `characters`。
- runtime：新增 collection（例如 `game_runtime` / `character_runtime`），`refId` 指向 baseline `_id`，存當前遊戲狀態。
- snapshot：可與 runtime 共用 collection（type/scope 區分）或獨立 `*_snapshots`，在結束/重置時存一版。
- logs：獨立 `logs` collection，索引 `gameId + timestamp`，可選 `characterId`。

#### 流程
- 開始遊戲（GM 按鈕）：從 baseline 建/覆蓋 runtime，標記 `isActive=true`，推送 WS `game.started`（或 reload）。
- 遊戲進行：所有變更寫入 runtime，WS 事件基於 runtime，logs 記錄每次變更。
- 結束/重置（GM 按鈕）：存 snapshot（終局），清空/重建 runtime（回到 baseline），標記 `isActive=false`，推送 WS `game.reset`/`game.ended`。

#### 前端
- 玩家/GM 遊戲中視圖讀 runtime，若未開始可讀 baseline 或提示「未開始」。
- GM 端新增「開始遊戲」「結束/重置」按鈕，顯示當前狀態。
- 可選：提供日志檢視（按時間軸）與終局 snapshot 檢視。

#### WS 事件
- `game.started`：提示重新讀 runtime。
- `game.reset` / `game.ended`：提示狀態已重置/結束。

#### 索引/安全
- runtime/snapshot/ logs 皆需 `gameId` 索引；必要時 `characterId` 索引。

### Phase 9：優化與測試（Week 12-13）

#### 前置作業（⚠️ 需外部設定，部署前）
- [ ] Vercel 帳號與專案設定
- [ ] Vercel 環境變數配置（Production / Preview / Development）
- [ ] （選用）自訂網域設定
- [ ] （選用）Sentry 設定（錯誤追蹤）
- [ ] （選用）Upstash Redis 設定（Rate Limiting）

#### 開發任務
- [ ] 效能優化
- [ ] 安全性檢查
- [ ] 測試與 Debug
- [ ] 部署至 Vercel Production

---

## 6. 注意事項

### 6.1 效能考量

- 使用 Next.js Image Component 優化圖片
- 實作 Loading 與 Skeleton UI
- 採用 Dynamic Import 減少初始載入
- Server Components 優先，Client Components 按需使用

### 6.2 安全性考量

- PIN 採用明文儲存（4-6 位數字，僅 GM 可查看，玩家端 API 不回傳）
- Magic Link Token 需設定過期時間
- API 需實作 Rate Limiting
- 圖片上傳需檢查檔案類型與大小

### 6.3 響應式設計

- 玩家端：Mobile First（320px+）
- GM 端：Desktop First（1024px+）
- Breakpoints：sm(640px), md(768px), lg(1024px), xl(1280px)

---

## 7. Git 分支策略

```
main (production)
  ├─ develop (staging)
      ├─ feature/auth
      ├─ feature/gm-dashboard
      ├─ feature/character-management
      ├─ feature/player-view
      └─ feature/websocket
```

---

## 附註

此文件將隨開發進度持續更新。任何結構性調整需更新此文件並通知團隊。

