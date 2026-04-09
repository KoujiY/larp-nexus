# E2E Flow #4b — Ability Wizard & Stats CRUD（GM 角色卡細部）

> **上游索引**：本檔案為 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 中 Flow #4 拆分出來的姊妹檔。
> **主檔**：[E2E_FLOW_4_GM_CHARACTER_CRUD.md](./E2E_FLOW_4_GM_CHARACTER_CRUD.md)
> **對應 spec**：`e2e/flows/gm-ability-wizard.spec.ts`

---

## 設計背景

`components/gm/ability-edit-wizard.tsx` 是 Items 與 Skills 共用的 4 步驟建立/編輯流程，被 `items-edit-form.tsx` 與 `skills-edit-form.tsx` 以 `mode='item' | 'skill'` 方式呼叫。兩邊共用 Step 1（基本資訊）、Step 2（檢定設定）、Step 3（限制條件），Step 4（效果）的可選效果類型因 mode 而異——這是 Flow #4b 存在的核心理由：**同一元件跑兩條支線，step-by-step 驗證才能證明分支未漏洞**。

Stats CRUD（`stats-edit-form.tsx`）雖然不使用 Wizard，但它也是 **inline form 驅動的 ability-like 欄位**，type 結構與 validator 規則與 items/skills 同源（都在 `character-validator.ts`），放在同一 flow 維持「GM 細部 CRUD」的主題一致性。

### Flow #4b 的三個核心驗證目標

1. **Stats 的 inline CRUD + validator 規則**（`character-validator.ts:130-178`）
2. **AbilityEditWizard 的 happy path**：4 個步驟循序推進、每步的表單狀態、跨步驟的欄位依賴（例：Step 2 checkType=`contest` 強制 Step 2 需要 relatedStat）
3. **Items vs Skills 的 mode 分支**：Step 4 效果選項差異、技能專屬效果（`item_give`、`task_reveal`）

---

## 範圍定義

### 測
- `stats-edit-form.tsx` 的新增/修改/刪除 + validator 錯誤
- `ability-edit-wizard.tsx` 完整 4 步驟（Items mode）
- Step 2 的 checkType → relatedStat 互鎖規則
- `ability-edit-wizard.tsx` 完整 4 步驟（Skills mode）
- 技能專屬效果類型（`item_give` / `task_reveal`）
- Wizard edit mode（載入既有資料 → 修改 → 儲存）

### 不測（延後/排除）
- Wizard 內的圖片上傳（排除，Blob 限制）
- Step 3 限制條件的 runtime 實際觸發（延後至 Flow #5/#6）
- 效果 payload 在 runtime 的執行（如 `item_give` 真正 give 一個 item）→ Flow #5/#6 的 `player-use-skill.spec.ts`
- Wizard 的 form 初始化效能（非功能性）
- 同時開多個 Wizard（dialog stacking）→ UX edge case，延後

---

## Test Case 獨立性設計

| Case | 獨立 seed | Mode |
|---|---|---|
| #4b.1 Stats CRUD + validator | game + 1 角色（空 stats） | — |
| #4b.2 Items Wizard happy path | game + 1 角色 | item |
| #4b.3 Items Wizard 互鎖規則 | game + 1 角色 | item |
| #4b.4 Skills Wizard happy path + 專屬效果 | game + 1 角色 + 1 既有 item（for item_give target） | skill |
| #4b.5 Skills Wizard edit mode | game + 1 角色 + 1 既有 skill | skill |

**原則**：每個 case 獨立 seed，Wizard 的 dialog 每次重新開啟都從 Step 1 開始（RED 狀態），跨 case 不共享 Wizard 狀態。

---

## 共用規格

### URL 模式
- 編輯頁：`/games/{gameId}/characters/{charId}/edit`
- Wizard 沒有獨立路由，是 shadcn Dialog portal

