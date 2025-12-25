# LARP Nexus - 開發文件總覽

## 專案資訊

- **專案名稱**：LARP Nexus
- **版本**：v1.3 (MVP)
- **更新日期**：2025-01-XX（Phase 7 對抗檢定系統完成）
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
- Server Actions 規格（認證、劇本、角色、事件、技能）
- API Routes 規格（玩家端、圖片上傳、WebSocket 認證）
- 錯誤處理規範
- 認證與授權機制
- Rate Limiting 策略

#### 04. [WebSocket 事件格式](./specs/04_WEBSOCKET_EVENTS.md)
- Pusher 配置
- 事件類型定義（role.updated, game.broadcast, skill.used, skill.contest, 等）
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

### v1.4 (2025-01-XX) - Phase 7.6 需求規劃
- **需求變更**
  - ✅ 移除 Phase 7.5 戰鬥系統（變化過大，難以收斂）
  - ✅ 新增 Phase 7.6：標籤系統與檢定模式擴展
- **Phase 7.6 規劃**
  - 📋 標籤系統（"戰鬥"、"隱匿"）
  - 📋 防守方效果結算調整
  - 📋 數值判定系統匹配機制
  - 📋 隨機對抗檢定模式

### v1.3 (2025-01-XX) - Phase 7 對抗檢定系統完成
- **Phase 7 對抗檢定系統實作完成**
  - ✅ 技能/道具對抗檢定類型設定
  - ✅ 對抗檢定配置（相關數值、對手限制、平手裁決）
  - ✅ 攻擊方數值計算與等待機制
  - ✅ 防守方回應系統（可選擇道具/技能）
  - ✅ 對抗結果計算與處理
  - ✅ 道具互動效果（`item_take`, `item_steal`）
  - ✅ 目標道具選擇機制
  - ✅ 狀態持久化（localStorage，重新整理後恢復）
  - ✅ 跨分頁回應處理（無論在哪個分頁都能接收回應並開啟對應面板）
- **WebSocket 事件擴展**
  - ✅ `skill.contest` 事件（請求與結果）
  - ✅ 攻擊方/防守方事件區分
  - ✅ 對抗檢定結果推送（雙方角色頻道）
- **UI/UX 優化**
  - ✅ 對抗檢定進行中狀態顯示
  - ✅ Dialog 鎖定機制（對抗檢定進行中無法關閉）
  - ✅ 等待狀態提示
  - ✅ 結果通知顯示
  - ✅ 通知去重機制
- **狀態管理優化**
  - ✅ 對抗檢定狀態持久化（攻擊方/防守方）
  - ✅ 目標道具選擇狀態持久化
  - ✅ 對抗檢定狀態查詢機制（處理重新整理後無法收到 WebSocket 事件的情況）

### v1.2 (2025-01-XX) - Phase 6.5 方案 A 完成
- **Phase 6.5 互動型技能系統（方案 A）實作完成**
  - ✅ 新增跨角色效果功能實作
  - ✅ GM 可設定目標對象類型（自己/其他玩家/任一名玩家）
  - ✅ 玩家使用時可選擇目標角色（下拉選單）
  - ✅ 支援跨角色數值變化效果（目前值與最大值）
  - ✅ 目標角色顯示通知與 UI 更新
- **資料結構擴展**
  - ✅ 技能/道具效果新增 `targetType` 和 `requiresTarget` 欄位
  - ✅ MongoDB Schema 更新完成
  - ✅ TypeScript 型別定義完成
- **API 規格更新**
  - ✅ `useSkill` / `useItem` 新增 `targetCharacterId` 參數
  - ✅ 跨角色效果驗證與執行邏輯完成
- **WebSocket 事件擴展**
  - ✅ 更新 `character.affected` 事件格式（方案 A）
  - ✅ 目標角色即時通知推送完成
- **UI/UX 優化**
  - ✅ 技能/道具 Dialog 顯示目標資訊（包含僅限自己的情況）
  - ✅ 通知合併顯示（最大值與目前值同時變更時）
  - ✅ Toast 訊息在 Dialog 關閉時自動清除
- **開發階段調整**
  - 明確區分方案 A（簡化版）和方案 B（完整版）
  - 方案 B（對抗檢定與道具互動）延後至 Phase 7

### v1.1 (2025-01-XX) - Phase 6 完成
- Phase 5 技能系統已完成（影響自己的效果）
- Phase 6 WebSocket 即時同步已完成
- 更新開發階段規劃（Phase 6: WebSocket, Phase 6.5: 互動型技能, Phase 7: 戰鬥系統）
- 更新 API 規格（新增 useSkill）
- 更新 WebSocket 事件規格（新增技能相關事件）
- 玩家端通知紀錄系統已實作（localStorage 持久化）

### v1.0 (2025-11-29) - 初始版本
- 初始架構規劃
- 完成技術規格文件
- 專案結構設計

---

## 附註

- 所有文件需保持最新，變更時需同步更新
- 重大架構變更需經過團隊討論
- 定期 Review 文件完整性

**文件維護者**：SPEC AGENT
**最後更新**：2025-01-XX（Phase 7.6 需求規劃完成）
