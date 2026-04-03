# GM 端全面重設計 — 實作計畫

**日期**：2026-04-01
**設計規格**：`docs/refactoring/GM_DESIGN_SPEC.md`（v2.0）
**分支**：`refactor/project_enhancement`（Phase D-5b-2）

---

## 總覽

依設計規格第 5 節優先序，拆為 8 個 Phase，每個 Phase 內含具體任務清單。
Phase 之間有嚴格依賴關係（後面的 Phase 依賴前面的基礎設施），Phase 內的任務如標註「可並行」則無互相依賴。

### 依賴圖

```
P1（框架 + Save Bar）
 ├─→ P2（Wizard）
 ├─→ P5（各 Tab 內容）─→ P5 依賴 P2（道具/技能 Tab 需要 Wizard）
 └─→ P3（劇本管理 Baseline）─→ P4（Runtime 控制台）
P6（劇本列表頁）─→ 獨立，但需 P3 完成後再砍 Dashboard
P7（Dialog 群）─→ 獨立
P8（個人設定）─→ 獨立
P9（登入頁）─→ 獨立
```

> **P3/P4 順序調整（2026-04-02）**：原 P3（Runtime 控制台）依賴原 P4（劇本管理頁框架），
> 實際執行順序應為先建框架再加控制台，因此對調編號。下方章節已按新編號排列。

---

## P1. 角色編輯頁框架 + Sticky Save Bar（基礎設施）

> 規格 §4.7。這是所有角色 Tab 的容器，必須最先完成。

### P1-1. 建立 `StickySaveBar` 元件

**新增檔案**：`components/gm/sticky-save-bar.tsx`

**職責**：
- 接收 `dirtyState: Record<TabKey, TabDirtyInfo>` props
  - `TabDirtyInfo = { isDirty: boolean; added: number; modified: number; deleted: number }`
- 有 dirty state 時從底部滑入（Framer Motion `animate`）
- 顯示摘要文字：「N 個分頁有未儲存的變更」
- 展開詳細統計：各 Tab 的新增/修改/刪除數量
- 「全部儲存」按鈕：觸發 `onSaveAll` callback
- 「捨棄變更」按鈕：觸發 `onDiscardAll` callback
- `beforeunload` 監聽 + 自訂 `AlertDialog`（離開頁面攔截）

**相關型別**（新增至 `types/gm-edit.ts`）：
```typescript
type TabKey = 'basic' | 'background' | 'secrets' | 'stats' | 'tasks' | 'items' | 'skills';

type TabDirtyInfo = {
  isDirty: boolean;
  added: number;
  modified: number;
  deleted: number;
};

type DirtyState = Record<TabKey, TabDirtyInfo>;
```

### P1-2. 重寫 `CharacterEditTabs`

**修改檔案**：`components/gm/character-edit-tabs.tsx`（112 行 → 全面改寫）

**變更**：
- Tab 數量從 5 → 7（新增「背景故事」「隱藏資訊」）
- 移除 `window.confirm()` 攔截邏輯（Sticky Save Bar 取代）
- 切 Tab 不再跳警告，dirty state 跨 Tab 保留
- Tab 列分組：敘事類（基本設定、背景故事、隱藏資訊）| 機械類（數值、任務、道具、技能）
- 新增 icon：`BookOpen`（背景故事）、`EyeOff`（隱藏資訊）
- 整合 `StickySaveBar`，傳入各 Tab 的 dirty state
- Tab 標籤上有 dirty indicator：名稱後加 `●`（`text-warning`）

**核心架構**：
```
CharacterEditTabs
├── TabsList（7 個 TabsTrigger）
├── TabsContent × 7（各 Tab 元件）
└── StickySaveBar（fixed bottom，接收所有 Tab dirty state）
```

### P1-3. 建立 dirty state 管理 hook

**新增檔案**：`hooks/use-character-edit-state.ts`

