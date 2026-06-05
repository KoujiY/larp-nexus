# 統一可見性條件至 AutoRevealCondition 重做計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將技能/物品的 `VisibilityCondition[]`（雙向、多條件、手動輸入 ID）重做為單一、僅揭露的 `AutoRevealCondition`，與隱藏資訊/任務共用同一套條件模型與選擇器 UI，並把「兩層下拉（角色 → 物品/技能）」回頭升級到既有的秘密/任務編輯器。

**Architecture:** 移除 `VisibilityCondition` 系列型別，擴充共用的 `AutoRevealCondition`（新增 `skillIds` 與 `skills_revealed`/`items_revealed` 類型）。技能/物品改為單一 `autoRevealCondition`（僅揭露，與秘密/任務一致）。共用元件 `AutoRevealConditionEditor` 升級為兩層下拉並支援技能來源；因 `GameItemInfo` 已帶 `characterName`，秘密/任務編輯器自動獲得兩層下拉。揭露條件一律以 ID 比對（轉移安全）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Mongoose / Vitest / Playwright

**前置假設：** 本功能仍在未合併分支 `feat/hidden-skills-items`，DB 無正式 `visibilityConditions` 資料，因此**不需要資料遷移**。若日後發現有殘留資料，舊欄位會被 Mongoose strict mode 忽略，不影響讀取。

---

## 設計決策（已與使用者確認方向，實作細節決定如下）

1. **欄位命名**：技能/物品的條件欄位命名為 `autoRevealCondition`（單數），與秘密/任務完全一致。移除 `visibilityConditions`（複數陣列）。
2. **方向**：僅揭露（reveal-only）。移除 `action: 'reveal' | 'hide'`。條件成立 → 揭露隱藏的技能/物品。手動隱藏/揭露（toggle-visibility）與預設事件 `reveal_skill`/`hide_skill`/`reveal_item`/`hide_item` 不受影響。
3. **保留的條件類型**（統一後的 `AutoRevealConditionType`）：`none` / `items_viewed` / `items_acquired` / `secrets_revealed` / `skills_revealed` / `items_revealed` / `skill_used` / `item_used`。
4. **`skill_used`/`item_used` 保留為「使用即揭露」**（決策 C）：技能/物品被使用時可揭露隱藏項目。新模型下僅揭露方向（不再有 hide）。`skill-use.ts`/`item-use.ts`/對抗結算 的觸發點**保留**。
5. **UI 提供的類型由 props 控制**：秘密維持 `items_viewed`/`items_acquired`；任務維持 + `secrets_revealed`；技能/物品提供全部 7 種（none 以外）。
6. **`toggle-visibility` 連鎖觸發正名**：手動揭露技能/物品後，改發 `skill_visibility_changed`/`item_visibility_changed`（純連鎖訊號），**不再借用 `skill_used`/`item_used`**，避免誤觸「使用型」條件。
6. **兩層下拉**：第一層選角色、第二層選該角色的物品/技能。儲存值僅為 `itemId`/`skillId`/`secretId`（轉移安全）。顯示時以 ID 跨角色解析目前持有者。
7. **條件區顯示時機**：技能/物品的條件編輯器**僅在「隱藏」開關開啟時顯示**（僅揭露條件只對隱藏項目有意義），解決原 bug #2。

---

## File Structure

| 檔案 | 責任 | 動作 |
|------|------|------|
| `types/character.ts` | 型別單一真相來源 | 擴充 `AutoRevealCondition`；移除 `VisibilityCondition*`；技能/物品改用 `autoRevealCondition` |
| `lib/db/schemas/shared-schemas.ts` | Mongoose schema | 擴充共用 `autoRevealConditionSchema`；技能/物品改用之；移除 `visibilityConditions` 子文檔 |
| `lib/db/types/mongo-helpers.ts` | lean document 型別 | 移除 `VisibilityCondition` import；改 `autoRevealCondition?` |
| `lib/reveal/auto-reveal-evaluator.ts` | 揭露引擎 | 簡化 `isConditionMet`、`evaluateSkillItemConditions`、`RevealTrigger`、`buildTriggerReason` |
| `app/actions/games.ts` | 劇本資料查詢 | 新增 `getGameSkills` + `GameSkillInfo` |
| `components/gm/auto-reveal-condition-editor.tsx` | 共用條件編輯器 | 兩層下拉 + 技能來源 + 可控類型 |
| `components/gm/ability-edit-wizard.tsx` | 技能/物品編輯 wizard | 以共用編輯器取代手動輸入；gate on `isHidden` |
| `components/gm/skills-edit-form.tsx` / `items-edit-form.tsx` | 卡片清單 + wizard 容器 | 取得並下傳 available 資料 |
| `app/(gm)/.../character 編輯頁` | 提供 available 資料來源 | 載入 getGameItems/getGameSkills/secrets |
| `lib/character/field-updaters/skills.ts` / `items.ts` | 寫入路徑 | 持久化 `autoRevealCondition` |
| `app/actions/character-update-types.ts` | 寫入輸入型別 | 新增 `autoRevealCondition?` |
| `lib/character-cleanup.ts` | 讀回序列化 | 保留 `autoRevealCondition` |
| `app/actions/toggle-visibility.ts` | 觸發點 | toggle 連鎖改用 `*_visibility_changed`（`skill-use`/`item-use`/contest 的 `skill_used`/`item_used` 觸發點**保留**）|
| `lib/reveal/__tests__/auto-reveal-evaluator.test.ts` | 引擎單元測試 | 改寫 7 個可見性測試 |
| `docs/knowledge/**` | 知識庫 | 同步 |

