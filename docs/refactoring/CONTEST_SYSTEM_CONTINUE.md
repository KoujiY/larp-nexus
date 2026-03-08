# 技能對抗系統重構 - 進度追蹤

## 當前狀態

**SPEC 確認狀態**：✅ 所有 SPEC 項目已確認

**Phase 1 狀態**：✅ 已完成（基礎改進）
**Phase 2 狀態**：✅ 已完成（事件系統改進）
**Phase 3 狀態**：✅ 已完成（代碼重構）
**Phase 3.5 狀態**：✅ 已完成（清除全局等待 Dialog）
**Phase 4 狀態**：✅ 已完成（通知發送邏輯，6 個場景全部正確）
**Phase 5 狀態**：✅ 已完成（防守方目標道具選擇）
**Phase 7.6 隱匿標籤**：✅ 已完成（效果執行層 + 對抗檢定事件流程）

---

## Phase 1 已完成項目

1. ✅ **統一 contestId 生成和解析**
   - 已創建 `lib/contest/contest-id.ts`
   - 已更新所有使用 contestId 的地方（8 個文件）

2. ✅ **統一超時時間為 3 分鐘**
   - 已修改 `lib/contest-tracker.ts`（後端）
   - 已修改 `hooks/use-contest-state.ts`（前端）

3. ✅ **防守方面板提示訊息**
   - 已在 `components/player/contest-response-dialog.tsx` 添加多選提示

---

## Phase 2 已完成項目

1. ✅ **更新類型定義**
   - 已在 `types/event.ts` 的 `SkillContestEvent` payload 中添加 `subType?: 'request' | 'result' | 'effect'`

2. ✅ **創建統一事件發送器**
   - 已創建 `lib/contest/contest-event-emitter.ts`
   - 實作 `emitContestRequest()` - 發送請求事件（只發送給防守方）
   - 實作 `emitContestResult()` - 發送結果事件（發送給攻擊方和防守方）
   - 實作 `emitContestEffect()` - 發送效果事件（只發送給攻擊方）

3. ✅ **更新事件發送邏輯**
   - 已更新 `lib/skill/check-handler.ts` - 使用 `emitContestRequest()` 發起對抗
   - 已更新 `lib/item/check-handler.ts` - 使用 `emitContestRequest()` 發起對抗
   - 已更新 `app/actions/contest-respond.ts` - 使用 `emitContestResult()` 回應對抗
   - 已更新 `app/actions/contest-select-item.ts` - 使用 `emitContestEffect()` 選擇目標道具

4. ✅ **更新前端處理邏輯**
   - 已更新 `hooks/use-contest-handler.ts` - 優先使用 `subType`，向後兼容 `attackerValue === 0`
   - 正確處理三種事件類型：`request`、`result`、`effect`

**標準化事件發送順序**：
1. 攻擊方發起對抗 → `skill.contest`（`subType: 'request'`）
2. 防守方回應 → `skill.contest`（`subType: 'result'`）
3. 效果執行 → `character.affected`（如果有數值變化）
4. 選擇目標道具 → `skill.contest`（`subType: 'effect'`）

---

## Phase 3 已完成項目

1. ✅ **創建統一對抗檢定處理器**
   - 已創建 `lib/contest/contest-handler.ts`
   - 實作 `handleContestCheck()` 函數，統一處理技能和道具的對抗檢定
   - 差異通過 `sourceType` 參數處理
   - 支援 `contest` 和 `random_contest` 兩種對抗檢定類型

2. ✅ **重構現有代碼**
   - 已重構 `lib/skill/check-handler.ts` - 對抗檢定邏輯使用統一處理器
   - 已重構 `lib/item/check-handler.ts` - 對抗檢定邏輯使用統一處理器
   - 移除了約 150 行重複代碼
   - 保留了各自的 `random` 和 `none` 檢定類型處理邏輯

**重構成果**：
- 代碼重複從 ~400 行減少到 ~200 行
- 修復 bug 時只需修改一處（統一處理器）

---

## Phase 3.5 已完成項目

1. ✅ **刪除全局等待 Dialog 組件**
   - 已刪除 `components/player/attacker-contest-waiting-dialog.tsx`

2. ✅ **更新 Dialog 狀態定義**
   - 已從 `hooks/use-contest-dialog-state.ts` 的 `ContestDialogState` 移除 `dialogType` 欄位
   - `setAttackerWaitingDialog()` 函數簽名已更新為 3 個參數（移除 `dialogType`）

3. ✅ **更新所有調用點**
   - `components/player/character-card-view.tsx` - 移除全局 dialog 邏輯，恢復時根據 `sourceType` 切換分頁
   - `hooks/use-contestable-item-usage.ts` - 更新為 3 參數調用

4. ✅ **驗證結果**
   - 零個 `AttackerContestWaitingDialog` 引用殘留
   - 零個 `dialogType === 'global'` 邏輯殘留
   - 重新整理恢復邏輯只切換到技能或道具分頁

---

## Phase 4 已完成項目

> 對應 REFACTORING_V2.md 中的「Phase 4: 修復通知發送邏輯」

