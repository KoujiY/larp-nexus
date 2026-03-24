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

## D-2. 系統概述（設計範疇）

> 以下為設計重構的功能範疇定義。

### 使用者分類與裝置

| 使用者 | 主要裝置 | 備注 |
|--------|---------|------|
| GM | PC（桌面瀏覽器） | 仍需 RWD |
| 玩家 | 手機 | 仍需 RWD |

---

### GM 端畫面清單

#### 登入畫面
- 僅使用 Magic Link（收 email 後點連結登入）
- 需提供：驗證中狀態、驗證成功轉場效果與文字

#### 主畫面
- 功能入口：劇本管理、個人設定、登出
- 角色卡需先選擇劇本才可進入，並導向劇本管理
- 個人設定：唯讀呈現基本資料（email、首次登入時間等）
- 現況：陽春，**需要全面重新設計**

#### 劇本管理
- 建立劇本（簡單 dialog，輸入名稱即可）
- 選擇劇本進入「管理劇本」

#### 管理劇本
- 可切換 **Baseline**（遊戲前設定）與 **Runtime**（遊戲進行中）環境，兩者不會並存
  - **Baseline → Runtime**：觸發「開始遊戲」後，系統**一次性快照複製** baseline 至 runtime DB 並開放玩家互動；複製後兩者完全獨立，遊戲進行中 GM 的編輯寫入 runtime（不回寫 baseline）
  - **Runtime → Baseline**：觸發「結束遊戲」後，runtime 資料存為 snapshot 後刪除，切回 baseline DB 並關閉玩家互動
  - Runtime 中可進行修改，**不影響** baseline DB；baseline 的修改同樣不影響進行中的 runtime
  - **需要明確的視覺提示**讓 GM 知道目前在哪個環境（影響設計：頂部 badge 或不同主題色等）
- 兩個子頁籤：
  - **劇本資訊**：基本資訊（GM 內部描述）、公開資訊（面向玩家，含預覽）、及時推播（Runtime 下推送訊息給玩家）
  - **角色列表**：選擇角色進入編輯，或新增角色（簡單 dialog，輸入名稱即可）

#### 編輯角色
- **基本資訊**：角色基本資訊、公開資訊（玩家預設已知）、隱藏資訊（可隨遊戲推進揭露）
- **角色數值**：新增/編輯數值項目（如 HP、力量），可設最大值；時效性效果會顯示在此（數值變動量、剩餘時間）
- **任務管理**：一般任務（玩家預設已知）、隱藏目標（可隨遊戲推進揭露）
- **道具管理**：分消耗品（有使用次數限制，耗盡無法使用）與裝備兩種；一個道具可具備多個效果與多種檢定模式；道具可被偷竊或移除
  - 新增/編輯道具：基本資訊、檢定系統、使用限制、使用效果
- **技能管理**：無使用次數限制，可設定冷卻時間
  - 新增/編輯技能：基本資訊、檢定系統、使用限制、使用效果

---

### 玩家端畫面清單

#### 公開頁面
- 所有玩家預設可檢視，不需解鎖
- 提供世界觀、前導故事等區塊

#### 角色卡（三種模式）

**解鎖畫面**
- 輸入 PIN → 進入預設模式
- 輸入 遊戲代碼 + PIN，且 GM 已開始遊戲 → 進入完整模式

**預設模式**（唯讀瀏覽）
- 顯示：基本資訊、角色數值、任務列表、道具列表、技能列表
- 各項目以卡片呈現，點開可檢視詳細資訊
- 所有數值與狀態在任何模式下均**無法直接修改**，僅能透過道具/技能使用或 GM 介入變更
- 如欲使用道具/技能，提示需進入完整模式

**完整模式**（可互動）
- 道具與技能可使用
- 若使用有檢定需求且目標為其他角色：進入**對抗流程**
  - 攻擊方（主動使用者）：顯示等待 dialog
  - 防守方：顯示回應 dialog
  - 若效果為偷竊/移除道具：對抗成功後額外顯示目標道具選擇 dialog
- GM 端在對抗流程中**無任何介入點**（無法查看即時記錄、無法強制干預結果）

