# 修復道具偷竊/移除與檢定系統 Bug

## 問題描述

### Bug 1: 無檢定偷竊/移除道具 — 目標道具下拉選單被禁用
- **重現步驟**: 使用無檢定的偷竊/移除效果道具 → 選擇目標角色 → 點擊「確認目標」→ 目標道具下拉選單為 disabled
- **根因**: `item-list.tsx` 傳給 `TargetSelectionSection` 的 `disabled` prop 為 `isTargetConfirmed || isWaitingForContest`。目標道具選擇 UI 只在 `isTargetConfirmed=true` 時才出現，因此 `disabled` 永遠為 `true`

### Bug 2: 有檢定的偷竊/移除道具無法正常使用
- **重現步驟**: 使用有對抗/隨機對抗檢定的偷竊道具 → 選擇目標後，按鈕顯示「請選擇目標角色」且 disabled
- **根因**: `use-item-usage.ts` 和 `item-list.tsx` 多處只判斷 `checkType === 'contest'`，遺漏 `'random_contest'`。導致 `random_contest` 道具被當作非對抗檢定處理，要求目標確認 + 目標道具選擇，但 UI 又因為 `TargetSelectionSection` 正確識別為 contest 而不顯示這些 UI，造成死鎖

### Bug 3: 道具檢定選擇對抗時沒有鎖定目標為其他玩家
- **根因**: 同 Bug 2，`requiresTarget` 和 `targetType` 的計算只包含 `'contest'`，未包含 `'random_contest'`

## 任務拆解

### Step 1: 修復 Bug 1 — TargetSelectionSection disabled prop
- **檔案**: `components/player/item-list.tsx` (line 1147)
- **修改**: `disabled={isTargetConfirmed || isWaitingForContest}` → `disabled={isWaitingForContest}`
- TargetSelectionSection 內部已透過條件渲染正確處理 `isTargetConfirmed` 的 UI 顯示/隱藏

### Step 2: 修復 Bug 2 & 3 — 添加 `random_contest` 支援
需修改的位置（對比技能系統 `use-skill-usage.ts` 和 `skill-list.tsx`）：

**`hooks/use-item-usage.ts`**:
- Line 95: `const isContest = selectedItem.checkType === 'contest'` → 加上 `|| selectedItem.checkType === 'random_contest'`
- Line 119: `if (selectedItem.checkType === 'contest')` → 加上 `|| selectedItem.checkType === 'random_contest'`

**`components/player/item-list.tsx`**:
- Line 91: `requiresTarget` 計算加上 `random_contest`
- Line 94: `targetType` 計算加上 `random_contest`
- Line 474: `isContest` 計算加上 `random_contest`
- Line 514: `handleConfirmTarget` 的 `isContest` 加上 `random_contest`
- Line 1195: 使用按鈕的 `isContest` 加上 `random_contest`

### Step 3: Type check 驗證

## 參考：技能系統的正確實作
- `use-skill-usage.ts` line 87: `const isContest = selectedSkill.checkType === 'contest' || selectedSkill.checkType === 'random_contest'`
- `skill-list.tsx` line 968: 同上
- `item-use.ts` (server-side) line 156, 160, 272: 已正確處理 `random_contest`（後端無問題）

### Step 4: 修復 Bug 3 — 道具 EffectEditor 未傳遞 checkType
- **檔案**: `components/gm/items-edit-form.tsx`
- **修改**: 在 `EffectEditor` 組件加上 `checkType={editingItem.checkType}`
- **根因**: 技能的 `SkillEditForm` 已傳遞 `checkType`，但道具的 `ItemsEditForm` 遺漏
- **驗收**: PASSED

### Step 5: Issue 1 — 使用偷竊技能/道具後重新開啟 dialog 會鎖定目標
- **檔案**: `components/player/skill-list.tsx`, `components/player/item-list.tsx`
- **修改**: `handleClearTargetStateBase` 加上 `clearTargetState()` 呼叫以清除 localStorage
- 所有失敗路徑（checkPassed false、result.success false、catch）都呼叫 `onClearTargetState`
- **驗收**: PASSED

### Step 6: Issue 2 — 非對抗偷竊流程重新設計（延遲目標道具選擇）
目標道具不應在使用前顯示，改為使用成功後才顯示目標道具選擇 UI。

**Server-side 修改**:
- `app/actions/skill-use.ts`: 增加 `needsTargetItemSelection` 回傳邏輯
- `app/actions/item-use.ts`: 增加 `needsTargetItemSelection` 回傳邏輯
- `lib/skill/skill-effect-executor.ts`: steal/take 效果在 `!targetItemId` 時 `continue`（不 throw）
- `lib/item/item-effect-executor.ts`: 同上
- `app/actions/select-target-item.ts`: 新增 server action，處理延遲的偷竊/移除效果

