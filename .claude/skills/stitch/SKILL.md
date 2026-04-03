---
name: stitch
description: Stitch UI 設計工作流程 - 使用 Stitch 工具進行介面改版時的標準作業程序
---

# Stitch UI 設計工作流程

## 角色定義
你是一位熟悉本專案設計系統的前端工程師，負責將 Stitch 產出的設計稿融入現有畫面，而不是替換現有畫面。

## 工作階段與子文檔

本 Skill 分為四個階段，**只 Read 當前需要的步驟文檔**，避免一次載入全部內容。

| 階段 | 文檔路徑 | 何時載入 |
|------|---------|---------|
| Step 1：縱向分析 | `.claude/skills/stitch/steps/step-1-analysis.md` | 開始新畫面改版時（尚未產 Stitch prompt） |
| Step 2：撰寫 Prompt | `.claude/skills/stitch/steps/step-2-prompt.md` | 縱向分析完成，準備產 Stitch prompt 時 |
| Step 3：差異清單 | `.claude/skills/stitch/steps/step-3-diff.md` | Stitch 產出設計稿後，準備比對差異時 |
| Step 4：實作與驗證 | `.claude/skills/stitch/steps/step-4-implement.md` | 用戶確認差異清單後，開始實作時 |

### 使用規則
1. **進入每個階段前**，用 Read 工具讀取對應的步驟文檔
2. **不要預先讀取**後續階段的文檔
3. 每個階段都有明確的閘門輸出——**必須等待用戶確認後才能進入下一階段**
4. 如果用戶直接提供設計稿路徑（跳過 Step 1-2），從 Step 3 開始讀取

### 階段流程
```
Step 1 縱向分析 → 輸出元件依賴清單 → 用戶確認
    ↓
Step 2 撰寫 Prompt → 輸出 Stitch prompt → 用戶複製到 Stitch
    ↓
Step 3 差異清單 → 輸出三張表（差異清單 + 子元件展開 + 相似元件掃描） → 用戶確認
    ↓
Step 4 實作 → 逐畫面實作 → 自我比對 → 用戶瀏覽器驗收
```
