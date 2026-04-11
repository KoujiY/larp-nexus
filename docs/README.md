# LARP Nexus - 開發文件總覽

## 專案資訊

- **專案名稱**：LARP Nexus
- **版本**：v3.0
- **更新日期**：2026-04-11（裝備系統、預設事件、E2E 測試完成）
- **專案類型**：LARP GM/玩家輔助系統

---

## 文件導覽

### 使用者文件

- **[使用指南](./USER_GUIDE.md)** — GM 與玩家的完整操作說明

### 技術規格文件

本專案的技術規格位於 `docs/specs/` 目錄：

| 文件 | 內容 |
|------|------|
| [資料庫 Schema](./specs/02_DATABASE_SCHEMA.md) | MongoDB Collections、資料模型、索引設計 |
| [API 規格](./specs/03_API_SPECIFICATION.md) | Server Actions、API Routes、錯誤處理 |
| [WebSocket 事件](./specs/04_WEBSOCKET_EVENTS.md) | Pusher 配置、事件類型定義、前後端實作 |
| [部署架構](./specs/09_DEPLOYMENT_CICD.md) | Vercel 部署、CI/CD 流程、監控 |
| [外部設定檢查清單](./specs/10_EXTERNAL_SETUP_CHECKLIST.md) | 環境變數、外部服務設定步驟 |
| [設計規格](./specs/DESIGN.md) | 視覺設計方向、品牌風格 |

### 知識庫

原子化領域知識位於 `docs/knowledge/`，依領域拆分為小單元：

| 領域 | 路徑 | 內容 |
|------|------|------|
| GM/角色 | `knowledge/gm/character/` | 角色卡、基本資訊、公開資訊、隱藏資訊、數值 |
| GM/遊戲 | `knowledge/gm/game/` | 遊戲設定、廣播、遊戲狀態、預設事件 |
| GM/道具 | `knowledge/gm/items/` | 道具概念、效果、標籤、裝備系統 |
| GM/技能 | `knowledge/gm/skills/` | 技能概念、效果、標籤 |
| GM/任務 | `knowledge/gm/tasks/` | 任務管理、隱藏任務與自動揭露 |
| 玩家 | `knowledge/player/` | 角色卡視圖、道具使用、技能使用 |
| 共用 | `knowledge/shared/` | 對抗流程、檢定機制、自動揭露、通知、WebSocket |
| 架構 | `knowledge/architecture/` | 資料模型、API、部署、E2E 測試 |

### 歷史文件

歷史開發文件位於 `docs/archive/`，為唯讀參考（含早期設計規格、E2E flow 設計文件等）。

---

## 快速開始

> 開始開發前，請先完成 [外部設定檢查清單](./specs/10_EXTERNAL_SETUP_CHECKLIST.md) 中的必要項目。

```bash
pnpm install          # 安裝依賴
cp .env.example .env.local  # 建立環境變數（手動填入）
pnpm dev              # 啟動開發伺服器（http://localhost:3000）
```

### 常用指令

```bash
pnpm dev              # 開發伺服器
pnpm build            # 生產環境建置
pnpm lint             # ESLint 檢查
pnpm type-check       # TypeScript 型別檢查
pnpm test             # 單元測試（Vitest）
pnpm test:e2e         # E2E 測試（Playwright，完全離線可跑）
```

---

## 專案架構概覽

```
larp-nexus/
├── app/                    # Next.js App Router
│   ├── auth/              # 認證頁面（登入、驗證）
│   ├── (gm)/              # GM 端頁面
│   ├── (player)/g/        # 玩家端世界觀頁面
│   ├── c/                 # 玩家端角色卡頁面
│   ├── api/               # API Routes
│   └── actions/           # Server Actions
├── components/            # React 元件
│   ├── ui/               # shadcn/ui 基礎元件
│   ├── gm/               # GM 端元件
│   ├── player/           # 玩家端元件
│   └── shared/           # 共用元件
├── lib/                  # 核心邏輯
│   ├── db/              # MongoDB Models & Schemas
│   ├── auth/            # 認證（session、magic link）
│   ├── contest/         # 對抗檢定系統
│   ├── skill/           # 技能系統
│   ├── item/            # 道具系統（含裝備加成）
│   ├── effects/         # 時效性效果系統
│   ├── preset-event/    # 預設事件系統
│   ├── websocket/       # WebSocket（Pusher）
│   └── utils/           # 工具函式
├── types/               # TypeScript 類型定義
├── hooks/               # Custom React Hooks
├── e2e/                 # E2E 測試（Playwright）
└── docs/                # 文件目錄
    ├── specs/           # 技術規格
    ├── knowledge/       # 知識庫（原子化領域知識）
    └── archive/         # 歷史文件
```

