# E2E Flow #9 — 預設事件 runtime 執行

> **上游索引**：本檔案為 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 中 Flow #9 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/preset-event-runtime.spec.ts`
> **關聯 flow**：
> - [E2E_FLOW_3_GM_EDIT.md](./E2E_FLOW_3_GM_EDIT.md) — GM 編輯流程（#3.5 只驗 runtime console 上預設事件 tab hint 存在）
> - [E2E_FLOW_8_GM_BROADCAST.md](./E2E_FLOW_8_GM_BROADCAST.md) — 手動廣播（`pushEvent` 寫 PendingEvent；預設事件 `executeBroadcast` **不寫**）
> - [E2E_FLOW_5_PLAYER_USE_SKILL.md](./E2E_FLOW_5_PLAYER_USE_SKILL.md) — stat_change 共用 `computeStatChange()`、TemporaryEffect 共用 `createTemporaryEffectRecord()`
> - [E2E_FLOW_4_GM_CHARACTER_CRUD.md](./E2E_FLOW_4_GM_CHARACTER_CRUD.md) — reveal_secret / reveal_task 的 CRUD 基礎

---

## ⚠ 基礎設施依賴（Blocker）

1. **WebSocket 事件擷取**
   - 繼承 Flow #5 的 `wsCaptureHelper`：需攔截 `game.broadcast`、`role.message`、`role.updated`、`secret.revealed`、`task.revealed` 事件
   - Player context 需同時綁定 `private-game-{gameId}` 和 `private-character-{characterId}` 兩個 channel
2. **DB 直接查詢 helper**
   - `GameRuntime.findOne({ gameId })` — 驗證 presetEvents 的 executionCount、executedAt、runtimeOnly
   - `CharacterRuntime.findOne({ _id })` — 驗證 stats 數值變更、secrets/tasks 的 isRevealed 狀態
   - `Log.find({ gameId, action })` — 驗證各 action type 的 Log 記錄
   - `PendingEvent.find({ targetGameId })` — 驗證預設事件 broadcast **不寫** PendingEvent（反向斷言）
3. **Game activation 前置**
   - 所有 case 需要 `isActive: true` 的 game（即已經過 `startGame` 流程）
   - seed 需確保 Baseline Game 有預設事件 → startGame 複製到 GameRuntime
4. **Runtime console 存取**
   - GM page 需導航到 runtime console 並找到預設事件快速面板（`preset-event-quick-panel.tsx`）

---

## 設計背景

Flow #9 驗證**預設事件在 runtime 階段的完整生命週期**——從 Baseline 複製、Runtime CRUD、到 GM 手動觸發執行。

預設事件系統有兩層獨立性：

**CRUD 層**：
- **Baseline**（`Game.presetEvents`）：遊戲準備階段定義，`isActive=false` 時操作
- **Runtime**（`GameRuntime.presetEvents`）：遊戲啟動時從 Baseline 複製，加入 `executionCount`、`executedAt`、`runtimeOnly` 等執行狀態欄位
- Runtime 新增的事件標記 `runtimeOnly: true`，不回寫 Baseline

**執行層**：
- 4 種 action type：`broadcast`、`stat_change`、`reveal_secret`、`reveal_task`
- **best-effort 執行模型**：單一 action 失敗/skip 不阻擋後續 action
- 目標解析：`resolveTargets()` 將 `'all'` 展開為所有角色 baseline ID，或過濾不存在的指定 ID
- 執行後遞增 `executionCount`、更新 `executedAt`

**與 Flow #8 手動廣播的關鍵差異**：
- 手動廣播（`pushEvent`）：寫 PendingEvent（離線補償）
- 預設事件廣播（`executeBroadcast`）：**不寫** PendingEvent（`execute-preset-event.ts:154` 註解：避免重複）

