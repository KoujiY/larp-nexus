# Step 3：讀取 Stitch 產出並輸出視覺差異清單（**動手前的強制閘門**）

Stitch 會產出：`screen.png`（不讀取）、`DESIGN.md`、`code.html`

## 3-1：讀取順序（依序執行，不可跳過）

1. **讀取 `DESIGN.md`**（設計決策與 token 對照）
   - 讀取設計決策（間距、字體大小、顏色意圖）
   - Stitch 使用 Material Design-like token，需對照本專案 token

2. **讀取 `code.html`**（HTML 結構語義參考）
   - 理解 Stitch 的結構意圖
   - **禁止直接複製**：使用了不同的 class 系統和元件庫，會破壞現有狀態邏輯

> **注意：不要讀取 `screen.png`。** 圖片檔案可能過大導致 API 錯誤，請透過 `DESIGN.md` 和 `code.html` 理解設計意圖。

## 3-2：輸出視覺差異清單（**必須在動手前輸出，等待用戶確認**）

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

## 3-3：差異清單粒度要求（MANDATORY）

差異清單的「區塊/元件」欄**必須拆到單一 HTML 元素層級**，不可只寫區塊名稱。

```
# ❌ 錯誤：區塊級（太粗，實作時必然遺漏細節）
| Header | 需要調整 | 現行版本 | ✓ |

# ✅ 正確：元素級（每個可視差異獨立一行）
| Header > 麵包屑分隔符      | chevron_right icon               | "/" 文字        | ✓ |
| Header > 角色名稱字體      | text-3xl font-bold tracking-tight | text-2xl        | ✓ |
| Header > Badge 字體大小     | text-[10px] uppercase tracking-wider | text-xs       | ✓ |
| Header > Action 按鈕樣式   | 40×40 ghost icon-only             | text button     | ✓ |
| Tab > 觸發器內容            | 純文字，無 icon                    | icon + 文字     | ✓ |
| Tab > 選取狀態              | border-b-2 + font-bold            | bg + shadow + outline | ✓ |
```

具體做法：讀取 `code.html` 時，對每個 HTML 元素的 class 逐一與現有元件比對。
特別注意 shadcn/ui 元件的**基底樣式**（如 TabsTrigger 的 focus ring、border、shadow），
這些預設樣式在 `code.html` 中不存在，代表設計稿預期它們被清除。

## 3-4：子元件展開規則（MANDATORY）

差異清單中的每個區塊，若包含子元件（import 的其他 component），**必須先 Read 該子元件的完整程式碼**，再逐一列出其內部元素的差異。

**禁止**用「內部大致相同」、「子元件不需改動」等描述帶過。每個子元件都必須展開到元素級，與 `code.html` 中對應的 HTML 結構逐一比對。

```
# ❌ 錯誤：跳過子元件
| 世界觀公開資訊 | 區塊編輯器 | 現有 BlockEditor | ✓ |

# ✅ 正確：展開子元件內部元素
| BlockEditor > Block 容器       | bg-muted/30 p-6 rounded-xl      | bg-card p-4 rounded-lg    | ✓ |
| BlockEditor > 類型切換         | pill toggle（標題/內文）          | 靜態 label                | ✓ |
| BlockEditor > 刪除按鈕         | 常駐顯示 text-muted-foreground/40 | hover 才顯示 opacity-0   | ✓ |
| BlockEditor > 新增區塊按鈕     | 虛線框 + PlusCircle icon          | 兩個獨立按鈕              | ✓ |
| BlockEditor > Input (title)    | bg-transparent border-0 text-lg   | bg-muted h-11            | ✓ |
| BlockEditor > Textarea (body)  | bg-transparent border-0 text-sm   | bg-muted rows-4          | ✓ |
```

## 3-5：相似元件掃描（MANDATORY — 實作前強制閘門）

從差異清單中提取所有**新增或大幅改動的視覺 pattern**，對 codebase 執行 `grep` 搜尋相同的 CSS 特徵，列出所有匹配的現有元件。

**具體做法：**
1. 從 `code.html` 中識別每個獨特的視覺 pattern（如虛線框按鈕、icon-only 按鈕、特定 input 樣式）
2. 提取該 pattern 的關鍵 CSS 特徵（如 `border-dashed`、`bg-muted border-none h-11`）
3. 對 `components/` 目錄執行 `grep`，找出所有使用相同 pattern 的檔案
4. 判斷是否應抽出共用元件

輸出格式：
```
## 相似元件掃描結果

| 視覺 Pattern | 關鍵 CSS 特徵 | 匹配檔案 | 應抽出共用 |
|-------------|--------------|---------|-----------|
| 虛線框新增按鈕 | border-dashed | create-character-button.tsx, background-block-editor.tsx | ✓ → DashedAddButton |
| icon-only 操作按鈕 | p-2 rounded-full icon-only | character-card.tsx, game-header-actions.tsx | ✓ → IconActionButton |
| GM 表單 input | bg-muted border-none h-11 | ability-edit-wizard.tsx, game-edit-form.tsx | ✓ → GM_INPUT_CLASS |
```

> **為什麼這一步是強制的？**
> 視覺改版最常見的技術債來源是「同一個 pattern 在多處獨立實作」。
> 若不在動手前掃描，改版後仍會留下不一致的舊元件，且未來每次修改都要逐一更新。

**等待用戶確認差異清單 + 掃描結果後，才能開始實作。**