**Client-side 修改**:
- `hooks/use-post-use-target-item-selection.ts`: 新增 hook，管理使用成功後的目標道具選擇流程
- `hooks/use-skill-usage.ts`: 移除 `isTargetConfirmed`，增加 `onNeedsTargetItemSelection` 回調
- `hooks/use-item-usage.ts`: 同上
- `components/player/target-selection-section.tsx`: 改為 return null（所有偷竊流程改用延遲選擇）
- `components/player/item-list.tsx`:
  - 初始化 `postUseSelection` hook
  - 增加 `onNeedsTargetItemSelection` 回調到 `useItemUsage`
  - 更新按鈕 disabled/label 邏輯（移除前置偷竊驗證）
  - 新增使用成功後目標道具選擇 UI（Select dropdown + 確認/取消按鈕）
  - 所有 dialog 關閉防護點加上 `postUseSelection` 檢查
- `components/player/skill-list.tsx`:
  - 同 item-list.tsx 的所有修改

### Step 7: Bug 4 — 對抗檢定複合效果（steal + stat_change）中非偷竊效果未執行

**問題描述**:
- 複合技能效果包含偷竊 + HP 當前值 -1，防守方無道具
- 無檢定技能：所有效果正確執行 ✓
- `random_contest` 技能：偷竊通知正常，但 HP 減少效果未執行 ✗

**根因分析**:
三個位置導致對抗流程中非偷竊效果被完全跳過：

1. **`contest-effect-executor.ts` (lines 119-138)**: `needsTargetItemSelection` 為 true 時提前返回空的 `effectsApplied`，跳過 **所有** 效果（包括 stat_change）
2. **`contest-respond.ts` (lines 350-361)**: 用 `if (!needsTargetItemSelection)` 包裹 `executeContestEffects` 調用，完全跳過效果執行
3. **`contest-select-item.ts`**: 選擇目標道具後呼叫 `executeContestEffects` 執行 **所有** 效果，導致若修復 (1)(2) 會造成 stat_change 重複執行

**修復方案**:
- **`contest-effect-executor.ts`**:
  - 移除 `needsTargetItemSelection` 的提前返回（line 124-138）
  - 新增 `onlyItemTransfer?: boolean` 參數：為 `true` 時只執行 `item_steal`/`item_take` 效果
  - `item_steal`/`item_take` 在 `!targetItemId` 時仍透過 `continue` 跳過（line 298，已有邏輯）
- **`contest-respond.ts`**:
  - 移除 `if (!needsTargetItemSelection)` 和 `if (!defenderNeedsTargetItemSelection)` 守衛
  - 一律呼叫 `executeContestEffects`，stat_change 等效果立即執行，steal 透過 `continue` 延遲
- **`contest-select-item.ts`**:
  - 呼叫 `executeContestEffects` 時傳入 `onlyItemTransfer: true`，只執行偷竊/移除效果

**修改檔案**:
- `lib/contest/contest-effect-executor.ts`
- `app/actions/contest-respond.ts`
- `app/actions/contest-select-item.ts`

**驗收**: 待驗收

### Step 7.1: 追加修正 — 攻擊方通知缺少 stat_change 效果

**問題描述**:
- 防守方正確收到 stat_change 通知（透過 `character.affected` 事件）
- 攻擊方只收到偷竊通知（沒有道具），缺少 stat_change 效果通知

**根因分析**:
- `contest-respond.ts` 的第二次 `sendContestResultNotifications` 呼叫（包含 effectsApplied）被 `if (!finalNeedsTargetItemSelection)` 阻擋
- 即使 stat_change 效果已執行，攻擊方仍收不到包含 effectsApplied 的 `skill.contest` 事件

**根因深入分析**:
- `contest-notification-manager.ts` line 294: `emitContestResult`（`skill.contest` 事件）被 `if (!needsTargetItemSelection)` 阻擋
- `emitSkillUsed`（`skill.used` 事件）雖有發送，但 `mapSkillUsed` 在 `checkType === 'contest'|'random_contest'` 且 `checkPassed === true` 時返回 `[]`（假設成功通知由 `skill.contest` 處理）
- 兩個事件互相推諉，攻擊方的 stat_change 通知無處可生成

