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

## Step 3：讀取 Stitch 產出並輸出視覺差異清單（**動手前的強制閘門**）

Stitch 會產出：`screen.png`（不讀取）、`DESIGN.md`、`code.html`

### 3-1：讀取順序（依序執行，不可跳過）

1. **讀取 `DESIGN.md`**（設計決策與 token 對照）
   - 讀取設計決策（間距、字體大小、顏色意圖）
   - Stitch 使用 Material Design-like token，需對照本專案 token

2. **讀取 `code.html`**（HTML 結構語義參考）
   - 理解 Stitch 的結構意圖
   - **禁止直接複製**：使用了不同的 class 系統和元件庫，會破壞現有狀態邏輯

> **注意：不要讀取 `screen.png`。** 圖片檔案可能過大導致 API 錯誤，請透過 `DESIGN.md` 和 `code.html` 理解設計意圖。

### 3-2：輸出視覺差異清單（**必須在動手前輸出，等待用戶確認**）

讀完 `DESIGN.md` 和 `code.html` 後，**必須輸出以下格式的差異清單**，等待用戶確認後才能開始實作：

```
## 視覺差異清單：[畫面名稱]

| 區塊 / 元件 | 設計稿要求 | 現行實作 | 需改動 |
|------------|-----------|---------|--------|
| [元件名稱] | [設計稿描述] | [現行描述] | ✓ / — |
| ...        | ...         | ...       | ...    |

**範圍外（本次不動）：**
- [元件名稱]：[原因]

**等待確認後開始實作。**
```

> **為什麼這一步是強制的？**
> 若跳過差異清單，容易遺漏重要視覺改動（例如：角色名字應壓在圖片上而非圖片下方），
> 或在不應改動的區域動手（超出範圍）。差異清單是唯一可驗證的閘門。

---

## Step 4：逐畫面實作（範圍紀律）

### 嚴格範圍規則
- **每次只處理一個畫面**，完成後等待用戶驗收，才能繼續下一個
- **不得在未取得授權的情況下改動其他畫面**（例如：處理玩家角色卡時，不應同時動 GM 側）
- 若發現相鄰畫面也需要修改，**先記錄**，等當前畫面通過驗收後再提出

### 實作原則
- 設計稿是**視覺方向**，不是實作藍圖
- 改版重點是「融入」而非「替換」：保留所有現有業務邏輯（handlers、hooks、actions）
- 按鈕必須保留原有 `onClick` handler，不可因視覺改版而遺失

---

## Step 5：Token 對照表

| Stitch Token | 本專案對應 | 說明 |
|--------------|-----------|------|
| `surface` / `surface-dim` | `bg-background` | 頁面底層背景 |
| `surface-container-low` | `bg-surface-base` | 區塊背景（略高於 bg） |
| `surface-container` | `bg-card` | 主要卡片背景 |
| `surface-container-high` | `bg-popover` | 互動元素、下拉選單 |
| `surface-bright` | `bg-surface-raised` | Hover / 強調區塊（最高層） |
| `primary` | `bg-primary` / `text-primary` | 主強調色（金/琥珀） |
| `primary-container` | `bg-primary/80` | 按鈕漸層終止色 |
| `on-primary` | `text-primary-foreground` | 主色上的文字 |
| `on-surface` | `text-foreground` | 一般文字 |
| `on-surface-variant` | `text-muted-foreground` | 次要文字 |
| `outline` | `border-border` | 邊框 |
| `outline-variant` | `border-border/15` | Ghost border（幾乎不可見） |
| `error` | `text-destructive` / `border-destructive` | 錯誤狀態 |
| `scrim` | `bg-black/50` | 遮罩層 |

> 新遇到的 token 請自行補充到此表。

---

## 完成後
- 在 `docs/refactoring/REFACTOR_PROGRESS.md` 更新進度
- 等待用戶在瀏覽器中驗收後，才算此畫面完成