**職責**：
- 管理 7 個 Tab 的記憶體狀態（local state，非 server state）
- 提供 `registerDirty(tabKey, info)` / `clearAll()` / `clearTab(tabKey)` API
- 提供 `saveAll()` 統一觸發各 Tab 的 save action
- 提供 `discardAll()` 回復所有 Tab 至 server state
- 計算 `hasDirty: boolean` 與 `dirtyState: DirtyState`

### P1-4. 更新角色編輯頁面

**修改檔案**：`app/(gm)/games/[gameId]/characters/[characterId]/page.tsx`（169 行）

**變更**：
- 環境橫幅從 inline Alert → 獨立 `EnvironmentBanner` 元件（共用於角色編輯頁 + 劇本管理頁）
- 麵包屑結構加 `<nav aria-label="breadcrumb">`
- 調整頁面佈局以容納 Sticky Save Bar（底部預留空間）

**新增檔案**：`components/gm/environment-banner.tsx`

---

## P2. 道具/技能編輯 Wizard

> 規格 §4.16。最大痛點，需要拆分現有的 Dialog 邏輯。

### P2-1. 建立 `AbilityEditWizard` 元件

**新增檔案**：`components/gm/ability-edit-wizard.tsx`

**職責**：
- 共用元件，`mode: 'item' | 'skill'` 控制差異
- 4 步驟 Stepper：基本資訊 → 效果設定 → 檢定配置 → 預覽確認
- Step 1 差異：
  - Item：類型選擇（消耗/裝備/被動）、數量、可轉讓
  - Skill：圖示 URL、額外效果類型（task_reveal / task_complete）
- Step 2：整合現有 `EffectEditor`（`effect-editor.tsx`）
- Step 3：整合現有 `CheckConfigSection`（`check-config-section.tsx`）
- Step 4：預覽卡片 + 確認按鈕
- 「儲存」= 寫入父 Tab 記憶體狀態（Dialog 層儲存），不直接打 API

**新增檔案**：`components/gm/wizard-stepper.tsx`（Stepper 導航列，可複用）

### P2-2. 重構 `items-edit-form.tsx`

**修改檔案**：`components/gm/items-edit-form.tsx`（531 行）

**變更**：
- 移除內嵌的 Dialog 編輯邏輯（~300 行）→ 改為呼叫 `AbilityEditWizard`
- 列表改為卡片式 + dirty state 視覺標記（琥珀金左邊框 + badge）
- 刪除行為改為「標記刪除」（opacity-50 + 刪除線 + 復原按鈕）
- 不再有獨立的 `SaveButton`，改為向上回報 dirty state
- 移除 `onDirtyChange` prop，改為透過 `useCharacterEditState` hook 回報

### P2-3. 重構 `skills-edit-form.tsx`

**修改檔案**：`components/gm/skills-edit-form.tsx`（407 行）

**變更**：同 P2-2，但 mode='skill'

### P2-4. 整理共用子元件

**保留不變**（被 Wizard 引用）：
- `effect-editor.tsx`（366 行）
- `check-config-section.tsx`（301 行）
- `usage-limit-section.tsx`（60 行）
- `tags-section.tsx`（57 行）

**可能微調**：確認這些子元件能在 Wizard 的 Step context 中正常運作（不依賴外層 form state）

---

## P3. 劇本管理頁重設計（Baseline 框架）

> 規格 §4.3（Baseline）+ §4.5（角色列表）。P4 的前置框架。

### P3-1. 重寫 `GameEditTabs`

**修改檔案**：`components/gm/game-edit-tabs.tsx`（48 行 → 全面改寫）

**變更**：
- Emoji tab label → Lucide icon（`FileText`、`Users`、`Radio`）
- 新增 Runtime 控制台 Tab（`game.isActive` 時才顯示）
- Tab 結構：劇本資訊 | 角色列表 | 廣播系統 | [控制台]（Runtime only）
- 廣播系統從 `TabsContent value="info"` 內移出為獨立 Tab

