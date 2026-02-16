# 專案結構規劃

## 版本：v1.5
## 更新日期：2026-02-17（Phase 9 已完成）

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
│   │   ├── webhook/              # Webhook (Pusher auth)
│   │   └── cron/                 # Cron Jobs (Phase 8, 9)
│   │       └── check-expired-effects/  # 定期檢查過期效果 & 清理 pending events
│   ├── actions/                  # Server Actions
│   │   ├── auth.ts               # 認證相關 Actions
│   │   ├── games.ts              # 劇本管理 Actions
│   │   ├── characters.ts         # 角色管理 Actions
│   │   ├── events.ts             # 事件相關 Actions
│   │   └── pending-events.ts     # Phase 9: 離線事件拉取
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
│   │   │   ├── GMUser.ts         # GM 使用者模型
│   │   │   ├── MagicLink.ts      # Magic Link 模型
│   │   │   └── PendingEvent.ts   # Phase 9: 離線事件佇列模型
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
│   │   ├── pusher-server.ts      # Pusher Server 設定
│   │   ├── events.ts             # 事件推送函式（Phase 9: 整合 pending events 寫入）
│   │   ├── pending-events.ts     # Phase 9: Pending events 寫入輔助函式
│   │   └── clean-pending-events.ts  # Phase 9: Pending events 清理函式
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
│   ├── use-character-websocket-handler.ts  # 角色 WebSocket 事件處理
│   ├── use-notification-system.ts  # 通知系統
│   ├── use-pending-events.ts     # Phase 9: 離線事件處理
│   ├── use-contest-handler.ts    # 對抗檢定處理
│   ├── use-contest-state.ts      # 對抗檢定狀態管理
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

**Phase 8 擴展：時效性效果卡片**
- [ ] GM 端：在角色數值 Tab 中新增「時效性效果」卡片
  - 顯示所有計時中的效果列表
  - 每個效果顯示：來源（技能/道具名稱、施放者）、目標數值、變化量、剩餘時間
  - 效果過期後自動從卡片移除
  - 支援多效果堆疊顯示

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

#### ✅ Phase 7：對抗檢定系統（已完成）

##### 1. 對抗檢定系統（Contest Check）
- [x] 實作對抗檢定邏輯
  - [x] 新增參數：`opponentItems`、`opponentSkills`（防守方使用的道具/技能 ID 陣列）
  - [x] 攻擊方：取得相關數值（`contestConfig.relatedStat`）
  - [x] 防守方：可選擇使用道具/技能增強防禦
  - [x] 計算對抗結果
  - [x] 處理平手情況（`tieResolution`）
- [x] 玩家端：對抗檢定 UI
  - [x] 防守方收到對抗請求通知（WebSocket）
  - [x] 防守方可選擇使用道具/技能
  - [x] 顯示對抗結果（雙方）
  - [x] 攻擊方等待狀態（持續顯示原本使用的技能或道具 dialog，**不應顯示全局等待 dialog**）
  - [x] 狀態持久化（重新整理後恢復技能或道具 dialog 的等待狀態）
  - [x] 跨分頁回應處理
- [x] Server Action：對抗檢定流程
  - [x] 驗證防守方使用的道具/技能是否可用
  - [x] 執行對抗計算
  - [x] 推送對抗結果事件（雙方角色頻道）
  - [x] `respondToContest` - 防守方回應對抗檢定
  - [x] `queryContestStatus` - 查詢對抗檢定狀態
  - [x] `selectTargetItemForContest` - 選擇目標道具
  - [x] `cancelContestItemSelection` - 取消對抗檢定

##### 2. 道具互動效果
- [ ] `item_give`：給予目標角色道具（未實作）
- [x] `item_take`：從目標角色移除道具 ✅ 已實作
- [x] `item_steal`：從目標角色偷竊道具（需對抗檢定）✅ 已實作

##### 3. 防守互動機制
- [x] 防守方回應 UI
- [x] 道具/技能選擇介面
- [x] 對抗檢定事件（`skill.contest`）

### Phase 7.6：標籤系統與檢定模式擴展（Week 10-11）✅ 已完成