1. ✅ **創建統一通知管理器**
   - 已創建 `lib/contest/contest-notification-manager.ts`
   - 實作 `ContestNotificationManager.sendContestResultNotifications()` — 統一管理初始/最終通知
   - 實作 `ContestNotificationManager.sendContestEffectNotification()` — 目標道具選擇後通知

2. ✅ **雙階段通知機制**
   - 第一階段（`skipInitialResult: false`）：發送對抗結果（無效果），讓前端立即顯示結果
   - 第二階段（`skipInitialResult: true`）：發送包含 `effectsApplied` 的完整通知 + `skill.used` 事件

3. ✅ **6 個場景通知邏輯全部正確**

   | 場景 | 攻擊方獲勝 | 防守方獲勝 | 狀態 |
   |------|----------|----------|------|
   | 1. Stat vs Stat | 攻擊方收 `skill.used`(成功)，防守方收 `character.affected` | 攻擊方收 `skill.used`(失敗)+`character.affected`，防守方收 `skill.used`(成功) | ✅ |
   | 2. Stat vs 無回應 | 同場景 1 | 攻擊方收 `skill.used`(失敗)，防守方不收通知 | ✅ |
   | 3. Steal vs Stat | 攻擊方先選道具再結算 | 同場景 1 | ✅ |
   | 4. Steal vs Steal | 攻擊方先選道具再結算 | 防守方先選道具再結算 | ✅ |
   | 5. 複合型 | 合併效果，偷竊部分先選道具 | 合併效果，偷竊部分先選道具 | ✅ |
   | 6. 重新整理 | 恢復技能/道具 Dialog | 恢復對抗回應/道具選擇 Dialog | ✅ |

4. ✅ **關鍵修復**
   - 防守方無回應時清除 `defenderSkills`/`defenderItems`，防止前一個對抗的值被繼承
   - `event-mappers.ts` 中驗證 `sourceType` 與防守方回應類型的一致性
   - 攻擊方獲勝且無需效果時不發送空通知

5. ✅ **修改的檔案**
   - `lib/contest/contest-notification-manager.ts`（新建）
   - `app/actions/contest-respond.ts`（使用統一通知管理器）
   - `app/actions/contest-select-item.ts`（使用統一通知管理器）
   - `lib/utils/event-mappers.ts`（修復通知映射邏輯）

---

## Phase 5 已完成項目

> 對應 REFACTORING_V2.md 中的「Phase 5: 實作防守方獲勝時選擇目標道具」

1. ✅ **後端：防守方道具選擇流程**
   - `app/actions/contest-respond.ts` — 檢測防守方技能/道具是否有 `item_steal`/`item_take` 效果，設置 `defenderNeedsTargetItemSelection` 旗標
   - `app/actions/contest-select-item.ts` — 支援 `isDefenderSelecting` 判斷，根據選擇者身份決定對抗結果方向

2. ✅ **後端：效果目標方向**
   - `lib/contest/contest-effect-executor.ts` — 根據 `contestResult` 決定效果作用目標：
     - 攻擊方獲勝 → 效果作用於防守方
     - 防守方獲勝 → 效果作用於攻擊方（從攻擊方偷/移除道具）

3. ✅ **前端：防守方選擇 UI**
   - `components/player/target-item-selection-dialog.tsx` — 通用目標道具選擇 Dialog，支援攻守雙方
   - `components/player/target-item-selection-section.tsx` — 統一處理獲勝後的道具選擇 UI
   - `hooks/use-target-item-selection.ts` — 支援 `isDefenderSelecting`，傳入防守方的技能/道具 ID 和類型

4. ✅ **通知整合**
   - `contest-notification-manager.ts` 的 `sendContestEffectNotification()` 支援防守方選擇後的通知發送
   - 防守方獲勝且有回應：發送給雙方 + `skill.used` 給兩個角色

---

## Phase 7.6 隱匿標籤已完成項目

> 對應 `docs/specs/SPEC-contest-stealth-tag-2026-02-09.md`

**效果執行層**（先前已完成）：
- ✅ `types/event.ts` — `sourceHasStealthTag` 欄位已定義於 `CharacterAffectedEvent` 和 `SkillContestEvent`
- ✅ `types/character.ts` — 技能/道具 `tags` 欄位已定義
- ✅ `lib/contest/contest-effect-executor.ts` — 效果執行時正確隱藏攻擊方名稱
- ✅ `lib/skill/skill-effect-executor.ts` — 技能效果隱匿標籤
- ✅ `lib/item/item-effect-executor.ts` — 道具效果隱匿標籤
- ✅ `hooks/use-character-websocket-handler.ts` — 前端 `character.affected` 通知正確隱藏

**對抗檢定事件流程**（本次補完）：
- ✅ `lib/contest/contest-handler.ts` — 對抗請求事件設置 `sourceHasStealthTag` 標籤
- ✅ `lib/contest/contest-notification-manager.ts` — 對抗結果/效果通知設置 `sourceHasStealthTag`（兩處）
- ✅ `lib/contest/contest-event-emitter.ts` — 確認 payload 透通傳遞，無需修改
- ✅ `lib/utils/event-mappers.ts` — `mapSkillContest()` 根據隱匿標籤將攻擊方名稱替換為「某人」
- ✅ `hooks/use-contest-handler.ts` — 對抗請求 toast 通知根據隱匿標籤隱藏攻擊方名稱

