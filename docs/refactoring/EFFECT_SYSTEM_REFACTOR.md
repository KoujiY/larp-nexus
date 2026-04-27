# Effect System 重構計畫

> Item 與 Skill 的效果系統存在 ~70% 的邏輯重疊（~900 行），本計畫透過漸進式抽象消除重複，降低維護風險。

## 背景

經過多次迭代與 Agent 切換，Item 和 Skill 的 effect executor 各自發展出幾乎相同的邏輯：
- 目標解析（`resolveEffectTarget`）
- stat 累積器結構（`selfStatSet` / `targetStatSet`）
- `computeStatChange()` 呼叫與結果處理
- WebSocket 通知序列（`emitCharacterAffected` + `emitRoleUpdated`）

`lib/effects/shared-effect-executor.ts` 已提取了 `computeStatChange()` 和 `applyItemTransfer()`，但 executor 主迴圈、目標解析、通知序列仍各自重複。

### 核心檔案清單

| 檔案 | 行數 | 角色 |
|------|------|------|
| `lib/item/item-effect-executor.ts` | 123 | Item 效果執行器（薄殼，Phase 2 後） |
| `lib/skill/skill-effect-executor.ts` | 117 | Skill 效果執行器（薄殼，Phase 2 後） |
| `lib/effects/shared-effect-executor.ts` | 638 | 共用效果執行器（Phase 2 完成後） |
| `lib/contest/check-handler.ts` | 75 | 統一檢定處理（Phase 3 合併後） |
| `types/character.ts` L221-237 | — | `ItemEffect` 型別定義 |
| `types/character.ts` L304-322 | — | `SkillEffect` 型別定義 |

### 不可改變的契約

以下行為在整個重構過程中 **不可改變**：
1. 所有 281 個現有 vitest 測試必須通過
2. WebSocket 事件的 payload 格式不可變
3. Server Action 的對外介面（參數與回傳值）不可變
4. `ability-edit-wizard.tsx`（GM 編輯 UI）的行為不可變
5. 玩家端使用道具/技能的體驗不可變

---

## Phase 0：清理（風險：極低）✅ 已完成

**目標**：移除確定無用的遺留物，降低後續重構的認知負擔。

### 0-1. 遷移腳本歸檔 ✅

將一次性遷移腳本移出 `scripts/` 根目錄：

- `scripts/migrate-phase10.ts` → ✅ 移至 `docs/archive/scripts/`
- `scripts/migrate-phase-e.ts` → ✅ 移至 `docs/archive/scripts/`

保留 `scripts/test-connection.ts` 和 `scripts/test-sendmail.ts`（仍為開發工具）。

### 0-2. 移除 checkThreshold 舊格式相容碼 ✅

- ✅ `lib/skill/check-handler.ts`：移除 `if (!skill.randomConfig)` 分支中的 `checkThreshold` 舊格式處理，簡化為直接檢查 `randomConfig` 完整性
- ✅ `types/character.ts`：移除 `CreateSkillInput.checkThreshold` 欄位（該 interface 已無外部引用）
- ✅ grep `checkThreshold` 全專案程式碼無結果

### 0-3. 清理技術債標記 ✅

掃描並評估以下已知技術債：

- `components/gm/ability-edit-wizard.tsx` L531：NOTE 標記 → **保留**。記錄 `opponentMaxItems/Skills` 以 number 型別搭配 boolean-style 值（0/99）的有意設計，供未來多選擴充
- `components/player/contest-response-dialog.tsx` L112：NOTE 標記 → **保留**。同上，記錄 UI 為單選設計的上下文
- `types/character.ts` L329-330：NOTE 標記 → **保留**。同上設計決策的型別層文件

決策理由：三處 NOTE 都描述同一個刻意的 forward-compatible 設計（number 型別保留多選擴充空間），不是 bug。NOTE 本身即為有效的設計文件。

### 完成標準

- ✅ `tsc --noEmit` 零新錯誤
- ✅ `vitest run` 311 tests 全過
- ✅ `eslint` 零錯誤
- ✅ grep `checkThreshold` 全專案程式碼無結果

---

## Phase 1：統一 Effect 型別定義（風險：中）✅ 已完成

**目標**：將 `ItemEffect` 和 `SkillEffect` 統一為共用基底型別，為 Phase 2 鋪路。

### 現狀分析

```typescript
// types/character.ts L221-237
export interface ItemEffect {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal';
  targetType?: 'self' | 'other' | 'any';
  requiresTarget?: boolean;
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;
  description?: string;
  targetItemId?: string;
}

// types/character.ts L304-322
export interface SkillEffect {
  type: 'stat_change' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete' | 'custom';
  targetType?: 'self' | 'other' | 'any';
  requiresTarget?: boolean;
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;
  targetItemId?: string;
  targetTaskId?: string;
  description?: string;
}
```

