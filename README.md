# LARP Nexus

LARP（實境角色扮演遊戲）角色卡管理系統。提供 GM（遊戲主持人）建立劇本、管理角色，以及玩家即時查看角色卡、使用技能與道具的完整功能。

## 功能概覽

- **GM 端**：建立劇本、設計角色（數值/技能/道具/秘密資訊）、即時推送事件、管理遊戲進行
- **玩家端**：透過 PIN 碼解鎖角色卡、查看角色資訊、使用技能與道具、即時接收通知
- **即時同步**：WebSocket 驅動的即時通訊，GM 操作與玩家互動即時反映
- **對抗檢定**：支援玩家間的對抗互動（偷竊、攻擊等），含攻防雙方回應機制
- **時效性效果**：數值增減可設定持續時間，到期自動恢復

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

各服務的詳細設定步驟請參考 [環境變數文件](docs/specs/07_ENVIRONMENT_VARIABLES.md) 和 [外部設定檢查清單](docs/specs/10_EXTERNAL_SETUP_CHECKLIST.md)。

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

## 專案結構

```
app/                  # Next.js App Router
  ├── (auth)/         #   認證頁面（Magic Link 登入）
  ├── (gm)/           #   GM 端頁面（劇本/角色管理）
  ├── c/              #   玩家端角色卡頁面
  ├── api/            #   API Routes
  └── actions/        #   Server Actions
components/           # React 元件
  ├── gm/             #   GM 端元件
  ├── player/         #   玩家端元件
  └── ui/             #   shadcn/ui 基礎元件
lib/                  # 核心邏輯
  ├── db/models/      #   MongoDB Models
  ├── auth/           #   認證（session、magic link）
  ├── contest/        #   對抗檢定系統
  ├── skill/          #   技能系統
  ├── item/           #   道具系統
  ├── effects/        #   時效性效果系統
  └── websocket/      #   WebSocket（Pusher）
types/                # TypeScript 型別定義
hooks/                # Custom React Hooks
docs/                 # 文件
  ├── specs/          #   技術規格
  └── dev-notes/      #   開發筆記
```

## 文件

- [使用指南](docs/USER_GUIDE.md) — GM 與玩家的操作說明
- [技術規格總覽](docs/README.md) — 開發者文件導覽
- [環境變數](docs/specs/07_ENVIRONMENT_VARIABLES.md) — 完整環境變數說明
- [API 規格](docs/specs/03_API_SPECIFICATION.md) — Server Actions 與 API Routes
- [WebSocket 事件](docs/specs/04_WEBSOCKET_EVENTS.md) — 即時通訊事件格式

## 授權

本專案採用自訂非商業授權。允許個人使用、教育用途、非營利組織使用，以及私人 LARP 活動使用。禁止商業用途（販售、SaaS、營利產品整合）。

詳見 [LICENSE](LICENSE)。
