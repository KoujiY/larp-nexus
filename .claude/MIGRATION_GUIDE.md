# Skills 遷移指南

## 從 Cursor [AGENT] 標記遷移到 Claude Code Skills

本文檔說明如何從舊的 Cursor multi-agent 系統遷移到 Claude Code 的原生 Skills 機制。

---

## 快速對照表

| 舊方式 (Cursor) | 新方式 (Claude Code) | 說明 |
|----------------|---------------------|------|
| `[SPEC] 任務描述` | `/spec 任務描述` | 技術規格撰寫 |
| `[RD] 任務描述` | `/rd 任務描述` | 功能實作 |
| `[TEST] 任務描述` | `/test 任務描述` | 測試撰寫 |
| `[REVIEW] 任務描述` | `/review 任務描述` | 代碼審查 |
| `[PR] 任務描述` | `/pr 任務描述` | PR 撰寫 |

---

## 使用範例

### 舊方式 (Cursor)
```
[SPEC] 請為用戶登入功能產出技術規格
```

### 新方式 (Claude Code)
```
/spec 請為用戶登入功能產出技術規格
```

---

## Skills 的優勢

### 1. **原生支持**
- Claude Code 的內建功能，無需額外配置
- 更好的工具整合和提示
- 未來會有更多改進

### 2. **更清晰的調用方式**
- `/command` 格式更符合現代 CLI 習慣
- 與其他 Claude Code 命令保持一致（如 `/help`, `/commit`）
- 更易於發現和使用

### 3. **獨立的 Skills 定義**
- 每個 Skill 有自己的目錄和定義文件
- 更容易維護和更新
- 可以包含額外的資源文件

### 4. **更好的可擴展性**
- 可以添加更多 metadata（參數、選項等）
- 未來可能支持更多功能（如參數驗證、子命令）

---

## 遷移步驟（已完成）

✅ **步驟 1**: 創建 `.claude/skills/` 目錄結構
```
.claude/skills/
├── spec/SKILL.md
├── rd/SKILL.md
├── test/SKILL.md
├── review/SKILL.md
└── pr/SKILL.md
```

✅ **步驟 2**: 將 `.cursor/rules/` 中的內容轉換為 SKILL.md 格式

✅ **步驟 3**: 更新 `.claude/CLAUDE.md`，添加 Skills 使用說明

---

## 詳細使用指南

### `/spec` - 技術規格撰寫
**何時使用**: 需要將產品需求轉換為技術規格時

**輸入**: 產品需求、使用者故事、功能描述

**輸出**: `docs/specs/SPEC-{feature-name}-{date}.md`

**範例**:
```
/spec 設計一個角色裝備系統，玩家可以：
1. 查看裝備清單
2. 裝備/卸下物品
3. 查看裝備效果
```

---

### `/rd` - 功能實作
**何時使用**: 根據技術規格實作功能時

**輸入**: 技術規格文件路徑

**輸出**:
- 實作的程式碼
- `docs/dev-notes/{feature-name}.md`

**工作方式**:
- 讀取規格 → 任務拆解 → 逐步實作
- **重要**: 每完成一個步驟會暫停，等待人類驗收後繼續

**範例**:
```
/rd 根據 docs/specs/SPEC-equipment-system-2026-02-09.md 實作裝備系統
```

---

### `/test` - 測試撰寫
**何時使用**: 為實作的功能撰寫單元測試時

**輸入**: 要測試的程式碼路徑

**輸出**:
- `*.test.ts` 測試文件
- `docs/test-plans/{feature-name}-test-report.md`

**範例**:
```
/test 為 lib/contest/contest-calculator.ts 撰寫單元測試

測試需求：
- 測試正常情況
- 測試邊界情況
- 測試錯誤處理
```

---

### `/review` - 代碼審查
**何時使用**: 完成功能實作後，需要全面審查時

**輸入**: 要審查的變更範圍

**輸出**: `docs/reviews/{feature-name}-review.md`

**審查重點**:
- 程式碼品質（命名、結構、註解）
- 安全性（輸入驗證、權限檢查）
- 效能（渲染優化、記憶體管理）
- 測試（覆蓋率、案例完整性）
- 架構（是否符合專案規範）

**範例**:
```
/review 審查最近提交的 contest 系統重構

重點檢查：
- 是否符合專案架構
- WebSocket 連接是否正確清理
- 類型定義是否完整
```

---

### `/pr` - PR 描述撰寫
**何時使用**: 準備創建 Pull Request 時

**輸入**: 當前的 git 變更

**輸出**: `docs/pr-templates/{feature-name}-pr.md`