### 關鍵 Selectors
```ts
// Stats tab
const tabStats = page.getByRole('tab', { name: '數值' });
const addStatBtn = page.getByRole('button', { name: '新增數值' });
const statKeyInput = (idx: number) => page.getByTestId(`stat-key-${idx}`);
const statLabelInput = (idx: number) => page.getByTestId(`stat-label-${idx}`);
const statValueInput = (idx: number) => page.getByTestId(`stat-value-${idx}`);

// Items/Skills tab
const tabItems = page.getByRole('tab', { name: '物品' });
const tabSkills = page.getByRole('tab', { name: '技能' });
const addItemBtn = page.getByRole('button', { name: '新增物品' });
const addSkillBtn = page.getByRole('button', { name: '新增技能' });

// Wizard Dialog
const wizardDialog = page.getByRole('dialog', { name: /新增|編輯/ });
const wizardStepIndicator = wizardDialog.getByTestId('wizard-step');
const wizardNextBtn = wizardDialog.getByRole('button', { name: '下一步' });
const wizardPrevBtn = wizardDialog.getByRole('button', { name: '上一步' });
const wizardFinishBtn = wizardDialog.getByRole('button', { name: '完成' });

// Wizard Step 1
const wizardNameInput = wizardDialog.getByLabel('名稱');
const wizardDescInput = wizardDialog.getByLabel('描述');

// Wizard Step 2
const checkTypeSelect = wizardDialog.getByLabel('檢定類型');
const relatedStatSelect = wizardDialog.getByLabel('關聯數值');

// Wizard Step 3 — 使用限制（兩個獨立 number 欄位）
const usageLimitInput = wizardDialog.getByLabel('使用次數上限');
const cooldownInput = wizardDialog.getByLabel('冷卻時間');

// Wizard Step 4 — 效果
const addEffectBtn = wizardDialog.getByRole('button', { name: '新增效果' });
const effectTypeSelect = (idx: number) => wizardDialog.getByTestId(`effect-type-${idx}`);
```

### Helpers
```ts
async function goThroughWizardSteps(
  page: Page,
  steps: { step: 1 | 2 | 3 | 4; fill: () => Promise<void> }[]
) {
  for (const { step, fill } of steps) {
    await expect(page.getByTestId('wizard-step')).toHaveText(String(step));
    await fill();
    if (step < 4) await page.getByRole('button', { name: '下一步' }).click();
  }
  await page.getByRole('button', { name: '完成' }).click();
}
```

### Seed helpers
- `seedFixture.characterWithItem(gameId, itemSpec)` — 建立含一個 item 的角色（for #4b.4 target）
- `seedFixture.characterWithSkill(gameId, skillSpec)` — 建立含一個 skill 的角色（for #4b.5 edit）

---

## #4b.1 Stats inline CRUD + validator 規則

### 進入點
- 角色：GM → 編輯頁 → `tabStats.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色（`baselineData.stats = []`）

### 操作步驟
**Phase A — 新增第一個 stat**
1. `addStatBtn.click()`
2. 填入 key=`hp`、label=`生命值`、value=`100`
3. `saveAndWait(page)`

**Phase B — 新增第二個 stat**
4. `addStatBtn.click()`
5. 填入 key=`mp`、label=`魔力`、value=`50`
6. `saveAndWait(page)`

**Phase C — 修改既有 stat**
7. `statValueInput(0).fill('80')` (hp)
8. `saveAndWait(page)`

**Phase D — 刪除 stat**
9. 點 mp 的刪除按鈕
10. `saveAndWait(page)`

**Phase E — Validator 反向驗證**
11. `addStatBtn.click()`
12. key 留空 → 嘗試 save → Save Bar 保持、顯示錯誤
13. 填入 key=`hp`（重複）→ 嘗試 save → 顯示「key 必須唯一」錯誤（`character-validator.ts:130-178`）

### 非同步等待點
- 每次 `saveAndWait` 等 server action 200

### 斷言
- **DB 層**：
  - Phase A：`baselineData.stats.length === 1`、`stats[0].key === 'hp'`
  - Phase B：`length === 2`
  - Phase C：`stats[0].value === 80`
  - Phase D：`length === 1`，只剩 hp
- **UI 層**：每個 Phase 後 UI 顯示與 DB 一致

### 反向驗證
- 見 Phase E

### 已知陷阱
- **Stats 的 key 是程式性 id，label 是顯示用**：spec 斷言要區分 `key` 與 `label`，validator 的唯一性檢查是對 `key` 而非 `label`。
- **value 型別**：`number` vs `string` 混淆。若 input 用 `type="text"`，Playwright 的 `fill('80')` 會儲存字串，DB 斷言要 `Number(stats[0].value) === 80` 或確認 schema 已強制 cast。
- **Stats 排序**：若刪除中間項，後面 index 會補上，`statKeyInput(0)` 會指向不同 stat。spec 必須用 testId 帶 stable key 而非 index。

---

## #4b.2 Items Wizard happy path（4 步驟完整走過）

### 進入點
- 角色：GM → 編輯頁 → `tabItems.click()` → `addItemBtn.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色