**刻意排除**：
- Baseline CRUD 完整 UI 路徑 — Flow #3 已驗 UI hint，server action 較 Runtime 版簡單且對稱
- stat_change + duration（TemporaryEffect 計時器）— 時間依賴，歸 Flow #12
- Action editor UI 逐欄位驗證 — UI 表單驗證屬 unit test
- MultiTargetSelector 全選自動升級 'all' — UI 邏輯，unit test
- showName 對 player 端通知的影響 — 需進一步確認語意
- `syncValue` 在 stat_change 中的行為 — 需進一步理解語意

---

## 範圍定義

### 測
- Baseline → Runtime 複製 + 執行後 executionCount 遞增 + executedAt 更新（#9.1）
- Runtime CRUD：新增 runtimeOnly 事件 → 編輯 → 刪除 → 不回寫 Baseline（#9.2）
- 執行 broadcast 動作：'all' 走 `game.broadcast` + 指定角色走 `role.message` + **不寫 PendingEvent**（#9.3）
- 執行 stat_change 動作：角色數值更新 + `role.updated` 事件 + Log old/new value（#9.4）
- 執行 reveal_secret + reveal_task 動作：揭露狀態更新 + 對應 WS 事件（#9.5）
- 部分失敗/skip：混合結果 toast + executionCount 仍遞增（#9.6）

### 不測（延後/排除/橫切）
| 項目 | 狀態 | 去處 |
|---|---|---|
| Baseline CRUD 完整 UI 路徑 | 排除 | Flow #3 已驗 hint；server action 對稱 |
| stat_change + duration（TemporaryEffect） | 延後 | Flow #12（時間依賴） |
| Action editor UI 逐欄位驗證 | 排除 | unit test |
| MultiTargetSelector 全選 → 'all' | 排除 | unit test |
| showName 對 player 通知的影響 | 延後 | 需確認語意 |
| `syncValue` 行為 | 延後 | 需確認語意 |
| 預設事件刪除後再執行的防呆 | 排除 | server action 回 "找不到此預設事件" |
| auto-reveal 在執行後觸發 | 橫切 | Flow #10 |

---

## Test Case 獨立性設計

| Case | 獨立 seed | 雙 context | Game 狀態 |
|---|---|---|---|
| #9.1 Baseline → Runtime + 執行狀態 | 1 GM + 1 game（含 1 preset event with broadcast action）+ 1 角色 | ✅（GM + Player） | active（需 startGame） |
| #9.2 Runtime CRUD | 1 GM + 1 game（Baseline 無 preset event）+ 1 角色 | ❌（僅 GM） | active |
| #9.3 執行 broadcast | 1 GM + 1 game + 2 角色 + 1 event（含 2 broadcast actions：all + specific） | ✅（GM + Player） | active |
| #9.4 執行 stat_change | 1 GM + 1 game + 1 角色（含 stat）+ 1 event（stat_change action） | ✅（GM + Player） | active |
| #9.5 執行 reveal_secret + reveal_task | 1 GM + 1 game + 1 角色（含 hidden secret + hidden task）+ 1 event（2 actions） | ✅（GM + Player） | active |
| #9.6 部分失敗 + skip | 1 GM + 1 game + 1 角色 + 1 event（3 actions：1 valid + 1 已揭露 + 1 不存在角色） | ❌（僅 GM） | active |

---

## 共用規格

### 關鍵 Selectors

```ts
// Runtime console 預設事件快速面板
const quickPanel = (page: Page) =>
  page.locator('[class*="preset-event"]').filter({ hasText: '預設事件' })
    .or(page.getByText('預設事件').locator('..').locator('..'));
const eventSelect = (page: Page) =>
  quickPanel(page).getByRole('combobox');
const executeButton = (page: Page) =>
  quickPanel(page).getByRole('button', { name: /執行/ });
const confirmExecuteButton = (page: Page) =>
  page.getByRole('dialog').getByRole('button', { name: /確認|執行/ });

// 預設事件編輯 UI（Runtime tab）
const presetEventsTab = (page: Page) =>
  page.getByRole('tab', { name: /預設事件/ });
const addEventButton = (page: Page) =>
  page.getByRole('button', { name: /新增預設事件|新增/ });
const eventCard = (page: Page, eventName: string) =>
  page.locator('[class*="card"]').filter({ hasText: eventName });
const runtimeOnlyBadge = (page: Page, eventName: string) =>
  eventCard(page, eventName).getByText('僅本場次');
const executionCountBadge = (page: Page, eventName: string) =>
  eventCard(page, eventName).getByText(/已執行/);
```