**修復方案**:
- `contest-respond.ts`: 移除 `if (!finalNeedsTargetItemSelection)` 守衛，一律發送最終通知
- `contest-notification-manager.ts`: 移除 `isSendingFinal` 路徑中 `emitContestResult` 的 `if (!needsTargetItemSelection)` 守衛
- `mapSkillContest` 已有正確過濾邏輯：無效果 + needsTargetItemSelection → return []，有效果則正常顯示

**驗收**: PASSED

### Step 8: Bug 5 — 非對抗複合效果攻擊方缺少偷竊通知 + 通知拆分

**問題描述**:
- 複合技能/道具（steal + stat_change），checkType=none（不需要檢定）
- 使用成功後，攻擊方只收到 stat_change 通知，缺少偷竊通知
- 同時，多個效果被合成一條通知（join('、')），應改為每個效果一條通知

**根因分析**:
1. `skill-effect-executor.ts` line 214: steal 在 `!targetItemId` 時 `continue` → `effectsApplied` 只有 stat_change
2. `skill-use.ts` line 326: `emitSkillUsed` 發送的 `effectsApplied` 不含偷竊
3. `select-target-item.ts`: 偷竊完成後只對**防守方**發送 `character.affected`，**攻擊方沒有收到任何通知**
4. `mapSkillUsed`/`mapItemUsed`/`mapSkillContest` 把 effectsApplied 用 `join('、')` 合成一條通知

**修復方案**:
- **`app/actions/select-target-item.ts`**: 偷竊完成後 emit `skill.used`/`item.used` 給攻擊方
- **`lib/utils/event-mappers.ts`**: `mapSkillUsed`、`mapItemUsed`、`mapSkillContest` 每個效果生成獨立通知

**修改檔案**:
- `app/actions/select-target-item.ts`
- `lib/utils/event-mappers.ts`

**驗收**: FAILED — 部分執行 + 部分通知的方式不符合設計原則，進入 Step 9 重構

### Step 9: 全面重構 — 偷竊延遲時所有效果一起延遲、一起執行、一起通知

**設計原則**（由用戶確認）:
1. 攻擊方發起，必定使用技能或道具
2. 若無需檢定則結算，每個效果分別處理並發送通知
3. 若需要檢定，先由防守方決定是否回應
4. 無論誰獲勝，都依照原則 2 結算
5. **關鍵**：如果有偷竊/移除效果且尚未選擇目標道具，ALL 效果延遲（包括 stat_change），等到偷竊目標選定後一起執行、一起通知
6. 每個效果一條獨立通知（攻擊方和防守方都適用）
7. 被偷竊/移除道具的一方使用「道具更新 - XX 已移除」格式

**修改計畫**:

**A. 非對抗流程（skill-use.ts / item-use.ts）**:
- `needsTargetItemSelection` 檢查移到 `executeSkillEffects`/`executeItemEffects` 之前
- 若 `hasItemTakeOrSteal && !targetItemId && checkPassed`：跳過效果執行、跳過 `emitSkillUsed`/`emitItemUsed`、直接返回 `needsTargetItemSelection`
- 仍然更新使用記錄（usageCount, lastUsedAt）

**B. 非對抗延遲執行（select-target-item.ts）**:
- 重構：不再手動處理偷竊邏輯
- 改為呼叫 `executeSkillEffects`/`executeItemEffects`（帶 targetItemId）執行所有效果
- 效果執行器內部已處理：stat_change、item_steal/take、task_reveal、custom 等
- 效果執行器已發送 `character.affected`、`inventoryUpdated`、`role.updated` 給防守方
- 執行完成後 emit `skill.used`/`item.used` 給攻擊方（含完整 effectsApplied）

**C. 對抗流程（contest-respond.ts）**:
- 恢復條件式效果執行：若 `needsTargetItemSelection` → 跳過 `executeContestEffects`
- 初始通知照常發送（不含效果）
- 最終通知：若 `needsTargetItemSelection` → 不發送最終通知（由 contest-select-item 處理）

**D. 對抗延遲執行（contest-select-item.ts）**:
- 移除 `onlyItemTransfer: true` 參數
- 呼叫 `executeContestEffects`（不帶 onlyItemTransfer）執行所有效果
- 通知已由 `sendContestEffectNotification` 處理

**E. contest-effect-executor.ts**:
- 移除 `onlyItemTransfer` 參數（不再需要拆分執行）

**F. contest-notification-manager.ts**:
- 最終通知中 `emitContestResult`：若 `needsTargetItemSelection` → 跳過（由 contest-select-item 在效果執行後發送）
- `emitSkillUsed`：同上