---

## Task 1: 型別統一（types/character.ts）

**Files:**
- Modify: `types/character.ts`（`AutoRevealConditionType` ~97、`AutoRevealCondition` ~106、`VisibilityCondition*` ~129-155、`Item.visibilityConditions` ~313、`Skill.visibilityConditions` ~385）

- [ ] **Step 1: 擴充 `AutoRevealConditionType` 與 `AutoRevealCondition`**

將 `AutoRevealConditionType`（約 line 97）改為：

```typescript
export type AutoRevealConditionType =
  | 'none'
  | 'items_viewed'
  | 'items_acquired'
  | 'secrets_revealed'
  | 'skills_revealed'   // 某幾樣隱藏技能被揭露時（同層連鎖）
  | 'items_revealed'    // 某幾樣隱藏物品被揭露時（同層連鎖）
  | 'skill_used'        // 某技能被使用時（決策 C：使用即揭露）
  | 'item_used';        // 某物品被使用時（決策 C：使用即揭露）
```

將 `AutoRevealCondition`（約 line 106）改為（新增 `skillIds`）：

```typescript
export interface AutoRevealCondition {
  type: AutoRevealConditionType;
  itemIds?: string[];    // items_viewed / items_acquired / items_revealed / item_used
  secretIds?: string[];  // secrets_revealed
  skillIds?: string[];   // skills_revealed / skill_used
  matchLogic?: 'and' | 'or';
}
```

- [ ] **Step 2: 移除 `VisibilityCondition` 系列型別**

刪除 `types/character.ts` 約 line 129-155 的 `VisibilityAction`、`VisibilityConditionType`、`VisibilityCondition` 三個定義。

- [ ] **Step 3: 技能/物品改用 `autoRevealCondition`**

`Item`（約 line 313）與 `Skill`（約 line 385）中的：

```typescript
  visibilityConditions?: VisibilityCondition[];
```

改為：

```typescript
  autoRevealCondition?: AutoRevealCondition;
```

（`isHidden?`、`hiddenAt?` 維持不變。）

- [ ] **Step 4: 型別檢查（預期會有下游錯誤，屬正常）**

Run: `rtk tsc --noEmit`
Expected: 多個檔案出現 `VisibilityCondition` / `visibilityConditions` 找不到的錯誤 —— 這些會在 Task 2-9 逐一修正。本步驟只確認 `types/character.ts` 本身無語法錯誤。

- [ ] **Step 5: Commit**

```bash
rtk git add types/character.ts
rtk git commit -m "refactor: unify skill/item conditions into AutoRevealCondition type"
```

---

## Task 2: Mongoose Schema + lean 型別

**Files:**
- Modify: `lib/db/schemas/shared-schemas.ts`（共用 `autoRevealConditionSchema` ~20-36、items `visibilityConditions` ~158-173、skills `visibilityConditions` ~250-265）
- Modify: `lib/db/types/mongo-helpers.ts`（import ~11、`MongoItem` ~85、`MongoSkill` ~137）

- [ ] **Step 1: 擴充共用 `autoRevealConditionSchema`**

`shared-schemas.ts` 約 line 20-36，將 enum 與欄位擴充為：

```typescript
export const autoRevealConditionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['none', 'items_viewed', 'items_acquired', 'secrets_revealed', 'skills_revealed', 'items_revealed', 'skill_used', 'item_used'],
      default: 'none',
    },
    itemIds: [{ type: String }],
    secretIds: [{ type: String }],
    skillIds: [{ type: String }],
    matchLogic: {
      type: String,
      enum: ['and', 'or'],
      default: 'and',
    },
  },
  { _id: false }
);
```

- [ ] **Step 2: items 改用共用 schema**

`createItemsSchemaField()` 約 line 158-173，將整段 `visibilityConditions: [{ ... }]` 替換為：

```typescript
      autoRevealCondition: { type: autoRevealConditionSchema, default: undefined },
```

（保留上方 `isHidden`、`hiddenAt` 兩行。）

- [ ] **Step 3: skills 改用共用 schema**

`createSkillsSchemaField()` 約 line 250-265，同樣將 `visibilityConditions: [{ ... }]` 替換為：

