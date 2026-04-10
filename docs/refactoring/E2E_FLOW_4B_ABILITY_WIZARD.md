# E2E Flow #4b — Ability Wizard & Stats CRUD（GM 角色卡細部）

> **上游索引**：本檔案為 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 中 Flow #4 拆分出來的姊妹檔。
> **主檔**：[E2E_FLOW_4_GM_CHARACTER_CRUD.md](./E2E_FLOW_4_GM_CHARACTER_CRUD.md)
> **對應 spec**：`e2e/flows/gm-ability-wizard.spec.ts`

---

## 設計背景

`components/gm/ability-edit-wizard.tsx` 是 Items 與 Skills 共用的 4 步驟建立/編輯流程，被 `items-edit-form.tsx` 與 `skills-edit-form.tsx` 以 `mode='item' | 'skill'` 方式呼叫。兩邊共用 Step 1（基本資訊）、Step 2（檢定設定）、Step 3（限制條件），Step 4（效果）的可選效果類型因 mode 而異——這是 Flow #4b 存在的核心理由：**同一元件跑兩條支線，step-by-step 驗證才能證明分支未漏洞**。

Stats CRUD（`stats-edit-form.tsx`）雖然不使用 Wizard，但它也是 **inline form 驅動的 ability-like 欄位**，type 結構與 validator 規則與 items/skills 同源（都在 `character-validator.ts`），放在同一 flow 維持「GM 細部 CRUD」的主題一致性。

### Flow #4b 的三個核心驗證目標

1. **Stats 的 inline CRUD + validator 規則**（`stats-edit-form.tsx`）
2. **AbilityEditWizard 的 happy path**：4 個步驟循序推進、每步的表單狀態、跨步驟的欄位依賴（例：Step 2 checkType=`contest` 強制需要 relatedStat）
3. **Items vs Skills 的 mode 分支**：Step 4 效果選項差異、技能專屬效果（`task_reveal`、`task_complete`）

---

## 範圍定義

### 測
- `stats-edit-form.tsx` 的新增/修改/刪除 + validator 錯誤
- `ability-edit-wizard.tsx` 完整 4 步驟（Items mode）
- Step 2 的 checkType → relatedStat 互鎖規則（驗證在 save 按鈕觸發，非 Next 按鈕）
- `ability-edit-wizard.tsx` 完整 4 步驟（Skills mode）
- 技能專屬效果類型（`task_reveal`、`task_complete`——技能比物品多這兩種）
- Wizard edit mode（載入既有資料 → 修改 → 儲存）
- Wizard Stepper 自由跳步（點 `aria-label="跳至步驟 N：{label}"` 按鈕直接跳轉）

### 不測（延後/排除）
- Wizard 內的圖片上傳（排除，Blob 限制）
- Step 3 限制條件的 runtime 實際觸發（延後至 Flow #5/#6）
- 效果 payload 在 runtime 的執行（如 `task_reveal` 真正揭露一個任務）→ Flow #5/#6
- Wizard 的 form 初始化效能（非功能性）
- 同時開多個 Wizard（dialog stacking）→ UX edge case，延後

---

## Test Case 獨立性設計

| Case | 獨立 seed | Mode |
|---|---|---|
| #4b.1 Stats CRUD + validator | gmWithGameAndCharacter（空 stats） | — |
| #4b.2 Items Wizard happy path | gmWithGameAndCharacter + 1 stat（供 effect target） | item |
| #4b.3 Items Wizard 互鎖規則 | gmWithGameAndCharacter + 1 stat（供 relatedStat） | item |
| #4b.4 Skills Wizard happy path + 專屬效果 | gmWithGameAndCharacter + 1 stat | skill |
| #4b.5 Skills Wizard edit mode | gmWithGameAndCharacter + 1 stat + 1 既有 skill | skill |

**原則**：每個 case 獨立 seed（使用 `seed.gmWithGameAndCharacter({ characterOverrides })`），Wizard 的 dialog 每次重新開啟都從 Step 1 開始，跨 case 不共享 Wizard 狀態。

---

## 共用規格

### URL 模式
- 編輯頁：`/games/{gameId}/characters/{charId}/edit`
- Wizard 沒有獨立路由，是 shadcn Dialog portal