### P3-2. 更新劇本管理頁面

**修改檔案**：`app/(gm)/games/[gameId]/page.tsx`（146 行）

**變更**：
- 加入 `EnvironmentBanner`（P1-4 建立的共用元件）
- 麵包屑 a11y 結構
- 傳入 `RuntimeConsole`（P4-4）至 `GameEditTabs`

### P3-3. 重設計角色卡片

**修改檔案**：`components/gm/character-card.tsx`（97 行）

**變更**：
- 依規格 §4.5 調整卡片佈局：圖片 `aspect-4/3` + 名稱 + 描述截斷 + 操作按鈕
- hover lift 效果

---

## P4. Runtime 控制台（新功能）

> 規格 §4.4。需要新的後端 API。依賴 P3 的劇本管理頁框架。

### P4-1. Event Log 後端 API

**新增檔案**：`app/actions/event-log.ts`

**職責**：
- Server Action：`getEventLog(gameId, filters)` 
- 聚合查詢 `logs` + `pending_events` collections
- 支援篩選：角色、事件類型（道具使用 / 技能使用 / 對抗 / 廣播 / 系統）
- 支援分頁（cursor-based，lazy loading）
- 返回時間排序的事件列表

**相關型別**（新增至 `types/event-log.ts`）：
```typescript
type EventLogEntry = {
  id: string;
  timestamp: Date;
  type: 'item_use' | 'skill_use' | 'contest' | 'broadcast' | 'system' | 'reveal';
  characterId?: string;
  characterName?: string;
  summary: string;
  detail?: string;
};

type EventLogFilters = {
  characterId?: string;
  types?: EventLogEntry['type'][];
  cursor?: string;
  limit?: number;
};
```

### P4-2. WebSocket 事件推送至 GM

**修改檔案**：涉及 Pusher 事件發送的 Server Actions（需調查具體檔案）

**變更**：
- 現有事件（道具使用、技能使用、對抗結果等）新增推送至 GM channel
- GM channel 命名：`private-game-${gameId}-gm`

### P4-3. 建立 `EventLog` 元件

**新增檔案**：`components/gm/event-log.tsx`

**職責**：
- 篩選列：角色下拉 + 事件類型多選
- 事件列表：時間戳 + icon + 摘要，可展開詳情
- Lazy loading（滾動到底部自動載入更多）
- WebSocket 即時更新（新事件從頂部插入）

### P4-4. 建立 `RuntimeConsole` 元件

**新增檔案**：`components/gm/runtime-console.tsx`

**職責**：
- 4 區塊佈局：狀態總覽（上）、事件 Log（中，佔最大面積）、快速廣播（右側/下方）、遊戲控制（底部）
- 狀態總覽：在線人數、角色狀態摘要（上線/離線）
- 快速廣播：整合現有 `GameBroadcastPanel`
- 遊戲控制：整合現有 `GameLifecycleControls` 的「結束遊戲」

---

## P5. 角色編輯各 Tab 內容（可並行）

> 規格 §4.8-4.15。依賴 P1（框架）和 P2（Wizard，道具/技能 Tab 需要）。

### P5-1. 基本設定 Tab

**修改檔案**：`components/gm/character-edit-form.tsx`（724 行 → 大幅縮減）

**變更**：
- 從原本的「全部欄位」縮減為只包含：名稱、描述、PIN、人格特質
- 移除背景故事、隱藏資訊、人物關係等欄位（各自獨立為新 Tab）
- 移除獨立的 `SaveButton`，改為回報 dirty state 至 `useCharacterEditState`
- 重新命名為 `basic-settings-tab.tsx`（或保留原名但大幅瘦身）

**預估**：724 行 → ~150 行

### P5-2. 背景故事 Tab

**新增檔案**：`components/gm/background-story-tab.tsx`

