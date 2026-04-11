# E2E Flow #4 — GM 角色卡 CRUD（主線）

> **上游索引**：本檔案為 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 中 Flow #4 的完整規格。主 plan 僅保留 anchor 與指標。
> **姊妹檔**：Items/Skills 內部的 `AbilityEditWizard` 4 步驟流程拆至 [e2e_flow_4b_ability_wizard.md](./e2e_flow_4b_ability_wizard.md)。
> **對應 spec**：`e2e/flows/gm-character-crud.spec.ts`

---

## 設計背景

Flow #4 驗證 **GM 端角色卡 CRUD 的整條鏈**，從空白遊戲狀態建立第一張角色卡、填入 7 個分頁的內容、到刪除角色，確保：

1. **角色建立的兩條業務閘門**
   - PIN 同 game 內唯一性（`app/actions/characters.ts:305-319`）
   - active game 禁止新增角色（`app/actions/characters.ts:331-338`，Phase 10 safeguard）
2. **7 個分頁的欄位更新走同一條 field-updater pipeline**（`lib/character/field-updaters/*` 為 single source of truth），每個分頁至少有一個代表性欄位被寫入 → 讀回 → 斷言
3. **Sticky Save Bar + dirty state + beforeunload** 能正確反映使用者的未儲存編輯
4. **baseline/runtime 雙寫** 在 `active:false` 時只寫 baseline，確保 Flow #5-#8 的 runtime overlay 有穩定起點
5. **刪除閘門**：`isActive:true` 時隱藏刪除按鈕（`components/gm/delete-character-button.tsx`）

**不在本 flow 範圍**（拆至其他 flow 或延後）：
- Items/Skills 的 `AbilityEditWizard` 4 步驟互動 → Flow #4b
- Stats CRUD → Flow #4b（與 Wizard 同批，因 form 型態相近）
- 玩家端 CharacterCardView 的讀取 → Flow #2、#5-#8
- WebSocket 廣播事件 → Flow #5-#9
- Runtime field update（玩家操作引發的 overlay）→ Flow #5-#8
- Auto-reveal 條件的實際觸發驗證 → 未定 Flow #10（auto-reveal 專屬）
- 圖片上傳實際流程 → Phase B4 圖片上傳暫列排除（Blob 無法模擬）

---

## 範圍定義

### 測
- `/games/{gameId}` 列表頁 → 「新增角色」按鈕 → 建立 Dialog
- `/games/{gameId}/characters/{characterId}/edit` 7 個分頁：
  1. 基本設定（name / description / slogan / personality / PIN）
  2. 背景故事（blocks 排序 + relationships）
  3. 隱藏資訊（secrets 多段落 + AutoReveal 代表性）
  4. 數值（**僅驗證從 Flow #4b 寫回後能顯示**，CRUD 本體在 Flow #4b）
  5. 任務（general + hidden + 狀態機）
  6. 物品（**僅驗證列表顯示與刪除**，Wizard 本體在 Flow #4b）
  7. 技能（**僅驗證列表顯示與刪除**，Wizard 本體在 Flow #4b）
- Sticky Save Bar dirty state、beforeunload 攔截、儲存後 dirty 歸零
- 刪除角色（isActive gate）

### 不測（延後/排除）
- 圖片上傳（Blob 限制，排除）
- AutoReveal 條件在 runtime 實際被觸發（拆至 Flow #10）
- 玩家端 action trump GM editing（`character-edit-tabs.tsx:119-130`）→ 與 WebSocket 綁定，延後至 Flow #5 姊妹 case
- GM 多人同時編輯同一張卡 → 無此需求，排除

---

## Test Case 獨立性設計

