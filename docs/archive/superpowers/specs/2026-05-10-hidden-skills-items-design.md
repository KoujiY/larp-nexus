# 隱藏技能/物品系統設計規格

## 概述

為技能（Skill）和物品（Item）新增隱藏屬性，支援 GM 在 Baseline 預設隱藏、Runtime 雙向切換（隱藏 ↔ 揭露），並整合自動觸發引擎、預設事件、WebSocket 通知等現有系統。

## 設計原則

- **擴充現有引擎**：不建立獨立系統，擴充現有自動揭露引擎（方案一）
- **對齊既有模式**：GM 操作、通知、預設事件的 UI/UX 比照隱藏資訊和隱藏任務
- **雙向切換**：與隱藏資訊/任務的單向揭露不同，技能/物品的可見性可多次來回切換
- **伺服器端過濾**：隱藏資料不傳送到玩家端，確保安全性

---

## 1. 資料模型

### 1.1 Skill / Item 新增欄位

```typescript
// 新增到 Skill 和 Item interface
isHidden?: boolean;                              // 當前可見狀態（true = 玩家不可見），預設 false
hiddenAt?: Date;                                 // 最後一次狀態切換的時間戳
visibilityConditions?: VisibilityCondition[];    // 自動觸發條件陣列
```

- `isHidden`：單一布林欄位表達當前狀態，支援多次雙向切換
- `hiddenAt`：記錄最後一次切換時間，用於 GM 端顯示和排序
- `visibilityConditions`：條件陣列，同一技能/物品可同時設定揭露和隱藏條件

### 1.2 VisibilityCondition 型別

> ⚠️ 已於 2026-05-30 重做：VisibilityCondition 已移除，技能/物品改用統一的單一 reveal-only AutoRevealCondition。詳見 docs/superpowers/plans/2026-05-29-unify-visibility-conditions.md

```typescript
type VisibilityAction = 'reveal' | 'hide';

type VisibilityConditionType =
  | 'items_viewed'       // 檢視過某幾樣道具
  | 'items_acquired'     // 取得了某幾樣道具
  | 'secrets_revealed'   // 某幾樣隱藏資訊已揭露
  | 'skill_used'         // 某技能被使用（含主動和被動）
  | 'item_used'          // 某物品被使用（含主動和被動）
  | 'skills_revealed'    // 某幾樣隱藏技能被揭露
  | 'items_revealed';    // 某幾樣隱藏物品被揭露

interface VisibilityCondition {
  action: VisibilityAction;               // 條件滿足時的動作方向
  type: VisibilityConditionType;          // 條件類型
  itemIds?: string[];                     // items_viewed / items_acquired / item_used / items_revealed 使用
  secretIds?: string[];                   // secrets_revealed 使用
  skillIds?: string[];                    // skill_used / skills_revealed 使用
  matchLogic?: 'and' | 'or';             // 匹配邏輯，預設 'and'
}
```

- 與現有 `AutoRevealCondition` 結構相似，新增 `action`、`skillIds` 欄位
- 現有隱藏資訊/任務繼續使用 `AutoRevealCondition`（單向揭露），`VisibilityCondition` 僅用在技能和物品上
- `skill_used` / `item_used` 只認技能/物品 ID，不區分施術者

### 1.3 RevealResult 擴充

```typescript
interface RevealResult {
  type: 'secret' | 'task' | 'skill' | 'item';   // 擴充 skill / item
  action: 'reveal' | 'hide';                      // 新增：動作方向
  id: string;
  title: string;                                   // 技能/物品的 name
  triggerReason: string;
}
```

### 1.4 Mongoose Schema 變更

在 `shared-schemas.ts` 的 `createSkillsSchemaField()` 和 `createItemsSchemaField()` 中新增：

```typescript
isHidden: { type: Boolean, default: false },
hiddenAt: { type: Date },
visibilityConditions: [{
  _id: false,
  action: { type: String, enum: ['reveal', 'hide'], required: true },
  type: {
    type: String,
    enum: [
      'items_viewed', 'items_acquired', 'secrets_revealed',
      'skill_used', 'item_used', 'skills_revealed', 'items_revealed',
    ],
    required: true,
  },
  itemIds: [String],
  secretIds: [String],
  skillIds: [String],
  matchLogic: { type: String, enum: ['and', 'or'], default: 'and' },
}],
```

---

## 2. 自動觸發引擎擴充

### 2.1 評估流程（擴充後）

