# E2E Flow #10 — 自動揭露（Auto-Reveal）

> **上游索引**：本檔案為 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 中 Flow #10 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/auto-reveal.spec.ts`
> **關聯 flow**：
> - [e2e_flow_4_gm_character_crud.md](./e2e_flow_4_gm_character_crud.md) — Flow #4 驗證 auto-reveal 條件「可被儲存並讀回」，不驗 runtime 行為
> - [e2e_flow_7_item_operations.md](./e2e_flow_7_item_operations.md) — showcase + transfer 觸發 auto-reveal 的上游
> - [e2e_flow_6b_contest_item_transfer.md](./e2e_flow_6b_contest_item_transfer.md) — item_steal 轉移後觸發 auto-reveal 的上游
> - [e2e_flow_9_preset_event_runtime.md](./e2e_flow_9_preset_event_runtime.md) — reveal_secret/reveal_task 使用 `revealType: 'manual'`，本 flow 使用 `revealType: 'auto'`

---

## ⚠ 基礎設施依賴（Blocker）

1. **WebSocket 事件擷取**
   - 繼承 Flow #5 的 `wsCaptureHelper`：需攔截 `secret.revealed`、`task.revealed`、`item.showcased` 事件
   - Player context 需綁定 `private-character-{characterId}` channel
2. **DB 直接查詢 helper**
   - `Character/CharacterRuntime.findOne()` — 驗證 `secretInfo.secrets[].isRevealed`、`tasks[].isRevealed`、`viewedItems[]`
3. **雙 player context**
   - #10.1 和 #10.2 需要兩個 player page（展示方 + 接收方）
   - #10.3 只需 GM + Player
4. **GM 角色編輯**
   - #10.5 需存取角色卡的 secret/task 編輯介面中的 auto-reveal 條件編輯器

---

## 設計背景

Flow #10 驗證**自動揭露系統的 runtime 行為**——當角色滿足特定條件時，隱藏資訊（secrets）或隱藏目標（tasks）自動揭露。

### 三種條件類型

| 條件 | 監聽 | 適用對象 | 觸發場景 |
|---|---|---|---|
| `items_viewed` | `character.viewedItems[]` | secrets + tasks | 展示道具給他人、自行檢視道具 |
| `items_acquired` | `character.items[]` | secrets + tasks | 道具轉移、item_steal、GM 新增 |
| `secrets_revealed` | `secretInfo.secrets[].isRevealed` | **僅 tasks** | GM 手動揭露 secret → 鏈式觸發 task |

### 隱藏資訊 vs 隱藏目標的差異

| 面向 | 隱藏資訊（secrets） | 隱藏目標（tasks） |
|---|---|---|
| 可用條件類型 | `items_viewed`、`items_acquired` | `items_viewed`、`items_acquired`、`secrets_revealed` |
| 前置檢查 | `isRevealed === false` | `isHidden === true && isRevealed === false` |
| 鏈式觸發 | 被揭露後可觸發 tasks 的 `secrets_revealed` 條件 | 不會再觸發其他揭露（限制 2 層） |

### 評估順序（有依賴）

1. 先評估 **secrets** 的條件 → 揭露符合的 secrets
2. 將本輪新揭露的 secret IDs 加入 `revealedSecretIds` 集合
3. 再評估 **tasks** 的條件（含 `secrets_revealed`）→ 揭露符合的 tasks
4. 批量 DB 更新 + 逐一 emit WebSocket 事件

這個順序保證 tasks 的 `secrets_revealed` 條件能看到**同一輪剛揭露的** secret。

### matchLogic（AND / OR）

- **AND**（預設）：所有指定 item/secret 都必須滿足
- **OR**：任一指定 item/secret 滿足即觸發

### 與手動揭露的差異

| 面向 | 自動揭露 | 手動揭露（GM / 預設事件） |
|---|---|---|
| `revealType` | `'auto'` | `'manual'` |
| `triggerReason` | 依條件類型（如 `'滿足道具檢視條件'`） | `'預設事件觸發'` 或無 |
| 觸發方式 | 系統自動評估 | GM 主動操作 |