### 關鍵 Selectors（實測驗證）
```ts
// Stats tab
const tabStats = page.getByRole('tab', { name: '數值' });
// 空狀態用 '新增第一個數值'，非空狀態用 '新增數值'
const addStatFirstBtn = page.getByRole('button', { name: '新增第一個數值' });
const addStatBtn = page.getByRole('button', { name: '新增數值' });

// StatCard — view mode 用 hasText 定位，edit mode 用 has:'完成編輯' button
// ⚠ hasText 只匹配 DOM textContent，不匹配 <input value>
const statCardView = (name: string) =>
  page.locator('div.bg-card.rounded-2xl').filter({ hasText: name });
const editingCard = page.locator('div.bg-card.rounded-2xl').filter({
  has: page.getByRole('button', { name: '完成編輯' }),
});

// Items/Skills tab
const tabItems = page.getByRole('tab', { name: '物品' });
const tabSkills = page.getByRole('tab', { name: '技能' });
// 空狀態用 '新增第一個物品/技能'，非空狀態用 '新增物品/技能'

// Wizard Dialog
const dialog = page.getByRole('dialog');

// Wizard 步驟標示（文字，非 data-testid）
// e.g. await expect(dialog.getByText('步驟 1')).toBeVisible();

// Wizard 導航
const wizardNextBtn = dialog.getByRole('button', { name: '下一步' });
// 無「上一步」按鈕——改用 Stepper 直接跳步
// e.g. dialog.getByRole('button', { name: /跳至步驟 1/ }).click();

// Wizard 完成按鈕（按 mode 不同）
const wizardSaveItemBtn = dialog.getByRole('button', { name: '儲存物品' });
const wizardSaveSkillBtn = dialog.getByRole('button', { name: '儲存技能' });
// ⚠ 沒有「完成」按鈕——save 按鈕名稱是「儲存物品」或「儲存技能」

// Wizard Dialog title（⚠ 用 h1 避免 Radix sr-only h2 重複）
// e.g. dialog.locator('h1', { hasText: '新增技能' })
// 不用 getByRole('heading') 因為 shadcn/ui DialogContent 會同時產生 sr-only <h2> 和可見 <h1>

// Wizard Step 1 — 名稱、描述用 placeholder 定位
// Items: '輸入物品名稱...' / '描述此物品的外觀、來源或特殊傳說...'
// Skills: '輸入技能名稱...' / '描述技能的效果和使用方式...'

// Wizard Step 2 — 檢定類型用文字卡片（非 Select）
// e.g. dialog.getByText('無檢定', { exact: true }).click();
// e.g. dialog.getByText('對抗檢定', { exact: true }).click();
// relatedStat Select（Radix combobox，無 accessible name）：
// dialog.getByRole('combobox').filter({ hasText: '選擇數值' })

// Wizard Step 4 — 效果
const addEffectBtn = dialog.getByRole('button', { name: '新增效果' });
// 效果類型 Select（Radix combobox，用 hasText filter）：
// dialog.getByRole('combobox').filter({ hasText: '數值變更' })
// 目標數值 Select：
// dialog.getByRole('combobox').filter({ hasText: '選擇數值' })
// 數值變更量 input：
// dialog.getByPlaceholder('+5 或 -10')
// task_reveal 的任務 ID input：
// dialog.getByPlaceholder('任務 ID')
```

### Seed 方式（使用 fixture `seed` 物件）
```ts
// 基本角色
const { gmUserId, gameId, characterId } = await seed.gmWithGameAndCharacter({
  characterOverrides: {
    name: 'E2E 角色',
    stats: [{ id: 'stat-hp', name: 'HP', value: 100 }],
    skills: [{ id: 'skill-1', name: '初始技能', effects: [...] }],
  },
});

// 登入 + 導航
await asGm({ gmUserId });
await page.goto(`/games/${gameId}/characters/${characterId}`);
```

### 跨 Phase 穩定模式（**必讀**）
```ts
// 每次 save 後，等 Sonner toast 全部消失再進行下一個 Phase
// 防止：(1) 下次 waitForToast('已儲存') 誤匹配殘留 toast
//       (2) E2E Pusher stub 回送 role.updated 觸發 discardStatsAndRefresh 清掉 dirty state
await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });
```