```
觸發事件（物品使用、技能使用、展示、對抗等）
  ↓
第一層：評估 secrets（隱藏資訊）— 現有邏輯不變
  ↓ 新揭露的 secretIds 加入查找集合
第二層：評估 tasks（隱藏任務）— 現有邏輯不變
  ↓
第三層：評估 skills / items 的 visibilityConditions
  ↓ 新變更的 skillIds / itemIds 加入查找集合
第四層：同層連鎖（skills_revealed / items_revealed 觸發其他 skills / items）— 限一輪
```

- 現有引擎限制為 2 層（secrets → tasks），擴充後為 3 層 + 同層 1 輪，共 4 輪上限
- 同層連鎖限一輪：技能 A 揭露 → 觸發技能 B 揭露（`skills_revealed`），但技能 B 揭露不再觸發第二輪同層評估

### 2.2 isConditionMet 函式擴充

現有簽名接收散落的參數，重構為 context 物件：

```typescript
function isConditionMet(
  condition: AutoRevealCondition | VisibilityCondition,
  context: {
    viewedItemIds: Set<string>;
    ownedItemIds: Set<string>;
    revealedSecretIds: Set<string>;
    usedSkillIds: Set<string>;      // 本次事件使用的技能 ID
    usedItemIds: Set<string>;       // 本次事件使用的物品 ID
    revealedSkillIds: Set<string>;  // 當前可見的技能 ID
    revealedItemIds: Set<string>;   // 當前可見的物品 ID
  }
): boolean
```

新增條件判斷邏輯：
- `skill_used`：檢查 `context.usedSkillIds` 是否包含 `condition.skillIds`
- `item_used`：檢查 `context.usedItemIds` 是否包含 `condition.itemIds`
- `skills_revealed`：檢查 `context.revealedSkillIds` 是否包含 `condition.skillIds`
- `items_revealed`：檢查 `context.revealedItemIds` 是否包含 `condition.itemIds`

### 2.3 RevealTrigger 擴充

```typescript
type RevealTrigger =
  | { type: 'items_viewed'; itemIds: string[] }
  | { type: 'items_acquired' }
  | { type: 'secret_revealed' }
  | { type: 'skill_used'; skillIds: string[] }
  | { type: 'item_used'; itemIds: string[] }
  | { type: 'skill_visibility_changed' }
  | { type: 'item_visibility_changed' }
  | { type: 'manual_reveal' }
  | { type: 'manual_hide' }
  | { type: 'preset_event' };
```

### 2.4 觸發點

| 觸發點 | 修改內容 |
|--------|---------|
| 技能使用入口 | 帶入 `usedSkillIds` 呼叫 auto-reveal |
| `item-use.ts` | 帶入 `usedItemIds` 呼叫 auto-reveal |
| `contest-effect-executor.ts` | 對被影響方傳入施術者的 `usedSkillIds` / `usedItemIds` |
| GM 手動切換 | 切換後觸發連鎖評估 |
| 預設事件執行 | 執行 `reveal_skill` 等動作後觸發連鎖評估 |

被動觸發機制：當 A 對 B 使用技能/物品時，效果執行端對 B 也跑一輪 auto-reveal，將 A 使用的 skillId/itemId 作為 `usedSkillIds`/`usedItemIds` 傳入 B 的 context。

---

## 3. 玩家端過濾

### 3.1 過濾原則

- 在伺服器端過濾，隱藏的技能/物品不傳送到客戶端
- `isHidden` 欄位本身也不傳給玩家端

### 3.2 過濾位置

| 位置 | 過濾邏輯 |
|------|---------|
| 玩家端角色資料 API | `skills.filter(s => !s.isHidden)` / `items.filter(i => !i.isHidden)` |
| `item_steal` / `item_take` 目標物品清單 | 取得對方物品時過濾 `!isHidden` |
| 對抗中技能/物品選擇清單 | 對方可用清單過濾 `!isHidden` |

### 3.3 不需額外處理的位置

物品展示、轉移、使用、裝備切換等操作：隱藏項目已不在玩家清單中，自然無法選取，不需額外過濾邏輯。

---

## 4. GM 端操作介面

### 4.1 Baseline 編輯（AbilityEditWizard）

在 Step 1（基本資訊）新增：

| 欄位 | 控件 | 說明 |
|------|------|------|
| `isHidden` | Switch toggle | 預設 off；控制初始可見狀態 |
| `visibilityConditions` | 條件編輯器 | 獨立區塊，不依賴 `isHidden` 開關；支援新增/刪除多條件 |

