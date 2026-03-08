# LARP Nexus 專案指南

## 專案概述
角色扮演遊戲（LARP）管理系統，包含 GM 側和玩家側的完整功能。

## 開發環境

### 技術棧
- **Frontend**: Next.js 14+ + React 18+ + TypeScript
- **State Management**: React Hooks + WebSocket
- **UI**: Tailwind CSS + shadcn/ui
- **Database**: MongoDB (透過 Mongoose)
- **Real-time**: WebSocket
- **Testing**: Vitest

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
  ├── specs/      # 技術規格
  ├── dev-notes/  # 開發筆記
  └── reviews/    # 代碼審查報告
```

## 專業 Agent Skills

本專案提供以下專業 Skills，使用 `/skill-name` 調用：

### `/spec` - 技術規格撰寫專家
將需求轉換為結構化技術規格文件。
- **輸出位置**: `docs/specs/SPEC-{feature-name}-{date}.md`
- **包含內容**: 功能概述、架構圖、資料模型、實作步驟、驗收標準

**使用範例**:
```
/spec 請為角色裝備系統撰寫技術規格
```

### `/rd` - 前端開發專家
根據技術規格實作功能，每步驟暫停等待驗收。
- **輸出位置**: 程式碼 + `docs/dev-notes/{feature-name}.md`
- **工作方式**: 任務拆解 → 逐步實作 → 每步驟暫停驗收

**使用範例**:
```
/rd 根據 SPEC-equipment-system-2026-02-09.md 實作裝備系統
```

### `/test` - 測試工程師
撰寫全面的單元測試和測試報告。
- **輸出位置**: `*.test.ts` + `docs/test-plans/{feature-name}-test-report.md`
- **測試框架**: Vitest

**使用範例**:
```
/test 為 lib/contest/contest-calculator.ts 撰寫單元測試
```

### `/review` - 代碼審查專家
全面審查程式碼品質、安全性和效能。
- **輸出位置**: `docs/reviews/{feature-name}-review.md`
- **審查重點**: 品質、安全性、效能、測試、架構

**使用範例**:
```
/review 審查最近的 contest 系統重構
```

### `/pr` - PR 撰寫專家
撰寫清晰完整的 Pull Request 描述。
- **輸出位置**: `docs/pr-templates/{feature-name}-pr.md`

**使用範例**:
```
/pr 為當前的變更撰寫 PR 描述
```

## 工作流程建議

### 新功能開發
1. `/spec` - 撰寫技術規格
2. `/rd` - 實作功能（逐步驗收）
3. `/test` - 撰寫測試
4. `/review` - 代碼審查
5. `/pr` - 準備 PR

### Bug 修復
1. 分析問題
2. `/rd` - 修復實作
3. `/test` - 添加回歸測試
4. `/review` - 審查修復

## 重要提醒
- 完成實作後執行 `npm run type-check` 和 `npm run lint`
- WebSocket 連接需要在 useEffect 中清理
- Server Actions 返回 JSON 可序列化的數據
- 資料庫查詢前檢查用戶權限

## 文件同步規則
- 完成一個 Phase 或重構階段後，**必須立即**更新對應的進度追蹤文件（如 `docs/refactoring/*_CONTINUE.md`）
- 進度追蹤文件應記錄：完成的項目清單、修改的檔案、關鍵 SPEC 確認結果
- 若進度追蹤文件中的狀態標記（如「待實作」）與 codebase 實際狀態不一致，應優先修正文件
- 新增或刪除檔案時，檢查是否有其他文件引用了該檔案路徑，一併更新

## 架構文檔參考
- 專案結構：@docs/specs/01_PROJECT_STRUCTURE.md
- API 規範：@docs/specs/03_API_SPECIFICATION.md
- WebSocket 事件：@docs/specs/04_WEBSOCKET_EVENTS.md