### Helpers

```ts
// 在 quick panel 選擇並執行預設事件
async function executePresetEvent(page: Page, eventName: string) {
  await eventSelect(page).click();
  await page.getByRole('option', { name: eventName }).click();
  await executeButton(page).click();
  await confirmExecuteButton(page).click();
}

// 等待執行結果 toast
async function waitForExecutionToast(page: Page, timeoutMs = 5000) {
  await page.getByText(/已執行|成功|跳過|失敗/).waitFor({ state: 'visible', timeout: timeoutMs });
}
```

---

## #9.1 Baseline → Runtime 複製 + 執行狀態追蹤

### 進入點
- GM context：`/games/{gameId}`（runtime console）
- Player context：`/c/{characterId}`

### 前置 seed
- 1 GMUser + 1 Game（`isActive: false`）
- Game 的 Baseline presetEvents 含：
  ```
  [{
    id: 'pe-welcome',
    name: '歡迎廣播',
    description: '遊戲開始時的歡迎訊息',
    showName: true,
    actions: [{
      id: 'act-welcome-broadcast',
      type: 'broadcast',
      broadcastTargets: 'all',
      broadcastTitle: '遊戲開始',
      broadcastMessage: '歡迎來到冒險世界',
    }],
  }]
  ```
- 角色 A：基本角色

### Phase A — Game Start 觸發複製

1. 透過 seed 或 server action 呼叫 `startGame(gameId)` → game 變為 `isActive: true`
2. **DB 驗證 — GameRuntime 已建立**：
   ```ts
   const runtime = await GameRuntime.findOne({ gameId });
   expect(runtime).toBeTruthy();
   expect(runtime.presetEvents).toHaveLength(1);
   ```
3. **驗證複製正確性**：
   ```ts
   const runtimeEvent = runtime.presetEvents[0];
   expect(runtimeEvent.id).toBe('pe-welcome');
   expect(runtimeEvent.name).toBe('歡迎廣播');
   expect(runtimeEvent.executionCount).toBe(0);       // ← 初始化為 0
   expect(runtimeEvent.executedAt).toBeUndefined();    // ← 尚未執行
   expect(runtimeEvent.runtimeOnly).toBeFalsy();       // ← 非 runtime-only
   expect(runtimeEvent.actions).toHaveLength(1);
   ```

### Phase B — GM 執行預設事件

4. `asGm(pageGM, { gameId })`
5. `asPlayer(pagePlayer, { characterId: A, gameId })`
6. pageGM: 在 runtime console 找到預設事件快速面板
7. pageGM: `executePresetEvent(pageGM, '歡迎廣播')`

### Phase C — 執行結果驗證

8. **GM toast**：等待 `'「歡迎廣播」已執行'` 或包含 `'成功'` 的 toast
9. **Player WebSocket**：
   ```ts
   const broadcastEvent = await waitForWsEvent(wsCapturePlayer, 'game.broadcast');
   expect(broadcastEvent.payload.title).toBe('遊戲開始');
   expect(broadcastEvent.payload.message).toBe('歡迎來到冒險世界');
   ```

### Phase D — 執行狀態更新驗證

10. **DB — executionCount 遞增**：
    ```ts
    const runtimeAfter = await GameRuntime.findOne({ gameId });
    const eventAfter = runtimeAfter.presetEvents[0];
    expect(eventAfter.executionCount).toBe(1);           // ← 0 → 1
    expect(eventAfter.executedAt).toBeTruthy();           // ← 已更新
    ```