```typescript
      autoRevealCondition: { type: autoRevealConditionSchema, default: undefined },
```

- [ ] **Step 4: 更新 mongo-helpers 型別**

`lib/db/types/mongo-helpers.ts`：
- line 11：將 import 改為僅 `import type { AutoRevealCondition } from '@/types/character';`（移除 `VisibilityCondition`）。
- line 85（`MongoItem`）與 line 137（`MongoSkill`）：將 `visibilityConditions?: VisibilityCondition[];` 改為 `autoRevealCondition?: AutoRevealCondition;`。

- [ ] **Step 5: 型別檢查**

Run: `rtk tsc --noEmit`
Expected: `shared-schemas.ts`、`mongo-helpers.ts` 無錯誤；引擎/UI 仍有錯誤（後續任務處理）。

- [ ] **Step 6: Commit**

```bash
rtk git add lib/db/schemas/shared-schemas.ts lib/db/types/mongo-helpers.ts
rtk git commit -m "refactor: replace visibilityConditions schema with shared autoRevealCondition"
```

---

## Task 3: 揭露引擎簡化（auto-reveal-evaluator.ts）

**Files:**
- Modify: `lib/reveal/auto-reveal-evaluator.ts`（import ~15、`RevealTrigger` ~32-45、`SkillEntry`/`ItemEntry` ~72-100、`isConditionMet` ~119-213、`toVisibilityCondition` ~232-253、`evaluateSkillItemConditions` ~345-395、`buildTriggerReason` ~401-420、`executeAutoReveal` 觸發解析 ~513-538）

- [ ] **Step 1: 移除 VisibilityCondition import；RevealTrigger 保留 _used 變體**

- line 15：移除 `VisibilityCondition` import，保留 `AutoRevealCondition`。
- `RevealTrigger`（約 line 32）**維持既有變體不變**（`skill_used`/`item_used` 因決策 C 保留，仍夾帶剛使用的 ID）：

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

- [ ] **Step 2: `SkillEntry`/`ItemEntry` 改用 autoRevealCondition**

約 line 72-100，將 `visibilityConditions?: ...[]` 改為單一條件欄位：

```typescript
  autoRevealCondition?: AutoRevealCondition;
  isHidden?: boolean;
```

（其餘 `id`/`name`/`equipped` 等維持。）

- [ ] **Step 3: 統一 `isConditionMet` 參數型別（保留所有分支）**

`isConditionMet`（約 line 119）參數型別由 `AutoRevealCondition | VisibilityCondition` 改為僅 `AutoRevealCondition`，並移除所有 `as VisibilityCondition` cast（`skillIds` 現在是 `AutoRevealCondition` 的合法欄位）。**所有條件分支保留**（含 `skill_used`/`item_used`，決策 C）：

```typescript
function isConditionMet(condition: AutoRevealCondition, context: ConditionContext): boolean {
  const logic = condition.matchLogic ?? 'and';
  const match = (ids: string[] | undefined, pool: Set<string>) => {
    const list = ids ?? [];
    if (list.length === 0) return false;
    return logic === 'or' ? list.some((id) => pool.has(id)) : list.every((id) => pool.has(id));
  };
  switch (condition.type) {
    case 'items_viewed': return match(condition.itemIds, context.viewedItemIds);
    case 'items_acquired': return match(condition.itemIds, context.ownedItemIds);
    case 'secrets_revealed': return match(condition.secretIds, context.revealedSecretIds);
    case 'skills_revealed': return match(condition.skillIds, context.revealedSkillIds);
    case 'items_revealed': return match(condition.itemIds, context.revealedItemIds);
    case 'skill_used': return match(condition.skillIds, context.usedSkillIds);
    case 'item_used': return match(condition.itemIds, context.usedItemIds);
    case 'none':
    default: return false;
  }
}
```

`ConditionContext`（約 line 103）**維持** `usedSkillIds`、`usedItemIds` 兩個 Set 不變。

- [ ] **Step 4: 移除 `toVisibilityCondition`，改用 `toAutoRevealCondition`**

刪除 `toVisibilityCondition`（約 line 232-253）。新增等價的 `toAutoRevealCondition`（將 Mongoose lean 物件轉為 `AutoRevealCondition`，cast `type`、`matchLogic`，複製 `itemIds`/`secretIds`/`skillIds`）。

- [ ] **Step 5: 改寫 `evaluateSkillItemConditions` 為單一、僅揭露**

約 line 345，改為：對每個 `skill`/`item`，僅當 `entry.isHidden === true` 且 `entry.autoRevealCondition` 存在且 `isConditionMet(...)` 為真時，產生 `{ action: 'reveal', ... }` 的 `RevealResult`。移除迭代陣列、移除 hide 分支與 hide 的 no-op guard。

