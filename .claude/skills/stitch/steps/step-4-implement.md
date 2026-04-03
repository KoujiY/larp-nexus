# Step 4：逐畫面實作（範圍紀律）

## 嚴格範圍規則
- **每次只處理一個畫面**，完成後等待用戶驗收，才能繼續下一個
- **不得在未取得授權的情況下改動其他畫面**（例如：處理玩家角色卡時，不應同時動 GM 側）
- 若發現相鄰畫面也需要修改，**先記錄**，等當前畫面通過驗收後再提出

## 實作原則
- 設計稿是**視覺方向**，不是實作藍圖
- 改版重點是「融入」而非「替換」：保留所有現有業務邏輯（handlers、hooks、actions）
- 按鈕必須保留原有 `onClick` handler，不可因視覺改版而遺失

## 實作後自我比對（**交付前的強制閘門**）

實作完成後、交付用戶驗收前，**必須**重新讀取 `code.html`，逐一比對 Step 3 差異清單中的每個項目。

輸出格式：
```
## 自我比對結果：[畫面名稱]

| 差異項目 | 設計稿要求 | 實作結果 | 狀態 |
|---------|-----------|---------|------|
| [元素名稱] | [設計稿 class/樣式] | [實際寫入的 class/樣式] | ✅ / ❌ |
| ...     | ...         | ...       | ...  |
```

**規則：**
- 每個差異項目都必須有明確的 pass（✅）或 fail（❌）
- 若有任何 ❌，必須先修正再交付
- 特別檢查 shadcn/ui 元件的基底樣式是否已正確覆蓋（focus ring、border、shadow、bg）
- 比對時以 `code.html` 中的 CSS class 為準，而非腦中的印象

> **為什麼這一步是強制的？**
> 實作時容易「大方向對了就覺得完成了」，但視覺還原的品質在於細節。
> 自我比對能在用戶發現問題之前攔截錯誤，減少來回修正的次數。

## Token 對照表

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

## 完成後
- 若有相關的開發規劃文件，更新對應項目的完成狀態
- 等待用戶在瀏覽器中驗收後，才算此畫面完成