11. **UI — execution count badge**：
    - executionCountBadge(pageGM, '歡迎廣播') 顯示 `'已執行 ×1'`
12. **Baseline 不受影響**：
    ```ts
    const baseline = await Game.findOne({ _id: gameId });
    const baselineEvent = baseline.presetEvents[0];
    expect(baselineEvent.executionCount).toBeUndefined(); // ← Baseline 無此欄位
    expect(baselineEvent.executedAt).toBeUndefined();
    ```

### Phase E — 再次執行（executionCount 累加）

13. pageGM: 再次 `executePresetEvent(pageGM, '歡迎廣播')`
14. **DB — executionCount = 2**：
    ```ts
    const runtimeAfter2 = await GameRuntime.findOne({ gameId });
    expect(runtimeAfter2.presetEvents[0].executionCount).toBe(2);
    ```
15. **UI badge**：`'已執行 ×2'`

---

## #9.2 Runtime CRUD（僅本場次事件）

### 進入點
- GM context only：`/games/{gameId}`

### 前置 seed
- 1 GMUser + 1 Game（`isActive: true`，Baseline **無**預設事件）
- 角色 A（用於 action 目標選擇）

### Phase A — 新增 Runtime-only 事件

1. `asGm(pageGM, { gameId })`
2. pageGM: 導航到預設事件編輯區（Runtime 模式）
3. pageGM: 點擊「新增預設事件」
4. 填入 name: `'緊急通報'`、description: `'臨時新增的廣播事件'`
5. 新增 1 個 broadcast action：targets='all', title='緊急', message='集合'
6. 儲存

### Phase B — 驗證新增結果

7. **UI**：eventCard(pageGM, '緊急通報') 可見
8. **runtimeOnly badge**：runtimeOnlyBadge(pageGM, '緊急通報') 可見（`'僅本場次'`）
9. **DB — GameRuntime**：
   ```ts
   const runtime = await GameRuntime.findOne({ gameId });
   const newEvent = runtime.presetEvents.find(e => e.name === '緊急通報');
   expect(newEvent).toBeTruthy();
   expect(newEvent.runtimeOnly).toBe(true);           // ← runtime-only 標記
   expect(newEvent.executionCount).toBe(0);
   ```
10. **DB — Baseline 不受影響**：
    ```ts
    const baseline = await Game.findOne({ _id: gameId });
    expect(baseline.presetEvents).toHaveLength(0);     // ← Baseline 仍為空
    ```

### Phase C — 編輯 Runtime 事件

11. pageGM: 點擊 eventCard '緊急通報' 的編輯按鈕
12. 修改 name → `'緊急通報（已修改）'`
13. 儲存
14. **UI**：eventCard 顯示新名稱
15. **DB**：`runtime.presetEvents[0].name === '緊急通報（已修改）'`
16. **Baseline 仍不受影響**：`baseline.presetEvents.length === 0`

### Phase D — 刪除 Runtime 事件

17. pageGM: 點擊 eventCard '緊急通報（已修改）' 的刪除按鈕
18. 確認刪除
19. **UI**：eventCard 消失
20. **DB**：`runtime.presetEvents.length === 0`
21. **Baseline 仍不受影響**：`baseline.presetEvents.length === 0`

---

## #9.3 執行 broadcast 動作（all + 指定角色 + PendingEvent 反向驗證）

### 進入點
- GM context：`/games/{gameId}`
- Player context A：`/c/{A_id}`
- Player context B：`/c/{B_id}`

### 前置 seed
- 1 GMUser + 1 Game（`isActive: true`）
- GameRuntime.presetEvents 含：
  ```
  [{
    id: 'pe-dual-broadcast',
    name: '雙重廣播',
    actions: [
      {
        id: 'act-all',
        type: 'broadcast',
        broadcastTargets: 'all',
        broadcastTitle: '全體通知',
        broadcastMessage: '所有人注意',
      },
      {
        id: 'act-specific',
        type: 'broadcast',
        broadcastTargets: [B_baselineId],   // ← 只對角色 B
        broadcastTitle: '密令',
        broadcastMessage: '只有你收到',
      },
    ],
    executionCount: 0,
  }]
  ```