### 操作步驟
**Phase A — Dialog 開啟，Step 1**
1. `addItemBtn.click()`
2. 斷言：Wizard Dialog 開啟，Step indicator === `1`
3. `wizardNameInput.fill('治療藥水')`
4. `wizardDescInput.fill('恢復 20 HP 的紅色藥水')`
5. `wizardNextBtn.click()`

**Phase B — Step 2 檢定設定**
6. 斷言：Step indicator === `2`
7. `checkTypeSelect` 選擇 `none`（無檢定）
8. `wizardNextBtn.click()`

**Phase C — Step 3 使用限制（留預設無限制）**
9. 斷言：Step indicator === `3`
10. 斷言：`usageLimitInput` 與 `cooldownInput` 皆可見（items 非 equipment 類型不會跳過此 step）
11. 保留預設值（`usageLimit=0` 或 `1`，取決於 item type；`cooldown=0`）
12. `wizardNextBtn.click()`

**Phase D — Step 4 效果**
12. 斷言：Step indicator === `4`
13. `addEffectBtn.click()`
14. `effectTypeSelect(0)` 選擇 `stat_modify`
15. 填入 target stat=`hp`，amount=`20`
16. `wizardFinishBtn.click()`

**Phase E — 確認並儲存到角色**
17. 斷言：Dialog 關閉
18. 斷言：Items 列表出現「治療藥水」
19. `saveAndWait(page)`（Wizard 完成後的資料寫入 form dirty state，需要 Sticky Save Bar 確認）

### 非同步等待點
- Wizard 關閉（Radix portal unmount）
- saveAndWait server action 200

### 斷言
- **DB 層**：
  - `character.baselineData.items.length === 1`
  - `items[0].name === '治療藥水'`
  - `items[0].checkType === 'none'`
  - `items[0].effects[0].type === 'stat_modify'`
  - `items[0].effects[0].targetStat === 'hp'`
  - `items[0].effects[0].amount === 20`
- **UI 層**：Items 列表顯示名稱、Wizard 已關閉

### 反向驗證
- Phase A name 留空 → `wizardNextBtn` 被 disabled 或 click 後停留 Step 1 顯示錯誤

### 已知陷阱
- **Wizard 的 Next 按鈕 disabled 條件**：若 next 按鈕在 required 欄位未填時是 `disabled`，Playwright 的 `click()` 會 no-op 不報錯。用 `expect(nextBtn).toBeDisabled()` 主動驗證。
- **Wizard Dialog 是 Radix portal**：selector 必須 `page.getByRole('dialog')` 全域找，不可 scope 在 form 下。
- **Wizard 完成後的資料尚未寫 DB**：`wizardFinishBtn.click()` 只是把 ability 推入 form state，真正寫入要靠外層 `saveAndWait`。若 spec 在 click finish 後直接讀 DB，會讀到舊資料。
- **`items-edit-form.tsx:114-132` 的 `liveEquippedByWs` overlay**：僅在 active game 時生效，Flow #4b 用 inactive 避開。

---

## #4b.3 Items Wizard 互鎖規則：Step 2 `contest` 強制 relatedStat