---

## #4b.1 Stats inline CRUD + validator 規則

### 進入點
- 角色：GM → 編輯頁 → 「數值」tab

### 前置 seed
- `seed.gmWithGameAndCharacter({ characterOverrides: { name: 'E2E 數值角色' } })`（空 stats）

### 操作步驟
**Phase A — 新增兩個 stat（合併為單次 save，避免 stale closure）**
1. 空狀態顯示「尚未定義任何數值」→ 點「新增第一個數值」
2. 新增 stat 自動進入 edit mode（name input auto-focus）
3. 填入 name=`生命值`、value=`100`，點「完成編輯」
4. 點「新增數值」（非空狀態用 DashedAddButton）
5. 填入 name=`魔力`、value=`50`，點「完成編輯」
6. SaveBar 出現 → 點「全部儲存」→ 等 `已儲存` toast → SaveBar 消失

**Phase B — 修改 + 刪除（合併為單次 save）**
7. **等待 Phase A 的 toast 全部消失**（`[data-sonner-toast] count=0`，防止 stale toast + role.updated 事件）
8. 點「生命值」card 的「編輯」→ edit mode 啟動
9. edit mode 用 `has:'完成編輯' button` 定位 card（因 name 已從 textContent 搬進 input value）
10. 修改 value=`80` → 點「完成編輯」
11. 點「魔力」card 的「刪除」（soft delete）
12. SaveBar → 儲存 → toast → SaveBar 消失

**Phase C — Validator 反向驗證：空 name**
13. 等待 Phase B 的 toast 全部消失
14. 點「新增數值」→ 不填 name → 點「完成編輯」（draft name 為空字串）
15. 點「全部儲存」→ 錯誤 toast「所有數值欄位都需要名稱」
16. SaveBar 仍可見（save 未成功）
17. 點空 name stat（顯示「未命名」）的「刪除」→ SaveBar 消失（回到 Phase B 狀態）

### 非同步等待點
- 每次 save 後等 toast 出現 + SaveBar 消失
- **跨 Phase 必須等 `[data-sonner-toast]` count=0**（規則 19）

### 斷言
- **DB 層**：
  - Phase A：`stats.length === 2`、`stats.find(s => s.name === '生命值')` 存在、value=100
  - Phase B：`stats.length === 1`、`stats[0].name === '生命值'`、value=80
- **UI 層**：Phase C 的錯誤 toast + SaveBar 保持可見

### 反向驗證
- Phase C 驗證 validator 攔截空 name

### 已知陷阱
- **Stats 只有 name + value，沒有 key/label 區分**：DB 中 `stats[].name` 即是顯示名稱，沒有獨立的 `key` 欄位。validator 的唯一性檢查（如果有）也是對 `name`。
- **value 型別**：DB 中 value 可能是 number 或 string。斷言用 `Number(stats[0].value)` 做 cast。
- **view mode vs edit mode 的 locator 斷裂**：`hasText: '生命值'` 在 view mode 匹配 `<p>生命值</p>`，進入 edit mode 後 name 變成 `<input value="生命值">`，`hasText` 不再匹配。必須用 `has: page.getByRole('button', { name: '完成編輯' })` 定位 editing card。
- **跨 Phase stale toast + Pusher self-echo**：見共用陷阱 #8。

---

## #4b.2 Items Wizard happy path（4 步驟完整走過）

### 進入點
- 角色：GM → 編輯頁 → 「物品」tab → 開啟 Wizard

### 前置 seed
- `seed.gmWithGameAndCharacter({ characterOverrides: { name: 'E2E 物品角色', stats: [{ id: 'stat-hp', name: 'HP', value: 100 }] } })`

### 操作步驟
**Phase A — 4 步驟 Wizard 走完**
1. 空狀態「尚無物品」→ 點「新增第一個物品」
2. Dialog 開啟 → 確認「步驟 1」可見
3. Step 1：名稱=`治療藥水`（placeholder `輸入物品名稱...`），描述=`恢復 20 HP 的紅色藥水`，選「消耗品」卡片 → 下一步
4. Step 2：選「無檢定」卡片 → 下一步
5. Step 3：usageLimit 改為 `3`（消耗品預設=1）→ 下一步
6. Step 4：「新增效果」→ 效果類型預設 `stat_change`（數值變更）→ 選目標數值 `HP` → 填變更量 `20`
7. 點「儲存物品」→ Dialog 關閉

