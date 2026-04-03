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
  └─ [前置] 縱向分析：確認元件所有權（見下方「Stitch 作業注意事項 #1」）
  └─ 定義畫面狀態清單（每個畫面有哪些狀態需要設計）
  └─ 產生 Stitch prompt（含狀態說明、資料結構、互動描述，見下方 #2）
  └─ 在 Stitch 迭代設計稿 → 定稿
  └─ 將設計稿輸出整合回 DESIGN.md 與組件規格（見下方 #3、#4）

Step 4：實作（D-4）
  └─ 根據 DESIGN.md 實作各畫面
  └─ 遵守 React pattern 規範（見下方 #5）
  └─ impeccable:polish 最終品質確認
```

### Stitch 相容性驗證結果（2026-03-25）

- [x] Stitch 輸出**不直接相容** Tailwind CSS 4+：使用 Material Design token 命名，需手動對照轉換（見下方 #4）
- [x] Stitch 輸出**不直接相容** shadcn/ui：使用原生 HTML 元素與自訂 CSS，不可直接貼入
- [x] **結論**：Stitch 作為設計視覺參考使用，不作為程式碼來源

---

### Stitch 作業注意事項（2026-03-25 歸納）

> 以下條目源自 PIN 解鎖畫面實作過程中的實際踩坑與反思。

#### #1 前置縱向分析：確認元件所有權

**在開始 Stitch 設計前**，必須完成縱向分析，確認要修改的是哪個元件：

```
向上（呼叫端）：
  - 組件：grep import 路徑，找出所有父組件
  - Next.js page：grep 路由（Link、router.push、redirect）
  - Server action / API：grep 函數名稱

向下（依賴鏈）：
  - 沿著 page → layout → component 讀完關鍵節點
  - 不能假設任何組件「只是顯示用的」
```

**常見陷阱**：Next.js `page.tsx` 透過 filesystem 自動註冊為路由，靜態分析工具（knip、ts-prune）無法偵測「已無導航入口的頁面」，必須人工確認呼叫端。

**實際案例**：PIN 解鎖畫面的分析只讀了 `app/c/[characterId]/page.tsx`，未繼續追蹤 `CharacterCardView` 內部已有 `PinUnlock` 組件，導致錯誤地建立了新組件，造成重複開發。

---

#### #2 Stitch Prompt 完整性要求

Prompt 必須涵蓋以下所有面向，缺少任一項都可能導致設計稿與功能不符：

| 項目 | 說明 | 範例 |
|------|------|------|
| 畫面狀態 | 列出所有視覺狀態 | 預設、錯誤、驗證中、成功 |
| 輸入欄位 | 欄位名稱、格式、長度限制 | PIN 4 碼數字、遊戲代碼 6 碼英數 |
| 互動邏輯 | 按鈕觸發的行為與條件 | 僅 PIN → 唯讀模式；PIN + 遊戲代碼 → 完整模式 |
| 錯誤提示 | 各種錯誤的顯示方式與位置 | 位置固定避免版面晃動；區分 PIN 錯誤 vs 遊戲代碼錯誤 |
| 模式差異 | 同一畫面的不同行為分支 | 唯讀模式只有 PIN 框變紅；完整模式兩者都變紅 |
| 設計語言 | 指定主題、色彩偏好 | 深色主題、琥珀金強調色 |

---

#### #3 Stitch 產出三個檔案的使用方式

Stitch 產出 `screen.png`、`DESIGN.md`、`code.html` 三個檔案，**各有不同用途**，不能混用：

| 檔案 | 用途 | 注意事項 |
|------|------|---------|
| `screen.png` | 視覺參考，確認整體視覺方向 | 主要設計定稿依據 |
| `DESIGN.md` | 理解設計概念與設計語言，作為實作的概念指引 | 直接閱讀，提取設計意圖 |
| `code.html` | 理解佈局結構與細節 | **不可直接使用**，token 命名系統不同，字體引用不同 |

**核心原則**：理解設計意圖後，以專案現有的 token 系統重新實作，而非照搬 HTML。

---

#### #4 Stitch Token → 專案 Token 對照表

Stitch 使用類 Material Design token 命名，實作前需先對照轉換：

| Stitch Token | 本專案 Token |
|-------------|-------------|
| `bg-surface` | `bg-background` |
| `surface-container-high` | `bg-card` |
| `text-on-surface` | `text-foreground` |
| `text-on-surface-variant` | `text-muted-foreground` |
| `from-primary to-primary-container` | `from-primary to-primary/80` |
| `border-outline` | `border-border` |
| `amber-glow`（自訂） | `shadow-[0_4px_24px_rgba(...)]`（inline style） |

---

#### #5 實作時的 React Pattern 規範

實作 Stitch 設計時，新建立的 UI state 需遵守以下規範：

**localStorage 初始化**：使用 `useState` lazy initializer，不在 `useEffect` 中同步呼叫 `setState`

```tsx
// ✅ 正確
const [value, setValue] = useState(() => {
  if (typeof window === 'undefined') return defaultValue;
  return localStorage.getItem(KEY) ?? defaultValue;
});