**範例**:
```
/pr 為當前的裝備系統實作撰寫 PR 描述
```

---

## 完整工作流程範例

### 場景：實作新功能「角色裝備系統」

#### 1. 撰寫技術規格
```
/spec 設計角色裝備系統

需求：
- 玩家可以裝備武器、防具、飾品
- 裝備提供屬性加成
- GM 可以查看所有玩家裝備
```

產出：`docs/specs/SPEC-equipment-system-2026-02-09.md`

---

#### 2. 實作功能
```
/rd 根據 docs/specs/SPEC-equipment-system-2026-02-09.md 實作裝備系統
```

RD Agent 會：
1. 讀取規格文件
2. 拆解任務（例如：資料模型 → API → 組件 → 整合）
3. 逐步實作，每步驟完成後暫停等待驗收

產出：
- `lib/equipment/` 業務邏輯
- `components/player/equipment-panel.tsx` UI 組件
- `types/equipment.ts` 類型定義
- `docs/dev-notes/equipment-system.md` 開發筆記

---

#### 3. 撰寫測試
```
/test 為 lib/equipment/equipment-manager.ts 撰寫單元測試
```

產出：
- `lib/equipment/equipment-manager.test.ts`
- `docs/test-plans/equipment-system-test-report.md`

---

#### 4. 代碼審查
```
/review 審查裝備系統的實作
```

產出：`docs/reviews/equipment-system-review.md`

根據審查結果修正問題

---

#### 5. 準備 PR
```
/pr 為裝備系統功能撰寫 PR 描述
```

產出：`docs/pr-templates/equipment-system-pr.md`

複製內容到 GitHub PR

---

## 與舊系統的兼容性

### 選項 1：完全遷移（推薦）
- 使用新的 `/skill` 命令
- 享受原生支持和未來改進

### 選項 2：保留舊系統
- 可以在 CLAUDE.md 中加回舊的 [AGENT] 規則
- 新舊系統可以並存
- 建議逐步遷移到新系統

如果需要保留舊系統，可以在 CLAUDE.md 末尾添加：

```markdown
## 兼容模式：[AGENT] 標記支持

當用戶使用 `[SPEC]`, `[RD]`, `[TEST]`, `[REVIEW]`, `[PR]` 標記時：
1. 讀取 `.claude/skills/{agent-name}/SKILL.md`
2. 按照該文件的定義執行任務

這是為了兼容舊的 Cursor 習慣，建議使用 `/skill` 命令。
```

---

## FAQ

### Q: 我可以同時使用 [AGENT] 和 /skill 嗎？
A: 可以，但建議統一使用 `/skill` 獲得更好的體驗。

### Q: Skills 可以接受參數嗎？
A: 目前主要通過自然語言描述任務，未來可能支援更結構化的參數。

### Q: 我可以創建自己的 Skills 嗎？
A: 可以！在 `.claude/skills/` 中創建新目錄和 SKILL.md 文件即可。

### Q: Skills 和 Agents 有什麼區別？
A: Skills 是輕量級的角色切換，Agents 是獨立的子進程，適合更複雜的任務。

---

## 進階：創建自定義 Skill

### 範例：創建 `/doc` Skill 用於撰寫文檔

1. 創建目錄和文件
```bash
mkdir .claude/skills/doc
```

2. 創建 `SKILL.md`
```markdown
---
name: doc
description: 技術文件撰寫專家
---

# Documentation Writer

## 角色定義
你是技術文件撰寫專家，負責撰寫清晰的技術文檔。

## 主要職責
- 撰寫 API 文檔
- 更新 README
- 撰寫使用指南

## 工作流程
1. 分析程式碼
2. 識別需要文檔的部分
3. 撰寫清晰的文檔
4. 添加範例

## 輸出位置
- API 文檔：`docs/api/`
- 使用指南：`docs/guides/`
```

3. 使用
```
/doc 為 lib/contest/ 模組撰寫 API 文檔
```

---

## 總結

✅ **已完成的遷移**:
- 創建了 5 個 Skills（spec, rd, test, review, pr）
- 更新了 CLAUDE.md 配置
- 提供完整的使用範例

🎯 **下一步建議**:
- 開始使用 `/skill` 命令替代 `[AGENT]` 標記
- 根據使用經驗調整 Skills 定義
- 考慮創建更多自定義 Skills

💡 **記住**:
- 使用 `/help` 查看所有可用命令
- Skills 會隨著 Claude Code 更新獲得更多功能
- 保持 SKILL.md 文件簡潔清晰

---

如有問題或建議，歡迎更新此文檔！
