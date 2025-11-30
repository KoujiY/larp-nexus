# LARP Nexus - 開發文件總覽

## 專案資訊

- **專案名稱**：LARP Nexus
- **版本**：v1.0 (MVP)
- **更新日期**：2025-11-29
- **專案類型**：LARP GM/玩家輔助系統

---

## 文件導覽

### 需求文件

1. **[PRD（產品需求文件）](./requirements/LARP_NEXUS_PRD.md)**
   - 產品目的與使用者角色
   - 功能規格
   - 技術架構概要
   - MVP 版本功能

---

### 技術規格文件

本專案的完整技術規格位於 `docs/specs/` 目錄：

#### 01. [專案結構規劃](./specs/01_PROJECT_STRUCTURE.md)
- 目錄結構設計
- 路由規劃（GM 端、玩家端）
- 元件架構原則
- 命名規範
- 開發階段劃分

#### 02. [資料庫 Schema 設計](./specs/02_DATABASE_SCHEMA.md)
- MongoDB Collections 定義
- 資料模型（GMUser, Game, Character, MagicLink）
- 索引設計
- 資料驗證規則
- Mongoose Schema 實作指引

#### 03. [API 規格文件](./specs/03_API_SPECIFICATION.md)
- Server Actions 規格（認證、劇本、角色、事件）
- API Routes 規格（玩家端、圖片上傳、WebSocket 認證）
- 錯誤處理規範
- 認證與授權機制
- Rate Limiting 策略

#### 04. [WebSocket 事件格式](./specs/04_WEBSOCKET_EVENTS.md)
- Pusher 配置
- 事件類型定義（role.updated, game.broadcast, 等）
- 前端實作指引
- 後端推送實作
- 事件優先級與 QoS

#### 05. [GM 端頁面架構](./specs/05_GM_PAGES_ARCHITECTURE.md)
- 頁面設計（登入、Dashboard、劇本管理、角色管理、事件推送）
- 元件組成與設計
- 狀態管理
- UX 設計原則

#### 06. [玩家端頁面架構](./specs/06_PLAYER_PAGES_ARCHITECTURE.md)
- 角色卡頁面設計
- PIN 解鎖機制
- WebSocket 整合
- 動畫效果
- 響應式設計

#### 07. [環境變數配置](./specs/07_ENVIRONMENT_VARIABLES.md)
- 必要環境變數（MongoDB, Pusher, Vercel Blob, Email）
- 選用環境變數
- 安全性建議
- 疑難排解

#### 08. [技術棧與套件清單](./specs/08_TECH_STACK.md)
- 核心技術棧
- 套件版本管理
- 安裝指令
- 相容性需求
- 套件選擇說明

#### 09. [部署架構與 CI/CD](./specs/09_DEPLOYMENT_CICD.md)
- 部署架構圖
- 雲端服務配置（Vercel, MongoDB Atlas, Pusher）
- CI/CD 流程
- 監控與日誌
- 成本估算

#### 10. [外部設定檢查清單](./specs/10_EXTERNAL_SETUP_CHECKLIST.md) ⚠️ **重要**
- Phase 1：基礎服務設定（MongoDB, GitHub, 本地環境）
- Phase 2：開發階段服務（Pusher, Resend）
- Phase 3：部署前設定（Vercel）
- Phase 4：生產環境優化（自訂網域, Sentry, Upstash）
- 詳細設定步驟與驗證方式

---

## 快速開始

> ⚠️ **重要**：開始開發前，請先完成 [外部設定檢查清單](./specs/10_EXTERNAL_SETUP_CHECKLIST.md) 中的必要項目。

### 1. 外部服務設定

在開始開發前，需要完成以下外部服務設定：

- [ ] MongoDB Atlas 設定
- [ ] GitHub Repository 建立
- [ ] 本地開發環境安裝（Node.js, pnpm, Git）
- [ ] Pusher 設定
- [ ] Resend 設定
- [ ] `.env.local` 建立與環境變數配置

**詳細步驟**：請參考 [外部設定檢查清單](./specs/10_EXTERNAL_SETUP_CHECKLIST.md)

### 2. 環境設定

```bash
# 安裝依賴
pnpm install

# 建立環境變數檔案（需手動建立）
# 參考 10_EXTERNAL_SETUP_CHECKLIST.md 中的完整範本
# 填入所有必要的 API 金鑰與連線字串
```

### 3. 開發

```bash
# 啟動開發伺服器
pnpm dev

# 開啟瀏覽器：http://localhost:3000
```