### 目標結構

```typescript
// types/character.ts — 新增共用基底
export interface BaseEffect {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete';
  targetType?: 'self' | 'other' | 'any';
  requiresTarget?: boolean;
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;
  description?: string;
  targetItemId?: string;
  targetTaskId?: string;
}

// 保留原有型別作為 alias，確保下游不需要同步改動
export type ItemEffect = BaseEffect;
export type SkillEffect = BaseEffect;
```

### 步驟

1. 在 `types/character.ts` 中新增 `BaseEffect` interface
2. 將 `ItemEffect` 和 `SkillEffect` 改為 `BaseEffect` 的 type alias
3. 跑 `tsc --noEmit` 確認所有型別檢查通過
4. 跑 `vitest run` 確認行為不變

### 注意事項

- `Item` interface (L244) 的 `effects?: ItemEffect[]` 和 `Skill` interface (L347) 的 `effects?: SkillEffect[]` 不需要改動——它們會自動使用新的 alias
- 若型別檢查發現某處依賴了 `ItemEffect` 和 `SkillEffect` 的差異（例如某個 type guard 只接受 `task_reveal`），需要保留區分能力。可改用：
  ```typescript
  export type ItemEffectType = 'stat_change' | 'custom' | 'item_take' | 'item_steal';
  export type SkillEffectType = ItemEffectType | 'task_reveal' | 'task_complete';
  ```

### 完成標準

- `tsc --noEmit` 零錯誤
- `vitest run` 全過
- grep `interface ItemEffect` 和 `interface SkillEffect` 無結果（已改為 type alias）
- `BaseEffect` 只在 `types/character.ts` 中定義一次

---

## Phase 2：提取 Executor 共用核心（風險：中高）✅ 已完成

**目標**：將 item/skill executor 的重複邏輯提取到 `shared-effect-executor.ts`。

### 依賴

Phase 1 完成（`BaseEffect` 已就位）。

### 實作摘要

`lib/effects/shared-effect-executor.ts` 新增三個共用函數：

1. **`resolveEffectTarget()`** — 純函數，解析效果作用對象（self/other）
2. **`executeEffectBatch()`** — 遍歷效果陣列、累積 stat 變更、處理所有效果類型（stat_change, custom, item_take, item_steal, task_reveal, task_complete）
3. **`emitAffectedNotifications()`** — 套用累積器至 DB、發送 `emitCharacterAffected` + `emitRoleUpdated` WebSocket 通知

原 executor 改為薄殼，僅保留：
- **item-effect-executor.ts**（123 行）：`getItemEffects()` 向後兼容讀取 + `writeLog(action: 'item_use')`
- **skill-effect-executor.ts**（117 行）：目標驗證 + `writeLog(action: 'skill_use')`

### 完成標準

- ✅ `tsc --noEmit` 零新錯誤
- ✅ `vitest run` 311 tests 全過
- ✅ `eslint` 零錯誤
- ✅ `item-effect-executor.ts` 123 行（< 150）
- ✅ `skill-effect-executor.ts` 117 行（< 150）
- ✅ `shared-effect-executor.ts` 包含所有共用邏輯（638 行）
- ✅ 兩個 executor 中不再有結構相同的程式碼區塊

---

## Phase 3：合併 Check Handler（風險：低中）✅ 已完成

**目標**：統一 item/skill 的檢定處理邏輯。

### 依賴

Phase 0-2 完成（舊格式碼已移除、型別已統一）。

### 實作摘要

將 `lib/item/check-handler.ts`（76 行）和 `lib/skill/check-handler.ts`（93 行）合併為統一的 `lib/contest/check-handler.ts`，提供 `handleAbilityCheck()` 函數。

簽名：
```typescript
export async function handleAbilityCheck(params: {
  ability: ItemType | SkillType;
  abilityType: 'item' | 'skill';
  character: CharacterDocument;
  targetCharacterId?: string;
  checkResult?: number;
  targetItemId?: string;
}): Promise<CheckResult>
```

以 `abilityType` 區分差異（錯誤訊息中的「道具」/「技能」標籤、`targetItemId` 傳遞）。

更新了 `app/actions/item-use.ts` 和 `app/actions/skill-use.ts` 的 import 與呼叫。

### 完成標準