### 進入點
- 角色：GM → 編輯頁 → `tabItems.click()` → `addItemBtn.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色（`baselineData.stats = [{ key: 'str', label: '力量', value: 10 }]`）

### 操作步驟
**Phase A — Step 1 填完 → Step 2**
1. Step 1：name=`投擲匕首`，desc=`近戰武器`
2. Next → Step 2

**Phase B — checkType=none → next 正常**
3. `checkTypeSelect` 選 `none`
4. 斷言：Next 按鈕 enabled
5. 返回 `wizardPrevBtn.click()` → 再 Next

**Phase C — checkType=contest → relatedStat required**
6. `checkTypeSelect` 選 `contest`
7. 斷言：`relatedStatSelect` 變為可見/必填
8. **不選 relatedStat**，嘗試 Next
9. 斷言：Next 按鈕 disabled **或** click 後停留 Step 2 顯示錯誤
10. `relatedStatSelect` 選 `str`
11. Next → Step 3

**Phase D — 完成後驗證 DB**
12. Step 3：`usageLimit=0`、`cooldown=0`（保留預設）→ Next
13. Step 4：不加效果（允許 items 無效果）
14. Finish → saveAndWait

### 斷言
- **DB 層**：
  - `items[0].checkType === 'contest'`
  - `items[0].relatedStat === 'str'`
- **UI 層**：Phase C 的 disabled/error 狀態可見

### 反向驗證
- 若實作容許 `contest` 沒有 relatedStat，則此 case 揭露 validator 漏洞，應 fail（這是 Flow #4b 存在的部分理由）

### 已知陷阱
- **Step 切換會保留前一步的 state**：`wizardPrevBtn` 後 Step 1 的資料仍在。spec 不要假設 prev 會清空。
- **`relatedStat` 的下拉選項來自當前角色 `baselineData.stats`**：seed 必須預先給 stats，否則下拉為空無法選擇，導致誤以為 bug。
- **validator 可能同時檢查 Step 2 與 Step 4 的 effect**：某些 effect 類型（如 `roll_check`）也會要求 relatedStat。此 case 只覆蓋 checkType 分支，其他互鎖若有需另寫 case。

---

## #4b.4 Skills Wizard happy path + 技能專屬效果（`item_give` / `task_reveal`）

### 進入點
- 角色：GM → 編輯頁 → `tabSkills.click()` → `addSkillBtn.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色
- 角色已有 1 既有 item（`name: '鑰匙'`）作為 `item_give` 的 target
- 角色已有 1 既有 hidden task（`title: '秘密任務'`）作為 `task_reveal` 的 target

### 操作步驟
**Phase A — Skills Wizard Step 1-3 依序推進**
1. Step 1：name=`大師技能`，desc=`賦予物品並揭露任務`
2. Step 2：checkType=`none`
3. Step 3：`usageLimit=1` + `cooldown=0`（用量限制代表性驗證；兩者為獨立 number 欄位，無 `limitType` discriminator）

**Phase B — Step 4 加入 `item_give` 效果**
4. `addEffectBtn.click()`
5. `effectTypeSelect(0)` 選 `item_give`
6. 斷言：target item 下拉出現，選項含 `鑰匙`
7. 選 `鑰匙`

**Phase C — Step 4 加入 `task_reveal` 效果**
8. `addEffectBtn.click()`
9. `effectTypeSelect(1)` 選 `task_reveal`
10. 斷言：target task 下拉出現，選項含 `秘密任務`
11. 選 `秘密任務`

**Phase D — 完成並儲存**
12. Finish → saveAndWait

### 斷言
- **DB 層**：
  - `character.baselineData.skills.length === 1`
  - `skills[0].name === '大師技能'`
  - `skills[0].usageLimit === 1`、`skills[0].cooldown === 0`、`skills[0].usageCount === 0`（初始未使用）
  - `skills[0].lastUsedAt === undefined`（尚未觸發）
  - `skills[0].effects.length === 2`
  - `effects[0].type === 'item_give'`, targetItemId 指向既有 item
  - `effects[1].type === 'task_reveal'`, targetTaskId 指向既有 task
- **UI 層**：Skills 列表顯示「大師技能」

### 反向驗證
- 若 mode=`item`，Step 4 的 effect 選項**不**包含 `item_give` / `task_reveal`（這兩個是技能專屬）
- 此反向驗證必須在 #4b.2 已確認前提下推論，或在 #4b.3 補一步