**Phase B — 儲存到 DB**
8. Items 列表出現「治療藥水」→ SaveBar 出現
9. 點「全部儲存」→ toast → SaveBar 消失

### 斷言
- **DB 層**：
  - `items.length === 1`
  - `items[0].name === '治療藥水'`、`type === 'consumable'`、`checkType === 'none'`
  - `Number(items[0].usageLimit) === 3`、`Number(items[0].usageCount) === 0`
  - `effects[0].type === 'stat_change'`、`effects[0].targetStat === 'HP'`、`Number(effects[0].value) === 20`
- **UI 層**：Items 列表顯示名稱、Wizard Dialog 已關閉

### 已知陷阱
- **Wizard Next 按鈕的驗證只在 Step 0（name 為空時 early return）**：其他 step 的 Next 永遠通過，真正的驗證在「儲存物品/技能」按鈕上。
- **Wizard Dialog 是 Radix portal**：必須用 `page.getByRole('dialog')` 全域找。
- **Wizard 完成 ≠ DB 寫入**：「儲存物品」只把 ability 推入 form dirty state，需要外層 SaveBar 觸發才寫 DB。
- **Radix Select combobox 無 accessible name**：`<label>` 未用 `htmlFor` 關聯 → `getByRole('combobox', { name })` 不可用。用 `getByRole('combobox').filter({ hasText: '選擇數值' })` 替代。
- **消耗品預設 `usageLimit: 1`**：選「消耗品」卡片時 side-effect 設 usageLimit=1。

---

## #4b.3 Items Wizard 互鎖規則：checkType=contest 需 relatedStat

### 進入點
- 角色：GM → 編輯頁 → 「物品」tab → 開啟 Wizard

### 前置 seed
- `seed.gmWithGameAndCharacter({ characterOverrides: { name: 'E2E 互鎖角色', stats: [{ id: 'stat-str', name: '力量', value: 10 }] } })`

### 操作步驟
**Phase A — Step 1 填完 → Step 2 選「對抗檢定」**
1. 空狀態 → 點「新增第一個物品」→ Dialog 開啟
2. Step 1：名稱=`投擲匕首`，選「道具」卡片 → 下一步
3. Step 2：選「對抗檢定」卡片 → relatedStat Select 出現（placeholder `選擇數值`）

**Phase B — 不選 relatedStat 直接走到最後嘗試儲存**
4. 不選 relatedStat → 下一步 → Step 3 → 下一步 → Step 4
5. 點「儲存物品」→ **驗證攔截**
6. 錯誤 toast「請選擇對抗檢定使用的數值」→ 自動跳回 Step 2

**Phase C — 補選 relatedStat → 儲存成功**
7. 選 relatedStat=`力量` → 點「儲存物品」→ Dialog 關閉
8. SaveBar → 儲存 → toast → SaveBar 消失

### 斷言
- **DB 層**：
  - `items[0].name === '投擲匕首'`、`items[0].checkType === 'contest'`
  - `contestConfig.relatedStat === '力量'`
- **UI 層**：Phase B 的錯誤 toast + 自動跳回 Step 2

### 反向驗證
- Phase B 驗證 `contest` 必須有 relatedStat（`check-config-validators.ts` 的 contest 分支）

### 已知陷阱
- **驗證在 save 按鈕觸發，不在 Next 按鈕**：`handleNext` 只驗證 Step 0 name 為空。checkType 互鎖驗證在 `handleSave` 中 `validateCheckConfig()` 執行，失敗時自動跳回 Step 2 + toast 錯誤。
- **relatedStat 下拉選項來自角色 `stats`**：seed 必須預先給 stats，否則下拉為空。
- **補選 relatedStat 後可直接點「儲存物品」**：不需要重新走 Step 3/4，save 按鈕在任何 step 都可點擊。

---