條件編輯器每條顯示：
1. **方向**：`reveal` / `hide` 下拉選單
2. **條件類型**：7 種條件的下拉選單
3. **引用 ID**：根據條件類型顯示對應的多選選擇器（物品、技能、隱藏資訊）
4. **匹配邏輯**：AND / OR 切換

初始 `isHidden: false` 的技能/物品也可設定 `visibilityConditions`（例如「一開始可見，某條件後隱藏」）。此時條件編輯器不依賴 `isHidden` 開關展開，改為獨立的條件區塊。

### 4.2 Runtime 控制台

角色詳情面板的技能/物品區塊：

| 功能 | 操作 |
|------|------|
| 隱藏狀態標記 | 隱藏中的卡片加上半透明 + 眼睛斜線圖示 badge |
| 手動切換 | 卡片上的可見性切換按鈕，點擊即時生效 |
| 操作通知 | 切換後自動發送 WebSocket 通知給該玩家 |

### 4.3 預設事件

新增四種動作類型：

| 動作類型 | 欄位 | 說明 |
|---------|------|------|
| `reveal_skill` | `characterId` + `skillId` | 揭露指定角色的隱藏技能 |
| `hide_skill` | `characterId` + `skillId` | 隱藏指定角色的可見技能 |
| `reveal_item` | `characterId` + `itemId` | 揭露指定角色的隱藏物品 |
| `hide_item` | `characterId` + `itemId` | 隱藏指定角色的可見物品 |

UI 比照 `reveal_secret` / `reveal_task`：先選角色，再選該角色的技能/物品。

---

## 5. WebSocket 事件與通知

### 5.1 新增事件

| 事件名稱 | Payload |
|---------|---------|
| `SkillRevealed` | `characterId`, `skillId`, `skillName`, `revealType`, `triggerReason` |
| `SkillHidden` | `characterId`, `skillId`, `skillName`, `hideType`, `triggerReason` |
| `ItemRevealed` | `characterId`, `itemId`, `itemName`, `revealType`, `triggerReason` |
| `ItemHidden` | `characterId`, `itemId`, `itemName`, `hideType`, `triggerReason` |

`revealType` / `hideType`：`'manual'` | `'auto'` | `'preset_event'`

### 5.2 玩家端通知文字

| 事件 | 通知文字 |
|------|---------|
| `SkillRevealed` | 「你習得了新的技能：{name}」 |
| `SkillHidden` | 「你的技能已消失：{name}」 |
| `ItemRevealed` | 「你獲得了新的道具：{name}」 |
| `ItemHidden` | 「你的道具已消失：{name}」 |

- 用「習得/消失」而非「揭露/隱藏」，維持玩家的沉浸體驗
- `triggerReason` 不傳給玩家端，僅供 GM 端日誌追蹤

### 5.3 事件發射器

在 `reveal-event-emitter.ts` 新增：

```typescript
emitSkillRevealed(characterId, payload)
emitSkillHidden(characterId, payload)
emitItemRevealed(characterId, payload)
emitItemHidden(characterId, payload)
```

### 5.4 玩家端即時更新

收到事件後重新拉取角色資料，清單自然更新（與現有隱藏資訊揭露行為一致）。

---

## 6. 測試策略

### 6.1 單元測試（Vitest）

放置位置比照現有慣例 `lib/*/__tests__/*.test.ts`。

#### 6.1.1 `lib/reveal/__tests__/auto-reveal-evaluator.test.ts`（擴充現有）

擴充現有測試檔案，新增以下測試群組：

**isConditionMet — 新條件類型**：

| 場景 | 預期 |
|------|------|
| `skill_used` + AND，全部 skillIds 命中 | true |
| `skill_used` + AND，部分 skillIds 命中 | false |
| `skill_used` + OR，任一 skillId 命中 | true |
| `item_used` + AND/OR 邏輯 | 同上對稱 |
| `skills_revealed`，所有指定技能已可見 | true |
| `items_revealed`，部分指定物品已可見（AND） | false |
| 空 skillIds / itemIds 陣列 | false |

**evaluateSkillItemConditions — 可見性切換**：

| 場景 | 預期 |
|------|------|
| 隱藏技能 + 條件滿足 + action=reveal | 回傳 reveal 結果 |
| 可見物品 + 條件滿足 + action=hide | 回傳 hide 結果 |
| 已可見技能 + action=reveal | 忽略（no-op） |
| 已隱藏物品 + action=hide | 忽略（no-op） |

**連鎖觸發**：