| Case | 獨立 seed | 互相依賴 |
|---|---|---|
| #4.1a 空 game 建角色 | game（空） | 無 |
| #4.1b PIN 唯一性 | game + 1 角色（已有 pin=1234） | 無 |
| #4.2 基本設定 CRUD | game + 1 角色（空白基本設定） | 無 |
| #4.3 背景故事 + relationships | game + 2 角色（for relationships 下拉） | 無 |
| #4.4 隱藏資訊 CRUD | game + 1 角色（空白 secrets） | 無 |
| #4.5 任務 CRUD | game + 1 角色 | 無 |
| #4.6 Dirty + beforeunload | game + 1 角色 | 無 |
| #4.7 刪除角色 gate | game + 1 角色 × 2 次（active / inactive） | 無 |

**原則**：每個 case 用獨立 `seed-fixture` 建立自己的 game + character，避免 case 間污染。

---

## 共用規格

### URL 模式
- 列表：`/games/{gameId}`
- 建立 Dialog：由列表頁觸發，無獨立路由
- 編輯：`/games/{gameId}/characters/{characterId}/edit`
- 編輯頁預設分頁：**基本設定** (`character-edit-tabs.tsx` default value)

### 關鍵 Selectors
```ts
// 列表頁
const createBtn = page.getByRole('button', { name: '新增角色' });
const deleteBtn = page.getByRole('button', { name: '刪除角色' }); // 只在 inactive 時存在

// 建立 Dialog
const nameInput = page.getByLabel('角色名稱');
const pinInput = page.getByLabel('PIN 碼');
const enablePinSwitch = page.getByRole('switch', { name: 'PIN 鎖' });
const submitCreate = page.getByRole('button', { name: '建立' });

// 編輯頁 tabs
const tabBasic = page.getByRole('tab', { name: '基本設定' });
const tabBackground = page.getByRole('tab', { name: '背景故事' });
const tabSecrets = page.getByRole('tab', { name: '隱藏資訊' });
const tabStats = page.getByRole('tab', { name: '數值' });
const tabTasks = page.getByRole('tab', { name: '任務' });
const tabItems = page.getByRole('tab', { name: '物品' });
const tabSkills = page.getByRole('tab', { name: '技能' });

// Sticky Save Bar
const saveBar = page.getByTestId('sticky-save-bar');
const saveBtn = saveBar.getByRole('button', { name: '儲存' });
const discardBtn = saveBar.getByRole('button', { name: '放棄變更' });
```

### Helpers
```ts
// 等待 server action 回寫 + Save Bar dirty 歸零
async function saveAndWait(page: Page) {
  await saveBar.getByRole('button', { name: '儲存' }).click();
  await expect(saveBar).toBeHidden(); // dirty=false 時 hide
}

// 直接從 DB 讀角色（bypass UI revalidation timing）
async function loadCharFromDb(gameId: string, charId: string) {
  return CharacterModel.findOne({ _id: charId, gameId }).lean();
}
```

### Seed helpers（需新增）
- `seedFixture.characterInGame(gameId, overrides?)` — 建立一張最小角色卡（name, pin optional）
- `seedFixture.charactersForRelationships(gameId, count)` — 建立 N 張角色供 relationships 下拉選擇

---

## #4.1a 空白遊戲建立第一張角色（happy path）

### 進入點
- 角色：GM (`asGm()`)
- URL：`/games/{gameId}`

### 前置 seed
- 1 GMUser
- 1 Game，`isActive: false`，**無任何角色**

### 操作步驟
**Phase A — 進入列表**
1. `asGm()` → `page.goto('/games/{gameId}')`
2. 斷言：列表顯示空狀態文案（代表性斷言即可）

**Phase B — 開啟建立 Dialog**
3. `createBtn.click()`
4. 斷言：Dialog 開啟、name input 有 focus

**Phase C — 填表並建立**
5. `nameInput.fill('E2E 主角')`
6. `enablePinSwitch.click()` → `pinInput.fill('1234')`
7. `submitCreate.click()`