- 角色 A + 角色 B

### Phase A — GM 執行雙重廣播事件

1. `asGm(pageGM, { gameId })`
2. `asPlayer(pageA, { characterId: A, gameId })`
3. `asPlayer(pageB, { characterId: B, gameId })`
4. pageGM: `executePresetEvent(pageGM, '雙重廣播')`

### Phase B — 全體廣播驗證（action 'act-all'）

5. **Player A WebSocket**：收到 `game.broadcast`
   ```ts
   const broadcastA = await waitForWsEvent(wsCaptureA, 'game.broadcast');
   expect(broadcastA.payload.title).toBe('全體通知');
   ```
6. **Player B WebSocket**：也收到 `game.broadcast`（因為 'all' → channel `private-game-{gameId}`）
   ```ts
   const broadcastB = await waitForWsEvent(wsCaptureB, 'game.broadcast');
   expect(broadcastB.payload.title).toBe('全體通知');
   ```

### Phase C — 指定角色廣播驗證（action 'act-specific'）

7. **Player B WebSocket**：收到 `role.message`
   ```ts
   const msgB = await waitForWsEvent(wsCaptureB, 'role.message');
   expect(msgB.payload.title).toBe('密令');
   expect(msgB.payload.from).toBe('GM');
   expect(msgB.payload.style).toBe('info');
   ```
8. **Player A WebSocket**：**不收到** `role.message`（A 不在 targets 中）
   ```ts
   // 在合理等待時間內，A 不應收到 role.message
   await expect(waitForWsEvent(wsCaptureA, 'role.message', 2000))
     .rejects.toThrow(/timeout/i);
   ```

### Phase D — PendingEvent 反向驗證（核心差異）

9. **PendingEvent — 預設事件 broadcast 不寫**：
   ```ts
   const pending = await PendingEvent.find({ targetGameId: gameId });
   expect(pending).toHaveLength(0);  // ← 預設事件 broadcast 刻意不寫 PendingEvent
   ```
   > 這是 Flow #9 與 Flow #8 的關鍵差異。Flow #8 的 `pushEvent` broadcast 會寫 PendingEvent；
   > 預設事件的 `executeBroadcast` 不寫（`execute-preset-event.ts:154` 註解）。

### Phase E — Log 驗證

10. **broadcast Log**：
    ```ts
    const logs = await Log.find({ gameId, action: 'broadcast' }).sort({ timestamp: 1 });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    // 'all' 模式寫 1 筆 game-level log
    const allLog = logs.find(l => l.details.title === '全體通知');
    expect(allLog).toBeTruthy();
    expect(allLog.actorType).toBe('gm');
    ```
11. **character_message Log**（指定角色模式）：
    ```ts
    const charLogs = await Log.find({ gameId, action: 'character_message' });
    const specificLog = charLogs.find(l => l.details.title === '密令');
    expect(specificLog).toBeTruthy();
    expect(specificLog.characterId.toString()).toBe(B_characterId);
    ```

### Phase F — GM toast

12. toast 顯示 `'「雙重廣播」已執行'` 或包含 `'2 個動作成功'`

---

## #9.4 執行 stat_change 動作

### 進入點
- GM context：`/games/{gameId}`
- Player context：`/c/{A_id}`

### 前置 seed
- 1 GMUser + 1 Game（`isActive: true`）
- 角色 A：
  ```
  stats: [
    { key: 'hp', label: '生命值', value: 80, maxValue: 100 },
    { key: 'mp', label: '魔力', value: 50, maxValue: 50 },
  ]
  ```