- ✅ `tsc --noEmit` 零新錯誤
- ✅ `vitest run` 311 tests 全過
- ✅ `eslint` 零錯誤
- ✅ `lib/item/check-handler.ts` 和 `lib/skill/check-handler.ts` 不再存在
- ✅ grep 舊路徑確認無殘留 import

---

## Phase 4：Player 元件整理（風險：中，需 IDE 驗證）✅ 已完成

**目標**：拆分巨型元件、減少 item-list 與 skill-list 的 UI 層重複。

> ⚠️ 此 Phase 涉及 UI 結構變更，**必須在 IDE（本機）搭配瀏覽器視覺驗證**。

### 依賴

Phase 2 完成後做更自然（底層已統一），但也可獨立進行。

### 4-1. 拆分 `item-list.tsx`（742 行 → 612 行）✅

原計畫提到拆出 `item-target-selector.tsx`、`item-transfer-confirm.tsx`、`item-card.tsx`，但這些子元件在先前的開發迭代中已獨立拆出（`ItemCard`、`ItemDetailDialog`、`ItemSelectDialog`、`TargetItemSelectionDialog`）。

實際瓶頸是狀態管理和事件處理器堆積（而非 JSX 膨脹），因此改為提取 custom hooks：

- **`hooks/use-item-transfer.ts`**（119 行）：封裝轉移對話框狀態（targets 載入、選擇、送出）與兩條轉移路徑（快捷路徑 + fallback dialog）
- **`hooks/use-item-showcase.ts`**（122 行）：封裝展示對話框狀態與兩條展示路徑（同上模式）

### 4-2. `skill-list.tsx`（498 行）— 維持現狀 ✅

分析結論：498 行已有 `SkillCard`、`SkillDetailDialog`、`TargetItemSelectionDialog` 三個子元件拆出。不像 item-list 有轉移/展示兩大獨立功能可抽取，skill-list 只有「使用技能」一條主線（已由 `useSkillUsage` hook 管理）。剩餘狀態為 contest 管理和 target selection，均已在共用 hooks 中。無需進一步拆分。

### 4-3. Contest Hooks 評估 — 保持分離 ✅

三個 hook 經深入分析後確認各有清晰的單一職責：

- `use-contest-state.ts`（282 行）— pending contests 的 CRUD + localStorage 持久化
- `use-contest-dialog-state.ts`（263 行）— dialog 顯示狀態 + 跨分頁/跨實例事件同步
- `use-contest-state-restore.ts`（269 行）— 頁面重載後的狀態恢復 + server query 補償

合併會產生 800+ 行的超大 hook，違反「200-400 行典型，800 行上限」原則，且三者的變更頻率和依賴關係不同，保持分離是正確決策。

### 完成標準

- ✅ `tsc --noEmit` 零錯誤
- ✅ `vitest run` 311 tests 全過
- ⏳ 視覺驗證：道具列表、技能列表、對抗流程的完整 UI 行為不變（待使用者 E2E 確認）
- ✅ 所有拆出的 hook < 200 行（`use-item-transfer.ts` 119 行、`use-item-showcase.ts` 122 行）

---

## 執行順序與分派建議

```
Phase 0（清理）──→ Phase 1（型別統一）──→ Phase 2（Executor 合併）──→ Phase 3（Check Handler）
                                                                          │
                                                                          └──→ Phase 4（UI 元件，IDE）
```

| Phase | 適合環境 | 預估規模 | Session 指令範例 |
|-------|---------|---------|-----------------|
| 0 | Web session | 小 | `讀 docs/refactoring/EFFECT_SYSTEM_REFACTOR.md，執行 Phase 0。做完 commit + push。` |
| 1 | Web session | 中 | `讀 docs/refactoring/EFFECT_SYSTEM_REFACTOR.md，執行 Phase 1。每步跑 tsc + vitest 驗證。做完 commit + push。` |
| 2 | Web session | 大 | `讀 docs/refactoring/EFFECT_SYSTEM_REFACTOR.md，執行 Phase 2。逐步提取，每提取一個函數就跑 vitest。做完 commit + push。` |
| 3 | Web session | 小 | `讀 docs/refactoring/EFFECT_SYSTEM_REFACTOR.md，執行 Phase 3。做完 commit + push。` |
| 4 | IDE | 大 | 需搭配瀏覽器視覺驗證 |

## 知識庫同步提醒

以下知識庫文件可能需要在各 Phase 完成後更新：
- `docs/knowledge/gm/items/`：物品效果相關
- `docs/knowledge/gm/skills/`：技能效果相關
- `docs/knowledge/shared/contest/`：檢定機制
- `docs/knowledge/architecture/`：檔案結構參考

每個 Phase 完成時，執行者應檢查並同步更新對應的知識庫文件。