**Phase D — 導航至編輯頁**
8. 等待 URL 切換至 `/games/{gameId}/characters/{newCharId}/edit`
9. 斷言：**預設分頁為「基本設定」**（這是上一段 session 修好的 bug 的對稱驗證 — GM 端也要確認 default tab 對）

### 非同步等待點
- `submitCreate` 的 server action 回 200
- `router.push` 完成導航
- 編輯頁初次 render 完成（基本設定表單可見）

### 斷言
- **UI 層**：
  - 編輯頁 URL match `/games/{gameId}/characters/{id}/edit`
  - 基本設定分頁的 name 欄位顯示 `E2E 主角`
  - Sticky Save Bar **不可見**（dirty=false）
- **DB 層**：
  - `Character.findOne({ gameId, name: 'E2E 主角' })` 存在
  - `hasPinLock === true`
  - `pin === '1234'`（明文，`characters.ts:349-351`）
  - `baselineData.stats` 為 schema 預設空陣列
- **Session/LocalStorage**：無需斷言（此 case 與 player 無關）

### 反向驗證（在同一 case 內）
- 不填 name → submit → Dialog 維持開啟、顯示 Zod 錯誤
- 啟用 PIN 但填 `12`（2 位） → 顯示 `PIN 碼必須為 4 位數字`（`characters.ts:297`）

### 已知陷阱
- **Zod schema 錯誤優先於手動訊息**：`characterSchema.parse()` 失敗時，Zod 錯誤格式會早於 `characters.ts` 後段的 PIN 唯一性檢查出現。反向驗證斷言文案時要對照 Zod 的實際輸出。
- **`revalidatePath` 路徑是 `/games/{gameId}` 不是 `/games`**：建立完的列表 re-render 在 game detail 頁而非 games 列表頁，spec 若先 `goto('/games')` 會看不到新角色。

---

## #4.1b PIN 同 game 內唯一性

### 進入點
- 角色：GM
- URL：`/games/{gameId}`

### 前置 seed
- 1 GMUser
- 1 Game，`isActive: false`
- **1 既有角色**：name=`先行者`, pin=`1234`, hasPinLock=true

### 操作步驟
1. `asGm()` → `page.goto('/games/{gameId}')`
2. `createBtn.click()`
3. `nameInput.fill('後來者')` → 啟用 PIN → `pinInput.fill('1234')`
4. `submitCreate.click()`

### 斷言
- **UI 層**：Dialog 顯示「此 PIN 在本遊戲中已被使用」（`characters.ts:316` 文案）
- **DB 層**：`Character.countDocuments({ gameId })` === 1（未新增）

### 反向驗證
- 改 `pinInput.fill('5678')` → `submitCreate.click()` → 成功建立，`Character.countDocuments({ gameId })` === 2

### 已知陷阱
- **PIN 唯一性的查詢條件是 `{ gameId, pin }`**：跨 game 可以重複。若此 case 誤把兩個角色放在不同 game，反向驗證會通過但失去意義。必須 assert **同一 gameId** 下的 count。

---

## #4.2 基本設定分頁 CRUD（含 PIN 修改 + 圖片欄位 gate）

### 進入點
- 角色：GM
- URL：`/games/{gameId}/characters/{charId}/edit`（預設分頁為基本設定）

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色（name=`E2E 主角`，其他欄位皆空）

### 操作步驟
**Phase A — 讀取初始狀態**
1. 進入編輯頁
2. 斷言：name 顯示 `E2E 主角`，description/slogan/personality 為空
3. 斷言：Save Bar 隱藏（dirty=false）

**Phase B — 修改四個文字欄位**
4. `nameInput.fill('修改後的名字')`
5. 斷言：Save Bar 出現（dirty=true）
6. 填入 description, slogan, personality（各一段代表性文字）
7. `saveAndWait(page)`

**Phase C — 修改 PIN 並驗證明文儲存**
8. 改 `pinInput.fill('9876')`
9. `saveAndWait(page)`