### 已知陷阱
- **`item_give` 的 target 必須存在於角色當前 items**：seed 順序很重要，要先 seed item 再開 Wizard。若 seed 後 wizard 打開太快，React state 尚未 update，可能下拉為空。
- **`task_reveal` 只能選擇 hidden 類型任務**：general 任務不會出現。seed 時必須指定 `type: 'hidden'`。
- **限制機制是兩個獨立 number 欄位，不是 discriminator enum**：實作採用 `usageLimit` (Skill/Item) + `cooldown` (Skill/Item) + `usageCount` (Skill only) + `lastUsedAt` (Skill only)。`usageLimit=0` 代表無上限、`cooldown=0` 代表無冷卻。spec 禁止使用 `limitType: 'daily' | 'per_scene' | 'once'` 這類 discriminator——那是舊文件的誤稱，會與 `types/character.ts:266-269, 359-362` 的 type 定義不符。
- **Equipment 類型會跳過 Step 3**：`ability-edit-wizard.tsx:613-623` 在 `itemData.type === 'equipment'` 時直接顯示「裝備類型無需使用限制」並 disable Next 的限制欄位驗證。Flow #4b 的 items case 刻意選 non-equipment 類型避開此分支，若未來要測裝備需另開 case。
- **Consumable 類型預設 `usageLimit: 1`**：`ability-edit-wizard.tsx:410` 在使用者點「消耗品」類型卡時會 side-effect 設 usageLimit=1。斷言時要考慮初始值而非 0。

---

## #4b.5 Skills Wizard edit mode（載入既有 → 修改 → 儲存）

### 進入點
- 角色：GM → 編輯頁 → `tabSkills.click()` → 點擊既有 skill 的「編輯」按鈕

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色
- 角色已有 1 skill：
  ```
  {
    name: '初始技能',
    description: '舊描述',
    checkType: 'contest',
    relatedStat: 'str',
    usageLimit: 2,
    cooldown: 0,
    usageCount: 0,
    effects: [{ type: 'stat_modify', targetStat: 'hp', amount: 10 }]
  }
  ```

### 操作步驟
**Phase A — 開啟 edit Wizard**
1. 點擊 skill 的編輯按鈕
2. 斷言：Dialog title 為「編輯技能」（非「新增」）
3. 斷言：Step indicator === `1`
4. 斷言：name input 預填 `初始技能`、desc 預填 `舊描述`

**Phase B — 依序驗證每個 step 的預填值**
5. Next → Step 2：斷言 checkType=`contest`，relatedStat=`str`
6. Next → Step 3：斷言 `usageLimitInput` 顯示 `2`、`cooldownInput` 顯示 `0`
7. Next → Step 4：斷言 effects 列表有 1 項，type=`stat_modify`

**Phase C — 修改 Step 1 與 Step 4**
8. 回到 Step 1（點 step indicator 或連按 Prev）
9. `wizardNameInput.fill('進化技能')`
10. 跳到 Step 4，修改 effect amount=`20`
11. Finish → saveAndWait

### 斷言
- **DB 層**：
  - 同一 skill id（未建新）
  - `name === '進化技能'`
  - `effects[0].amount === 20`
  - 其他欄位維持原值（`checkType`, `relatedStat`, `usageLimit=2`, `cooldown=0`, `usageCount=0`）
- **UI 層**：Skills 列表顯示「進化技能」，原「初始技能」消失

### 反向驗證
- Phase B 的每個 step 預填值若有任一錯誤，代表 Wizard 的 `initialData` 傳遞有漏洞

### 已知陷阱
- **Edit mode 是同 id 覆蓋還是新增 + 刪除舊**：需先讀 `field-updaters/skills.ts` 確認。若是前者，DB 斷言 `_id` 不變；若是後者，必須比對 `name` 並接受 `_id` 變動。
- **Step 之間的 navigation 可能支援直接點 step indicator**：若支援，此 case 應同時驗證；若不支援，只能連按 Prev。
- **Wizard `initialData` 的 deep clone**：若 Wizard 直接 mutate prop，Cancel 也會污染 form state。此 case 可加反向驗證：Phase A 後直接 Cancel → 確認 form state 未變。

