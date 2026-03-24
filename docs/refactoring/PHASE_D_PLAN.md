# Phase D 計畫書：UI 全面重設計

> 分支策略：從 `main`（Phase B+C PR 合併後）開啟 `feat/phase-d-ui-redesign` 進行，完成後再 PR → `main`

---

## D-0. 前置條件

- [ ] Phase B+C PR 合併至 `main`
- [ ] 從 `main` 建立 `feat/phase-d-ui-redesign` 分支

---

## D-1. 前階段遺留項目

### D-1a. 元件合併

**`ItemTransferDialog` / `ItemShowcaseSelectDialog`**
- 路徑：`components/player/item-transfer-dialog.tsx`、`components/player/item-showcase-select-dialog.tsx`
- 現況：結構幾乎完全相同（各約 110 行），僅用途標籤不同
- 行動：合併為單一 `ItemSelectDialog`，以 `mode` prop 區分行為

### D-1b. Reveal UI 重設計

**`RevealableItem` 元件**
- 現況：Phase B-1 延後，Phase D 將重新設計揭露互動 UI
- 行動：配合新 UI 設計，重新規劃揭露流程的 UX

### D-1c. 共享 Hook 抽取

**`useUsageFlow` 共享 Hook**
- 現況：Phase B-1 延後，item/skill 使用流程差異足夠大，待 UI 穩定後再評估
- 行動：UI 重設計後，重新評估 `use-item-usage.ts` 與 `use-skill-usage.ts` 的共同邏輯是否可抽取

### D-1d. 元件精簡

**`character-card-view.tsx`（702 行）**
- 現況：函式本體約 625 行，混合對抗 Dialog 管理與 WebSocket 事件處理
- 行動：抽取 `useContestDialogManagement`、`useGameEventHandler` 兩個 hook

### D-1e. Bug 修復

**`item-list.tsx` 的 `selectedItem` stale closure**
- 現況：WebSocket handler 中 `selectedItem` 未透過 ref 存取，可能讀取到舊值
- 行動：新增 `selectedItemRef`，類比現有的 `pendingContestsRef` 模式
- 參考：`hooks/use-character-websocket-handler.ts` 的 `handlerRef` 模式

---

## D-2. 設計工具評估

- [ ] 評估 Google Stitch 作為設計稿生成工具
- [ ] 評估 Google Docs 嵌入方案（適用於內容豐富的區塊，如角色背景故事）
- [ ] 確認設計需求：桌面 / 平板 / 手機三端，可讀性優先

---

## D-3. 設計需求定義

- [ ] 訂定色彩系統與字體規範
- [ ] 訂定 GM 側頁面設計規範
- [ ] 訂定玩家側頁面設計規範
- [ ] 確認無障礙（a11y）基線要求（WCAG 2.1 AA）

---

## D-4. 實作

### D-4a. 遺留修復（優先處理）
- [ ] D-1e：`selectedItem` stale closure 修復
- [ ] D-1d：`character-card-view.tsx` hook 抽取

### D-4b. 元件重設計
- [ ] 玩家側：角色卡視圖（`character-card-view.tsx`）
- [ ] 玩家側：道具列表（`item-list.tsx`）
- [ ] 玩家側：技能列表（`skill-list.tsx`）
- [ ] GM 側：角色卡編輯（主要表單）
- [ ] 共用：對抗檢定 Dialog 流程

### D-4c. 元件合併與新增
- [ ] D-1a：合併 `ItemTransferDialog` / `ItemShowcaseSelectDialog`
- [ ] D-1b：`RevealableItem` 重設計
- [ ] D-1c：`useUsageFlow` 是否可抽取（UI 穩定後評估）

---

## D-5. 驗收

- [ ] 手機響應式驗證（320px、375px、768px）
- [ ] 桌面瀏覽器驗證（1280px、1920px）
- [ ] `/code-review` 全面審查

---

## 完成標準

1. 所有 D-1 遺留項目已處理完畢
2. 新設計在三端（桌面 / 平板 / 手機）均可正常使用
3. `type-check` / `lint` / 212+ tests 全數通過
4. Code review 無 HIGH 以上問題