```typescript
function evaluateSkillItemConditions(
  skills: SkillEntry[],
  items: ItemEntry[],
  context: ConditionContext,
): RevealResult[] {
  const results: RevealResult[] = [];
  const evalOne = (entry: SkillEntry | ItemEntry, kind: 'skill' | 'item') => {
    if (!entry.isHidden || !entry.autoRevealCondition) return;
    const cond = toAutoRevealCondition(entry.autoRevealCondition);
    if (cond.type === 'none') return;
    if (isConditionMet(cond, context)) {
      results.push({
        type: kind, action: 'reveal', id: entry.id, title: entry.name,
        triggerReason: buildTriggerReason(cond),
      });
    }
  };
  for (const s of skills) evalOne(s, 'skill');
  for (const i of items) evalOne(i, 'item');
  return results;
}
```

- [ ] **Step 6: `buildTriggerReason` 更新**

約 line 401，參數型別改為 `AutoRevealCondition`。**保留** `skill_used`/`item_used` case，新增 `skills_revealed`/`items_revealed` 的中文理由（例：`'滿足技能揭露條件'`、`'滿足物品揭露條件'`），其餘沿用。

- [ ] **Step 7: `executeAutoReveal` 觸發解析（保留 used 集合建構）**

約 line 513-538，**維持**從 trigger 取 `usedSkillIds`/`usedItemIds` 的程式碼（`trigger.type === 'skill_used'/'item_used'` 時填入）。`SkillEntry`/`ItemEntry` 的 map 由 `visibilityConditions: s.visibilityConditions` 改為 `autoRevealCondition: s.autoRevealCondition, isHidden: s.isHidden`。兩段式評估（pass 1 / pass 2 的 `skills_revealed`/`items_revealed` 同層連鎖、限一輪、dedup）邏輯保留不變。

- [ ] **Step 8: 型別檢查**

Run: `rtk tsc --noEmit`
Expected: 引擎相關錯誤消失；剩 UI（ability-edit-wizard）、觸發點、測試的錯誤。

- [ ] **Step 9: Commit**

```bash
rtk git add lib/reveal/auto-reveal-evaluator.ts
rtk git commit -m "refactor: simplify reveal engine to single reveal-only autoRevealCondition"
```

---

## Task 4: 新增 getGameSkills server action

**Files:**
- Modify: `app/actions/games.ts`（`GameItemInfo`/`getGameItems` 約 line 440-517 之後）

- [ ] **Step 1: 新增 `GameSkillInfo` 與 `getGameSkills`**

於 `getGameItems` 後新增（鏡像其結構，遊戲進行中讀 Runtime）：

```typescript
/** GM 端使用，用於自動揭露條件的技能選擇器 */
export interface GameSkillInfo {
  characterId: string;
  characterName: string;
  skillId: string;
  skillName: string;
}

export async function getGameSkills(gameId: string): Promise<ApiResponse<GameSkillInfo[]>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    await dbConnect();
    const game = await Game.findOne({ _id: gameId, gmUserId }).lean();
    if (!game) return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };

    const baselineCharacters = await Character.find({ gameId }).select('_id name skills').lean();
    let runtimeMap: Map<string, { name: string; skills: typeof baselineCharacters[number]['skills'] }> | null = null;
    if (game.isActive) {
      const runtimeCharacters = await CharacterRuntime.find({ gameId, type: 'runtime' }).select('refId name skills').lean();
      runtimeMap = new Map(runtimeCharacters.map((rc) => [rc.refId.toString(), { name: rc.name, skills: rc.skills }]));
    }

    const skills: GameSkillInfo[] = [];
    for (const baseline of baselineCharacters) {
      const runtime = runtimeMap?.get(baseline._id.toString());
      const charName = runtime?.name ?? baseline.name;
      const charSkills = runtime?.skills ?? baseline.skills ?? [];
      for (const skill of charSkills) {
        skills.push({ characterId: baseline._id.toString(), characterName: charName, skillId: skill.id, skillName: skill.name });
      }
    }
    return { success: true, data: skills };
  } catch (error) {
    console.error('Error fetching game skills:', error);
    return { success: false, error: 'FETCH_FAILED', message: '無法取得劇本技能列表' };
  }
}
```

- [ ] **Step 2: 型別檢查**

Run: `rtk tsc --noEmit`
Expected: 無新增錯誤（`getGameSkills` 自洽）。

- [ ] **Step 3: Commit**

```bash
rtk git add app/actions/games.ts
rtk git commit -m "feat: add getGameSkills action for condition skill selector"
```

---

## Task 5: 共用條件編輯器升級（兩層下拉 + 技能來源）

**Files:**
- Modify: `components/gm/auto-reveal-condition-editor.tsx`（全檔）
- Test: `components/gm/__tests__/auto-reveal-condition-editor.test.tsx`（新增，若既有測試框架支援 RTL；否則以引擎測試覆蓋，見 Task 9）