**刻意排除**：
- self-view（recordItemView 自行檢視）觸發 items_viewed — 與 showcase 共用同一評估路徑
- skill-use / contest-respond / contest-select-item 觸發 items_acquired — 上游 Flow #5/#6/#6b 已驗效果執行
- GM 手動新增道具觸發 items_acquired — character-update-side-effects 路徑
- 已揭露 secret 的冪等性（重複觸發不重複揭露）— unit test 覆蓋
- 條件引用已刪除 item/secret 的清理 — condition-cleaner.ts，unit test 覆蓋
- 循環依賴防護（限制 2 層鏈）— 架構限制（secrets → tasks 單向），無法在 UI 構成循環

---

## 範圍定義

### 測
- `items_viewed` 條件：展示道具 → secret 自動揭露 + `revealType:'auto'`（#10.1）
- `items_acquired` 條件：道具轉移 → task 自動揭露（#10.2）
- `secrets_revealed` 鏈式揭露：GM 手動揭露 secret → task 自動揭露（#10.3）
- AND/OR matchLogic：AND 測 secret（需全部 item）、OR 測 task（任一 item 即觸發）（#10.4）
- 條件編輯器 UI：GM 設定 auto-reveal 條件 → 儲存 → 驗證持久化（#10.5）

### 不測（延後/排除/橫切）
| 項目 | 狀態 | 去處 |
|---|---|---|
| self-view 觸發 items_viewed | 排除 | 共用 `executeAutoReveal`，差異僅 sourceCharacterId |
| skill-use / contest 觸發 items_acquired | 排除 | 上游 Flow #5/#6/#6b 已驗效果執行 |
| GM 新增道具觸發 items_acquired | 排除 | character-update-side-effects 路徑 |
| 冪等性（重複觸發不重複揭露） | 排除 | unit test（evaluator 內 `isRevealed` 跳過邏輯） |
| condition-cleaner 清理無效引用 | 排除 | unit test |
| 循環依賴防護 | 排除 | 架構限制，無法在 UI 構成 |

---

## Test Case 獨立性設計

| Case | 獨立 seed | 雙 context | Game 狀態 |
|---|---|---|---|
| #10.1 items_viewed → secret 揭露 | 2 角色（A 有道具 + B 有 secret with items_viewed 條件） | ✅（Player A + Player B） | active |
| #10.2 items_acquired → task 揭露 | 2 角色（A 有道具 + B 有 hidden task with items_acquired 條件） | ✅（Player A + Player B） | active |
| #10.3 secrets_revealed 鏈式揭露 | 1 GM + 1 角色（含 secret + hidden task with secrets_revealed 條件） | ✅（GM + Player） | active |
| #10.4 AND/OR matchLogic | 1 角色（含 2 道具 + 1 secret with AND + 1 hidden task with OR） | ✅（Player A + Player B） | active |
| #10.5 條件編輯器 UI | 1 GM + 1 角色（含道具 + secret） | ❌（僅 GM） | 不限 |

---

## 共用規格

### 關鍵 Selectors

```ts
// Player 端 — 隱藏資訊/目標揭露通知
const revealNotification = (page: Page, title: string) =>
  page.locator('[data-notification]').filter({ hasText: title });

// GM 端 — auto-reveal 條件編輯器
const conditionTypeSelect = (page: Page) =>
  page.getByRole('combobox').filter({ hasText: /無條件|道具檢視|道具取得|資訊揭露/ });
const matchLogicToggle = (page: Page, logic: 'and' | 'or') =>
  page.getByRole('button', { name: logic === 'and' ? 'AND' : 'OR' });
const itemSelector = (page: Page) =>
  page.getByRole('combobox').filter({ hasText: /選擇道具/ });
```

### Helpers

```ts
// 角色 A 展示道具給角色 B
async function showcaseItem(
  pageA: Page, itemId: string, targetCharacterName: string
) {
  // 打開道具 detail → 點擊展示 → 選擇目標角色 → 確認
  await pageA.getByTestId(`item-${itemId}`).click();
  await pageA.getByRole('button', { name: /展示/ }).click();
  await pageA.getByText(targetCharacterName).click();
  await pageA.getByRole('button', { name: /確認/ }).click();
}

// 角色 A 轉移道具給角色 B
async function transferItem(
  pageA: Page, itemId: string, targetCharacterName: string
) {
  await pageA.getByTestId(`item-${itemId}`).click();
  await pageA.getByRole('button', { name: /轉移/ }).click();
  await pageA.getByText(targetCharacterName).click();
  await pageA.getByRole('button', { name: /確認/ }).click();
}
```