### 4. 建置

```bash
# 類型檢查
pnpm type-check

# Lint 檢查
pnpm lint

# 建置專案
pnpm build

# 啟動正式環境
pnpm start
```

---

## 專案架構概覽

```
larp-nexus/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 認證頁面（登入、驗證）
│   ├── (gm)/              # GM 端頁面
│   ├── (player)/          # 玩家端頁面
│   ├── api/               # API Routes
│   └── actions/           # Server Actions
├── components/            # React 元件
│   ├── ui/               # shadcn/ui 基礎元件
│   ├── gm/               # GM 端元件
│   ├── player/           # 玩家端元件
│   └── shared/           # 共用元件
├── lib/                  # 工具函式與設定
│   ├── db/              # 資料庫（MongoDB, Mongoose）
│   ├── auth/            # 認證邏輯
│   ├── storage/         # 圖片儲存
│   ├── websocket/       # WebSocket (Pusher)
│   └── utils/           # 工具函式
├── types/               # TypeScript 類型定義
├── hooks/               # Custom React Hooks
├── store/               # Jotai 狀態管理
└── docs/                # 文件目錄
    ├── requirements/    # 需求文件
    └── specs/           # 技術規格
```

---

## 技術棧

- **框架**：Next.js 16 (App Router)
- **語言**：TypeScript 5
- **資料庫**：MongoDB Atlas + Mongoose
- **UI**：Tailwind CSS + shadcn/ui
- **狀態管理**：Jotai
- **即時通訊**：Pusher
- **圖片儲存**：Vercel Blob
- **認證**：iron-session (Magic Link)
- **部署**：Vercel

詳細套件清單請參閱 [技術棧文件](./specs/08_TECH_STACK.md)。

---

## 開發指引

### 分支策略

```
main (production)
  └─ develop (staging)
      └─ feature/xxx (feature branches)
```

### Commit 規範

```
feat: 新增功能
fix: 修正 Bug
docs: 文件更新
style: 程式碼格式調整（不影響功能）
refactor: 重構
test: 測試相關
chore: 其他（建置、套件更新等）
```

### PR 流程

1. 建立 Feature Branch
2. 開發並測試
3. 建立 PR 至 `develop`
4. 通過 CI 檢查（ESLint, TypeScript, Build）
5. Code Review
6. Merge

---

## 測試策略

### 單元測試（未來實作）
- 使用 Vitest
- 測試 Server Actions 與 API Routes

### 整合測試（未來實作）
- 使用 Playwright
- 測試完整使用者流程

### E2E 測試（未來實作）
- 測試 GM 登入 → 建立劇本 → 建立角色 → 推送事件
- 測試玩家 PIN 解鎖 → 接收事件

---

## 部署流程

### 自動部署（推薦）

1. Merge PR 至 `main` 分支
2. Vercel 自動偵測並部署
3. 部署完成後檢查 Production

### 手動部署

```bash
vercel --prod
```

---

## 監控與日誌

- **Vercel Analytics**：流量與效能分析
- **Vercel Logs**：API Routes 與 Functions 日誌
- **Sentry**（選用）：錯誤追蹤

---

## 常見問題

### Q1：如何新增 shadcn/ui 元件？

```bash
npx shadcn@latest add [component-name]
```

### Q2：如何連線至 MongoDB？

確保 `.env.local` 包含正確的 `MONGODB_URI`，格式：

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
```

### Q3：Pusher WebSocket 無法連線？

檢查：
- `NEXT_PUBLIC_PUSHER_KEY` 與 `NEXT_PUBLIC_PUSHER_CLUSTER` 是否正確
- Pusher App 是否啟用
- 瀏覽器 Console 是否有錯誤訊息

---

## 貢獻指引

歡迎貢獻！請遵循以下步驟：

1. Fork 專案
2. 建立 Feature Branch
3. 開發並測試
4. 建立 PR
5. 等待 Code Review

---

## 授權

本專案為私有專案，未經授權不得使用。

---

## 聯絡方式

如有問題，請聯絡專案負責人。

---

## 更新日誌

### v1.0 (2025-11-29)
- 初始架構規劃
- 完成技術規格文件
- 專案結構設計

---

## 附註

- 所有文件需保持最新，變更時需同步更新
- 重大架構變更需經過團隊討論
- 定期 Review 文件完整性

**文件維護者**：SPEC AGENT
**最後更新**：2025-11-29