**說明：** 因 `GameItemInfo` 已含 `characterId`/`characterName`，將既有「單層物品下拉」改為「先選角色，再選該角色物品」。新增 `availableSkills?: GameSkillInfo[]` 與可控的 `allowedTypes` props。秘密/任務編輯器沿用本元件，故兩層下拉「免費」回流（Task 6 僅需在技能/物品情境多傳 skills）。

- [ ] **Step 1: 擴充 props 與類型選項**

```typescript
import type { GameItemInfo, GameSkillInfo } from '@/app/actions/games';

interface AutoRevealConditionEditorProps {
  condition: AutoRevealCondition | undefined;
  onChange: (condition: AutoRevealCondition | undefined) => void;
  availableItems: GameItemInfo[];
  availableSkills?: GameSkillInfo[];
  availableSecrets?: SecretOption[];
  /** 可選用的條件類型（不含 none，none 由元件自動提供） */
  allowedTypes: AutoRevealConditionType[];
  disabled?: boolean;
}
```

`CONDITION_TYPE_OPTIONS` 擴充 `skills_revealed`、`items_revealed`：

```typescript
const CONDITION_TYPE_OPTIONS: Array<{ value: AutoRevealConditionType; label: string }> = [
  { value: 'none', label: '無其他自動揭露條件' },
  { value: 'items_viewed', label: '檢視過某幾樣物品' },
  { value: 'items_acquired', label: '取得了某幾樣物品' },
  { value: 'secrets_revealed', label: '某幾樣隱藏資訊已揭露' },
  { value: 'skills_revealed', label: '某幾樣隱藏技能已揭露' },
  { value: 'items_revealed', label: '某幾樣隱藏物品已揭露' },
  { value: 'skill_used', label: '某幾樣技能被使用' },
  { value: 'item_used', label: '某幾樣物品被使用' },
];
```

類型下拉只渲染 `value === 'none' || allowedTypes.includes(value)` 的選項。

**選擇器對應**：
- 物品下拉（itemIds）：`items_viewed` / `items_acquired` / `items_revealed` / `item_used`
- 技能下拉（skillIds）：`skills_revealed` / `skill_used`
- 隱藏資訊下拉（secretIds）：`secrets_revealed`

- [ ] **Step 2: 兩層物品下拉（角色 → 物品）**

以 `availableItems` 依 `characterId` 分組。新增本地 state `selectedCharForItem: string`。第一層 Select 列出有物品的角色（去重 `characterId`+`characterName`）；第二層 Select 列出該角色尚未被選入條件的物品（`itemId` 作為 value）。「添加」沿用既有 `handleAddItem`（仍只存 `itemId`）。已選 Badge 顯示沿用 `getItemDisplayName`（以 `itemId` 跨全部 `availableItems` 解析目前持有角色名；找不到時顯示 `(已轉移/已刪除) {id}`）。

- [ ] **Step 3: 技能下拉（角色 → 技能），對應 skills_revealed / skill_used**

鏡像 Step 2，使用 `availableSkills`，新增 `currentSkillIds = condition?.skillIds ?? []`、`handleAddSkill`/`handleRemoveSkill`（操作 `skillIds`）、`getSkillDisplayName`。當 `currentType === 'skills_revealed' || currentType === 'skill_used'` 時渲染此區。

- [ ] **Step 4: items_revealed / item_used 沿用物品下拉**

`items_revealed`、`item_used` 與 `items_viewed`/`items_acquired` 同樣操作 `itemIds`，共用 Step 2 的物品下拉。`isItemsCondition` 判斷式加入 `|| currentType === 'items_revealed' || currentType === 'item_used'`。

- [ ] **Step 5: handleTypeChange 重置正確的 ID 欄位**

```typescript
const ITEM_TYPES: AutoRevealConditionType[] = ['items_viewed', 'items_acquired', 'items_revealed', 'item_used'];
const SKILL_TYPES: AutoRevealConditionType[] = ['skills_revealed', 'skill_used'];

const handleTypeChange = (type: AutoRevealConditionType) => {
  if (type === 'none') { onChange(undefined); return; }
  onChange({
    type,
    itemIds: ITEM_TYPES.includes(type) ? [] : undefined,
    secretIds: type === 'secrets_revealed' ? [] : undefined,
    skillIds: SKILL_TYPES.includes(type) ? [] : undefined,
    matchLogic: 'and',
  });
};
```

- [ ] **Step 6: 型別檢查 + lint**

Run: `rtk tsc --noEmit && rtk lint components/gm/auto-reveal-condition-editor.tsx`
Expected: 0 error（呼叫端尚未傳 `allowedTypes` 會報錯 → Task 6 修）。

- [ ] **Step 7: Commit**

```bash
rtk git add components/gm/auto-reveal-condition-editor.tsx
rtk git commit -m "feat: two-level dropdown and skill source for auto-reveal condition editor"
```

---

## Task 6: 接入 wizard 並回流秘密/任務編輯器