**職責**：
- BackgroundBlock 編輯器（從 `character-edit-form.tsx` 抽出）
- 人物關係卡片列表（新增/刪除/排序）
- dirty state 回報（含區塊和關係的新增/修改/刪除計數）
- 引用現有 `background-block-editor.tsx`

### P5-3. 隱藏資訊 Tab

**新增檔案**：`components/gm/secrets-tab.tsx`

**職責**：
- 隱藏資訊卡片列表（從 `character-edit-form.tsx` 抽出）
- 每張卡片：標題、揭露狀態、自動揭露條件摘要
- 點擊卡片開啟 `SecretEditDialog`（已存在：`secret-edit-dialog.tsx`）
- dirty state 回報 + 4 種視覺狀態（正常/新增/修改/刪除）

### P5-4. 數值 Tab

**修改檔案**：`components/gm/stats-edit-form.tsx`

**變更**：
- 移除獨立 `SaveButton`，改為回報 dirty state
- 新增 dirty 視覺標記（新增/修改/刪除的數值列）
- `TemporaryEffectsCard` 保留在此 Tab 內

### P5-5. 任務 Tab

**修改檔案**：`components/gm/tasks-edit-form.tsx`（469 行）

**變更**：
- 移除獨立 `SaveButton`，改為回報 dirty state
- 卡片列表加 dirty 視覺標記
- 隱藏任務區塊分組顯示

### P5-6. 道具列表 Tab（依賴 P2）

已在 P2-2 處理 `items-edit-form.tsx`。此處確認 Tab 容器整合正確。

### P5-7. 技能列表 Tab（依賴 P2）

已在 P2-3 處理 `skills-edit-form.tsx`。此處確認 Tab 容器整合正確。

---

## P6. 劇本列表頁 + 導航調整

> 規格 §4.1。砍 Dashboard 路由。

### P6-1. 重設計劇本列表頁

**修改檔案**：`app/(gm)/games/page.tsx`（104 行）

**變更**：
- 加入歡迎區（GM 名稱 + 最後登入時間）
- 可摺疊快速流程指引（localStorage 記住折疊狀態）
- 劇本卡片依規格重新設計

### P6-2. 砍掉 Dashboard

**刪除檔案**：`app/(gm)/dashboard/page.tsx`（130 行）

**修改檔案**：`components/gm/navigation.tsx`（102 行）
- 移除 Dashboard 導航項
- 劇本管理設為主入口（active state 預設）
- 側邊欄底部（「登出」上方）新增主題切換按鈕（淺色/深色/跟隨系統）

**修改檔案**：`app/(gm)/layout.tsx`
- 確認 default redirect 指向 `/games` 而非 `/dashboard`

### P6-3. 檢查所有導航引用

**需要 grep**：
- `href="/dashboard"` 或 `redirect('/dashboard')` → 全部改為 `/games`
- `Link.*dashboard` → 全部移除或更新

---

## P7. Dialog 群（獨立，可並行）

> 規格 §4.2, §4.6, §4.17。

### P7-1. 建立劇本 Dialog

**修改檔案**：`components/gm/create-game-button.tsx`

**變更**：
- 依規格 §4.2 調整 Dialog 內容（劇本名稱 + 描述 + 對抗最大值）

### P7-2. 建立角色 Dialog

**修改檔案**：`components/gm/create-character-button.tsx`（297 行）

**變更**：
- 依規格 §4.6 調整 Dialog 內容

### P7-3. 結束遊戲確認 Dialog

**修改檔案**：`components/gm/game-lifecycle-controls.tsx`（233 行）

**變更**：
- 依規格 §4.17 調整確認 Dialog（警告 icon、後果列點、快照名稱輸入）

---

## P8. 個人設定頁（最低優先）

> 規格 §4.18。

### P8-1. 重設計個人設定

**修改檔案**：`app/(gm)/profile/page.tsx`（98 行）

**變更**：
- 依規格調整佈局（居中卡片、頭像佔位、資訊列表、登出按鈕）
- 最小化修改，不過度設計

---