- GameRuntime.presetEvents 含：
  ```
  [{
    id: 'pe-poison',
    name: '毒霧',
    actions: [{
      id: 'act-poison',
      type: 'stat_change',
      statTargets: 'all',
      statName: 'hp',
      statChangeTarget: 'value',
      statChangeValue: -20,       // ← 減少 20 HP
    }],
    executionCount: 0,
  }]
  ```

### Phase A — GM 執行毒霧事件

1. `asGm(pageGM, { gameId })`
2. `asPlayer(pagePlayer, { characterId: A, gameId })`
3. pageGM: `executePresetEvent(pageGM, '毒霧')`

### Phase B — Player 端數值變更驗證

4. **WebSocket**：
   ```ts
   const updateEvent = await waitForWsEvent(wsCapturePlayer, 'role.updated');
   // role.updated payload 包含 stat 變更資訊
   ```
5. **Player UI**：HP 顯示從 80 變為 60

### Phase C — DB 驗證

6. **CharacterRuntime — stats 更新**：
   ```ts
   const charRuntime = await CharacterRuntime.findOne({ _id: A_runtimeId });
   const hpStat = charRuntime.stats.find(s => s.key === 'hp');
   expect(hpStat.value).toBe(60);           // ← 80 - 20 = 60
   expect(hpStat.maxValue).toBe(100);       // ← maxValue 不變
   ```
7. **其他 stat 不受影響**：
   ```ts
   const mpStat = charRuntime.stats.find(s => s.key === 'mp');
   expect(mpStat.value).toBe(50);            // ← 未變
   ```
8. **Log**：
   ```ts
   const log = await Log.findOne({ gameId, action: 'stat_change' });
   expect(log).toBeTruthy();
   expect(log.actorType).toBe('gm');
   expect(log.details.statName).toBe('hp');
   expect(log.details.oldValue).toBe(80);
   expect(log.details.newValue).toBe(60);
   ```

### Phase D — 邊界驗證（value 不低於 0）

9. **隱含於 `computeStatChange` 邏輯**：若 statChangeValue=-200（超過 value），結果應 clamp 到 0。
   此邊界已在 `lib/utils/__tests__/compute-effective-stats.test.ts` 的 unit test 覆蓋。
   E2E 此處只驗證正常 delta 的主線路徑。

---

## #9.5 執行 reveal_secret + reveal_task 動作

### 進入點
- GM context：`/games/{gameId}`
- Player context：`/c/{A_id}`

### 前置 seed
- 1 GMUser + 1 Game（`isActive: true`）
- 角色 A：
  ```
  secretInfo: {
    secrets: [
      { id: 'secret-1', title: '隱藏身份', content: '你其實是王子', isRevealed: false },
    ]
  }
  tasks: [
    { id: 'task-1', title: '暗殺任務', description: '消滅目標', isHidden: true, isRevealed: false },
  ]
  ```
- GameRuntime.presetEvents 含：
  ```
  [{
    id: 'pe-reveal-all',
    name: '真相大白',
    actions: [
      {
        id: 'act-reveal-secret',
        type: 'reveal_secret',
        revealCharacterId: A_baselineId,
        revealTargetId: 'secret-1',
      },
      {
        id: 'act-reveal-task',
        type: 'reveal_task',
        revealCharacterId: A_baselineId,
        revealTargetId: 'task-1',
      },
    ],
    executionCount: 0,
  }]
  ```

### Phase A — GM 執行真相大白事件

1. `asGm(pageGM, { gameId })`
2. `asPlayer(pagePlayer, { characterId: A, gameId })`
3. pageGM: `executePresetEvent(pageGM, '真相大白')`

### Phase B — Player 端揭露驗證

4. **WebSocket — secret.revealed**：
   ```ts
   const secretEvent = await waitForWsEvent(wsCapturePlayer, 'secret.revealed');
   expect(secretEvent.payload.secretId).toBe('secret-1');
   expect(secretEvent.payload.secretTitle).toBe('隱藏身份');
   expect(secretEvent.payload.revealType).toBe('manual');
   expect(secretEvent.payload.triggerReason).toBe('預設事件觸發');
   ```