---

## #10.1 items_viewed 條件 — 展示道具觸發 secret 揭露

### 進入點
- Player A context：`/c/{A_id}`（展示方）
- Player B context：`/c/{B_id}`（接收方）

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  items: [
    { id: 'item-map', name: '藏寶圖', type: 'tool', quantity: 1, isTransferable: true },
  ]
  ```
- 角色 B：
  ```
  secretInfo: {
    secrets: [
      {
        id: 'secret-treasure',
        title: '寶藏位置',
        content: '寶藏在北方森林',
        isRevealed: false,
        autoRevealCondition: {
          type: 'items_viewed',
          itemIds: ['item-map'],        // ← 看到藏寶圖就揭露
          matchLogic: 'and',
        },
      },
    ]
  }
  viewedItems: []   // ← 尚未檢視任何道具
  ```

### Phase A — 角色 A 展示道具給角色 B

1. `asPlayer(pageA, { characterId: A, gameId })`
2. `asPlayer(pageB, { characterId: B, gameId })`
3. **斷言 — B 的 secret 尚未揭露**：
   - Player B 的 secrets tab 中不可見「寶藏位置」（或標示為隱藏）
4. pageA: `showcaseItem(pageA, 'item-map', B_name)`

### Phase B — 自動揭露觸發驗證

5. **WebSocket — secret.revealed**：
   ```ts
   const revealEvent = await waitForWsEvent(wsCaptureB, 'secret.revealed');
   expect(revealEvent.payload.secretId).toBe('secret-treasure');
   expect(revealEvent.payload.secretTitle).toBe('寶藏位置');
   expect(revealEvent.payload.revealType).toBe('auto');           // ← 自動揭露
   expect(revealEvent.payload.triggerReason).toBe('滿足道具檢視條件');
   ```
6. **Player B UI**：「寶藏位置」在 secrets tab 中可見

### Phase C — DB 驗證

7. **B 的 viewedItems 已記錄**：
   ```ts
   const charB = await getCharacterData(B_id);
   const viewed = charB.viewedItems.find(v => v.itemId === 'item-map');
   expect(viewed).toBeTruthy();
   expect(viewed.sourceCharacterId).toBe(A_baselineId);
   ```
8. **B 的 secret 已揭露**：
   ```ts
   const secret = charB.secretInfo.secrets.find(s => s.id === 'secret-treasure');
   expect(secret.isRevealed).toBe(true);
   expect(secret.revealedAt).toBeTruthy();
   ```

---

## #10.2 items_acquired 條件 — 道具轉移觸發 task 揭露

### 進入點
- Player A context：`/c/{A_id}`（轉移方）
- Player B context：`/c/{B_id}`（接收方）

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  items: [
    { id: 'item-key', name: '鑰匙', type: 'tool', quantity: 1, isTransferable: true },
  ]
  ```
- 角色 B：
  ```
  items: []
  tasks: [
    {
      id: 'task-unlock',
      title: '開啟密室',
      description: '找到鑰匙並開啟密室',
      isHidden: true,              // ← 隱藏目標
      isRevealed: false,
      autoRevealCondition: {
        type: 'items_acquired',
        itemIds: ['item-key'],      // ← 取得鑰匙就揭露
        matchLogic: 'and',
      },
    },
  ]
  ```

### Phase A — 角色 A 轉移道具給角色 B

1. `asPlayer(pageA, { characterId: A, gameId })`
2. `asPlayer(pageB, { characterId: B, gameId })`
3. **斷言 — B 的 hidden task 不可見**
4. pageA: `transferItem(pageA, 'item-key', B_name)`

### Phase B — 自動揭露觸發驗證

5. **WebSocket — task.revealed**：
   ```ts
   const revealEvent = await waitForWsEvent(wsCaptureB, 'task.revealed');
   expect(revealEvent.payload.taskId).toBe('task-unlock');
   expect(revealEvent.payload.taskTitle).toBe('開啟密室');
   expect(revealEvent.payload.revealType).toBe('auto');
   expect(revealEvent.payload.triggerReason).toBe('滿足道具取得條件');
   ```
6. **Player B UI**：「開啟密室」在 tasks tab 中可見

### Phase C — DB 驗證