## #4b.4 Skills Wizard happy path + 技能專屬效果（`stat_change` + `task_reveal`）

### 進入點
- 角色：GM → 編輯頁 → 「技能」tab → 開啟 Wizard

### 前置 seed
- `seed.gmWithGameAndCharacter({ characterOverrides: { name: 'E2E 技能角色', stats: [{ id: 'stat-hp', name: 'HP', value: 100 }] } })`
- 不需要預置 item 或 task — `task_reveal` 的 targetTaskId 是純文字 input，不是下拉選單

### 操作步驟
**Phase A — Skills Wizard Step 1-3 依序推進**
1. 空狀態「尚無技能」→ 點「新增第一個技能」→ Dialog 開啟
2. Dialog title 為「新增技能」（用 `dialog.locator('h1', { hasText: '新增技能' })` 定位，避免 sr-only h2 重複）
3. Step 1：名稱=`大師技能`（placeholder `輸入技能名稱...`），描述=`測試技能描述`（placeholder `描述技能的效果和使用方式...`）→ 下一步
4. Step 2：選「無檢定」卡片 → 下一步
5. Step 3：usageLimit=`1` → 下一步

**Phase B — Step 4 加入 `stat_change` 效果**
6. Step 4 → 「新增效果」→ 效果預設 `stat_change`
7. 選目標數值 `HP`（combobox filter `選擇數值`）→ 填變更量 `-10`

**Phase C — Step 4 加入 `task_reveal` 效果（技能專屬）**
8. 「新增效果」→ 自動選取效果 2（面板已切換）
9. 確認「效果 2」段落可見（用 `dialog.getByRole('paragraph').filter({ hasText: '效果 2' })`，避免 sidebar button 重複匹配）
10. 效果類型 combobox（預設顯示「數值變更」）→ 選「揭露任務」
11. 填入任務 ID=`task-secret-001`（placeholder `任務 ID`）— **純文字 input，非下拉選單**

**Phase D — 儲存**
12. 點「儲存技能」→ Dialog 關閉
13. SaveBar → 儲存 → toast → SaveBar 消失

### 斷言
- **DB 層**：
  - `skills.length === 1`
  - `skills[0].name === '大師技能'`、`description === '測試技能描述'`、`checkType === 'none'`
  - `Number(skills[0].usageLimit) === 1`、`Number(skills[0].usageCount) === 0`
  - `effects.length === 2`
  - `effects[0].type === 'stat_change'`、`targetStat === 'HP'`、`Number(value) === -10`
  - `effects[1].type === 'task_reveal'`、`targetTaskId === 'task-secret-001'`
- **UI 層**：Skills 列表顯示「大師技能」

### 已知陷阱
- **新增效果後自動選取新效果**：`selectedEffectIndex` 會更新到新效果，不需要手動點 sidebar button。若嘗試點 sidebar 的「效果 2」按鈕會因 sidebar + 面板兩處匹配 strict mode 而失敗。
- **「效果 2」文字的 strict mode**：`getByText('效果 2')` 同時匹配 sidebar button 子元素和右側面板的 paragraph。用 `getByRole('paragraph').filter({ hasText: '效果 2' })` 精確定位面板。
- **Dialog heading 重複**：shadcn/ui DialogContent 產生 sr-only `<h2>` (DialogTitle) 和 Wizard 可見 `<h1>`，兩者同名。`getByRole('heading', { name })` 會 strict mode 失敗，用 `dialog.locator('h1')` 替代。
- **`task_reveal`/`task_complete` 是純文字 input**：placeholder 為「任務 ID」，label 為「目標任務 ID」。不是下拉選單，不需要預置 task。
- **技能 vs 物品效果類型差異**：
  - 物品效果：`stat_change`, `custom`, `item_take`, `item_steal`
  - 技能效果：`stat_change`, `item_take`, `item_steal`, `task_reveal`, `task_complete`, `custom`
  - 技能多了 `task_reveal`（揭露任務）和 `task_complete`（完成任務）

---

## #4b.5 Skills Wizard edit mode（載入既有 → 修改 → 儲存）

### 進入點
- 角色：GM → 編輯頁 → 「技能」tab → 點既有 skill 的「編輯」按鈕