#### 目標
- 新增技能與道具的標籤系統（"戰鬥"、"隱匿"）
- 調整對抗檢定邏輯：防守方成功時結算防守方效果
- 實作數值判定系統匹配機制
- 新增隨機對抗檢定模式

#### 開發任務

##### 1. 標籤系統實作
- [x] 資料模型擴展
  - [x] 擴展 `Skill` 和 `Item` 介面：新增 `tags?: string[]` 欄位
  - [x] 更新 MongoDB Schema：在技能和道具中新增 `tags` 陣列欄位
  - [x] 支援的標籤：`"combat"`（戰鬥）、`"stealth"`（隱匿）
- [x] GM 端標籤編輯 UI
  - [x] `skills-edit-form.tsx`：新增標籤選擇介面（複選框）
  - [x] `items-edit-form.tsx`：新增標籤選擇介面（複選框）
  - [x] 顯示標籤說明（"戰鬥"：可用於對抗檢定回應；"隱匿"：攻擊方姓名不出現在防守方訊息中）
- [x] 標籤驗證邏輯
  - [x] 攻擊方：只有標註 "戰鬥" 標籤的技能/道具才能發起對抗檢定
  - [x] 防守方：只有標註 "戰鬥" 標籤的技能/道具才能在回應中使用
  - [x] 更新 `lib/contest/contest-validator.ts`：驗證標籤

##### 2. 防守方效果結算調整
- [x] 修改對抗檢定結算邏輯
  - [x] 更新 `lib/contest/contest-effect-executor.ts`：防守方成功時只結算防守方的效果
  - [x] 更新 `app/actions/contest-respond.ts`：調整效果執行順序
  - [x] 攻擊方成功：結算攻擊方效果（現有邏輯）
  - [x] 防守方成功：結算防守方效果（新增邏輯）
- [x] 更新對抗檢定流程說明文件

##### 3. 數值判定系統匹配
- [x] 驗證規則實作
  - [x] 攻擊方和防守方必須使用相同的 `relatedStat`（數值名稱）
  - [x] 攻擊方和防守方必須使用相同的檢定類型（`contest` vs `random_contest`）
- [x] 防守方回應面板過濾邏輯
  - [x] 更新 `components/player/contest-response-dialog.tsx`：只顯示符合條件的技能/道具
  - [x] 過濾條件：
    - 必須有 "戰鬥" 標籤
    - `relatedStat` 必須與攻擊方相同
    - 檢定類型必須與攻擊方相同（`contest` 對 `contest`，`random_contest` 對 `random_contest`）
- [x] 更新驗證邏輯
  - [x] `lib/contest/contest-validator.ts`：驗證防守方選擇的技能/道具是否符合匹配規則

##### 4. 隱匿標籤實作
- [x] 修改通知訊息邏輯
  - [x] 更新 `lib/utils/event-mappers.ts`：`mapCharacterAffected` 函數根據 "隱匿" 標籤決定是否顯示攻擊方姓名
  - [x] 更新 `hooks/use-character-websocket-handler.ts`：`character.affected` 事件處理根據 "隱匿" 標籤決定 toast 訊息內容
- [x] 更新事件推送格式
  - [x] 更新 `lib/contest/contest-effect-executor.ts`：推送事件時根據 "隱匿" 標籤決定是否包含攻擊方資訊
  - [x] 更新 `types/event.ts`：`CharacterAffectedEvent` 類型說明
- [x] 規則說明
  - [x] 帶有 "隱匿" 標籤：攻擊方姓名不出現在防守方訊息中（現有行為）
  - [x] 不帶 "隱匿" 標籤：攻擊方姓名會出現在防守方訊息中（新增行為）
  - [x] 技能/道具名稱始終不出現在防守方訊息中（保持現有行為）

##### 5. 隨機對抗檢定實作
- [x] 資料模型擴展
  - [x] 擴展 `checkType`：新增 `'random_contest'` 選項
  - [x] 在 `Game` 模型中新增 `randomContestMaxValue?: number`（劇本共通的隨機對抗檢定上限值）
  - [x] 更新 `types/character.ts`：`checkType` 類型擴展
  - [x] 更新 MongoDB Schema