**Phase D — 圖片欄位 gate（I5/I6 代表性斷言）**
10. 斷言：頁面存在 image 欄位 UI 元素（file input 或 preview placeholder）
11. **不實際上傳**（Blob 限制，此步驟僅驗證 UI 存在）

### 非同步等待點
- 每次 `saveAndWait` 等待 server action 200 + Save Bar 消失

### 斷言
- **UI 層**：
  - Phase B 後：所有文字欄位顯示新值、Save Bar 隱藏
  - Phase C 後：PIN input 顯示 `9876`
- **DB 層**：
  - `character.name === '修改後的名字'`
  - `character.description/slogan/personality` 為新值
  - `character.pin === '9876'`（明文）
  - `character.baselineData` 對應欄位一致（**確認 baseline/runtime 雙寫規則下 active:false 只寫 baseline**，見 `app/actions/character-update.ts:104-112` buildUpdateData）

### 反向驗證
- name 清空 → 嘗試儲存 → Save Bar 保持、顯示 name required 錯誤（`character-validator.ts:18-20`）
- PIN 填 `abcd` → Zod 錯誤（非數字）

### 已知陷阱
- **baseline/runtime 雙寫分支**：`character-update.ts:104-112` 的 `buildUpdateData` 在 `active:true` 時會同時寫 `baselineData.name` 與 `runtimeData.name`。此 case 用 inactive game 避開 runtime 寫入，但 spec comment 必須說明「未測試 active 分支」以免誤以為涵蓋全部。
- **I5/I6 圖片 gate 只驗 UI 存在**：實際上傳 Blob 在 E2E 排除，不要寫 `setInputFiles`。

---

## #4.3 背景故事分頁：blocks 排序 + relationships

### 進入點
- 角色：GM → `tabBackground.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + **2 角色**：`E2E 主角`（被編輯）與 `路人甲`（作為 relationships target）

### 操作步驟
**Phase A — 新增 3 個 background blocks**
1. 點擊「新增段落」× 3
2. 分別填入 `第一段` / `第二段` / `第三段`
3. `saveAndWait(page)`

**Phase B — 拖曳重排**
4. 使用 `dragTo()` 把第 3 段拖到第 1 段前方（dnd-kit）
5. 斷言：UI 順序變為 `第三段` → `第一段` → `第二段`
6. `saveAndWait(page)`

**Phase C — 新增 relationship**
7. 點擊「新增關係」
8. 在對象下拉選擇 `路人甲`
9. 填入關係描述 `宿敵`
10. `saveAndWait(page)`

### 非同步等待點
- dnd-kit 排序後的狀態更新（無額外網路請求）
- saveAndWait server action 200

### 斷言
- **DB 層**：
  - `character.background.blocks` 長度 === 3，順序 `[第三段, 第一段, 第二段]`
  - `character.background.relationships` 長度 === 1，target 指向 `路人甲` 的 id、描述為 `宿敵`
- **UI 層**：reload 後順序保持、relationship 下拉仍顯示 `路人甲`

### 反向驗證
- 刪除 relationship → saveAndWait → DB 長度為 0

### 已知陷阱
- **dnd-kit 需要 pointer event 而非 click**：Playwright 的 `dragTo()` 對 dnd-kit 要有額外的 `force: true` 或手動 `mouse.down()/move()/up()`。若 sensor 設定為 `activationConstraint: { distance: 5 }`，必須先 move 超過 5px 才會觸發。
- **relationships target 是角色 id 而非 name**：斷言 DB 時不要比字串 name，要比 `_id`。
- **blocks 的 id 不會因重排變動**：spec 應該在排序前記錄每個 block 的 client-side id，以區分「排序換位」與「刪除再新增」。

---

## #4.4 隱藏資訊分頁：secrets CRUD + AutoReveal（代表性）+ soft delete

### 進入點
- 角色：GM → `tabSecrets.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色（無 secrets）