**Bug 修正與 UI 改善**（Phase 7.6 後續修正）：
- ✅ `components/player/contest-response-dialog.tsx` — 修正 dialog 標題根據隱匿標籤動態顯示攻擊方名稱（之前硬編碼為「有人」）
- ✅ `hooks/use-contest-handler.ts` — 修正 toast 通知根據隱匿標籤動態顯示攻擊方名稱
- ✅ `lib/utils/event-mappers.ts` — 修正 `mapCharacterAffected()` 根據隱匿標籤動態顯示攻擊方名稱（之前硬編碼為「你受到了影響」）
- ✅ `components/gm/items-edit-form.tsx` — GM 面板道具卡片排版改為名稱與標籤分兩行顯示，每個 tag 獨立 Badge
- ✅ `components/player/item-list.tsx` — 使用次數耗盡/冷卻中的道具卡片仍可點開（可轉移），只有「使用道具」按鈕 disabled
- ✅ `components/player/item-list.tsx` — 裝備類型 Badge 文字從「裝備」改為「裝備/道具」

---

## Phase 7.7 已完成項目

> 對應 `docs/specs/SPEC-auto-reveal-item-showcase-2026-02-09.md`

**Phase 7.7 狀態**：✅ 已完成（自動揭露條件系統 + 道具展示功能）

1. ✅ **資料模型與類型定義**（Phase 7.7-A）
   - `types/character.ts` — 新增 `AutoRevealConditionType`、`AutoRevealCondition`、`ViewedItem`
   - `types/event.ts` — 新增 `SecretRevealedEvent`、`TaskRevealedEvent`、`ItemShowcasedEvent`
   - `lib/db/models/Character.ts` — Secret/Task Schema 擴展 `autoRevealCondition`、新增 `viewedItems`

2. ✅ **自動揭露條件評估引擎**（Phase 7.7-B）
   - `lib/reveal/auto-reveal-evaluator.ts` — 條件評估與連鎖揭露
   - `lib/reveal/reveal-event-emitter.ts` — 揭露/展示事件發送

3. ✅ **道具展示 Server Action**（Phase 7.7-C）
   - `app/actions/item-showcase.ts` — `showcaseItem()` + `recordItemView()`
   - `app/actions/games.ts` — `getGameItems()`

4. ✅ **整合自動揭露到既有流程**（Phase 7.7-D）
   - `app/actions/item-use.ts`、`app/actions/character-update.ts`、`lib/contest/contest-effect-executor.ts` — 各觸發點整合

5. ✅ **GM 端 UI**（Phase 7.7-E/F/G）
   - `components/gm/auto-reveal-condition-editor.tsx` — 通用條件編輯器
   - `lib/reveal/condition-cleaner.ts` — 條件健全性清理

6. ✅ **玩家端 UI + 事件處理**（Phase 7.7-H/I）
   - `components/player/item-showcase-dialog.tsx` — 唯讀道具 Dialog
   - `hooks/use-character-websocket-handler.ts`、`lib/utils/event-mappers.ts` — 新事件處理

7. ✅ **資料過濾與安全**（Phase 7.7-J）
   - `lib/character-cleanup.ts` — autoRevealCondition 映射
   - `app/actions/public.ts` — 顯式欄位映射排除 GM 專用欄位

8. ✅ **Bug 修正**
   - `hooks/use-websocket.ts` — 補齊 `CHARACTER_EVENT_TYPES` 遺漏的三個事件
   - `app/actions/item-showcase.ts` — `executeAutoReveal` 改為無條件執行（GM 重設揭露狀態後可重新觸發）

---

## 重要文件位置

- **進度追蹤**：`docs/refactoring/CONTEST_SYSTEM_CONTINUE.md`（本文件）
- **原始規格**：`docs/requirements/CONTEST_SYSTEM_SPIKE_NOTE.md`
- **隱匿標籤 SPEC**：`docs/specs/SPEC-contest-stealth-tag-2026-02-09.md`
- **統一工具**：
  - `lib/contest/contest-id.ts`
  - `lib/contest/contest-event-emitter.ts`
  - `lib/contest/contest-handler.ts`
  - `lib/contest/contest-notification-manager.ts`

---

## 關鍵 SPEC 確認結果

1. 攻擊方不支援道具/技能加成
2. `random_contest` 類型下，道具/技能不影響隨機數
3. 對抗檢定狀態不需要持久化到資料庫
4. 防守方獲勝時只執行第一個技能/道具效果
5. 前後端統一為 3 分鐘超時
6. 事件發送順序：方案 C（使用事件子類型 `subType`）
7. 統一處理：技能和道具的對抗檢定邏輯統一處理

---

## 注意事項

- 所有修改都需要通過 linter 檢查
- 保持向後兼容性（特別是事件格式）
- 測試時注意技能和道具的差異處理
- 更新相關類型定義文件
- **完成 Phase 後立即更新本文件**