- [x] 業務邏輯實作
  - [x] `lib/skill/check-handler.ts`：新增 `random_contest` 處理邏輯
  - [x] `lib/item/check-handler.ts`：新增 `random_contest` 處理邏輯
  - [x] `lib/contest/contest-calculator.ts`：新增隨機對抗檢定的計算邏輯
    - [x] 攻擊方和防守方都骰 1 到 `game.randomContestMaxValue` 的隨機數
    - [x] 比拚雙方的大小決定勝負
    - [x] 平手處理：使用 `tieResolution` 機制
  - [x] `lib/contest/contest-validator.ts`：驗證防守方使用的檢定類型必須與攻擊方一致
- [x] UI 實作
  - [x] `components/gm/skills-edit-form.tsx`：新增 "隨機對抗檢定" 選項
  - [x] `components/gm/items-edit-form.tsx`：新增 "隨機對抗檢定" 選項
  - [x] `components/gm/game-edit-form.tsx`：新增 `randomContestMaxValue` 設定欄位
  - [x] `components/player/contest-response-dialog.tsx`：過濾只顯示相同檢定類型的技能/道具
  - [x] `components/player/skill-list.tsx`：隨機對抗檢定時的前端骰子 UI（顯示骰子結果）
  - [x] `components/player/item-list.tsx`：隨機對抗檢定時的前端骰子 UI（顯示骰子結果）
- [x] 文件更新
  - [x] 更新 API 規格：新增 `random_contest` 檢定類型說明
  - [x] 更新 WebSocket 事件規格：更新 `skill.contest` 事件格式

#### 注意事項
- 標籤系統設計為 `tags: string[]`，支援多標籤，未來可擴展其他標籤
- 攻擊方也需要 "戰鬥" 標籤才能發起對抗檢定
- 隨機對抗檢定的上限值設定為劇本共通變數，避免攻擊方和防守方上限不一致的問題
- 防守方成功時只結算防守方的效果，不結算攻擊方的效果

### Phase 7.7：自動揭露條件 + 道具展示功能

> 詳細規格：`docs/specs/SPEC-auto-reveal-item-showcase-2026-02-09.md`

#### 開發任務

##### A. 資料模型與類型定義
- [x] 新增 `AutoRevealConditionType`、`AutoRevealCondition`（含 `matchLogic` AND/OR）、`ViewedItem` 類型（`types/character.ts`）
- [x] 擴展 `Secret` 介面：新增 `autoRevealCondition` 欄位
- [x] 擴展 `Task` 介面：新增 `autoRevealCondition` 欄位
- [x] 擴展 Character Schema：Secret/Task 新增 `autoRevealCondition` 子文檔（`lib/db/models/Character.ts`）
- [x] 擴展 Character Schema：新增 `viewedItems` 陣列欄位
- [x] 新增事件類型：`SecretRevealedEvent`、`TaskRevealedEvent`、`ItemShowcasedEvent`（`types/event.ts`）

##### B. 自動揭露條件評估引擎
- [x] 建立 `lib/reveal/auto-reveal-evaluator.ts`：條件評估與連鎖揭露邏輯
- [x] 建立 `lib/reveal/reveal-event-emitter.ts`：揭露事件與展示事件發送

##### C. 道具展示與檢視記錄 Server Action
- [x] 建立 `app/actions/item-showcase.ts`：`showcaseItem()` + `recordItemView()` 功能實作
- [x] 新增 `app/actions/games.ts`：`getGameItems()` 輔助函數

##### D. 整合自動揭露到既有流程
- [x] 道具轉移後觸發揭露評估（`app/actions/item-use.ts` 等）
- [x] GM 新增/更新道具後觸發揭露評估（`app/actions/character-update.ts`）
- [x] 對抗檢定 `item_steal`/`item_take` 後觸發揭露評估（`lib/contest/contest-effect-executor.ts`）
- [x] GM 手動揭露隱藏資訊後連鎖觸發隱藏目標揭露（`app/actions/character-update.ts`）

##### E. GM 端 UI — 揭露條件設定
- [x] 建立 `components/gm/auto-reveal-condition-editor.tsx`：通用條件編輯器
- [x] 修改 `components/gm/character-edit-form.tsx`：隱藏資訊新增條件設定 UI
- [x] 修改 `components/gm/tasks-edit-form.tsx`：隱藏目標新增條件設定 UI