### 操作步驟
**Phase A — 新增 secret（多段落）**
1. 點擊「新增隱藏資訊」
2. 填入 title=`深層秘密`
3. 新增 2 個 content paragraphs：`第一段內容` / `第二段內容`
4. `saveAndWait(page)`

**Phase B — AutoReveal 代表性：設定「首次與角色 X 對抗」條件**
5. 展開 AutoReveal condition editor
6. 選擇 condition type=`first_contest_with`
7. 選擇 target=任一已存在角色（需加 seed 一張輔助卡）
8. `saveAndWait(page)`

**Phase C — Soft delete + undo（代表性）**
9. 點擊 secret 的刪除按鈕
10. 斷言：UI 顯示「已標記刪除」+ undo 按鈕
11. **不 saveAndWait**，先點 undo → 斷言回復
12. 再次刪除 → saveAndWait
13. 斷言：DB 中 `deletedIds` 包含該 secret id（或 secret 實際從陣列移除）

### 非同步等待點
- saveAndWait server action 200

### 斷言
- **DB 層**：
  - Phase A：`character.secrets[0].title === '深層秘密'`、`content` 為 `['第一段內容', '第二段內容']`
  - Phase B：`character.secrets[0].autoRevealCondition.type === 'first_contest_with'`，target id 正確
  - Phase C：`character.secrets` 長度 === 0（或對應 secret 被標記刪除）
- **UI 層**：各 Phase 結束 reload 後狀態一致

### 反向驗證
- Phase A 後清空 title → 儲存 → 錯誤訊息（`character-validator.ts` 對 secrets 的 required 檢查）

### 已知陷阱
- **`AutoRevealConditionEditor` 是 Secrets/Tasks/Items 三處共用元件**：此 case 只覆蓋 Secrets 使用情境，Tasks/Items 的使用在 #4.5 用代表性斷言而非完整重測。
- **Soft delete 的 state 不是 DB undo**：是前端 local state，reload 頁面會消失。若 spec 在 undo 前做 `page.reload()`，會誤以為 bug。
- **Secrets 的 AutoReveal 條件實際觸發驗證拆至 Flow #10**：本 case 只驗證「條件可被儲存並讀回」，不驗證 runtime 行為。

---

## #4.5 任務分頁：general/hidden + 狀態機

### 進入點
- 角色：GM → `tabTasks.click()`

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色

### 操作步驟
**Phase A — 新增一般任務**
1. 點擊「新增任務」→ 選擇 type=`general`
2. 填入 title=`主線任務 1`、description=`打倒魔王`
3. 狀態預設 `pending`
4. `saveAndWait(page)`

**Phase B — 切換狀態（pending → in_progress → completed）**
5. 展開任務 → 狀態下拉改 `in_progress` → saveAndWait
6. 再改 `completed` → saveAndWait

**Phase C — 新增隱藏任務**
7. 點擊「新增任務」→ 選擇 type=`hidden`
8. 填入 title=`隱藏任務 1`
9. **不設 AutoReveal**（代表性：只驗證可建立）
10. `saveAndWait(page)`

### 斷言
- **DB 層**：
  - Phase A：`character.tasks[0]` 存在、title/description/type/status 正確
  - Phase B：每次 saveAndWait 後 status 更新
  - Phase C：`character.tasks[1].type === 'hidden'`
- **UI 層**：隱藏任務在 GM 側可見（GM 端無遮蔽）

### 反向驗證
- 狀態機試著從 `completed` 回 `pending`（若 UI 限制流轉方向）→ 斷言被阻擋或允許。**由實作決定方向**（需先讀 `tasks-edit-form.tsx` 確認）。

### 已知陷阱
- **hidden task 的 AutoReveal 條件拆至 Flow #10**：本 case 不驗證「條件觸發後任務出現在玩家端」。
- **任務狀態可能影響其他系統**（completed 觸發自動揭露？）→ 若有，必須在 comment 標註「未涵蓋」。