7. **B 的 items 已取得鑰匙**：
   ```ts
   const charB = await getCharacterData(B_id);
   const key = charB.items.find(i => i.id === 'item-key');
   expect(key).toBeTruthy();
   ```
8. **B 的 task 已揭露**：
   ```ts
   const task = charB.tasks.find(t => t.id === 'task-unlock');
   expect(task.isRevealed).toBe(true);
   expect(task.isHidden).toBe(true);     // ← isHidden 不變，只是 isRevealed 變 true
   expect(task.revealedAt).toBeTruthy();
   ```

---

## #10.3 secrets_revealed 鏈式揭露（secret → task）

### 進入點
- GM context：`/games/{gameId}`
- Player context：`/c/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  secretInfo: {
    secrets: [
      {
        id: 'secret-identity',
        title: '真實身份',
        content: '你是失蹤的王子',
        isRevealed: false,
        // ← 此 secret 本身無 autoRevealCondition（由 GM 手動揭露）
      },
    ]
  }
  tasks: [
    {
      id: 'task-reclaim',
      title: '奪回王位',
      description: '知道身份後的使命',
      isHidden: true,
      isRevealed: false,
      autoRevealCondition: {
        type: 'secrets_revealed',
        secretIds: ['secret-identity'],  // ← 當「真實身份」被揭露時觸發
        matchLogic: 'and',
      },
    },
  ]
  ```

### Phase A — GM 手動揭露 secret

1. `asGm(pageGM, { gameId })`
2. `asPlayer(pagePlayer, { characterId: A, gameId })`
3. **斷言 — task 尚未揭露**
4. pageGM: 進入角色 A 的編輯頁 → secrets tab → 將「真實身份」標記為已揭露 → 儲存

### Phase B — 鏈式揭露觸發驗證

5. **WebSocket — secret.revealed**（手動揭露）：
   ```ts
   const secretEvent = await waitForWsEvent(wsCapturePlayer, 'secret.revealed');
   expect(secretEvent.payload.secretId).toBe('secret-identity');
   expect(secretEvent.payload.revealType).toBe('manual');  // ← GM 手動揭露
   ```
6. **WebSocket — task.revealed**（鏈式自動揭露）：
   ```ts
   const taskEvent = await waitForWsEvent(wsCapturePlayer, 'task.revealed');
   expect(taskEvent.payload.taskId).toBe('task-reclaim');
   expect(taskEvent.payload.taskTitle).toBe('奪回王位');
   expect(taskEvent.payload.revealType).toBe('auto');          // ← 自動揭露
   expect(taskEvent.payload.triggerReason).toBe('滿足隱藏資訊揭露條件');
   ```

### Phase C — DB 驗證

7. **secret 已揭露（手動）**：
   ```ts
   const charA = await getCharacterData(A_id);
   expect(charA.secretInfo.secrets[0].isRevealed).toBe(true);
   ```
8. **task 已揭露（鏈式自動）**：
   ```ts
   const task = charA.tasks.find(t => t.id === 'task-reclaim');
   expect(task.isRevealed).toBe(true);
   expect(task.revealedAt).toBeTruthy();
   ```

### Phase D — 鏈式時序驗證

9. **task 的 revealedAt >= secret 的 revealedAt**：
   > 評估順序保證：先揭露 secrets → 更新 revealedSecretIds → 再評估 tasks。
   > 兩者在同一 `executeAutoReveal` 呼叫中完成，時間戳可能相同但 task 不會早於 secret。

---

## #10.4 AND/OR matchLogic（secret 用 AND、task 用 OR）