### 前置 seed
- `seed.gmWithGameAndCharacter({ characterOverrides: { ... } })` 含 1 個既有 skill：
  ```ts
  skills: [{
    id: 'skill-existing',
    name: '初始技能',
    description: '舊描述',
    checkType: 'none',
    usageLimit: 2,
    cooldown: 0,
    usageCount: 0,
    effects: [{ type: 'stat_change', targetStat: 'HP', value: 10 }],
  }]
  ```

### 操作步驟
**Phase A — 開啟 edit Wizard，驗證預填值**
1. 點 AbilityCard 的「編輯」按鈕 → Dialog 開啟
2. Dialog title 為「編輯技能」（`dialog.locator('h1', { hasText: '編輯技能' })`）
3. 驗證 Step 1 預填值：名稱=`初始技能`、描述=`舊描述`

**Phase B — 修改名稱 + Stepper 跳到 Step 4 修改效果**
4. 修改名稱=`進化技能`
5. 點 Stepper 跳到 Step 4（`dialog.getByRole('button', { name: /跳至步驟 4/ })`）
6. 驗證效果值預填=`10`
7. 修改效果值=`20`

**Phase C — 儲存**
8. 點「儲存技能」→ Dialog 關閉
9. SaveBar → 儲存 → toast → SaveBar 消失

### 斷言
- **DB 層**：
  - `skill.id === 'skill-existing'`（同一 id 覆蓋更新，非新增+刪除）
  - `name === '進化技能'`
  - `description === '舊描述'`（未修改）
  - `checkType === 'none'`、`Number(usageLimit) === 2`、`Number(usageCount) === 0`
  - `effects[0].type === 'stat_change'`、`targetStat === 'HP'`、`Number(value) === 20`（已修改）
- **UI 層**：Skills 列表顯示「進化技能」

### 已知陷阱
- **Edit mode 是同 id 覆蓋**：`field-updaters/skills.ts` 以 `id` 匹配更新。DB 斷言 `skill.id` 不變。
- **Stepper 自由跳步**：`wizard-stepper.tsx` 的按鈕 `aria-label="跳至步驟 N：{stepLabels[i]}"` 允許跳到任意步驟。不需要連按 Prev/Next。
- **handleEditSkill 的 shallow copy**：`skills-edit-form.tsx` 在 `handleEditSkill` 中 shallow copy effects/tags arrays，設 `editingSkill` 後開 Wizard。Wizard 接收的是 copy，不會 mutate 原始 form state。

---

## 跨 Case 已知陷阱

### 陷阱 #1：Wizard 是 Radix Dialog portal
所有 Wizard 相關 selector 必須用 `page.getByRole('dialog')` 全域查找，不可 scope 在編輯頁 form 下。關閉時 Radix 有 animation，用 `expect(dialog).toBeHidden({ timeout: 5000 })` 等待。

### 陷阱 #2：Wizard 儲存 ≠ DB 寫入
「儲存物品」/「儲存技能」只把 ability 推入外層 form dirty state，真正寫入要靠 SaveBar 的「全部儲存」。若 spec 在 Wizard 關閉後立刻讀 DB，會讀到舊資料。

### 陷阱 #3：Effect 類型在 `item` vs `skill` mode 差異
- 物品效果：`stat_change`, `custom`, `item_take`, `item_steal`
- 技能效果：`stat_change`, `item_take`, `item_steal`, `task_reveal`, `task_complete`, `custom`
- 技能比物品多了 `task_reveal`（揭露任務）和 `task_complete`（完成任務）
- spec 在 items Step 4 找不到 `task_reveal` 選項**不是 bug**

### 陷阱 #4：Wizard edit mode 從 Step 1 開始
`ability-edit-wizard.tsx` 在 edit mode 也從 Step 1 開始（而非跳到最後一步）。`#4b.5 Phase A` 守護此規則。

### 陷阱 #5：Stats 只有 name + value
Stats 沒有獨立的 `key`/`label` 區分。DB 中 `stats[].name` 即是顯示名稱也是引用鍵。`relatedStat` 和 `targetStat` 的值就是 stat 的 `name`（如 `'HP'`、`'力量'`）。