| 場景 | 預期 |
|------|------|
| secret 揭露 → 觸發隱藏技能揭露（`secrets_revealed`） | 三層連鎖正常觸發 |
| 技能 A 揭露 → 觸發技能 B 揭露（`skills_revealed`） | 同層連鎖一輪 |
| 技能 A → B → C | 技能 C 不觸發（同層限一輪） |
| 揭露和隱藏條件同時滿足 | 以條件陣列順序執行，後者覆蓋前者 |

#### 6.1.2 `lib/reveal/__tests__/visibility-toggle.test.ts`（新增）

獨立測試隱藏/揭露的 DB 更新與事件發射邏輯：

| 場景 | 預期 |
|------|------|
| 隱藏技能 → `isHidden: true`, `hiddenAt` 更新 | DB 正確寫入 |
| 揭露物品 → `isHidden: false`, `hiddenAt` 更新 | DB 正確寫入 |
| 隱藏 equipped 裝備 | 自動卸除（`equipped: false`），移除 statBoosts |
| 揭露/隱藏後發射正確 WebSocket 事件 | 事件 payload 符合規格 |

#### 6.1.3 `lib/preset-event/__tests__/execute-preset-event.test.ts`（擴充或新增）

| 場景 | 預期 |
|------|------|
| `reveal_skill` 動作 | 目標角色技能 `isHidden` → false + 通知 |
| `hide_skill` 動作 | 目標角色技能 `isHidden` → true + 通知 |
| `reveal_item` / `hide_item` 動作 | 同上對稱 |
| 目標技能/物品不存在 | 回傳 `skipped` 狀態 |
| 執行後觸發連鎖評估 | 連鎖結果正確 |

#### 6.1.4 玩家端資料過濾測試

| 場景 | 預期 |
|------|------|
| 角色有 3 技能（1 隱藏） | 玩家端 API 只回傳 2 個技能 |
| 對方有 5 物品（2 隱藏），`item_steal` 選取 | 選取清單只有 3 個物品 |
| 回傳資料中無 `isHidden` 欄位 | 欄位被剔除，不洩露 |

### 6.2 E2E 測試（Playwright）

放置位置比照現有慣例 `e2e/flows/*.spec.ts`。

#### 6.2.1 `e2e/flows/hidden-skills-items.spec.ts`（新增）

**GM Baseline 設定流程**：

| 步驟 | 驗證 |
|------|------|
| GM 建立角色卡，新增技能並勾選隱藏 | 編輯精靈正確儲存 `isHidden: true` |
| GM 為隱藏技能設定 `visibilityConditions` | 條件編輯器 UI 操作正常、儲存正確 |
| GM 新增物品並設定隱藏 + 觸發條件 | 同上 |

**玩家端不可見**：

| 步驟 | 驗證 |
|------|------|
| 開始遊戲後，玩家登入 | 技能清單不顯示隱藏技能 |
| 玩家端物品清單 | 不顯示隱藏物品 |

**GM 手動切換**：

| 步驟 | 驗證 |
|------|------|
| GM 在控制台點擊揭露按鈕 | 技能變為可見 |
| 玩家端即時更新 | 技能出現在清單中 + 收到通知 |
| GM 再次點擊隱藏按鈕 | 技能消失 + 玩家收到消失通知 |

**自動觸發流程**：

| 步驟 | 驗證 |
|------|------|
| 玩家使用技能 A（設定為觸發條件） | 隱藏技能 B 自動揭露 + 通知 |
| 對方對玩家使用技能（被動觸發） | 玩家的隱藏物品自動揭露 + 通知 |

#### 6.2.2 `e2e/flows/preset-event-runtime.spec.ts`（擴充現有）

| 步驟 | 驗證 |
|------|------|
| GM 建立含 `reveal_skill` 動作的預設事件 | 事件儲存正確 |
| GM 執行預設事件 | 目標角色技能揭露 + 玩家收到通知 |
| GM 建立含 `hide_item` 動作的預設事件並執行 | 物品隱藏 + 通知 |

#### 6.2.3 既有 E2E 回歸確認

以下既有 spec 需確認不因新欄位（`isHidden` 預設 `false`）而 break：

| 檔案 | 確認重點 |
|------|---------|
| `e2e/flows/auto-reveal.spec.ts` | 現有自動揭露流程不受影響 |
| `e2e/flows/gm-ability-wizard.spec.ts` | 技能/物品建立流程不受影響 |
| `e2e/flows/item-operations.spec.ts` | 物品使用/展示/轉移不受影響 |
| `e2e/flows/player-use-skill.spec.ts` | 技能使用不受影響 |
| `e2e/flows/item-transfer-effects.spec.ts` | 偷取/移除效果不受影響 |