## P9. 登入頁重設計（Magic Link 登入 + 驗證）

> 規格 §D-2「登入畫面」。純視覺層重設計，Server Action 邏輯不變。

### P9-1. 重設計登入頁

**修改檔案**：`app/auth/login/page.tsx`（116 行）

**現況**：
- 純白 Card 居中，Drama icon + 品牌名稱 + Email 輸入
- 成功/錯誤訊息為 inline alert
- 無品牌沉浸感，與其他已重設計頁面風格落差大

**變更**：
- 融入品牌視覺（LARP Nexus 品牌 logo + 金琥珀強調色）
- 提升沉浸感（背景裝飾、卡片質感、轉場動畫）
- 視覺狀態：預設表單、發送中（loading）、成功訊息、錯誤訊息
- Server Action `sendMagicLink` 不變，僅調整 UI 層

### P9-2. 重設計驗證頁

**修改檔案**：`app/auth/verify/page.tsx`（103 行）

**現況**：
- 純白 Card 居中，三態切換（verifying spinner / success CheckCircle2 / error XCircle）
- 驗證成功後 1.5s 延遲跳轉至 `/games`
- Suspense fallback 為簡易 loading Card

**變更**：
- 驗證中狀態：品牌風格 spinner + 進度感（非僅旋轉 icon）
- 驗證成功轉場：成功動畫效果 + 文字（如金色粒子、光暈等），1.5s 後跳轉
- 驗證失敗：清晰的錯誤提示 + 返回登入按鈕
- Server Action `verifyMagicLink` 不變，僅調整 UI 層

### P9-3. 評估 Auth Layout

**評估**：目前無 `app/auth/layout.tsx`，兩頁面各自渲染全畫面。
- 若兩頁面共用背景裝飾或品牌元素，考慮新增 auth layout 統一管理
- 若差異大則維持各自獨立

---

## 跨 Phase 共用工作

### 移除 `NavigationGuardDialog`

**刪除或重構**：`components/gm/navigation-guard-dialog.tsx`
- 舊的 `window.confirm` 攔截機制由 Sticky Save Bar 取代
- 評估是否仍需要此元件（可能只保留 `beforeunload` 部分）

### 更新 `SaveButton` 用途

**修改檔案**：`components/gm/save-button.tsx`
- 角色編輯頁不再使用（由 Sticky Save Bar 取代）
- 劇本管理頁的劇本資訊 Tab 仍使用（頁面層儲存）
- 確認 `SaveButton` 元件保留，但檢查是否有不再需要的 props

---

## 檔案異動總表

### 新增（9 個）

| 檔案 | Phase | 說明 |
|------|-------|------|
| `components/gm/sticky-save-bar.tsx` | P1-1 | 全局儲存列 |
| `components/gm/environment-banner.tsx` | P1-4 | 環境橫幅（Baseline/Runtime） |
| `hooks/use-character-edit-state.ts` | P1-3 | 角色編輯 dirty state 管理 |
| `types/gm-edit.ts` | P1-1 | GM 編輯相關型別 |
| `components/gm/ability-edit-wizard.tsx` | P2-1 | 道具/技能 4 步驟 Wizard |
| `components/gm/wizard-stepper.tsx` | P2-1 | Stepper 導航列 |
| `components/gm/background-story-tab.tsx` | P5-2 | 背景故事 Tab |
| `components/gm/secrets-tab.tsx` | P5-3 | 隱藏資訊 Tab |
| `app/actions/event-log.ts` | P4-1 | Event Log API |
| `types/event-log.ts` | P4-1 | Event Log 型別 |
| `components/gm/event-log.tsx` | P4-3 | Event Log 元件 |
| `components/gm/runtime-console.tsx` | P4-4 | Runtime 控制台 |

### 大幅修改（10 個）

