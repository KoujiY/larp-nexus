---
name: stitch
description: Stitch UI 設計工作流程 - 使用 Stitch 工具進行介面改版時的標準作業程序
---

# Stitch UI 設計工作流程

## 角色定義
你是一位熟悉本專案設計系統的前端工程師，負責將 Stitch 產出的設計稿融入現有畫面，而不是替換現有畫面。

---

## Step 1：縱向分析（前置必要步驟）

**在提交任何 Stitch prompt 之前，必須先完成以下分析：**

### 向上追蹤（呼叫端）
- 確認目標畫面對應的 `page.tsx` 路由
- 用 grep 找出所有引用目標元件的父元件
- 確認 page → component 的完整引用鏈

### 向下追蹤（依賴鏈）
- 列出目標元件使用的所有子元件
- 確認哪些子元件有自己的業務邏輯（不能只看顯示層）
- 記錄可能受改動影響的 hooks 和 actions

### 輸出清單格式
```
目標畫面：[路由路徑]
主要元件：[component 路徑]
子元件：
  - [component] → [功能描述]
  - ...
使用的 hooks：[hook 名稱]
注意事項：[例如：元件 X 內部有 Y 邏輯，改版時不可拆除]
```

---

## Step 2：撰寫 Stitch Prompt

### 必填欄位（表格格式）

| 欄位 | 說明 | 範例 |
|------|------|------|
| 畫面名稱 | 頁面標題 | 玩家解鎖頁面 |
| 主要功能 | 這個畫面的目的 | 玩家輸入 PIN 碼和遊戲代碼登入 |
| 互動元素 | **所有**按鈕、輸入框、切換開關 | 4格 PIN 輸入框、6格遊戲代碼輸入框、解鎖按鈕 |
| 操作邏輯 | 每個互動的行為描述 | 輸入 PIN 後按解鎖 → 驗證 → 導向角色頁；錯誤 → 顯示紅框 |
| 模式差異 | 若有多種模式，說明差異 | 唯讀模式：只需 PIN；完整模式：需 PIN + 遊戲代碼 |
| 錯誤狀態 | 所有可能的錯誤顯示 | PIN 錯誤：PIN 框變紅；遊戲未開始：顯示專屬訊息 |
| RWD 要求 | 目標裝置 | 手機優先（320px–768px） |
| 主題 | 深色／淺色／兩者 | 深色（玩家端預設） |

> **重要**：互動元素和操作邏輯缺一不可，否則 Stitch 會省略按鈕或狀態。

---

## Step 3：使用 Stitch 輸出的三個檔案

Stitch 會產出：`screen.png`、`DESIGN.md`、`code.html`

### screen.png → 視覺對照
- 用途：確認整體視覺方向、排版比例、色彩搭配
- 不用途：不代表實作細節，Stitch 不了解本專案的狀態邏輯

### DESIGN.md → Token 對照參考
- 用途：讀取設計決策（間距、字體大小、顏色意圖）
- 注意：Stitch 使用 Material Design-like token，需對照本專案 token

### code.html → 禁止直接使用
- 用途：理解 Stitch 的 HTML 結構意圖，作為語義參考
- **不直接複製**：使用了不同的 class 系統和元件庫，會破壞現有狀態邏輯

---

## Step 4：Token 對照表

| Stitch Token | 本專案對應 | 說明 |
|--------------|-----------|------|
| `surface-container-high` | `bg-card` | 卡片背景 |
| `surface` | `bg-background` | 頁面底層背景 |
| `primary` | `bg-primary` / `text-primary` | 主強調色（金/琥珀） |
| `on-primary` | `text-primary-foreground` | 主色上的文字 |
| `on-surface` | `text-foreground` | 一般文字 |
| `on-surface-variant` | `text-muted-foreground` | 次要文字 |
| `outline` | `border-border` | 邊框 |
| `outline-variant` | `border-border/50` | 淡邊框 |
| `error` | `text-destructive` / `border-destructive` | 錯誤狀態 |
| `scrim` | `bg-black/50` | 遮罩層 |

> 新遇到的 token 請自行補充到此表。

---

## 注意事項

- 設計稿是**視覺方向**，不是實作藍圖
- 改版重點是「融入」而非「替換」：保留所有現有業務邏輯
- 改動完成後需在 `docs/refactoring/REFACTOR_PROGRESS.md` 更新進度