##### F. GM 端條件健全性清理
- [x] 建立 `lib/reveal/condition-cleaner.ts`：清理已失效的條件引用
- [x] GM 切換分頁時觸發清理邏輯

##### G. 玩家端 — 道具展示 UI
- [x] 修改 `components/player/item-list.tsx`：新增「展示」按鈕 + 點開時呼叫 `recordItemView()`
- [x] 建立 `components/player/item-showcase-dialog.tsx`：唯讀道具 Dialog

##### H. 玩家端 — 事件處理與通知
- [x] 修改 `hooks/use-character-websocket-handler.ts`：處理新事件
- [x] 修改 `lib/utils/event-mappers.ts`：新增事件映射函數
- [x] 修改 `components/player/character-card-view.tsx`：管理展示 Dialog 狀態

##### I. 資料過濾與安全
- [x] 修改 `app/actions/character-update.ts`：支援 `autoRevealCondition` 儲存
- [x] 修改 `app/actions/public.ts`：過濾 `autoRevealCondition`、`viewedItems` 等 GM 專用欄位

##### J. 文件更新
- [x] 更新 API 規格：新增 `showcaseItem`、`getGameItems` 說明
- [x] 更新 WebSocket 事件規格：新增 `secret.revealed`、`task.revealed`、`item.showcased`
- [x] 更新進度追蹤文件

#### 注意事項
- 自動揭露條件為**可選功能**，不影響既有 GM 手動揭露流程
- 道具匹配以**道具 ID**做判定，GM 在設定時選擇具體道具
- 連鎖揭露限制為 2 層：隱藏資訊 → 隱藏目標，不再深入
- 展示道具的 payload 僅包含基本資訊，不洩露效果/檢定等敏感設定
- 條件健全性清理在前端即時執行，儲存時持久化

---

### Phase 8：時效性效果系統（Week 11-12）

#### 開發任務

##### 1. 資料庫 Schema 擴展
- [ ] 擴展 Character 模型：新增 `temporaryEffects` 陣列
  - 效果唯一識別碼（`id`）
  - 來源資訊（`sourceType`, `sourceId`, `sourceCharacterId`, `sourceCharacterName`, `sourceName`）
  - 效果類型（`effectType`: `stat_change`）
  - 目標數值與變化量（`targetStat`, `deltaValue`, `deltaMax`, `statChangeTarget`）
  - 時間資訊（`appliedAt`, `expiresAt`, `duration`, `isExpired`）
- [ ] 擴展技能/道具效果定義：新增 `duration` 欄位（秒，undefined/0 = 永久效果）

##### 2. 後端實作
- [ ] 效果應用邏輯：執行 `stat_change` 效果時，若 `duration > 0`，建立時效性效果記錄
- [ ] 定時檢查機制：實作 API Route `/api/effects/check-expired`（建議使用 Vercel Cron Jobs，每分鐘執行）
- [ ] 自動恢復邏輯：過期效果自動恢復數值，標記為已過期
- [ ] Server Action：`checkExpiredEffects(characterId?)` - 檢查並處理過期效果
- [ ] Server Action：`getTemporaryEffects(characterId)` - 取得角色的所有時效性效果（GM 端用）

##### 3. WebSocket 事件
- [ ] 新增 `effect.expired` 事件：效果過期時推送到目標角色頻道
- [ ] 事件包含：效果資訊、恢復後的數值、來源資訊

##### 4. GM 端 UI
- [ ] 時效性效果卡片元件：`components/gm/temporary-effects-card.tsx`
  - 位置：角色編輯頁的「數值」Tab 中，位於數值列表下方
  - 顯示所有計時中的效果（`isExpired === false`）
  - 每個效果卡片顯示：
    - 來源資訊（技能/道具名稱、施放者名稱）
    - 目標數值與變化量（如「力量 +5」）
    - 剩餘時間倒數（即時更新）
  - 效果過期後自動從列表移除（透過 WebSocket 事件或定時刷新）
- [ ] 整合到角色編輯頁：在 `stats-edit-form.tsx` 中新增時效性效果卡片區塊