---

## 技術棧

- **框架**：Next.js 16 (App Router)
- **語言**：TypeScript 5
- **資料庫**：MongoDB Atlas + Mongoose
- **UI**：Tailwind CSS 4 + shadcn/ui + Framer Motion
- **狀態管理**：React Hooks + WebSocket
- **即時通訊**：Pusher (WebSocket)
- **圖片儲存**：Vercel Blob
- **認證**：iron-session (Magic Link)
- **測試**：Vitest（單元）+ Playwright（E2E）
- **部署**：Vercel

---

## 開發指引

### 分支策略

```
main (production)
  └─ feat/xxx (feature branches)
```

### Commit 規範

```
feat: 新增功能
fix: 修正 Bug
docs: 文件更新
refactor: 重構
test: 測試相關
chore: 其他（建置、套件更新等）
perf: 效能改善
```

> 禁止 scope 括號：使用 `feat: description` 而非 `feat(scope): description`。

### PR 流程

1. 建立 Feature Branch
2. 開發並測試（`tsc --noEmit` + `eslint` 必須 0 error）
3. 建立 PR 至 `main`
4. Code Review
5. Merge

---

## 測試策略

### 單元測試
- **Vitest** — field updaters、effect executors、validators、event mappers 等核心邏輯
- 執行：`pnpm test`

### E2E 測試
- **Playwright** + **mongodb-memory-server** — 完全離線可跑，不需要 Atlas/Pusher/SMTP
- 覆蓋 12 個業務流程（70+ test cases）：GM 登入、角色 CRUD、技能/道具使用、對抗檢定、廣播、預設事件、自動揭露等
- 自訂 fixtures（auto DB reset、seed builder、GM/Player session、WebSocket event listener）
- 執行：`pnpm test:e2e`
- 詳細架構：[E2E 測試架構](./knowledge/architecture/e2e-testing.md)

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

本專案採用自訂非商業授權。允許個人使用、教育用途、非營利組織使用，以及私人 LARP 活動使用。禁止商業用途（販售、SaaS、營利產品整合）。

詳見 [LICENSE](../LICENSE)。

---

## 聯絡方式

如有問題，請聯絡專案負責人。

---

## 更新日誌

### v3.0 (2026-04-11) - 裝備系統、預設事件、E2E 測試
- **裝備系統**
  - 道具可設為裝備類型，穿戴後提供常駐數值加成
  - 裝備轉移時自動卸下並還原加成
  - 裝備效果面板（玩家端即時顯示）
- **預設事件系統**
  - GM 預先設計多動作事件（廣播、數值調整、揭露資訊/任務）
  - 遊戲中一鍵觸發，支援重複執行
  - 執行結果摘要（成功/跳過/失敗）
- **GM 控制台重構**
  - 即時角色狀態總覽（WebSocket 自動同步）
  - 事件紀錄面板
  - 預設事件快捷面板
- **解鎖流程統一**
  - 無 PIN 角色可直接進入預覽/完整模式
  - PIN 驗證常數共用模組化
- **UI 重構**
  - 四步驟精靈（道具/技能編輯）
  - 吸附式儲存列（Sticky Save Bar）
  - 區塊式背景故事編輯器
  - 玩家端分頁重構（道具/技能/資訊/數值/任務）
- **E2E 測試基礎設施**
  - Playwright + mongodb-memory-server（完全離線）
  - 12 個業務流程、70+ test cases
  - 自訂 fixtures（seed builder、DB query、WebSocket event listener）
- **程式碼品質**
  - Mongoose Schema 共用化（shared-schemas.ts）
  - Field updaters 拆分為獨立模組
  - Event mappers 拆分為領域模組
  - 移除 Jotai 狀態管理，改用 React Hooks + WebSocket

### v2.0 (2026-03-11) - Phase 11.5 完成，專案文件完備
- **Phase 11 遠端服務整合與部署**
  - 11.1 遠端服務依賴任務全部完成
  - 11.2 Vercel 部署完成（含 Nodemailer + Gmail SMTP 遷移）
  - 11.3 Cron Jobs 設定（每日排程 + Lazy Evaluation 架構）
  - 11.4 完整功能測試（6 個測試場景全數通過）
  - 11.5 安全性掃描與修復（CRON_SECRET 強制驗證）
- **Phase 10 遊戲狀態分層系統**
  - Baseline / Runtime / Snapshot 分層架構
  - Game Code + PIN 解鎖機制
  - 遊戲生命週期管理（開始/結束遊戲）