---

## 跨 Case 已知陷阱

### 陷阱 #1：Wizard 是 Radix Dialog portal
所有 Wizard 相關 selector 必須用 `page.getByRole('dialog')` 全域查找，不可 scope 在編輯頁 form 下。關閉時 Radix 有 animation，需 `expect(dialog).toBeHidden()` 而非立刻 DOM detach 斷言。

### 陷阱 #2：Wizard finish 不等於 DB 寫入
Finish 只把資料推入外層 form dirty state，真正寫入要靠 Sticky Save Bar 的儲存。若 spec 在 finish 後立刻 `loadCharFromDb`，會讀到舊資料。**每個 Wizard case 結束前必須 `saveAndWait`**。

### 陷阱 #3：Effect 類型在 `item` vs `skill` mode 差異
- `item_give`, `task_reveal` 僅在 skill mode
- `consume_self` 僅在 item mode（若存在）
- 共用：`stat_modify`, `log_message` 等
- spec 若在 items 的 Step 4 找不到 `item_give` 選項**不是 bug**，而是正確行為

### 陷阱 #4：Wizard edit mode 的 RED 初始化
`ability-edit-wizard.tsx` 在 new mode 必定從 Step 1 開始，在 edit mode 也應從 Step 1 開始（而非最後一步）。`#4b.5 Phase A` 的 Step indicator 斷言守護這條規則。

### 陷阱 #5：Stats 的 key 與 label
- `key`：程式性 id，validator 強制唯一，用於 `relatedStat`、`targetStat` 等引用
- `label`：顯示文字，無唯一性要求
- spec 斷言 validator 錯誤時要用 key 不要用 label

### 陷阱 #6：圖片欄位
Wizard Step 1 可能有圖片欄位，與 Flow #4 #4.2 相同原則：**只驗證 UI 存在，不實際上傳**。

### 陷阱 #7：跨 tab 的 Wizard state
Wizard 開啟時切換 tab（Items → Skills），Dialog 是否關閉由實作決定。**Flow #4b 不測試** 這個 edge case，避免因實作策略變動造成 spec 脆弱。

---

## Fixture 需求

### 新增
- `seedFixture.characterWithItem(gameId, itemSpec)` — 角色含一 item（for #4b.4 item_give target）
- `seedFixture.characterWithSkill(gameId, skillSpec)` — 角色含一 skill（for #4b.5 edit mode）
- `seedFixture.characterWithHiddenTask(gameId, taskSpec)` — 角色含一 hidden task（for #4b.4 task_reveal target）
- `goThroughWizardSteps(page, steps)` helper

### 複用
- `asGm()` fixture
- `seedFixture.gameForGm(gmUserId, { isActive: false })` fixture
- `saveAndWait(page)` helper（Flow #4 定義）

---

## 延後 / 排除 / 橫切追溯

| 項目 | 狀態 | 去處 |
|---|---|---|
| 效果的 runtime 實際執行（`item_give` 真的 give）| 橫切 | Flow #5/#6 `player-use-skill.spec.ts` |
| 限制條件的 runtime 觸發（`daily` 用量消耗）| 橫切 | Flow #5 |
| Wizard 圖片上傳 | 排除 | Blob 限制 |
| Items mode 的 Step 4 所有效果類型窮舉 | 延後 | 僅代表性驗證 `stat_modify`，其他類型未覆蓋 |
| Active game 下 Wizard 行為（runtime 雙寫）| 橫切 | Flow #5/#6 |
| Wizard 同時多開 | 延後 | UX edge case |

---

## 實作順序建議

1. `#4b.1 Stats` 先跑通（無 Wizard，純 inline form，最簡單）
2. `#4b.2 Items happy path` 次之（建立 `goThroughWizardSteps` helper）
3. `#4b.3 Items 互鎖` 在 happy path 基礎上加分支
4. `#4b.4 Skills happy path + 專屬效果` 需新 seed helpers
5. `#4b.5 Skills edit mode` 最複雜（需先確認 edit 語意），最後寫