**Files:**
- Modify: `components/gm/ability-edit-wizard.tsx`（移除 line 64 的 `VisibilityCondition*` import、line 117-125 的 `VISIBILITY_CONDITION_TYPE_OPTIONS`、line 465-615 的手動條件編輯器 IIFE；新增 props）
- Modify: `components/gm/skills-edit-form.tsx` / `components/gm/items-edit-form.tsx`（下傳 available 資料）
- Modify: 角色編輯頁（提供 `availableItems`/`availableSkills`/`availableSecrets`，見 Step 4）
- Modify: `components/gm/secret-edit-dialog.tsx` / `components/gm/tasks-edit-form.tsx`（補傳 `allowedTypes`）

- [ ] **Step 1: wizard 新增 props 並以共用編輯器取代手動輸入**

`AbilityEditWizardProps` 新增：

```typescript
  availableItems: import('@/app/actions/games').GameItemInfo[];
  availableSkills: import('@/app/actions/games').GameSkillInfo[];
  availableSecrets?: { id: string; title: string }[];
```

在 `renderBasicInfoStep()` 中，移除整段手動條件 IIFE（line 465-615）。將「隱藏開關」之後改為：**僅當 `data.isHidden` 為 true 時**渲染：

```tsx
{data.isHidden && (
  <AutoRevealConditionEditor
    condition={data.autoRevealCondition}
    onChange={(autoRevealCondition) => updateData({ autoRevealCondition })}
    availableItems={availableItems}
    availableSkills={availableSkills}
    availableSecrets={availableSecrets}
    allowedTypes={['items_viewed', 'items_acquired', 'secrets_revealed', 'skills_revealed', 'items_revealed', 'skill_used', 'item_used']}
  />
)}
```

移除 line 64 的 `VisibilityCondition, VisibilityConditionType` import 與 line 117-125 常數。`handleSave` 的 finalData 透過既有展開（`...itemData`/`...skillData`）已帶 `autoRevealCondition`，無需額外處理。

- [ ] **Step 2: skills-edit-form / items-edit-form 接收並下傳**

兩個 form 的 props 各新增 `availableItems`、`availableSkills`、`availableSecrets`，原樣傳入 `<AbilityEditWizard ... />`。

- [ ] **Step 3: 角色編輯頁載入 available 資料**

於角色編輯頁（含 `SkillsEditForm`/`ItemsEditForm` 的父層；以 `rtk grep "SkillsEditForm"` 與 `"ItemsEditForm"` 定位 import 父元件）以 `getGameItems(gameId)`、`getGameSkills(gameId)` 取得清單，角色自身 `secrets` 轉為 `{id,title}[]`，下傳兩個 form。若父層為 Server Component，直接 `await`；若為 Client，於 `useEffect` 載入後存入 state。

- [ ] **Step 4: 回流——秘密/任務編輯器補 `allowedTypes`**

- `secret-edit-dialog.tsx`：呼叫 `AutoRevealConditionEditor` 處加 `allowedTypes={['items_viewed', 'items_acquired']}`（秘密維持原本不含 secrets_revealed）。
- `tasks-edit-form.tsx`：加 `allowedTypes={['items_viewed', 'items_acquired', 'secrets_revealed']}`。
- 兩者因 `availableItems` 已是 `GameItemInfo[]`，兩層下拉自動生效；不需傳 `availableSkills`。

- [ ] **Step 5: 型別檢查 + lint**

Run: `rtk tsc --noEmit && rtk lint components/gm app`
Expected: 0 error。

- [ ] **Step 6: Commit**

```bash
rtk git add components/gm app
rtk git commit -m "feat: wire shared condition editor into ability wizard and resync secret/task editors"
```

---

## Task 7: toggle-visibility 連鎖觸發正名

**說明：** 決策 C 保留 `skill_used`/`item_used` 為真正的「使用即揭露」條件，故 `skill-use.ts`、`item-use.ts`、`contest-effect-executor.ts` 的 `skill_used`/`item_used` 觸發點**全部保留不動**（它們是正確的「使用」事件）。唯一要改的是 `toggle-visibility.ts`：它原本借用 `skill_used`/`item_used` 做手動揭露後的連鎖，但「手動揭露」不是「使用」，會誤觸使用型條件，故改發純連鎖訊號。

**Files:**
- Modify: `app/actions/toggle-visibility.ts`（~70、~121）

- [ ] **Step 1: toggle-visibility 改用 visibility_changed 連鎖觸發**

`toggle-visibility.ts`：
- 約 line 70（技能揭露後）：將 `{ type: 'skill_used' as const, skillIds: [skill.id] }` 改為 `{ type: 'skill_visibility_changed' as const }`。
- 約 line 121（物品揭露後）：將 `{ type: 'item_used' as const, itemIds: [item.id] }` 改為 `{ type: 'item_visibility_changed' as const }`。

（引擎每次都會由 DB 重建 `revealedSkillIds`/`revealedItemIds`，故 `skills_revealed`/`items_revealed` 連鎖條件仍會被正確評估；同時避免手動揭露誤觸 `skill_used`/`item_used` 條件。）