##### 5. 玩家端 UI
- [ ] 接收 `effect.expired` 事件，顯示效果過期通知
- [ ] 更新數值顯示（自動刷新）

##### 6. 效果堆疊處理
- [ ] 允許同一數值被多個時效性效果影響
- [ ] 每個效果獨立追蹤，結束時只恢復該效果的變化
- [ ] 數值計算：基礎值 + 所有生效效果的變化量總和

##### 7. 定時任務設定
- [ ] 設定 Vercel Cron Job（`vercel.json` 或 Vercel Dashboard）
  - 路徑：`/api/cron/check-expired-effects`
  - 頻率：每分鐘執行一次
  - 或使用 Next.js API Route + 外部 Cron 服務（如 cron-job.org）

#### 技術細節
- **計時機制**：後端計時（伺服器端），前端顯示倒數
- **效果類型**：Phase 1 僅支援 `stat_change`，其他效果類型後續擴展
- **效果堆疊**：允許堆疊，每個效果獨立追蹤
- **檢查頻率**：建議每分鐘檢查一次過期效果

---

### Phase 9：離線事件佇列系統（Week 12）

#### 目標
- 解決玩家離線時漏接 WebSocket 事件的問題（瀏覽器關閉、手機休眠等）
- 實作 Server-side 事件佇列，所有 WebSocket 事件產生時同步寫入 DB
- 玩家上線（頁面載入）時拉取未送達的事件，逐一顯示通知
- 確保對抗檢定等關鍵互動不會因離線而卡住

#### 資料模型
- 新增 `pending_events` collection（或嵌入 Character document）
- 欄位：`id`, `targetCharacterId`, `eventType`, `eventPayload`, `createdAt`, `isDelivered`, `deliveredAt`, `expiresAt`
- 事件保留 24 小時，拉取後標記為已送達，定期清理已過期/已送達的記錄

#### 開發任務

##### 1. 資料模型與 Schema
- [ ] 設計 `PendingEvent` TypeScript 介面
- [ ] 建立 Mongoose Schema（`pending_events` collection 或 Character 嵌入陣列）
- [ ] 建立索引：`targetCharacterId + isDelivered + expiresAt`

##### 2. 事件寫入
- [ ] 修改 `lib/websocket/events.ts` 所有 `emitXXX()` 函式：推送 WebSocket 的同時寫入 pending_events
- [ ] 覆蓋所有事件類型：`role.updated`, `skill.contest`, `character.affected`, `item.transferred`, `role.inventoryUpdated`, `secret.revealed`, `task.revealed`, `item.showcased`, `role.message`, `game.broadcast`, `effect.expired`

##### 3. 事件拉取與送達
- [ ] 建立 Server Action `fetchPendingEvents(characterId)`：查詢未送達事件，標記為已送達，回傳事件列表
- [ ] 修改 `getPublicCharacter()` 或玩家端頁面載入流程：觸發 `fetchPendingEvents()`
- [ ] 前端收到 pending events 後逐一處理（顯示通知、開啟 dialog 等）

##### 4. 定期清理
- [ ] 擴展 Cron Job：清除超過 24 小時的已送達/已過期事件
- [ ] 可與 Phase 8 的 `check-expired-effects` Cron 合併

##### 5. 前端整合
- [ ] 玩家端頁面載入時拉取 pending events，逐一還原為通知
- [ ] 對抗檢定 pending event：自動開啟 ContestResponseDialog
- [ ] 道具展示 pending event：自動開啟唯讀 Dialog

#### 技術細節
- **寫入時機**：在 `emitXXX()` 函式中同步寫入，確保與 WebSocket 推送一致
- **拉取後清空**：`fetchPendingEvents()` 使用原子操作標記 `isDelivered = true`，避免重複拉取
- **逐一顯示**：前端收到 pending events 後按 `createdAt` 排序，逐一觸發通知
- **與 Phase 8 共用觸發點**：頁面載入時同時觸發 `checkExpiredEffects()` 和 `fetchPendingEvents()`

---

### Phase 10：遊戲狀態分層與歷史保留（Baseline / Runtime / Snapshot / Logs）（Week 13-14）

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

### Phase 11：優化與測試（Week 14-15）

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

