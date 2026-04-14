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
| `lib/item/item-effect-executor.ts` | 326 | Item 效果執行器 |
| `lib/skill/skill-effect-executor.ts` | 345 | Skill 效果執行器 |
| `lib/effects/shared-effect-executor.ts` | 261 | 已有的共用抽象（部分） |
| `lib/item/check-handler.ts` | 76 | Item 檢定處理 |
| `lib/skill/check-handler.ts` | 93 | Skill 檢定處理（含舊格式相容碼） |
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

## Phase 2：提取 Executor 共用核心（風險：中高）

**目標**：將 item/skill executor 的重複邏輯提取到 `shared-effect-executor.ts`。

### 依賴

Phase 1 完成（`BaseEffect` 已就位）。

### 現有共用抽象（保留並擴充）

`lib/effects/shared-effect-executor.ts` 目前提供：
- `computeStatChange()` — 純函數，計算數值變化
- `applyItemTransfer()` — 執行道具移除/偷竊的 DB 操作

### 需要提取的函數（按順序）

#### Step 1：提取 `resolveEffectTarget()`

- 來源：`item-effect-executor.ts` 和 `skill-effect-executor.ts` 中的目標解析邏輯
- 目標：`shared-effect-executor.ts` 新增 export
- 簽名：
  ```typescript
  export function resolveEffectTarget(
    effect: BaseEffect,
    selfCharacterId: string,
    targetCharacterId?: string
  ): { targetId: string; isSelf: boolean }
  ```
- 驗證：`vitest run`

#### Step 2：提取 stat 累積器與效果迴圈

- 來源：兩個 executor 的主迴圈中，遍歷 effects 陣列、累積 `selfStatSet` / `targetStatSet` 的邏輯
- 目標：`shared-effect-executor.ts` 新增 `executeEffectBatch()`
- 簽名（參考）：
  ```typescript
  export async function executeEffectBatch(params: {
    effects: BaseEffect[];
    character: CharacterDocument;
    targetCharacterId?: string;
    sourceType: 'item' | 'skill';
    sourceId: string;
    sourceName: string;
    gameId: string;
    checkPassed?: boolean;
  }): Promise<EffectBatchResult>
  ```
- 注意：item 和 skill 在迴圈內的差異（例如 `task_reveal` / `task_complete` 是 skill 專屬）需要透過 `sourceType` 分支處理，或在呼叫端前置過濾
- 驗證：`vitest run`

#### Step 3：提取 WebSocket 通知序列

- 來源：兩個 executor 結尾的 `emitCharacterAffected()` + `emitRoleUpdated()` 呼叫
- 目標：`shared-effect-executor.ts` 新增 `emitAffectedNotifications()`
- 驗證：`vitest run`

#### Step 4：將原 executor 改為薄殼

改寫 `item-effect-executor.ts` 和 `skill-effect-executor.ts`：
- 移除已提取的邏輯
- 改為呼叫 `shared-effect-executor.ts` 的共用函數
- 僅保留各自的專屬邏輯（item: 數量扣減、裝備檢查；skill: task_reveal/task_complete 處理）
- 目標：每個 executor 從 ~330 行降到 ~80-120 行

### 完成標準

- `tsc --noEmit` 零錯誤
- `vitest run` 全過
- `item-effect-executor.ts` < 150 行
- `skill-effect-executor.ts` < 150 行
- `shared-effect-executor.ts` 包含所有共用邏輯
- 兩個 executor 中不再有結構相同的程式碼區塊

---

## Phase 3：合併 Check Handler（風險：低中）

**目標**：統一 item/skill 的檢定處理邏輯。

### 依賴

Phase 0-2 完成（舊格式碼已移除、型別已統一）。

### 現狀

- `lib/item/check-handler.ts`（76 行）
- `lib/skill/check-handler.ts`（93 行，含舊格式相容碼）

兩者差異：
- skill 版多了 `checkThreshold` 舊格式處理（Phase 0 會移除）
- 函數簽名略有不同（接受 `Item` vs `Skill`）

### 目標

```
lib/contest/check-handler.ts ← 統一，接受通用參數
```

簽名（參考）：
```typescript
export async function handleAbilityCheck(params: {
  ability: Item | Skill;
  abilityType: 'item' | 'skill';
  character: CharacterDocument;
  targetCharacterId?: string;
  targetItemId?: string;
  checkResult?: number;
}): Promise<CheckHandlerResult>
```

### 步驟

1. 在 `lib/contest/` 下建立新的統一 `check-handler.ts`
2. 將兩個舊 handler 的邏輯合併，以 `abilityType` 區分差異
3. 更新 `lib/item/item-effect-executor.ts` 和 `lib/skill/skill-effect-executor.ts` 的 import
4. 刪除 `lib/item/check-handler.ts` 和 `lib/skill/check-handler.ts`
5. 更新知識庫 `docs/knowledge/` 中引用這兩個檔案的文件

### 完成標準

- `tsc --noEmit` 零錯誤
- `vitest run` 全過
- `lib/item/check-handler.ts` 和 `lib/skill/check-handler.ts` 不再存在
- grep 舊路徑確認無殘留 import

---

## Phase 4：Player 元件整理（風險：中，需 IDE 驗證）

**目標**：拆分巨型元件、減少 item-list 與 skill-list 的 UI 層重複。

> ⚠️ 此 Phase 涉及 UI 結構變更，**必須在 IDE（本機）搭配瀏覽器視覺驗證**。

### 依賴

Phase 2 完成後做更自然（底層已統一），但也可獨立進行。

### 4-1. 拆分 `item-list.tsx`（742 行）

將以下邏輯提取為子元件：
- 目標選擇 UI → `item-target-selector.tsx`
- 轉移確認 dialog → `item-transfer-confirm.tsx`
- 單個 item 卡片 → `item-card.tsx`

### 4-2. 拆分 `skill-list.tsx`（498 行）

同上模式，並與 item-list 共用目標選擇邏輯（`useTargetSelection` hook 已存在）。

### 4-3. 評估 Contest Hooks 合併

三個高度相關的 hook：
- `use-contest-state.ts`（282 行）
- `use-contest-state-restore.ts`（269 行）
- `use-contest-dialog-state.ts`（263 行）

需先深入分析三者的責任邊界，再決定是否合併。不強制合併——如果各自職責明確，保持分離也可以。

### 完成標準

- `tsc --noEmit` 零錯誤
- `vitest run` 全過
- 視覺驗證：道具列表、技能列表、對抗流程的完整 UI 行為不變
- 所有拆出的子元件 < 200 行

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