### 進入點
- Player A context：`/c/{A_id}`（展示方）
- Player B context：`/c/{B_id}`（接收方）

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  items: [
    { id: 'item-gem', name: '寶石', type: 'tool', quantity: 1, isTransferable: true },
    { id: 'item-scroll', name: '卷軸', type: 'tool', quantity: 1, isTransferable: true },
  ]
  ```
- 角色 B：
  ```
  secretInfo: {
    secrets: [
      {
        id: 'secret-and',
        title: 'AND 秘密',
        content: '需要同時看到寶石和卷軸才知道',
        isRevealed: false,
        autoRevealCondition: {
          type: 'items_viewed',
          itemIds: ['item-gem', 'item-scroll'],  // ← 兩個都要看到
          matchLogic: 'and',                     // ← AND 邏輯
        },
      },
    ]
  }
  tasks: [
    {
      id: 'task-or',
      title: 'OR 任務',
      description: '看到任一道具就觸發',
      isHidden: true,
      isRevealed: false,
      autoRevealCondition: {
        type: 'items_viewed',
        itemIds: ['item-gem', 'item-scroll'],  // ← 任一即可
        matchLogic: 'or',                      // ← OR 邏輯
      },
    },
  ]
  viewedItems: []
  ```

### Phase A — 展示第一個道具（寶石）

1. `asPlayer(pageA, { characterId: A, gameId })`
2. `asPlayer(pageB, { characterId: B, gameId })`
3. pageA: `showcaseItem(pageA, 'item-gem', B_name)`

### Phase B — OR 條件觸發、AND 條件未觸發

4. **WebSocket — task.revealed**（OR 條件滿足）：
   ```ts
   const taskEvent = await waitForWsEvent(wsCaptureB, 'task.revealed');
   expect(taskEvent.payload.taskId).toBe('task-or');
   expect(taskEvent.payload.revealType).toBe('auto');
   ```
5. **斷言 — secret 尚未揭露**（AND 條件未滿足）：
   ```ts
   const charB = await getCharacterData(B_id);
   const secret = charB.secretInfo.secrets.find(s => s.id === 'secret-and');
   expect(secret.isRevealed).toBe(false);  // ← 只看到寶石，還缺卷軸
   ```

### Phase C — 展示第二個道具（卷軸）

6. pageA: `showcaseItem(pageA, 'item-scroll', B_name)`

### Phase D — AND 條件現在也觸發

7. **WebSocket — secret.revealed**（AND 條件滿足）：
   ```ts
   const secretEvent = await waitForWsEvent(wsCaptureB, 'secret.revealed');
   expect(secretEvent.payload.secretId).toBe('secret-and');
   expect(secretEvent.payload.revealType).toBe('auto');
   ```
8. **DB 驗證 — 兩者都已揭露**：
   ```ts
   const charB = await getCharacterData(B_id);
   expect(charB.secretInfo.secrets[0].isRevealed).toBe(true);   // AND secret
   expect(charB.tasks[0].isRevealed).toBe(true);                 // OR task
   ```

### Phase E — OR task 不重複觸發

9. **第二次展示不應再次觸發 task.revealed**：
   > OR task 已在 Phase B 揭露。第二次展示時 `evaluateTaskConditions` 的 `isRevealed` 檢查（line 178）會跳過。
   > 驗證方式：在 Phase D 中只收到 `secret.revealed`，不收到第二個 `task.revealed`。

---

## #10.5 條件編輯器 UI

### 進入點
- GM context only：`/games/{gameId}` 或角色編輯頁

### 前置 seed
- 1 GMUser + 1 Game（active 或 inactive 皆可）
- 角色 A：
  ```
  items: [
    { id: 'item-ring', name: '魔戒', type: 'tool', quantity: 1 },
  ]
  secretInfo: {
    secrets: [
      { id: 'secret-power', title: '魔戒之力', content: '...', isRevealed: false },
    ]
  }
  tasks: [
    { id: 'task-destroy', title: '摧毀魔戒', description: '...', isHidden: true, isRevealed: false },
  ]
  ```

### Phase A — 在 secret 上設定 items_viewed 條件

1. `asGm(pageGM, { gameId })`
2. pageGM: 進入角色 A 的編輯頁 → secrets tab → 點擊「魔戒之力」的編輯
3. 找到 auto-reveal 條件編輯器
4. **選擇條件類型**：conditionTypeSelect → 選 `'items_viewed'`（道具檢視）
5. **斷言 — item 選擇器出現**：itemSelector 可見
6. 選擇 `'魔戒'`
7. **斷言 — AND/OR toggle 出現**（當有多個 item 時才出現，但即使只有 1 個也應顯示預設 AND）
8. 儲存

### Phase B — 驗證持久化

9. **重新載入頁面** → 進入同一 secret 的編輯
10. **斷言 — 條件已儲存**：
    - conditionTypeSelect 顯示 `'items_viewed'`
    - item 選擇區顯示 `'魔戒'`

### Phase C — 在 hidden task 上設定 secrets_revealed 條件

11. pageGM: 切換到 tasks tab → 點擊「摧毀魔戒」的編輯
12. 找到 auto-reveal 條件編輯器
13. **斷言 — secrets_revealed 選項可用**（`allowSecretsCondition: true`）
14. 選擇條件類型 → `'secrets_revealed'`（資訊揭露）
15. 選擇 secret `'魔戒之力'`
16. 儲存

### Phase D — 驗證持久化 + 條件差異

17. **DB 驗證**：
    ```ts
    const charA = await getCharacterData(A_id);
    // secret 的條件
    const secret = charA.secretInfo.secrets[0];
    expect(secret.autoRevealCondition.type).toBe('items_viewed');
    expect(secret.autoRevealCondition.itemIds).toEqual(['item-ring']);

    // task 的條件
    const task = charA.tasks[0];
    expect(task.autoRevealCondition.type).toBe('secrets_revealed');
    expect(task.autoRevealCondition.secretIds).toEqual(['secret-power']);
    ```

### Phase E — 條件類型切換為「無條件」

18. pageGM: 回到 secret 的編輯 → 條件類型切換為 `'none'`（無條件）
19. 儲存
20. **DB 驗證**：secret 的 `autoRevealCondition` 為 `undefined` 或 `{ type: 'none' }`

---

## 跨 Case 陷阱（Cross-case Pitfalls）

1. **evaluateSecretConditions 對 `secrets_revealed` 傳入空集合**：`auto-reveal-evaluator.ts:139` 明確傳 `new Set<string>()`，使 secret 上設定的 `secrets_revealed` 條件永遠不滿足。這是架構限制（防止 secret → secret 循環）。#10.5 的 UI 端也應限制——只有 tasks 的編輯器會顯示 `secrets_revealed` 選項（`allowSecretsCondition` flag）

2. **tasks 的雙重 gate**：`isHidden === true && isRevealed === false`（line 178）。seed 時 task 必須設 `isHidden: true`，否則即使條件滿足也不會觸發。非隱藏任務沒有自動揭露的語意

3. **viewedItems 的去重邏輯**：showcase 按 `itemId + sourceCharacterId` 去重（item-showcase.ts:99-102），self-view 按 `itemId` 去重（item-showcase.ts:231-233）。但 `executeAutoReveal` **每次都會重新評估**（即使 viewedItems 沒變化），因為 GM 可能在中途 reset 揭露狀態

4. **鏈式揭露只走一層**：`executeChainRevealForSecrets` 呼叫 `executeAutoReveal({ type: 'secret_revealed' })`。在此呼叫中，secrets 的條件不會再次被評估（因為 `evaluateSecretConditions` 對 `secrets_revealed` 傳空集合）。所以 secret A → task B 可行，但 secret A → secret B → task C 不可行

5. **#10.4 AND/OR 的展示順序很重要**：先展示寶石（Phase A）→ OR task 立即觸發、AND secret 不觸發。再展示卷軸（Phase C）→ AND secret 觸發。如果順序反過來，同樣的邏輯但要調整斷言。seed 時 itemIds 陣列的順序不影響（`every`/`some` 不依賴順序）

6. **revealType 是區分手動 vs 自動的唯一欄位**：`secret.revealed` 和 `task.revealed` 的 payload 中，`revealType: 'auto'` vs `'manual'` 是唯一差異。#10.1–#10.3 必須斷言 `revealType === 'auto'`，確認不是走到手動揭露路徑

7. **triggerReason 是硬編碼字串**：`buildTriggerReason` 回傳固定中文字串（`auto-reveal-evaluator.ts:200-209`）。斷言時用精確比對（`toBe`），不要用 regex，以免 regression 靜默改變文案而測試仍通過

8. **#10.3 的 GM 操作路徑**：GM 手動揭露 secret 的實際操作是在角色編輯頁修改 `isRevealed` 欄位 → 儲存 → `character-update-side-effects.ts:135-139` 偵測 `hasManualSecretReveal` → 呼叫 `executeChainRevealForSecrets`。seed 時不能預先設定 `isRevealed: true`（那就不會觸發 side-effects），必須讓 GM 在 E2E 中實際操作

9. **Baseline vs Runtime 自動偵測**：`executeAutoReveal` 使用 `getCharacterData()` 自動偵測 Baseline/Runtime 模式（Phase 11）。所有 case 都是 `isActive: true`，所以操作的是 CharacterRuntime。seed 時確保 `startGame` 已執行