- [ ] **Step 2: 型別檢查**

Run: `rtk tsc --noEmit`
Expected: 0 error。

- [ ] **Step 3: Commit**

```bash
rtk git add app/actions/toggle-visibility.ts
rtk git commit -m "refactor: use visibility_changed trigger for manual toggle chain"
```

---

## Task 8: 持久化 autoRevealCondition（寫入 + 讀回）

**Files:**
- Modify: `lib/character/field-updaters/skills.ts`、`lib/character/field-updaters/items.ts`
- Modify: `app/actions/character-update-types.ts`（items、skills 陣列型別）
- Modify: `lib/character-cleanup.ts`（`cleanSkillData`、`cleanItemData`）
- Test: `lib/character/__tests__/field-updaters-items-skills.test.ts`

- [ ] **Step 1: 寫失敗測試**

於既有測試檔新增：

```typescript
it('preserves autoRevealCondition for skills', () => {
  const cond = { type: 'skills_revealed' as const, skillIds: ['sk-2'], matchLogic: 'and' as const }
  const [s] = updateCharacterSkills([{ ...baseSkill(), autoRevealCondition: cond }]) as unknown as Record<string, unknown>[]
  expect(s.autoRevealCondition).toEqual(cond)
})

it('preserves autoRevealCondition for items', () => {
  const cond = { type: 'items_viewed' as const, itemIds: ['it-2'], matchLogic: 'or' as const }
  const { items } = updateCharacterItems([{ ...baseItem(), autoRevealCondition: cond }])
  const result = items[0] as unknown as Record<string, unknown>
  expect(result.autoRevealCondition).toEqual(cond)
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `rtk vitest run lib/character/__tests__/field-updaters-items-skills.test.ts`
Expected: 2 新測試 FAIL（`autoRevealCondition` 為 undefined）。

- [ ] **Step 3: 寫入路徑補欄位**

`skills.ts` 在既有 `isHidden`/`hiddenAt` 之後加：

```typescript
    if (skill.autoRevealCondition !== undefined) skillData.autoRevealCondition = skill.autoRevealCondition;
```

`items.ts` 在 `isHidden`/`hiddenAt` 之後加：

```typescript
    if (item.autoRevealCondition !== undefined) itemData.autoRevealCondition = item.autoRevealCondition;
```

- [ ] **Step 4: 輸入型別補欄位**

`character-update-types.ts` 的 `items` 與 `skills` 陣列各新增：

```typescript
    autoRevealCondition?: AutoRevealCondition;