| 檔案 | Phase | 變更 |
|------|-------|------|
| `components/gm/character-edit-tabs.tsx` | P1-2 | 5 Tab → 7 Tab + Sticky Save Bar 整合 |
| `components/gm/character-edit-form.tsx` | P5-1 | 724 行 → ~150 行（抽出背景故事/隱藏資訊） |
| `components/gm/items-edit-form.tsx` | P2-2 | 移除內嵌 Dialog → 呼叫 Wizard |
| `components/gm/skills-edit-form.tsx` | P2-3 | 移除內嵌 Dialog → 呼叫 Wizard |
| `components/gm/game-edit-tabs.tsx` | P3-1 | Emoji → icon + Runtime Tab |
| `components/gm/stats-edit-form.tsx` | P5-4 | 移除 SaveButton + dirty state |
| `components/gm/tasks-edit-form.tsx` | P5-5 | 移除 SaveButton + dirty state |
| `app/(gm)/games/[gameId]/characters/[characterId]/page.tsx` | P1-4 | 環境橫幅 + a11y |
| `app/(gm)/games/[gameId]/page.tsx` | P3-2 | 環境橫幅 + Runtime 控制台 |
| `app/(gm)/games/page.tsx` | P6-1 | 歡迎區 + 流程指引 |

### 刪除（1 個）

| 檔案 | Phase | 原因 |
|------|-------|------|
| `app/(gm)/dashboard/page.tsx` | P6-2 | Dashboard 砍掉，劇本列表即首頁 |

### 微調（5+ 個）

| 檔案 | Phase | 變更 |
|------|-------|------|
| `components/gm/navigation.tsx` | P6-2 | 移除 Dashboard 導航項 |
| `components/gm/character-card.tsx` | P3-3 | 卡片佈局調整 |
| `components/gm/game-lifecycle-controls.tsx` | P7-3 | 結束遊戲 Dialog 改版 |
| `components/gm/create-game-button.tsx` | P7-1 | Dialog 內容調整 |
| `components/gm/create-character-button.tsx` | P7-2 | Dialog 內容調整 |
| `app/(gm)/profile/page.tsx` | P8-1 | 佈局調整 |
| `app/auth/login/page.tsx` | P9-1 | 品牌視覺重設計 |
| `app/auth/verify/page.tsx` | P9-2 | 驗證狀態 + 成功轉場動畫 |
| `components/gm/save-button.tsx` | 跨 Phase | 確認用途範圍 |

---

## 每個畫面的 Stitch 工作流程

每個畫面開始前：

1. **檢查 prompt**：確認 `GM_DESIGN_SPEC.md` 中是否已有該畫面的 Stitch prompt
   - 有 → 檢查內容是否與最新規格一致，修正後交給用戶
   - 無 → 依規格撰寫 prompt，交給用戶
2. **用戶操作**：用戶將 prompt 送入 Stitch，自行迭代至滿意
3. **讀取產出**：用戶提供 Stitch 產出路徑，讀取 `DESIGN.md` + `code.html`（不讀 `screen.png`）
4. **視覺差異清單**：輸出差異清單，等待用戶確認
5. **編碼實作**：用戶確認後開始編碼
6. **用戶驗收**：用戶在瀏覽器中驗收，通過後進入下一個畫面

---

## 預估工作量分佈

| Phase | 預估佔比 | 核心挑戰 |
|-------|---------|---------|
| P1 | 25% | dirty state 架構設計，是全局基礎 |
| P2 | 25% | Wizard 步驟管理 + 兩個 500 行元件重構 |
| P3 | 10% | Tab 結構改版 + 環境感知（原 P4） |
| P4 | 15% | 新後端 API + WebSocket + 新 UI（原 P3） |
| P5 | 15% | 7 個 Tab 內容，但多數是搬運 + 微調 |
| P6 | 5% | 頁面改版 + 砍 Dashboard |
| P7 | 3% | 簡單 Dialog 調整 |
| P8 | 2% | 最小化修改 |
| P9 | 3% | 登入/驗證頁視覺重設計 + 轉場動畫 |