### 陷阱 #6：圖片欄位
Wizard Step 1 有圖片欄位，Flow #4b **不驗證圖片上傳**（Blob 限制）。

### 陷阱 #7：跨 tab 的 Wizard state
Wizard 開啟時切換 tab（Items → Skills），Dialog 是否關閉由實作決定。**Flow #4b 不測試**此 edge case。

### 陷阱 #8：跨 Phase 的 stale toast + Pusher self-echo（**重要**）
- **Sonner toast** 持續 ~4 秒。若 Phase A save 產生 `已儲存` toast，Phase B 的 `waitForToast('已儲存')` 可能誤匹配殘留 toast，導致 test 在 Phase B save 完成前就往下跑。
- **E2E Pusher stub** 不實作 `socket_id` 發送者排除。GM save 後觸發 `role.updated` WebSocket 事件，同一 browser 收到後會呼叫 `discardStatsAndRefresh()`。若 stats tab 處於 dirty 狀態，dirty changes 會被丟棄。
- **對策**：每次 save 後 `await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 })` 等全部 toast 消失，同時也等 role.updated 事件處理完畢。

### 陷阱 #9：Dialog heading 重複（Radix + Wizard）
shadcn/ui `DialogContent` 會產生 sr-only `<h2>` (DialogTitle) 和 Wizard 可見 `<h1>`，兩者文字相同。`getByRole('heading', { name: '新增技能' })` 會因 strict mode 匹配兩個元素而失敗。用 `dialog.locator('h1', { hasText })` 替代。

### 陷阱 #10：Radix Select combobox 無 accessible name
shadcn/ui Select 渲染的 `<button role="combobox">` 沒有 accessible name（`<label>` 未用 `htmlFor` 關聯）。`getByRole('combobox', { name: '...' })` 不可用。用 `getByRole('combobox').filter({ hasText: 'placeholder文字' })` 替代。

### 陷阱 #11：hasText 不匹配 input value
Playwright `filter({ hasText })` 只匹配 DOM `textContent`，不匹配 `<input value>`。StatCard 從 view mode（`<p>生命值</p>`）切到 edit mode（`<input value="生命值">`）時，原本的 hasText 定位器會失效。改用 `has: page.getByRole('button', { name: '完成編輯' })` 定位 editing card。

---

## Fixture 使用方式

### seed 物件（Phase 3 fixture 提供）
- `seed.gmWithGameAndCharacter({ characterOverrides })` — 一次建立 GM + inactive game + 角色
- `characterOverrides` 可包含 `stats`, `skills`, `items` 等陣列
- 不需要獨立的 `characterWithItem`/`characterWithSkill` helper — 用 `characterOverrides` 即可

### 複用
- `asGm({ gmUserId })` fixture — 設定 GM session
- `dbQuery(collection, filter)` fixture — DB 斷言
- `waitForToast(page, text)` helper — toast 等待

---

## 延後 / 排除 / 橫切追溯

| 項目 | 狀態 | 去處 |
|---|---|---|
| 效果的 runtime 實際執行（`task_reveal` 真的揭露）| 橫切 | Flow #5/#6 |
| 限制條件的 runtime 觸發（用量消耗、冷卻）| 橫切 | Flow #5 |
| Wizard 圖片上傳 | 排除 | Blob 限制 |
| Items Step 4 所有效果類型窮舉 | 延後 | 僅驗證 `stat_change`，其他未覆蓋 |
| Active game 下 Wizard 行為（runtime 雙寫）| 橫切 | Flow #5/#6 |
| Wizard 同時多開 | 延後 | UX edge case |
| Equipment 類型 Step 3 跳過行為 | 延後 | 需另開 case |

---

## 實作順序與結果

1. ✅ `#4b.1 Stats` — inline form CRUD + validator 反向驗證
2. ✅ `#4b.2 Items happy path` — 4 步驟 Wizard 完整走過
3. ✅ `#4b.3 Items 互鎖` — contest checkType 強制 relatedStat
4. ✅ `#4b.4 Skills happy path + 專屬效果` — stat_change + task_reveal 雙效果
5. ✅ `#4b.5 Skills edit mode` — 載入既有 → Stepper 跳步 → 修改 → 覆蓋更新