#### 通知面板
- 彙整所有通知：GM 推播、檢定結果（成功/失敗）、效果處理（數值變化、道具異動）、隱藏資訊/任務揭露
- 防守方**對抗成功**時不顯示通知（僅攻擊失敗對攻擊方顯示）

---

## D-3. 設計工具與作業流程

### 工具組合

| 工具 | 用途 |
|------|------|
| `impeccable:teach-impeccable` | 一次性設定：建立設計語言基線（色彩、字型、間距、風格偏好） |
| `impeccable:audit` | 審計現有 UI 問題，作為重設計前的現況紀錄 |
| Google Stitch | 根據設計規格 prompt 生成可視化設計稿，迭代後定稿 |
| `impeccable:adapt` | 確認跨裝置響應式設計 |
| `impeccable:polish` | 實作完成後的最終品質把關 |

### 作業流程

```
Step 1：流程確認 ✅
  └─ 系統概述定稿（2026-03-24）

Step 2：設計基線建立
  └─ 執行 impeccable:teach-impeccable（收集風格偏好與技術約束）
  └─ 執行 impeccable:audit（盤點現有 UI 問題）

Step 3：逐畫面設計（重複執行，從最複雜的畫面開始）
  └─ 定義畫面狀態清單（每個畫面有哪些狀態需要設計）
  └─ 產生 Stitch prompt（含狀態說明、資料結構、互動描述）
  └─ 在 Stitch 迭代設計稿 → 定稿
  └─ 將設計稿輸出整合回 DESIGN.md 與組件規格

Step 4：實作（D-4）
  └─ 根據 DESIGN.md 實作各畫面
  └─ impeccable:polish 最終品質確認
```

### Stitch 相容性待驗證項目

- [ ] Stitch 輸出是否相容 Tailwind CSS 4+（本專案使用）
- [ ] Stitch 輸出是否相容 shadcn/ui 組件結構
- [ ] 建議：先用一個簡單畫面（如登入畫面）測試輸出品質，再決定是否全面採用

---

## D-4. 設計需求定義

- [ ] `impeccable:teach-impeccable` 執行完成（設計語言基線）
- [ ] 訂定色彩系統與字體規範
- [ ] 訂定 GM 側頁面設計規範
- [ ] 訂定玩家側頁面設計規範
- [ ] 確認無障礙（a11y）基線要求（WCAG 2.1 AA）

---

## D-5. 實作

### D-5a. 遺留修復（優先處理）
- [x] D-1e：`selectedItem` stale closure 修復 ✅ 2026-03-24
- [x] D-1d：`character-card-view.tsx` hook 抽取 ✅ 2026-03-24

### D-5b. 元件重設計
- [ ] 玩家側：角色卡視圖（`character-card-view.tsx`）
- [ ] 玩家側：道具列表（`item-list.tsx`）
- [ ] 玩家側：技能列表（`skill-list.tsx`）
- [ ] GM 側：角色卡編輯（主要表單）
- [ ] 共用：對抗檢定 Dialog 流程

### D-5c. 元件合併與新增
- [ ] D-1a：合併 `ItemTransferDialog` / `ItemShowcaseSelectDialog`
- [ ] D-1b：`RevealableItem` 重設計
- [ ] D-1c：`useUsageFlow` 是否可抽取（UI 穩定後評估）

---

## D-6. 驗收

- [ ] 手機響應式驗證（320px、375px、768px）
- [ ] 桌面瀏覽器驗證（1280px、1920px）
- [ ] `/code-review` 全面審查

---

## 相關文件

| 文件 | 說明 |
|------|------|
| `docs/refactoring/PHASE_D_AUDIT.md` | UI/UX 全面審計報告（2026-03-24）— 27 個問題，含工作流程分析、問題清單、修復命令對照表 |
| `.impeccable.md` | 設計上下文（品牌個性、視覺方向、設計原則、技術約束） |

---

## 完成標準

1. 所有 D-1 遺留項目已處理完畢
2. 新設計在三端（桌面 / 平板 / 手機）均可正常使用
3. `type-check` / `lint` / 212+ tests 全數通過
4. Code review 無 HIGH 以上問題