5. **WebSocket — task.revealed**：
   ```ts
   const taskEvent = await waitForWsEvent(wsCapturePlayer, 'task.revealed');
   expect(taskEvent.payload.taskId).toBe('task-1');
   expect(taskEvent.payload.taskTitle).toBe('暗殺任務');
   ```
6. **Player UI**：
   - 隱藏身份在 secrets tab 中可見（isRevealed=true）
   - 暗殺任務在 tasks tab 中可見（isRevealed=true）

### Phase C — DB 驗證

7. **CharacterRuntime — secret 揭露**：
   ```ts
   const charRuntime = await CharacterRuntime.findOne({ _id: A_runtimeId });
   const secret = charRuntime.secretInfo.secrets.find(s => s.id === 'secret-1');
   expect(secret.isRevealed).toBe(true);
   expect(secret.revealedAt).toBeTruthy();
   ```
8. **CharacterRuntime — task 揭露**：
   ```ts
   const task = charRuntime.tasks.find(t => t.id === 'task-1');
   expect(task.isRevealed).toBe(true);
   expect(task.revealedAt).toBeTruthy();
   ```
9. **Log**：
   ```ts
   const logs = await Log.find({ gameId }).sort({ timestamp: 1 });
   const secretLog = logs.find(l => l.action === 'reveal_secret');
   expect(secretLog).toBeTruthy();
   expect(secretLog.details.secretTitle).toBe('隱藏身份');

   const taskLog = logs.find(l => l.action === 'reveal_task');
   expect(taskLog).toBeTruthy();
   expect(taskLog.details.taskTitle).toBe('暗殺任務');
   ```

### Phase D — GM toast

10. toast 包含 `'2 個動作成功'` 或類似文字

---

## #9.6 部分失敗 + skip 處理（best-effort 執行模型）

### 進入點
- GM context only：`/games/{gameId}`

### 前置 seed
- 1 GMUser + 1 Game（`isActive: true`）
- 角色 A：
  ```
  secretInfo: {
    secrets: [
      { id: 'secret-already', title: '已知秘密', content: '...', isRevealed: true },  // ← 已揭露
    ]
  }
  stats: [{ key: 'hp', label: '生命值', value: 100, maxValue: 100 }]
  ```
- GameRuntime.presetEvents 含：
  ```
  [{
    id: 'pe-mixed',
    name: '混合事件',
    actions: [
      {
        id: 'act-stat-ok',
        type: 'stat_change',
        statTargets: 'all',
        statName: 'hp',
        statChangeTarget: 'value',
        statChangeValue: -10,
      },
      {
        id: 'act-secret-already',
        type: 'reveal_secret',
        revealCharacterId: A_baselineId,
        revealTargetId: 'secret-already',      // ← 已揭露 → skip
      },
      {
        id: 'act-reveal-ghost',
        type: 'reveal_task',
        revealCharacterId: 'nonexistent-id',   // ← 角色不存在 → skip
        revealTargetId: 'task-ghost',
      },
    ],
    executionCount: 0,
  }]
  ```

### Phase A — GM 執行混合事件

1. `asGm(pageGM, { gameId })`
2. pageGM: `executePresetEvent(pageGM, '混合事件')`

### Phase B — 結果驗證

3. **GM toast**：顯示混合結果，包含：
   - `'1 成功'`（stat_change）
   - `'2 跳過'`（已揭露 + 角色不存在）
   - 或類似的 `'1 成功、2 跳過'` 格式
4. **DB — stat_change 仍然生效**：
   ```ts
   const charRuntime = await CharacterRuntime.findOne({ _id: A_runtimeId });
   expect(charRuntime.stats.find(s => s.key === 'hp').value).toBe(90);  // ← 100 - 10
   ```
5. **DB — secret 維持原狀**：
   ```ts
   const secret = charRuntime.secretInfo.secrets.find(s => s.id === 'secret-already');
   expect(secret.isRevealed).toBe(true);  // ← 本來就是 true，沒變
   ```