### 6.3 邊界案例

| 案例 | 處理方式 |
|------|---------|
| 對已可見技能觸發 reveal | 忽略（no-op），不發通知 |
| 對已隱藏物品觸發 hide | 忽略（no-op），不發通知 |
| 隱藏 consumable 物品（quantity > 0） | 隱藏狀態下不可使用，數量保持不變 |
| 隱藏 equipment 且 `equipped: true` | 隱藏時自動卸除（`equipped: false`），移除 statBoosts 加成 |
| 揭露和隱藏條件同時滿足 | 以條件陣列順序執行，後者覆蓋前者（最終狀態生效） |
| 物品被偷走後，原主人的 `item_used` 條件引用該物品 | 物品已不在背包，條件不再被觸發 |

---

## 影響範圍

### 需修改的檔案（預估）

| 類別 | 檔案 | 操作 |
|------|------|------|
| 型別定義 | `types/character.ts` | 修改：新增 `VisibilityCondition`、擴充 `Skill`/`Item`/`RevealResult` |
| DB Schema | `lib/db/schemas/shared-schemas.ts` | 修改：`createSkillsSchemaField()`、`createItemsSchemaField()` 新增欄位 |
| 自動揭露引擎 | `lib/reveal/auto-reveal-evaluator.ts` | 修改：擴充 `isConditionMet`、新增 skills/items 評估層、context 參數重構 |
| 事件發射 | `lib/reveal/reveal-event-emitter.ts` | 修改：新增 `emitSkillRevealed`/`emitSkillHidden`/`emitItemRevealed`/`emitItemHidden` |
| 預設事件執行 | `lib/preset-event/execute-preset-event.ts` | 修改：新增 `reveal_skill`/`hide_skill`/`reveal_item`/`hide_item` 動作處理 |
| 玩家端資料過濾 | 角色資料 API / Server Action | 修改：回傳前過濾 `isHidden` 技能/物品，剔除 `isHidden` 欄位 |
| 物品選取過濾 | `app/actions/select-target-item.ts` | 修改：`item_steal`/`item_take` 選取清單過濾 |
| GM 編輯精靈 | `components/gm/ability-edit-wizard.tsx` | 修改：Step 1 新增隱藏開關 + 條件編輯器 |
| GM 控制台 | GM 角色詳情面板的技能/物品區塊 | 修改：新增隱藏 badge + 手動切換按鈕 |
| 預設事件編輯器 | `components/gm/preset-event-action-editor.tsx` | 修改：新增四種動作類型的 UI |
| 觸發點 | 技能使用入口、`item-use.ts`、`contest-effect-executor.ts` | 修改：帶入 `usedSkillIds`/`usedItemIds` context |
| WebSocket 事件定義 | WebSocket 事件常數/型別 | 修改：新增 4 個事件類型 |
| 知識庫 | `docs/knowledge/gm/skills/`、`docs/knowledge/gm/items/`、`docs/knowledge/shared/auto-reveal-system.md`、`docs/knowledge/gm/game/preset-events.md` | 修改：同步更新文件 |

### 需新增的檔案（預估）

| 類別 | 檔案 | 說明 |
|------|------|------|
| 單元測試 | `lib/reveal/__tests__/visibility-toggle.test.ts` | 隱藏/揭露 DB 更新與事件發射 |
| E2E 測試 | `e2e/flows/hidden-skills-items.spec.ts` | GM 設定→玩家不可見→手動切換→自動觸發全流程 |

### 需擴充的測試檔案

| 檔案 | 擴充內容 |
|------|---------|
| `lib/reveal/__tests__/auto-reveal-evaluator.test.ts` | 新條件類型、連鎖觸發、同層連鎖限一輪 |
| `e2e/flows/preset-event-runtime.spec.ts` | `reveal_skill`/`hide_skill`/`reveal_item`/`hide_item` 動作 |

### 需回歸確認的既有測試

| 檔案 | 確認重點 |
|------|---------|
| `e2e/flows/auto-reveal.spec.ts` | 現有自動揭露流程不受影響 |
| `e2e/flows/gm-ability-wizard.spec.ts` | 技能/物品建立流程不受影響 |
| `e2e/flows/item-operations.spec.ts` | 物品使用/展示/轉移不受影響 |
| `e2e/flows/player-use-skill.spec.ts` | 技能使用不受影響 |
| `e2e/flows/item-transfer-effects.spec.ts` | 偷取/移除效果不受影響 |