// ❌ 錯誤（觸發額外渲染）
const [value, setValue] = useState(defaultValue);
useEffect(() => {
  setValue(localStorage.getItem(KEY) ?? defaultValue);
}, []);
```

**props/hook 值同步**：使用派生值（`??`），不用 `useEffect` 同步

```tsx
// ✅ 正確
const [localValue, setLocalValue] = useState<string | undefined>(undefined);
const effectiveValue = localValue ?? hookValue; // 使用者未選擇時回退到 hook 值

// ❌ 錯誤（觸發額外渲染）
useEffect(() => {
  if (hookValue !== undefined && localValue === undefined) {
    setLocalValue(hookValue);
  }
}, [hookValue, localValue]);
```

---

## D-4. 設計需求定義

- [x] `impeccable:teach-impeccable` 執行完成（設計語言基線）— `.impeccable.md` ✅ 2026-03-24
- [x] 訂定色彩系統與字體規範 — `impeccable:colorize` 完成 ✅ 2026-03-24
- [x] 訂定 GM 側頁面設計規範 — `docs/refactoring/GM_DESIGN_SPEC.md`（v2.0 2026-04-01 全面改版，v1.0 歸檔於 `docs/archive/gm-design-spec-v1.md`）✅ 2026-03-24
- [x] 訂定玩家側頁面設計規範 — `docs/refactoring/PLAYER_DESIGN_SPEC.md` ✅ 2026-03-24
- [x] 確認無障礙（a11y）基線要求（WCAG 2.1 AA）— 含於 PLAYER_DESIGN_SPEC.md ✅ 2026-03-24

---

## D-5. 實作

### D-5a. 遺留修復（優先處理）
- [x] D-1e：`selectedItem` stale closure 修復 ✅ 2026-03-24
- [x] D-1d：`character-card-view.tsx` hook 抽取 ✅ 2026-03-24

### D-5a-2. 設計系統基礎（已完成）
- [x] `impeccable:colorize`：建立完整 oklch 品牌色彩系統（`app/globals.css`）✅ 2026-03-24
  - 深色模式：深午夜藍 + 明亮琥珀金；淺色模式：暖米白 + 琥珀金
  - 新增語義色 token：success / warning / info / destructive（含 foreground）
  - 新增環境指示色 token：env-baseline（板岩藍）/ env-runtime（琥珀金）
- [x] `impeccable:normalize` + `impeccable:harden`：全站色彩 + icon 標準化（完整掃描）✅ 2026-03-24
  - 替換所有 hard-coded Tailwind 色階（含 text-red-/green-/blue-/purple-/amber-）為語義 token
  - 替換所有 UI emoji icon 為 Lucide React icon（含 auth 頁面、profile、world-info、character 頁面）
  - 移除所有 purple gradient 背景（login、verify、unlock、c/[characterId]、g/[gameId]）→ `bg-background`
  - 消除所有 `dark:` 手動覆寫，統一由 token 層（globals.css）管理深淺色模式
  - 影響超過 40 個檔案，最終 grep 掃描零殘留

### D-5a-3. RWD 修復（impeccable:adapt）✅ 2026-03-24
- [x] C-03：GM 行動版導航 — 新增 `MobileHeader` + shadcn Sheet 抽屜，`layout.tsx` 補入；`lg:` 以下顯示漢堡選單
- [x] C-06：玩家 Tab 觸控目標 — `TabsList h-12 sm:h-10`，各 `TabsTrigger` 加 `min-h-[44px] sm:min-h-0`，達 WCAG 44px
- [x] H-04：GM 道具編輯 Dialog 寬度 — `lg:max-w-[1400px]` → `lg:max-w-5xl`（1024px）
- [x] M-08：GM 角色卡圖片高度固定 — `h-48` → `aspect-4/3`（隨容器自適應）

### D-5b. 元件重設計（玩家側 — 全部完成 ✅ 2026-04-01）
- [x] 玩家側：PIN 解鎖畫面（`character-card-view.tsx` 內 PinUnlock）✅ 2026-03-25
- [x] 玩家側：角色卡視圖（`character-card-view.tsx`）✅ 2026-03-25
- [x] 玩家側：道具列表 + 道具詳情 Dialog（`item-list.tsx`、`item-detail-dialog.tsx`）✅ 2026-03-25
- [x] 玩家側：技能列表 + 技能詳情 Dialog（`skill-list.tsx`、`skill-detail-dialog.tsx`）✅ 2026-03-25
- [x] 玩家側：資訊 Tab（故事/人物關係/隱藏資訊）✅ 2026-03-27
- [x] 玩家側：數值 Tab（`info-status-tab.tsx`）✅ 2026-03-28
- [x] 玩家側：任務列表 + 任務 Dialog ✅ 2026-03-28
- [x] 玩家側：廣播通知 Dialog（`announce-dialog.tsx`）✅ 2026-03-29
- [x] 玩家側：道具展示 Dialog ✅ 2026-03-29
- [x] 共用：對抗檢定 Dialog 流程 ✅ 2026-03-31
  - [x] 防守方對抗回應 Dialog（`contest-response-dialog.tsx`）✅ 2026-03-30
  - [x] 攻擊方等待 Dialog（`contest-waiting-dialog.tsx`）✅ 2026-03-31
  - [x] 目標道具選擇 Dialog（`target-item-selection-dialog.tsx`）✅ 2026-03-31
- [x] 玩家側：世界觀頁面（`world-info-view.tsx`）✅ 2026-04-01
  - 新增共用元件：`ThemeToggleButton`、`CollapsibleSection`、`BackgroundBlockRenderer`、`CharacterAvatarList`
  - Game publicInfo 資料模型從 `{ worldSetting, intro, chapters }` 統一為 `{ blocks: BackgroundBlock[] }`
  - GM 端 `game-edit-form.tsx` 公開資訊改用 `BackgroundBlockEditor`
  - 角色卡故事 Tab / 人物關係 Tab 改用共用元件
  - 刪除死碼 `edit-game-button.tsx`
  - 版面最大寬度限制 1280px（Hero + 內容區域）

### D-5b-2. 元件重設計（GM 側 — 全部完成 ✅ 2026-04-03）
- [x] GM 側：主畫面重設計（P6：劇本列表頁 + sidebar 收合/展開 + 主題切換）✅ 2026-04-03
- [x] GM 側：劇本管理重設計（P3：Baseline 劇本資訊 + P4：Runtime 控制台 + Event Log）✅ 2026-04-02
- [x] GM 側：角色編輯重設計（P1：框架 + Sticky Save Bar + P2：Wizard + P5：7 Tab 內容）✅ 2026-04-02
- [x] GM 側：角色卡編輯（主要表單）✅ 2026-03-25
- [x] GM 側：登入頁重設計（P9）✅ 2026-04-03
  - Login 頁：Brand icon 圓形容器、glassmorphism 卡片、左側 icon input、漸層 CTA 按鈕、feature pills
  - Verify 頁：CSS ring spinner（3s 慢轉）、三狀態視覺（verifying/success/error）、bouncing dots、返回按鈕 arrow hover
  - 兩頁皆使用瀏覽器主題偏好（語意 token），移除 shadcn Card 改用原生 glassmorphism
- [x] GM 側：Dialog 群重設計（P7：建立劇本 / 新增角色 / 結束遊戲）✅ 2026-04-03
- [x] GM 側：個人設定頁重設計（P8）✅ 2026-04-03
- [x] GM 側：儲存按鈕功能盤點（P10）✅ 2026-04-03
- [x] GM 側：Bug 修復與功能補完（P11）✅ 2026-04-03

### D-5c. 元件合併與新增
- [x] D-1a：合併 `ItemTransferDialog` / `ItemShowcaseSelectDialog` → `ItemSelectDialog` (mode prop) ✅ 2026-03-25
- [x] D-1b：`RevealableItem` — 不執行 ✅ 2026-04-03（Phase D 重設計後 secrets/tasks UI 已高度分化，無共用元件可抽取）
- [x] D-1c：`useUsageFlow` — 不執行 ✅ 2026-04-03（~80% 流程重疊但差異在業務層面，抽取為 premature abstraction）
- [x] 清理死碼 `secret-info-section.tsx`（被 `info-secrets-tab.tsx` 取代，無任何 import）✅ 2026-04-03

---

## D-6. 驗收

- [x] `/code-review` 全面審查 ✅ 2026-04-03
  - Fixed CRITICAL (2): `checkPinAvailability` / `checkGameCodeAvailability` 缺少 auth guard
  - Fixed HIGH (5): `saveAll` 錯誤處理（Promise.allSettled + failedCount）、interface→type、WS listener unsafe cast、toast timer cleanup
  - Fixed MEDIUM (5): console.log 清理、重複 beforeunload 移除、stale comment
  - 記錄至 Phase E：`updateCharacter` 460 行拆分、`characters.ts` 超 800 行
- [x] RWD 自動掃描修復 ✅ 2026-04-03
  - Fixed CRITICAL (4): event-log Select 寬度、scroll 按鈕定位+觸控目標、stats input 寬度、save bar padding
  - Fixed MEDIUM (3): game-edit-form input 寬度、wizard grid cols、character card 寬度
- [x] 規格文件同步 ✅ 2026-04-03
  - 02_DATABASE_SCHEMA.md (v1.5): Game.publicInfo → BackgroundBlock[], Character.publicInfo.background → BackgroundBlock[], PIN 4 位數字
  - 03_API_SPECIFICATION.md (v1.9): 13 處修正（publicInfo×8, PIN×4, regex×1）
  - 04_WEBSOCKET_EVENTS.md: background 範例更新
  - USER_GUIDE.md: PIN "4-6" → "4" 位數字
  - knowledge/architecture/data-models.md: Phase D 標記為已完成
  - knowledge/gm/character/basic-info.md: PIN 儲存方式修正（plaintext, not hashed）
- [x] 登出確認 Dialog ✅ 2026-04-03
  - ExpandedNavigation / CollapsedNavigation 加入 LogoutConfirmDialog
  - 使用 GM_DIALOG_CONTENT_CLASS / GM_CANCEL_BUTTON_CLASS 統一樣式
- [x] sidebar cascading render 修正 ✅ 2026-04-03
  - useEffect + setState → lazy initializer（符合 CLAUDE.md React 模式規範）
- [x] 手機瀏覽器實測驗證（320px、375px、768px）✅ 2026-04-03
- [x] 桌面瀏覽器實測驗證（1280px、1920px）✅ 2026-04-03

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
