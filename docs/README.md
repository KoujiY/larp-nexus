# Agent 產出文件目錄

此目錄用於存放 **AI Agent 產出的所有文件**。

## 📁 目錄結構

```
docs/
├── README.md       # 文件結構說明
├── requirements/   # 📥 輸入：原始需求文件
├── specs/          # [SPEC] Spec Writer Agent 產出的技術規格
├── dev-notes/      # [RD] RD Agent 產出的開發筆記
├── test-plans/     # [TEST] Test Writer Agent 產出的測試報告
├── reviews/        # [REVIEW] Code Reviewer Agent 產出的審查報告
└── pr-templates/   # [PR] PR Writer Agent 產出的 PR 描述模板
```

## 🤖 相關 Agents 與輸出

### [SPEC] - Spec Writer Agent
- **輸出路徑**：`docs/specs/`
- **命名規範**：`SPEC-{feature-name}-{date}.md`
- **範例**：`SPEC-quiz-collection-deploy-20250105.md`
- **內容**：技術規格文件，包含功能概述、技術架構、資料模型、實作步驟等

### [RD] - Research & Development Agent
- **輸出路徑**：`docs/dev-notes/`
- **命名規範**：`{feature-name}.md`
- **範例**：`quiz-collection-deploy.md`
- **內容**：開發筆記，記錄任務拆解、技術決策、實作過程等

### [TEST] - Test Writer Agent
- **測試程式碼**：與原始程式碼放在同一資料夾（`{code-file-name}.test.ts`）
- **測試報告輸出路徑**：`docs/test-plans/`
- **命名規範**：`{feature-name}-test-report.md`
- **範例**：`quiz-collection-deploy-test-report.md`
- **內容**：測試報告，包含測試摘要、測試案例、發現的問題等

### [REVIEW] - Code Reviewer Agent
- **輸出路徑**：`docs/reviews/`
- **命名規範**：`{feature-name}-review.md`
- **範例**：`quiz-collection-deploy-review.md`
- **內容**：代碼審查報告，包含審查摘要、優點、需要改進的地方、指標等

### [PR] - PR Writer Agent
- **輸出路徑**：`docs/pr-templates/`
- **命名規範**：`{feature-name}-pr.md`
- **範例**：`quiz-collection-deploy-pr.md`
- **內容**：Pull Request 描述模板，包含改動內容、確認事項等

## 🔄 完整工作流程

```
1. [SPEC]   人類需求 → 技術規格 (docs/specs/)
2. [RD]     技術規格 → 功能實作 + 開發筆記 (docs/dev-notes/)
3. [TEST]   實作程式碼 → 測試程式碼 + 測試報告 (docs/test-plans/)
4. [REVIEW] 程式碼變更 → 審查報告 (docs/reviews/)
5. [PR]     程式碼變更 → PR 描述 (docs/pr-templates/)
```

## ⚠️ 注意事項

- 此目錄已加入 `.gitignore`，不會被 Git 追蹤
- Agent 產出的文件會自動放置到相應的子目錄
- 建議定期清理過時的文件