---

## #4.6 Dirty state + Sticky Save Bar + beforeunload

### 進入點
- 角色：GM → 編輯頁任一分頁

### 前置 seed
- 1 GMUser + 1 inactive Game + 1 角色

### 操作步驟
**Phase A — dirty=false 初始狀態**
1. 進入編輯頁
2. 斷言：Save Bar 隱藏

**Phase B — 任一欄位變動 → dirty=true**
3. name input 追加一個字元
4. 斷言：Save Bar 出現、儲存按鈕 enabled

**Phase C — 放棄變更**
5. 點 Discard → 確認 Dialog → 確認
6. 斷言：name 回到原值、Save Bar 隱藏

**Phase D — beforeunload 攔截**
7. 再次變更 name
8. 嘗試導航離開（`page.goto('/games')`）
9. 斷言：beforeunload 觸發（Playwright 的 `page.on('dialog')` 捕捉）→ 取消導航
10. 斷言：仍在編輯頁、變更仍在

**Phase E — 儲存後 dirty 歸零**
11. `saveAndWait(page)`
12. 斷言：Save Bar 隱藏、現在可以離開頁面

### 斷言
- **UI 層**：各 Phase 的 Save Bar 狀態
- **DB 層**：Phase C 後 name 未寫入；Phase E 後 name 已寫入

### 反向驗證
- 不做變更直接 reload → 不應觸發 beforeunload

### 已知陷阱
- **Playwright 的 beforeunload 捕捉方式**：Playwright 預設會自動 dismiss beforeunload，必須 `page.on('dialog', d => d.dismiss())` 明確訂閱才能斷言。
- **Discard Dialog 的 AlertDialog 是 Radix portal**：selector 可能在 body 根節點而非編輯頁容器內，用 `page.getByRole('alertdialog')` 抓取而非 scoped locator。
- **dirty state 由 `use-character-edit-state.ts` 管理**：此 hook 內部有 `hasUnsavedChanges` flag，spec 若想驗證 hook 狀態必須透過 UI（Save Bar 顯隱）而非直接探 hook。

---

## #4.7 刪除角色：isActive gate

### 進入點
- 角色：GM → 列表頁 or 編輯頁（依實作）

### 前置 seed
- **兩組獨立 seed**：
  - Seed A：1 GMUser + 1 **inactive** Game + 1 角色
  - Seed B：1 GMUser + 1 **active** Game + 1 角色

### 操作步驟
**Phase A — inactive 可以刪除**
1. `asGm()` → 進入 Seed A 的角色
2. 點擊「刪除角色」→ 確認 Dialog → 確認
3. 等待 redirect 回列表頁
4. 斷言：列表不含該角色
5. 斷言 DB：`Character.findById(id)` === null

**Phase B — active 時刪除按鈕隱藏**
6. `asGm()` → 進入 Seed B 的角色
7. 斷言：`deleteBtn` 不存在於 DOM（**不是 disabled**，而是完全不 render —— `delete-character-button.tsx` 的邏輯）
8. 嘗試直接呼叫 server action（繞過 UI）→ 應回錯誤 `GAME_ACTIVE`

### 斷言
- **UI 層**：Phase A 刪除成功、Phase B 按鈕不存在
- **DB 層**：Phase A 後角色不存在、Phase B 後角色仍存在

### 反向驗證
- 跨 GM 存取（`asGm({ gmUserId: 'other-gm' })`）→ 404（`characters.ts:325`）

### 已知陷阱
- **刪除是硬刪除還是軟刪除**：需先讀 `characters.ts` 的 `deleteCharacter` 實作確認。若為軟刪除，DB 斷言要改成 `deletedAt != null`。
- **active game 的判斷來源是 game 而非 character**：spec seed 時要設 `game.isActive=true`，不是 `character.isActive`（該欄位可能不存在）。