**修改檔案**:
- `app/actions/skill-use.ts`
- `app/actions/item-use.ts`
- `app/actions/select-target-item.ts`
- `app/actions/contest-respond.ts`
- `app/actions/contest-select-item.ts`
- `lib/contest/contest-effect-executor.ts`
- `lib/contest/contest-notification-manager.ts`

**驗收**: FAILED — 防守方無道具時所有效果被延遲但永遠不會執行

### Step 9.1: 修正 — 目標無道具時效果未執行、通知未發送

**問題描述**:
- 複合效果（steal + stat_change），目標角色沒有道具
- 客戶端 `confirmSelection()` 在 `targetItems.length === 0` 時直接返回，不呼叫 server action
- 效果永遠不執行，通知永遠不發送

**根因**:
- 客戶端 `use-post-use-target-item-selection.ts`：無道具時直接結束，不呼叫 `selectTargetItemAfterUse`
- 客戶端 `use-target-item-selection.ts`：無道具時呼叫 `cancelContestItemSelection` 取消對抗，而非執行效果
- 效果執行器：steal 在 `!targetItemId` 時 `continue` 但不產生任何訊息

**修復方案（正確方向 — 無論有無道具都走完整流程）**:
1. `use-post-use-target-item-selection.ts`：無道具時也呼叫 `selectTargetItemAfterUse`（傳空 targetItemId）
2. `use-target-item-selection.ts`：無道具時改為呼叫 `selectTargetItemForContest`（傳空 targetItemId），不再取消對抗
3. `skill-effect-executor.ts`：steal 在 `!targetItemId` 且非對抗時 push「目標角色沒有道具可互動」訊息
4. `item-effect-executor.ts`：同上
5. `contest-effect-executor.ts`：steal 在 `!targetItemId` 時 push「目標角色沒有道具可互動」訊息

**驗收**: 待驗收

## 備註
- 後端 (`item-use.ts`, `check-handler.ts`) 已正確處理 `random_contest`，Bug 1-2 修復純屬前端問題
- `random_contest` 的隨機骰子由 server-side 的 `handleContestCheck` 處理，前端不需要生成 checkResult
- Issue 2 的架構：使用成功 → server 回傳 `needsTargetItemSelection` → client 觸發 `postUseSelection.startSelection()` → 載入目標道具 → 用戶選擇/確認 → 呼叫 `selectTargetItemAfterUse` server action（即使無道具也呼叫）
- Step 9 對抗流程效果執行統整：`contest-respond.ts` 完全跳過效果執行，`contest-select-item.ts` 一次執行所有效果（不再拆分 onlyItemTransfer）
- Step 9 非對抗流程：同理，`skill-use.ts`/`item-use.ts` 完全跳過效果執行，`selectTargetItemAfterUse` 透過效果執行器一次執行所有效果
- Step 9.1：即使目標無道具，仍走延遲流程 — 用戶點「確認」後呼叫 server action → executor 產生「無道具」訊息 + 正常執行其他效果（stat_change 等）

### Step 10: 修復揭露邏輯與通知順序

**問題描述**:
1. 非對抗技能/道具偷竊後，接收方的 `items_acquired` 條件未被評估（auto-reveal 未觸發）
2. `item-showcase.ts` 中揭露通知搶先於展示通知送達前端

**根因分析**:
1. `skill-effect-executor.ts` 和 `item-effect-executor.ts` 在 `item_steal` 完成後沒有呼叫 `executeAutoReveal`
   - 對抗路徑（`contest-effect-executor.ts`）已有 `pendingReveal` 機制
   - 非對抗路徑完全遺漏
2. `item-showcase.ts` 中 `await executeAutoReveal(...)` 在 `emitItemShowcased(...)` 之前執行
   - `executeAutoReveal` 內部會發送揭露通知
   - 因此揭露通知先於展示通知到達前端

**修復方案**:
- `item-showcase.ts`: 將 `emitItemShowcased` 移到 `executeAutoReveal` 之前（await emit 確保順序）
- `skill-effect-executor.ts`: 加入 `pendingReveal` 到 `SkillEffectExecutionResult`
- `item-effect-executor.ts`: 加入 `pendingReveal` 到 `ItemEffectExecutionResult`
- `skill-use.ts`: 在 `emitSkillUsed` 之後觸發 `executeAutoReveal`
- `select-target-item.ts`: 在通知之後觸發 `executeAutoReveal`

**修改檔案**:
- `app/actions/item-showcase.ts`
- `lib/skill/skill-effect-executor.ts`
- `lib/item/item-effect-executor.ts`
- `app/actions/skill-use.ts`
- `app/actions/select-target-item.ts`

**驗收**: 待驗收
