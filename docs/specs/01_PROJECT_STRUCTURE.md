# 專案結構規劃

## 版本：v1.0
## 更新日期：2025-11-29

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
│   │   │   ├── [gameId]/         # 單一劇本詳情
│   │   │   │   ├── characters/   # 角色管理
│   │   │   │   ├── events/       # 事件推送
│   │   │   │   └── settings/     # 劇本設定
│   │   │   └── new/              # 建立新劇本
│   │   └── profile/              # GM 個人設定
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
│   │   ├── game-list.tsx         # 劇本列表
│   │   ├── game-form.tsx         # 劇本表單
│   │   ├── character-list.tsx    # 角色列表
│   │   ├── character-form.tsx    # 角色表單
│   │   ├── event-pusher.tsx      # 事件推送介面
│   │   └── qr-generator.tsx      # QR Code 生成器
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
│   │   ├── hash.ts               # PIN Hash
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
| `/login` | GM 登入頁 | Public |
| `/verify?token=xxx` | Email 驗證頁 | Public |
| `/dashboard` | GM 主控台（劇本總覽） | Protected |
| `/games/new` | 建立新劇本 | Protected |
| `/games/[gameId]` | 劇本詳情 Dashboard | Protected |
| `/games/[gameId]/characters` | 角色管理頁 | Protected |
| `/games/[gameId]/characters/new` | 建立新角色 | Protected |
| `/games/[gameId]/characters/[charId]` | 編輯角色 | Protected |
| `/games/[gameId]/events` | 事件推送介面 | Protected |
| `/games/[gameId]/settings` | 劇本設定 | Protected |
| `/profile` | GM 個人設定 | Protected |

### 2.2 玩家端路由（公開）

| 路徑 | 說明 | 認證需求 |
|------|------|----------|
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

### Phase 3：玩家端功能（Week 4）
- [ ] 角色卡顯示
- [ ] PIN 解鎖
- [ ] 響應式設計優化

### Phase 4：即時功能（Week 5）

#### 前置作業（⚠️ 需外部設定）
- [ ] Pusher 設定（WebSocket 服務）

#### 開發任務
- [ ] WebSocket 整合（Pusher SDK）
- [ ] 事件推送實作
- [ ] 即時更新功能

### Phase 5：優化與測試（Week 6）

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

- PIN 必須 hash 後儲存（bcrypt）
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