```

並於檔案頂端 import 既有 `AutoRevealCondition`（若無則新增 `import type { AutoRevealCondition } from '@/types/character';`，或沿用檔內既有的 `AutoRevealCondition` 區域型別並補 `skillIds`）。

- [ ] **Step 5: 讀回路徑保留欄位**

`character-cleanup.ts`：`cleanSkillData` 與 `cleanItemData` 的回傳物件，在 `isHidden`/`hiddenAt` 後各加 `autoRevealCondition: skill.autoRevealCondition,` / `autoRevealCondition: item.autoRevealCondition,`。

- [ ] **Step 6: 執行測試確認通過**

Run: `rtk vitest run lib/character/__tests__/field-updaters-items-skills.test.ts`
Expected: 全數 PASS。

- [ ] **Step 7: Commit**

```bash
rtk git add lib/character/field-updaters app/actions/character-update-types.ts lib/character-cleanup.ts lib/character/__tests__/field-updaters-items-skills.test.ts
rtk git commit -m "feat: persist autoRevealCondition for skills and items"
```

---

## Task 9: 改寫引擎單元測試

**Files:**
- Modify: `lib/reveal/__tests__/auto-reveal-evaluator.test.ts`（helper ~36-37、`describe('skill/item visibility conditions')` ~192-383）

- [ ] **Step 1: 更新 makeCharacter helper**

將 skills/items 的 `visibilityConditions?: unknown[]` 改為 `autoRevealCondition?: unknown`。

- [ ] **Step 2: 改寫測試案例（單一、僅揭露）**

以新模型（單一 `autoRevealCondition`、僅揭露）重寫 `describe` 區塊，至少涵蓋：

```typescript
it('reveals hidden skill when items_viewed condition met (AND)', /* skill isHidden + autoRevealCondition items_viewed → reveal */)
it('does NOT reveal when condition unmet', /* 部分命中 AND → 不揭露 */)
it('reveals via OR when any id matches', /* matchLogic or */)
it('reveals hidden skill on skill_used (AND)', /* 決策 C：trigger skill_used + autoRevealCondition skill_used → reveal */)
it('reveals hidden item on item_used', /* 決策 C：item 對稱案例 */)
it('skills_revealed same-layer chain (sk1 reveal → sk2 reveal)', /* sk2.autoRevealCondition skills_revealed [sk1]，sk1 由其它條件揭露 → 同輪 sk2 揭露 */)
it('same-layer chain limited to one round (sk3 NOT revealed)', /* 維持限一輪 */)
it('does not reveal an already-visible skill', /* isHidden false → 跳過 */)
it('hidden item revealed by items_acquired', /* item 對稱案例 */)
```

移除 `action: 'hide'` 與「多條件陣列」相關案例（這兩者已不存在）；`skill_used`/`item_used` 案例改為僅揭露方向保留。

- [ ] **Step 3: 執行測試**

Run: `rtk vitest run lib/reveal/__tests__/auto-reveal-evaluator.test.ts`
Expected: 全數 PASS。

- [ ] **Step 4: 全量單元測試**

Run: `rtk vitest run`
Expected: 全數 PASS（無回歸）。

- [ ] **Step 5: Commit**

```bash
rtk git add lib/reveal/__tests__/auto-reveal-evaluator.test.ts
rtk git commit -m "test: rewrite reveal engine tests for single reveal-only condition"
```

---

## Task 10: E2E 與預設事件驗證

**Files:**
- Modify（視需要）: `e2e/flows/hidden-skills-items.spec.ts`、`e2e/flows/preset-event-runtime.spec.ts`、`e2e/flows/auto-reveal.spec.ts`

- [ ] **Step 1: 確認預設事件不受影響**

`reveal_skill`/`hide_skill`/`reveal_item`/`hide_item` 為手動動作，不經由條件評估。`rtk grep "reveal_skill" lib/preset-event` 確認無 `visibilityConditions` 依賴。預期無需改動。

- [ ] **Step 2: 既有 E2E 條件斷言更新**

檢查 `e2e/flows/hidden-skills-items.spec.ts` 是否有針對手動輸入 ID 條件的步驟（Task 13 原版若無條件 UI 操作則免改）。`auto-reveal.spec.ts` 的秘密兩層下拉互動（#10.5）需更新為「先選角色再選物品」的兩步操作。

- [ ] **Step 3: 執行受影響 E2E**

Run: `rtk playwright test e2e/flows/auto-reveal.spec.ts e2e/flows/hidden-skills-items.spec.ts e2e/flows/preset-event-runtime.spec.ts`
Expected: 全數 PASS。

- [ ] **Step 4: Commit（若有改動）**

```bash
rtk git add e2e/
rtk git commit -m "test: update E2E for two-level condition selector"
```

---

## Task 11: 知識庫與規格同步

**Files:**
- Modify: `docs/knowledge/shared/auto-reveal-system.md`、`docs/knowledge/gm/skills/skill-concepts.md`、`docs/knowledge/gm/items/item-concepts.md`、`docs/knowledge/architecture/data-models.md`
- Modify: `docs/superpowers/specs/2026-05-10-hidden-skills-items-design.md`（標註 §1.2 VisibilityCondition 已被本次重做取代）

- [ ] **Step 1: 更新自動揭露知識庫**

`auto-reveal-system.md`：說明技能/物品改用單一 `autoRevealCondition`（僅揭露）；條件類型統一為 8 種（含 none：items_viewed/items_acquired/secrets_revealed/skills_revealed/items_revealed/skill_used/item_used）；新增 `skills_revealed`/`items_revealed` 同層連鎖；移除「雙向 hide」與「多條件陣列」的描述（`skill_used`/`item_used` 保留為僅揭露方向）。

- [ ] **Step 2: 更新技能/物品/資料模型知識庫**

`skill-concepts.md`、`item-concepts.md`：將「可見性條件」段落改為「自動揭露條件（與隱藏資訊共用）」。`data-models.md`：移除 `VisibilityCondition` 介面，更新 `Skill`/`Item` 為 `autoRevealCondition?: AutoRevealCondition`。

- [ ] **Step 3: 標註設計規格**

`2026-05-10-hidden-skills-items-design.md` §1.2 起標註：「本段 VisibilityCondition 設計已於 2026-05-29 重做為統一 AutoRevealCondition，詳見 plans/2026-05-29-unify-visibility-conditions.md」。

- [ ] **Step 4: 中文亂碼掃描**

Run: `rtk grep "�" docs/`
Expected: 無新增亂碼。

- [ ] **Step 5: Commit**

```bash
rtk git add docs/
rtk git commit -m "docs: sync knowledge base for unified autoRevealCondition"
```

---

## 最終驗證

- [ ] `rtk tsc --noEmit` → 0 error
- [ ] `rtk lint` → 0 error
- [ ] `rtk vitest run` → 全數 PASS
- [ ] `rtk playwright test e2e/flows/auto-reveal.spec.ts e2e/flows/hidden-skills-items.spec.ts e2e/flows/preset-event-runtime.spec.ts` → PASS
- [ ] `rtk grep "VisibilityCondition" .` → 僅剩 docs 的歷史標註（無程式碼引用）
- [ ] 使用者手動驗收（見執行後指引）
