# LARP Nexus

LARP（實境角色扮演遊戲）角色卡管理系統。提供 GM（遊戲主持人）建立劇本、管理角色，以及玩家即時查看角色卡、使用技能與物品的完整功能。

## 功能概覽

- **GM 端**：建立劇本、設計角色（數值/技能/物品/秘密資訊）、即時推送事件、管理遊戲進行
- **玩家端**：透過 PIN 碼解鎖角色卡、查看角色資訊、使用技能與物品、即時接收通知
- **即時同步**：WebSocket 驅動的即時通訊，GM 操作與玩家互動即時反映
- **對抗檢定**：支援玩家間的對抗互動（偷竊、攻擊等），含攻防雙方回應機制
- **裝備系統**：物品可設為裝備類型，穿戴後提供常駐數值加成
- **預設事件**：GM 預先設定多動作事件（廣播、數值調整、揭露資訊），遊戲中一鍵觸發
- **時效性效果**：數值增減可設定持續時間，到期自動恢復
- **自動揭露**：隱藏資訊與隱藏任務可設定條件（看過物品、獲得物品、連鎖揭露），滿足後自動解鎖

詳細功能說明請參閱 [LARP Nexus 使用指南](docs/USER_GUIDE.md)。

## 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 資料庫 | MongoDB Atlas + Mongoose |
| 即時通訊 | Pusher (WebSocket) |
| 圖片儲存 | Vercel Blob |
| 認證 | iron-session (Magic Link) |
| 部署 | Vercel |

## 本地開發

### 前置需求

- Node.js 18+
- npm / pnpm
- MongoDB Atlas 帳號（免費方案即可）
- Pusher 帳號（免費方案即可）
- Gmail 帳號（用於 Magic Link 寄信）

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

複製範本並填入實際數值：

```bash
cp .env.example .env.local
```

必要環境變數：

```bash
# 資料庫
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>

# 應用程式
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=            # openssl rand -base64 32

# Pusher（WebSocket）
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=ap3
NEXT_PUBLIC_PUSHER_KEY=    # 同 PUSHER_KEY
NEXT_PUBLIC_PUSHER_CLUSTER=ap3

# Vercel Blob（圖片上傳）
BLOB_READ_WRITE_TOKEN=

# Email（Gmail SMTP）
SMTP_USER=your@gmail.com
SMTP_PASS=                 # Gmail App Password（16碼）
```

各服務的詳細設定步驟請參考 [外部設定檢查清單](docs/specs/10_EXTERNAL_SETUP_CHECKLIST.md)。

### 3. 啟動開發伺服器

```bash
npm run dev
```

開啟 http://localhost:3000 即可使用。

### 4. 常用指令

```bash
npm run dev          # 開發伺服器
npm run build        # 生產環境建置
npm run lint         # ESLint 檢查
npm run type-check   # TypeScript 型別檢查
```

### 5. E2E 測試

E2E 測試使用 Playwright + mongodb-memory-server，完全離線可跑（不需要 Atlas、Pusher、SMTP）。

```bash
pnpm test:e2e              # 跑全部 E2E（smoke + flows）
pnpm test:e2e:smoke        # 只跑 smoke test
pnpm test:e2e:flows        # 只跑 flow test
pnpm test:e2e:headed       # 瀏覽器可視模式
pnpm test:e2e:debug        # Playwright Inspector debug 模式
pnpm test:e2e:ui           # Playwright UI 模式
```

首次執行需安裝 Playwright 瀏覽器與 mongod binary：

```bash
pnpm exec playwright install chromium
```

mongodb-memory-server 會在首次啟動時自動下載 mongod binary 並快取。

#### 常見問題排查

| 症狀 | 原因 | 解法 |
|------|------|------|
| webServer 啟動超時 | Next.js build 失敗或首次 webpack build 較慢 | 先跑 `E2E=1 pnpm exec next build --webpack` 確認 build 通過 |
| 找不到 mongod binary | 首次下載或 cache 失效 | 刪除 `~/.cache/mongodb-binaries` 讓它重新下載 |
| Chromium 找不到 | 未安裝 Playwright 瀏覽器 | `pnpm exec playwright install chromium` |
| Port 3100 被占用 | 上次 webServer 未正常關閉 | 結束占用 3100 的 process 或改用 `reuseExistingServer` |
| toast / DB 斷言超時 | Server action 尚未完成 | 增加 `expect.poll` 的 `timeout` 或檢查 server log |

詳細架構說明請參閱 [E2E 測試架構](docs/knowledge/architecture/e2e-testing.md)。

## 專案結構

```
app/                  # Next.js App Router
  ├── auth/           #   認證頁面（Magic Link 登入）
  ├── (gm)/           #   GM 端頁面（劇本/角色管理）
  ├── (player)/g/     #   玩家端世界觀頁面
  ├── c/              #   玩家端角色卡頁面
  ├── api/            #   API Routes
  └── actions/        #   Server Actions
components/           # React 元件
  ├── gm/             #   GM 端元件
  ├── player/         #   玩家端元件
  ├── shared/         #   共用元件
  └── ui/             #   shadcn/ui 基礎元件
lib/                  # 核心邏輯
  ├── db/             #   MongoDB Models & Schemas
  ├── auth/           #   認證（session、magic link）
  ├── contest/        #   對抗檢定系統
  ├── skill/          #   技能系統
  ├── item/           #   物品系統（含裝備加成）
  ├── effects/        #   時效性效果系統
  ├── preset-event/   #   預設事件系統
  └── websocket/      #   WebSocket（Pusher）
types/                # TypeScript 型別定義
hooks/                # Custom React Hooks
e2e/                  # E2E 測試（Playwright）
  ├── fixtures/       #   Custom fixtures
  ├── helpers/        #   共用 helper
  ├── smoke/          #   基礎設施 smoke test
  └── flows/          #   業務流程 integration test
docs/                 # 文件
  ├── specs/          #   技術規格
  ├── knowledge/      #   知識庫（原子化領域知識）
  └── archive/        #   歷史文件（唯讀參考）
```

## 文件

- [使用指南](docs/USER_GUIDE.md) — GM 與玩家的操作說明
- [技術規格總覽](docs/README.md) — 開發者文件導覽
- [API 規格](docs/specs/03_API_SPECIFICATION.md) — Server Actions 與 API Routes
- [WebSocket 事件](docs/specs/04_WEBSOCKET_EVENTS.md) — 即時通訊事件格式
- [E2E 測試架構](docs/knowledge/architecture/e2e-testing.md) — E2E 基礎設施與 Pusher stub 原理
- [外部設定檢查清單](docs/specs/10_EXTERNAL_SETUP_CHECKLIST.md) — 環境變數與外部服務設定

## 授權

本專案採用自訂非商業授權。允許個人使用、教育用途、非營利組織使用，以及私人 LARP 活動使用。禁止商業用途（販售、SaaS、營利產品整合）。

詳見 [LICENSE](LICENSE)。
