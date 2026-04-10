# 設計稿實作規範

> 適用於使用 Stitch 或其他 AI 設計工具產出設計稿後的實作階段。

## Stitch Prompt 格式

Stitch prompt 產出時不要使用 markdown 表格格式，改用純文字段落或清單格式，方便直接複製貼上到 Stitch 輸入介面。

將必填欄位改用「標題 + 內文」格式呈現，確保整段可以一次複製。

## 設計稿實作紀律

### 禁止包裝既有元件

Stitch 設計稿實作時，禁止直接包裝既有子元件作為「快捷方式」，必須依設計稿重寫 UI。

歷史教訓：Skill 編輯和 AbilityEditWizard 兩次都因為先嘗試「套殼複用」而大幅偏離設計稿，最終仍需完全重寫，浪費雙倍時間。既有元件的樣式、間距、佈局與設計稿幾乎一定不同。

### 實作步驟

1. 初次實作就按設計稿重寫，不嘗試包裝既有元件
2. 差異清單必須拆到**單一 CSS 屬性層級**（字體大小、padding、height、border、shadow 各自一行），不可停在區塊名稱
3. 交付前的自我比對必須逐項檢查每個 CSS class，特別注意 shadcn/ui 的 base class（如 SelectTrigger 的 `data-[size=default]:h-9`）
4. 同類型元素（所有 Textarea、所有 Input、所有 Select）必須確認一致性，修一處就檢查全部