### Phase C — executionCount 仍遞增

6. **DB — 即使部分 skip，事件仍算已執行**：
   ```ts
   const runtime = await GameRuntime.findOne({ gameId });
   const event = runtime.presetEvents.find(e => e.id === 'pe-mixed');
   expect(event.executionCount).toBe(1);       // ← 仍遞增
   expect(event.executedAt).toBeTruthy();
   ```

### Phase D — Log 僅記錄成功的 action

7. **Log — stat_change 有記錄**：
   ```ts
   const statLog = await Log.findOne({ gameId, action: 'stat_change' });
   expect(statLog).toBeTruthy();
   ```
8. **Log — skip 的 action 無記錄**（reveal_secret / reveal_task 被 skip 不寫 log）：
   ```ts
   const revealLogs = await Log.find({ gameId, action: /reveal/ });
   expect(revealLogs).toHaveLength(0);
   ```

---

## 跨 Case 陷阱（Cross-case Pitfalls）

1. **Game 必須 active**：所有 case 需要 `isActive: true`。seed 必須包含 `startGame` 步驟（或直接 seed GameRuntime）。若 seed 只建立 Game 但不 startGame，`executePresetEvent` 會因找不到 GameRuntime 而失敗

2. **Baseline vs Runtime 的 presetEvents 完全獨立**：`startGame` 做的是深拷貝（`start-game.ts:88-96`），之後兩邊各自獨立。seed 時如果直接操作 GameRuntime.presetEvents，不要假設 Baseline 也有對應資料

3. **executionCount 在部分失敗時也遞增**（#9.6）：`executePresetEvent` 在所有 actions 執行完畢後統一更新 executionCount（`execute-preset-event.ts:92-96`），不管個別 action 是否成功。這是 best-effort 設計——如果把 executionCount 綁定「全成功」，GM 會看不到事件被嘗試過

4. **預設事件 broadcast 不寫 PendingEvent**（#9.3）：`executeBroadcast` 在 `execute-preset-event.ts:154` 直接 `pusher.trigger()`，不經過 `emitGameBroadcast()`（後者會寫 PendingEvent）。這是刻意避免重複——預設事件可能被重複執行，每次都寫 PendingEvent 會導致離線 player 收到大量重複通知

5. **resolveTargets 過濾不存在的角色 ID**（#9.6）：如果 `broadcastTargets` 或 `statTargets` 指定了已刪除的角色 baseline ID，`resolveTargets` 會靜默過濾掉。若過濾後 targets 為空，action 回 `status: 'skipped'`

6. **reveal_secret/reveal_task 的 skip 判斷**：已揭露 → skip `'目標隱藏資訊已揭露'`；角色不存在 → skip `'目標角色不存在'`；secret/task ID 不存在 → skip。這些 skip 不寫 Log

7. **stat_change 操作 CharacterRuntime（非 Character）**：執行時查的是 `CharacterRuntime` 的 stats，不是 Baseline `Character` 的 stats。seed 時確保 CharacterRuntime 的 stats 與預期一致（`startGame` 會從 Character 複製到 CharacterRuntime）

8. **runtimeOnly 事件不回寫 Baseline**（#9.2）：`createRuntimePresetEvent` 只寫 `GameRuntime.presetEvents`，不觸碰 `Game.presetEvents`。刪除 runtimeOnly 事件也一樣。#9.2 的 Baseline 反向驗證是核心斷言

9. **quick panel 的確認 dialog**：`preset-event-quick-panel.tsx` 在點擊「執行」後會彈出確認 dialog。E2E 必須處理此 dialog（點擊確認按鈕），否則執行不會觸發

10. **emitRoleUpdated 的 payload 格式**：stat_change 透過 `emitRoleUpdated()` 發送角色更新事件，payload 包含 stat delta 值。#9.4 的 WebSocket 斷言需配合此 payload 格式（可能與 Flow #5 的 skill effect 使用同一 emit 函數）
