# LARP Nexus 專案指南

## 專案概述
角色扮演遊戲（LARP）管理系統，包含 GM 側和玩家側的完整功能。

## 開發環境

### 技術棧
- **Frontend**: Next.js 16+ + React 19+ + TypeScript
- **State Management**: React Hooks + WebSocket (Pusher)
- **UI**: Tailwind CSS 4+ + shadcn/ui + Framer Motion
- **Database**: MongoDB Atlas (透過 Mongoose)
- **Real-time**: Pusher WebSocket
- **Testing**: Vitest (Phase A 待設定)

### 開發命令
```bash
npm run dev          # 啟動開發服務器
npm run build        # 生產構建
npm run lint         # ESLint 代碼檢查
npm run type-check   # TypeScript 類型檢查
npm test             # 運行測試
```

## 程式碼規範

### TypeScript
- 使用 `strict: true` 模式
- 避免使用 `any`，優先使用 `unknown`
- 為所有函數參數和返回值添加類型
- 使用 `type` 定義數據結構

### React
- 使用函數式組件和 Hooks
- 組件命名使用 PascalCase
- Props 必須定義 TypeScript 介面
- 使用 kebab-case 命名文件

### 代碼風格
- 使用 2 空格縮進
- ES modules (import/export)
- 函數需要 JSDoc 註解
- 遵循單一職責原則（SRP）

## 專案結構
```
app/               # Next.js 應用路由
  ├── (gm)/       # GM 側功能
  ├── (player)/   # 玩家側功能
  └── actions/    # Server Actions
components/        # React 組件
  ├── gm/         # GM 組件
  └── player/     # 玩家組件
lib/              # 業務邏輯和工具
  ├── db/models/  # MongoDB 模型
  ├── contest/    # 對抗系統
  ├── item/       # 道具系統
  └── skill/      # 技能系統
types/            # TypeScript 類型定義
hooks/            # 自定義 React Hooks
docs/             # 文檔
  ├── knowledge/  # 原子化知識庫（主要參考）
  ├── specs/      # 技術規格（詳細 API/WebSocket 規格）
  ├── archive/    # 歷史文件（唯讀參考）
  └── refactoring/ # 重構進度追蹤
```

## 開發工具

本專案使用 **everything-claude-code** plugin 提供的工具。常用工具：

| 工具 | 用途 |
|------|------|
| `/plan` | 規劃實作步驟 |
| `/tdd` | 測試驅動開發流程 |
| `/code-review` | 程式碼審查 |
| `/e2e` | E2E 測試 |
| `/verify` | 完整驗證迴圈 |
| `/docs` | 查詢套件文件 |
| `/save-session` | 儲存 session 狀態（context 快用完時使用） |

## 工作流程

### 新功能開發
1. 讀取相關知識庫文件（`docs/knowledge/`）
2. `/plan` 規劃實作步驟
3. `/tdd` 測試驅動實作
4. `/code-review` 審查程式碼
5. 更新知識庫（若邏輯有變動）
6. Commit & PR

### Bug 修復
1. 讀取相關知識庫文件理解現行邏輯
2. 實作修復
3. 補回歸測試
4. `/code-review` 審查

## 重要提醒
- 完成實作後執行 `npm run type-check` 和 `npm run lint`
- WebSocket 連接需要在 useEffect 中清理
- Server Actions 返回 JSON 可序列化的數據
- 資料庫查詢前檢查用戶權限

## 知識庫 (Knowledge Base)

原子化知識庫位於 `docs/knowledge/`，依照領域拆分為小單元，每次開發只需載入相關部分：

```
docs/knowledge/
  gm/character/     ← 角色卡、基本資訊、公開資訊、隱藏資訊、數值
  gm/tasks/         ← 任務管理、隱藏任務與自動揭露
  gm/items/         ← 道具概念、效果與標籤
  gm/skills/        ← 技能概念、效果與標籤
  gm/game/          ← 遊戲設定、廣播系統、遊戲狀態
  player/           ← 角色卡視圖、道具使用、技能使用
  shared/contest/   ← 對抗流程、檢定機制、標籤規則
  shared/           ← 自動揭露系統、通知系統、WebSocket 事件
  architecture/     ← 資料模型、API 參考、部署、技術棧
```

### 知識庫維護規範（MANDATORY）

以下情況**必須**同步更新對應的知識庫文件：
1. **新增功能** → 在相關 domain 的 md 中加入概念說明
2. **修改現有邏輯**（資料結構、流程、規則）→ 更新對應 md
3. **重構後介面改變** → 更新 component 路徑、函數名稱等參考
4. **刪除功能** → 移除或標記過時的知識庫條目

違反此規範會導致知識庫與 codebase 脫節，失去其存在的意義。

## 文件同步規則
- 完成一個開發步驟後，**必須立即**更新重構進度文件 `docs/refactoring/REFACTOR_PROGRESS.md`（將對應項目從 `[ ]` 改為 `[x]`）
- 若進度文件中的狀態與 codebase 實際狀態不一致，應優先修正文件
- 新增或刪除檔案時，檢查是否有其他文件（包含知識庫）引用了該路徑，一併更新

## 架構文檔參考
- 重構進度：`docs/refactoring/REFACTOR_PROGRESS.md`
- API 規範：`docs/specs/03_API_SPECIFICATION.md`
- WebSocket 事件：`docs/specs/04_WEBSOCKET_EVENTS.md`
- 資料模型：`docs/knowledge/architecture/data-models.md`
- 知識庫索引：`docs/knowledge/`