- **Phase 9 離線事件佇列**
  - Pending Events 機制（離線玩家重連後自動拉取）
  - 事件清理（Cron Job 每日清理過期事件）
- **專案文件**
  - README.md 重寫
  - USER_GUIDE.md 使用者操作手冊
  - LICENSE 自訂非商業授權

### v1.5 (2026-02-16) - Phase 8 時效性效果系統完成
- **Phase 8 時效性效果系統實作完成**
  - 型別定義與 Schema 擴展（`TemporaryEffect`、`SkillEffect.duration`、`EffectExpiredEvent`）
  - 效果執行器整合（skill、item、contest）
  - 共用工具建立（`create-temporary-effect.ts`、`check-expired-effects.ts`）
  - Server Actions（`checkExpiredEffects`、`getTemporaryEffects`）
  - Cron Job API（`/api/cron/check-expired-effects`）
  - WebSocket 事件處理（`effect.expired` 完整流程）
  - 前端觸發整合（頁面載入、技能/道具使用前）
  - GM 端 UI（時效性效果卡片 + 持續時間設定）
  - 玩家端 UI（活躍效果面板 + 倒數計時）
- **核心特性**
  - 數值變化效果支援持續時間（分鐘輸入 → 秒儲存）
  - 效果到期自動恢復數值（反向 delta + clamp）
  - 雙重觸發機制（前端即時檢查 + Cron Job 定期清理）
  - 即時倒數計時（每秒更新 + 自動移除過期效果）
  - 效果堆疊支援（同一數值可被多個效果獨立影響）

### v1.4 (2025-01-XX) - Phase 7.6 需求規劃
- **需求變更**
  - 移除 Phase 7.5 戰鬥系統（變化過大，難以收斂）
  - 新增 Phase 7.6：標籤系統與檢定模式擴展
- **Phase 7.6 規劃**
  - 標籤系統（"戰鬥"、"隱匿"）
  - 防守方效果結算調整
  - 數值判定系統匹配機制
  - 隨機對抗檢定模式

### v1.3 (2025-01-XX) - Phase 7 對抗檢定系統完成
- **Phase 7 對抗檢定系統實作完成**
  - 技能/道具對抗檢定類型設定
  - 對抗檢定配置（相關數值、對手限制、平手裁決）
  - 攻擊方數值計算與等待機制
  - 防守方回應系統（可選擇道具/技能）
  - 對抗結果計算與處理
  - 道具互動效果（`item_take`, `item_steal`）
  - 目標道具選擇機制
  - 狀態持久化（localStorage，重新整理後恢復）
  - 跨分頁回應處理（無論在哪個分頁都能接收回應並開啟對應面板）
- **WebSocket 事件擴展**
  - `skill.contest` 事件（請求與結果）
  - 攻擊方/防守方事件區分
  - 對抗檢定結果推送（雙方角色頻道）
- **UI/UX 優化**
  - 對抗檢定進行中狀態顯示
  - Dialog 鎖定機制（對抗檢定進行中無法關閉）
  - 等待狀態提示
  - 結果通知顯示
  - 通知去重機制
- **狀態管理優化**
  - 對抗檢定狀態持久化（攻擊方/防守方）
  - 目標道具選擇狀態持久化
  - 對抗檢定狀態查詢機制（處理重新整理後無法收到 WebSocket 事件的情況）

### v1.2 (2025-01-XX) - Phase 6.5 方案 A 完成
- **Phase 6.5 互動型技能系統（方案 A）實作完成**
  - 新增跨角色效果功能實作
  - GM 可設定目標對象類型（自己/其他玩家/任一名玩家）
  - 玩家使用時可選擇目標角色（下拉選單）
  - 支援跨角色數值變化效果（目前值與最大值）
  - 目標角色顯示通知與 UI 更新
- **資料結構擴展**
  - 技能/道具效果新增 `targetType` 和 `requiresTarget` 欄位
  - MongoDB Schema 更新完成
  - TypeScript 型別定義完成
- **API 規格更新**
  - `useSkill` / `useItem` 新增 `targetCharacterId` 參數
  - 跨角色效果驗證與執行邏輯完成
- **WebSocket 事件擴展**
  - 更新 `character.affected` 事件格式（方案 A）
  - 目標角色即時通知推送完成
- **UI/UX 優化**
  - 技能/道具 Dialog 顯示目標資訊（包含僅限自己的情況）
  - 通知合併顯示（最大值與目前值同時變更時）
  - Toast 訊息在 Dialog 關閉時自動清除
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
**最後更新**：2026-04-11（v3.0 裝備系統、預設事件、E2E 測試）
