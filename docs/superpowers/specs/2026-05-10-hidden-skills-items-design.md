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

## 6. 測試策略與邊界案例

### 6.1 自動觸發引擎測試

| 場景 | 預期行為 |
|------|---------|
| 使用技能 A → 揭露自己的隱藏技能 B | `skill_used` 條件，action=reveal |
| 使用技能 A → 隱藏自己的可見物品 C | `skill_used` 條件，action=hide |
| 別人對我使用技能 A → 揭露我的隱藏物品 D | 被動觸發，`skill_used` 條件 |
| 隱藏資訊揭露 → 連鎖揭露隱藏技能 | `secrets_revealed` 條件，三層連鎖 |
| 技能 A 揭露 → 連鎖揭露技能 B | `skills_revealed` 條件，同層連鎖 |
| 技能 A 揭露 → 技能 B 揭露 → 不再觸發技能 C | 同層連鎖限一輪 |
| AND 邏輯，部分滿足 | 不觸發 |
| OR 邏輯，滿足其一 | 觸發 |

### 6.2 玩家端過濾測試

| 場景 | 預期行為 |
|------|---------|
| 角色有 3 技能（1 隱藏） | 玩家端只收到 2 個技能 |
| 對方有 5 物品（2 隱藏），使用 `item_steal` | 選取清單只顯示 3 個物品 |
| 隱藏物品的 `isHidden` 欄位 | 不出現在玩家端回傳資料中 |

### 6.3 GM 操作測試

| 場景 | 預期行為 |
|------|---------|
| GM 手動揭露 | `isHidden` → false，發送 Revealed 事件 |
| GM 手動隱藏 | `isHidden` → true，發送 Hidden 事件 |
| 預設事件 `reveal_skill` | 技能揭露 + 通知 + 連鎖評估 |
| 預設事件 `hide_item` | 物品隱藏 + 通知 + 連鎖評估 |

### 6.4 邊界案例

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

| 類別 | 檔案 |
|------|------|
| 型別定義 | `types/character.ts` |
| DB Schema | `lib/db/schemas/shared-schemas.ts` |
| 自動揭露引擎 | `lib/reveal/auto-reveal-evaluator.ts` |
| 事件發射 | `lib/reveal/reveal-event-emitter.ts` |
| 預設事件執行 | `lib/preset-event/execute-preset-event.ts` |
| 玩家端資料過濾 | 角色資料 API / Server Action |
| 物品選取過濾 | `app/actions/select-target-item.ts` |
| GM 編輯精靈 | `components/gm/ability-edit-wizard.tsx` |
| GM 控制台 | GM 角色詳情面板的技能/物品區塊 |
| 預設事件編輯器 | `components/gm/preset-event-action-editor.tsx` |
| 觸發點 | 技能使用入口、`item-use.ts`、`contest-effect-executor.ts` |
| WebSocket 事件定義 | WebSocket 事件常數/型別 |
| 知識庫 | `docs/knowledge/gm/skills/`、`docs/knowledge/gm/items/`、`docs/knowledge/shared/auto-reveal-system.md`、`docs/knowledge/gm/game/preset-events.md` |