---

## 跨 Case 已知陷阱

### 陷阱 #1：baseline/runtime 雙寫分支未完整覆蓋
Flow #4 全程在 **inactive game** 下操作，`buildUpdateData` 只會寫 baseline。active 狀態下的雙寫行為由 Flow #5-#9 覆蓋（玩家 action → runtime overlay）。**禁止** 在 Flow #4 新增「active game + GM 編輯」的 case，這屬於 Flow #5-#9 的範疇。

### 陷阱 #2：PIN 明文儲存
與 Flow #2 相同。seed 與斷言時直接用字串比對，不要 hash。

### 陷阱 #3：`revalidatePath` 路徑差異
- 列表頁 revalidate：`/games/{gameId}`
- 若誤導航到 `/games` 會看不到 Flow #4 的寫入。

### 陷阱 #4：Zod 錯誤優先於手動檢查
`character-validator.ts` 的訊息會在 `characters.ts` 後段的 PIN 唯一性檢查**之前**出現。反向驗證斷言文案時以實際 server 回傳為準。

### 陷阱 #5：Field updater 是 single source of truth
所有 7 個分頁的欄位更新最終都走 `lib/character/field-updaters/*`。若有 case fail 在「儲存後讀回不一致」，第一時間看 field updater 而非 UI 層。

### 陷阱 #6：gmNotes 欄位已移除
Migration 移除了 `gmNotes`，**不要** 在任何 case 的 seed、填表、斷言中出現這個名稱。

### 陷阱 #7：default tab bug 對稱性
上一段 session 修好了玩家端 `character-card-view.tsx:103` 的 default tab bug（`'items'` → `'info'`）。GM 端 `character-edit-tabs.tsx` 的 default 應該是**基本設定**，#4.1a 已含此驗證，其他 case 不需重複。

### 陷阱 #8：Action trump 機制未覆蓋
`character-edit-tabs.tsx:119-130` 有「玩家 action 會強迫 GM 放棄編輯」的機制。**Flow #4 刻意不測** 這個，因需 WebSocket + player 端配合，拆至 Flow #5 姊妹 case。

---

## Fixture 需求

### 新增
- `seedFixture.characterInGame(gameId, overrides?)` — 建立最小角色卡
- `seedFixture.charactersForRelationships(gameId, count)` — 建立 N 張輔助卡
- `saveAndWait(page)` helper
- `loadCharFromDb(gameId, charId)` helper（直接讀 DB 繞過 UI revalidation）

### 複用
- `asGm({ gmUserId? })` fixture（Flow #1 已建立）
- `seedFixture.gameForGm(gmUserId, { isActive })` (Flow #3 已建立)

---

## 延後 / 排除 / 橫切追溯

| 項目 | 狀態 | 去處 |
|---|---|---|
| AbilityEditWizard（Items/Skills）| 橫切 | Flow #4b |
| Stats CRUD | 橫切 | Flow #4b |
| 圖片上傳實際行為 | 排除 | Blob 限制 |
| AutoReveal runtime 觸發 | 延後 | 未定 Flow #10 |
| Player action trump GM | 延後 | Flow #5 姊妹 case |
| Active game 下的 baseline/runtime 雙寫 | 橫切 | Flow #5-#9 |
| Delete 的 cascade 效應（tasks/items/skills）| 延後 | 需先確認實作是否 cascade |

---

## 實作順序建議

1. 先跑通 #4.1a（空 game → 建立 → 編輯頁），其他 case 都依賴此基本流程
2. #4.1b 只需在 #4.1a 基礎上加一張 seed 角色
3. #4.2–#4.5 可並行，彼此獨立
4. #4.6 需先確定 `use-character-edit-state.ts` 的 API，再寫 dirty 斷言
5. #4.7 最後跑（硬刪除後的狀態重建成本高）
