# E2E Flow #5 — Player 使用技能（非對抗、非 item 轉移）

> **上游索引**：本檔案為 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 中 Flow #5 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/player-use-skill.spec.ts`
> **關聯 flow**：
> - [E2E_FLOW_2_PLAYER_PIN.md](./E2E_FLOW_2_PLAYER_PIN.md) — 玩家 PIN unlock 上游（提供 `fullAccess=true` 的前置）
> - [E2E_FLOW_6_CONTEST.md](./E2E_FLOW_6_CONTEST.md) — 對抗 (contest) 技能完整閉環
> - [E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md](./E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md) — item_take/item_steal 延遲選擇（對抗 #6b.1/#6b.2 + 非對抗 #6b.3）

---

## ✅ 實作後修正摘要（2026-04-10）

以下列出 spec 設計階段的假設與實作後發現的差異：

| # | Spec 假設 | 實際情況 |
|---|----------|---------|
| 1 | URL `/characters/{id}` | 實際為 `/c/{id}` |
| 2 | `getByRole('tab', { name: '技能' })` | Bottom nav 使用 `<button>` 不是 Radix Tab → `page.getByRole('navigation').getByRole('button', { name: '技能' })` |
| 3 | effect field `amount` | 實際為 `value` |
| 4 | stat 用 `key: 'hp'` 識別 | `targetStat` 匹配的是 `stats[i].name`（如 `'生命值'`），不是 key |
| 5 | `randomConfig: { sides, successThreshold }` | 實際為 `{ maxValue, threshold }` |
| 6 | `skill.used` 成功後顯示 Sonner toast | 成功只發 WebSocket 通知，`notify.error()` 僅在失敗時使用 |
| 7 | `wsCapture.waitFor()` API | 實際使用 `waitForWebSocketEvent(page, { event, channel })` helper，回傳 `BaseEvent { type, timestamp, payload }`，需 `.payload` 取得業務資料 |
| 8 | `usageCount` 每次使用都遞增 | 僅在 `usageLimit > 0` 時遞增（`skill-use.ts:344`） |
| 9 | `readOnly` 只需 `fullAccess: false` | `useLocalStorageUnlock` 在 `!hasPinLock` 時直接回傳 `fullAccess=true`，必須同時設 `hasPinLock: true` |
| 10 | TemporaryEffect field `delta` / `sourceSkillId` | 實際為 `deltaValue` / `sourceId` + `sourceType: 'skill'` |
| 11 | #5.6 Phase B：`GAME_INACTIVE` server check | `skill-use.ts` **無此檢查**，改為測試 PIN gate 阻擋未授權存取 |
| 12 | 獨立 fixture 檔案 (`as-player.ts`, `ws-capture.ts`) | 統一在 `e2e/fixtures/index.ts`（`test.extend()` pattern） |
| 13 | `checkResult` 注入用 `window.__E2E_HARNESS__` | 用 `page.evaluate(() => { Math.random = () => 0.7 })` 控制擲骰結果 |

---

## ⚠ 基礎設施依賴（Blocker）— ✅ 全部已完成

Flow #5 是整個 E2E 計畫中第一個需要完整 WebSocket 事件鏈驗證的 flow，**以下基礎設施在寫 spec 之前必須就位**，否則 `page.goto` 之後完全無法斷言：

1. **`asPlayer()` fixture 實作**
   - 目前專案**沒有**既有 `asPlayer()` fixture（Explore agent 已確認）
   - 上一段 session 在 Flow #2 與主 plan 中寫的 API shape 只是**設計稿**
   - 必須在 `e2e/fixtures/as-player.ts` 建立，API:
     ```ts
     asPlayer(page: Page, options: {
       characterId: string,
       gameId: string,
       fullAccess?: boolean,  // default true; false → PIN-only readOnly 模式
       readOnly?: boolean,     // Flow #2 預覽模式用
     }): Promise<void>
     ```
   - 內部須同時設定：(1) iron-session cookie 的 `unlockedCharacterIds`、(2) localStorage 的 `character-{id}-unlocked` 與 `character-{id}-fullAccess`

2. **Stub Pusher + SSE IPC 橋接** ✅ **已備妥**
   - `lib/websocket/pusher-server.e2e.ts` (server stub)
   - `lib/websocket/__e2e__/event-bus.ts` (單例 EventEmitter)
   - `app/api/test/events/route.ts` (SSE route)
   - `lib/websocket/pusher-client.e2e.ts` (client stub)

3. **WebSocket 事件捕捉 helper**
   - Flow #5 必須能斷言「某 event 在某 channel 被發送」
   - 建議在 `e2e/fixtures/ws-capture.ts` 建立：
     ```ts
     captureWsEvents(page: Page): {
       waitFor(channel: string, event: string, timeoutMs?: number): Promise<Payload>
       assertEmitted(channel: string, event: string): void
       getAll(channel?: string, event?: string): CapturedEvent[]
     }
     ```
   - 實作方式：注入 `window` 層級的事件監聽 + 在 test process 透過 `app/api/test/events/route.ts` 的 SSE 直接訂閱 event bus

4. **Game active 狀態 seed**
   - Flow #5 全程在 `game.isActive: true` 下跑
   - 需擴充 `seedFixture.gameForGm(gmUserId, { isActive: true })` 確保 GameRuntime 文件已建立（或在首次 `getCharacterData` 呼叫時自動複製 baseline → runtime）

**順序**：infra 1/3/4 **先實作**，再寫 Flow #5 spec。若先寫 spec 會 red 在 fixture undefined 而非業務邏輯——這種紅燈無助於驗證程式。

---

## 設計背景

Flow #5 驗證 **「玩家在 active game 中使用技能」的完整閉環**，核心證明：

1. **Stub Pusher + SSE IPC 可以在 E2E 中捕捉 WebSocket 事件**（基礎設施 smoke 之外的第一個真實業務驗證）
2. **`skill-effect-executor.ts` 的 effects 真的被執行** → `runtime.stats` 寫入
3. **baseline / runtime 隔離** 在 active game 下成立：玩家改的是 runtime，baseline 不動
4. **`use-skill-usage.ts` 的錯誤處理** 會把 server error 正確反映到 UI
5. **限制條件 (`usageLimit` / `cooldown`) 的 UI 與 server 雙層守門**

**刻意排除**：
- **對抗技能** (`checkType='contest' | 'random_contest'`)：`skill-use.ts:237` 提早 return，effects 由 `contest-respond.ts` 在防守方回應時執行——這不是技能使用的完整閉環，拆至 Flow #6
- **item_take / item_steal**：需要 TargetItemSelectionDialog 延遲選擇，主線以外的互動，拆至 Flow #6b（#6b.1/#6b.2 對抗、#6b.3 非對抗）
- **TemporaryEffect 過期行為**：需要等真實時間，E2E flaky，拆至後續 flow 或用 unit test 覆蓋
- **Cooldown 自然解除**：同上時間依賴問題
- **多 TemporaryEffect 累疊**：edge case，非主線
- **GM console 的 runtime overlay 更新**：拆至 GM 側 flow

---

## 範圍定義

### 測
- `checkType='none'` 技能：效果執行 + runtime 寫入 + WebSocket 事件（#5.1）
- `checkType='random'` 技能：前端 `checkResult` 注入 + pass/fail 雙分支（#5.2）
- 跨角色 `targetType='other'` 效果：B 角色 runtime 更新 + B 角色收到 `character.affected`（#5.2）
- 多 effects 同時執行順序 + 空 effects 反向驗證（#5.3）
- `usageLimit` 耗盡 + `cooldown` 守門的雙層（UI disable + server reject）（#5.4）
- readOnly 模式隱藏互動 + TemporaryEffect record 建立（**不驗證過期**）（#5.5）
- ~~授權拒絕（非擁有者）+ game inactive 拒絕~~ → PIN gate 阻擋未授權存取（#5.6，已修正：server 無 GAME_INACTIVE check）

### 不測（延後/排除/橫切）
| 項目 | 狀態 | 去處 |
|---|---|---|
| `checkType='contest'` 技能完整閉環 | 橫切 | Flow #6 |
| `checkType='random_contest'` | 橫切 | Flow #6 |
| `item_take` / `item_steal` 延遲選擇 | 橫切 | Flow #6b（#6b.1/#6b.2 對抗、#6b.3 非對抗） |
| TemporaryEffect 過期事件 (`effect.expired`) | 延後 | 未定 Flow 或 unit test |
| Cooldown 自然過期後可再用 | 延後 | 時間依賴 |
| 多 TemporaryEffect 累疊 | 延後 | edge case |
| GM runtime console 的事件接收 | 橫切 | GM 側 flow |
| 技能 id 不存在 | 延後 | 機器錯誤層 |
| `TARGET_IN_CONTEST` 錯誤 | 橫切 | Flow #6 |
| `targetType='any'` 下拉（含自己）| 延後 | 非主線，comment 標註 |
| SkillCard cooldown countdown 視覺 | 排除 | UI 動畫斷言 flaky，改用 unit test |

---

## Test Case 獨立性設計

| Case | 獨立 seed | Game 狀態 |
|---|---|---|
| #5.1 happy path self-target | 1 角色 + 1 skill（checkType=none, stat_change self）| active |
| #5.2 cross-target + random | 2 角色 + 1 skill（checkType=random, stat_change other）| active |
| #5.3 多 effect + 空 effect | 2 角色 + 2 skills（複合 / 空效果）| active |
| #5.4 限制條件 | 1 角色 + 2 skills（usageLimit=1 / cooldown=30）| active |
| #5.5 readOnly + TemporaryEffect | 1 角色 + 1 skill（stat_change with duration=60）| active |
| #5.6 PIN gate 授權 | 2 角色（A 無 PIN、B 有 PIN + 技能）| active |

**原則**：每個 case 用獨立 seed-fixture 組合，避免互相污染。所有 case 的 asPlayer 預設 `fullAccess=true` 除 #5.5 有明確 readOnly 步驟。

---

## 共用規格

### URL 模式
- 玩家角色卡頁：~~`/characters/{characterId}`~~ → **`/c/{characterId}`**
- 無獨立技能路由（技能 tab 是 CharacterCardView 內的 tab）

### 關鍵 Selectors（實作後修正）

```ts
// CharacterCardView bottom nav（不是 Radix Tab，是 <nav> 內的 <button>）
const tabSkills = page.getByRole('navigation').getByRole('button', { name: '技能' });

// SkillCard（list 中的單一卡片）— 用 text 定位而非 testId
const skillCard = page.getByText('技能名稱');

// SkillDetailDialog (Bottom Sheet) — role="dialog" + aria-label={skillName}
const skillDialog = page.getByRole('dialog', { name: '技能名稱' });

// 目標角色選擇 — Radix Select
const targetSelect = skillDialog.getByRole('combobox');

// 使用按鈕
const useBtn = skillDialog.getByRole('button', { name: '使用技能' });
// readOnly 模式下按鈕文字為 '預覽模式'（disabled）
```

### Helpers（實作後修正）

```ts
// 等待 skill.used 事件（使用 waitForWebSocketEvent helper）
// ⚠ 回傳 BaseEvent { type, timestamp, payload } — 需 .payload 取業務資料
const wsPromise = waitForWebSocketEvent(page, {
  event: 'skill.used',
  channel: `private-character-${characterId}`,
});
// 先建 promise → 觸發動作 → await promise（防 race）
await useBtn.click();
const wsRaw = await wsPromise;
const wsEvent = wsRaw.payload;

// DB 斷言透過 dbQuery fixture（不直接操作 Mongoose）
const runtimeDocs = await dbQuery('character_runtime', { refId: characterId });
const baselineDocs = await dbQuery('characters', { _id: characterId });
```

### Seed pattern（實作後修正）

使用統一 `e2e/fixtures/index.ts` 的 `seed` builder：

```ts
// Active game 三步驟 seed
const { gmUserId } = await seed.gmWithGame();
const game = await seed.game({ gmUserId, isActive: true });
const char = await seed.character({ gameId: game._id, name: '...', skills: [...], stats: [...] });
await seed.characterRuntime({ refId: char._id, gameId: game._id, ... });
await seed.gameRuntime({ refId: game._id, gmUserId });
```

---

## #5.1 Happy path：checkType=none + stat_change self + baseline/runtime 隔離

### 進入點
- 角色：Player（`asPlayer({ characterId: A })`）
- URL：`/c/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 1 角色 A：`stats = [{ id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 }]`
- 1 Skill on A：
  ```
  {
    id: 'skill-heal',
    name: '小治療',
    description: '恢復 20 HP',
    checkType: 'none',
    usageLimit: 0,
    cooldown: 0,
    effects: [{
      type: 'stat_change',
      targetType: 'self',
      targetStat: '生命值',    // ⚠ 匹配 stats[i].name，不是 key
      value: 20,               // ⚠ 原 spec 寫 amount，實際為 value
      duration: 0,
    }]
  }
  ```

### 操作步驟

**Phase A — 進入技能 tab**
1. `asPlayer({ characterId: A })`
2. `page.goto('/c/{A_id}')`
3. 等待角色卡 render 完成
4. `page.getByRole('navigation').getByRole('button', { name: '技能' }).click()`
5. 斷言：`page.getByText('小治療')` 可見

**Phase B — 開啟 SkillDetailDialog**
6. `skillCard('skill-heal').click()`
7. 等待 Bottom Sheet 開啟動畫完成
8. 斷言：`skillNameInSheet` 顯示 `小治療`
9. 斷言：**無** `targetCharSelect`（因為 effect.targetType='self'）
10. 斷言：`useSkillBtn` enabled

**Phase C — 使用技能**
11. `wsCapture.clear()`（確保只捕捉從現在開始的事件）
12. `useSkillBtn.click()`
13. 等待 server action 200
14. 等待 Sheet 關閉（動畫結束）

**Phase D — WebSocket 事件斷言**
15. `const wsRaw = await wsPromise;` `const wsEvent = wsRaw.payload;`（⚠ 需 `.payload` 取業務資料）
16. 斷言：`wsEvent.skillName === '小治療'`
17. 斷言：`wsEvent.checkType === 'none'`
18. 斷言：`wsEvent.checkPassed === true`

**Phase E — Runtime 寫入斷言**（透過 `dbQuery` fixture）
21. `const runtimeDocs = await dbQuery('character_runtime', { refId: A_id })`
22. 斷言：`runtime.stats.find(s => s.name === '生命值').value === 70`
23. 斷言：`runtime.skills[0].usageCount` — ⚠ `usageLimit=0` 時**不遞增**（`skill-use.ts:344`）
24. 斷言：`runtime.skills[0].lastUsedAt` 已設定

**Phase F — Baseline 隔離斷言（關鍵！）**
25. `const baselineDocs = await dbQuery('characters', { _id: A_id })`
26. 斷言：`baseline.stats.find(s => s.name === '生命值').value === 50`（**未變**）
27. 斷言：`baseline.skills[0].lastUsedAt === undefined`（**未變**）

### 非同步等待點
- Step 7：Bottom Sheet open animation
- Step 13：server action 200
- Step 15：`waitForSkillUsed` 透過 SSE IPC 收到事件
- Step 20：`role.updated` 事件

### 斷言層總覽
- **UI 層**：Sheet 開關、使用按鈕 enable/disable、（可選）stats overlay 更新
- **WebSocket 層**：`skill.used` + `role.updated` 事件 payload
- **DB 層**：
  - runtime：stats 更新、usageCount/lastUsedAt 更新
  - baseline：完全不變（隔離證明）
- **Session/LocalStorage**：無需斷言

### 反向驗證
- 不先 `asPlayer` 直接 `goto('/characters/{A_id}')` → 被 redirect 至 PIN unlock 頁
- `wsCapture.clear()` 後的事件陣列只包含本次 click 觸發的事件（防止遺留事件污染斷言）

### 已知陷阱
- **`usageCount` 在 `usageLimit=0` 時是否 track**：實作可能不累加 usageCount 當無上限。若 Step 23 fail，先讀 `skill-use.ts` 確認 increment 邏輯。
- **runtime 文件尚未建立**：active game 剛建立時 GameRuntime 可能不存在，`getCharacterData` 會首次建立（複製 baseline）。Flow #5 的斷言必須在 skill 使用**之後**讀 runtime，因為這是 runtime 建立的 trigger。
- **stats 的 `maxValue` 上限**：若 hp=50 + 20 = 70 < maxValue=100，無上限問題。若改成 +60 會測到 cap 邏輯，Flow #5 不測此 edge case。

---

## #5.2 跨角色目標 + checkType='random' 雙分支

### 進入點
- Player（A）
- URL：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A + 角色 B，B 有 `stats: [{ id: 'stat-hp', name: '生命值', value: 50, maxValue: 100 }]`
- Skill on A：
  ```
  {
    id: 'skill-bolt',
    name: '閃電箭',
    checkType: 'random',
    randomConfig: { maxValue: 20, threshold: 11 },  // ⚠ 原 spec 寫 sides/successThreshold
    usageLimit: 0,
    cooldown: 0,
    effects: [{
      type: 'stat_change',
      targetType: 'other',
      targetStat: '生命值',    // ⚠ 匹配 stats[i].name
      value: -15,              // ⚠ 原 spec 寫 amount
      duration: 0,
    }]
  }
  ```

### 操作步驟

**Phase A — 成功分支（注入 checkResult=15）**
1. `asPlayer(page, { characterId: A, gameId })`
2. `goto('/characters/{A_id}')` → `tabSkills.click()` → `skillCard('skill-bolt').click()`
3. 斷言：Sheet 顯示 `targetCharSelect`（因為 targetType=other）
4. `targetCharSelect` 選擇角色 B
5. **關鍵**：透過 E2E fixture 注入 `checkResult=15`（模擬擲骰結果）。方式：
   - (推薦) 在 Sheet 上直接呼叫 server action，繞過擲骰 UI：`page.evaluate(() => window.__E2E_HARNESS__.useSkill({ skillId, checkResult: 15, targetId }))`
   - 或：hook `Math.random` / sessionStorage seed
6. `useSkillBtn.click()`

**Phase B — 事件與 DB 斷言（成功）**
7. `const evt = await waitForSkillUsed(wsCapture, A_id, 'skill-bolt')`
8. 斷言：`evt.checkPassed === true`、`evt.checkResult === 15`
9. 斷言：B 的 `character-${B_id}` channel 出現 `character.affected` 事件
10. `const runtimeB = await loadRuntimeChar(gameId, B_id)`
11. 斷言：`runtimeB.stats.hp.value === 35`（50 - 15）

**Phase C — 失敗分支（注入 checkResult=5）**
12. 重置 wsCapture
13. `skillCard('skill-bolt').click()` → 選 B → 注入 `checkResult=5`
14. `useSkillBtn.click()`

**Phase D — 失敗斷言**
15. `skill.used` 事件仍發（帶 `checkPassed: false`、`checkResult: 5`）
16. 斷言：**無** `character.affected` 事件（effects 未執行）
17. `const runtimeB2 = await loadRuntimeChar(gameId, B_id)`
18. 斷言：`runtimeB2.stats.hp.value === 35`（與 Phase B 相同，未再變動）

**Phase E — 自身限制反向驗證**
19. 嘗試對自己使用 `targetType=other` 的技能（`targetCharSelect` 選 A）
20. 斷言：`useSkillBtn` disabled **或** click 後 server 回 error

### 斷言層總覽
- **WebSocket**：成功分支 `skill.used + character.affected`；失敗分支只有 `skill.used`
- **DB runtime**：成功時 B.hp -15；失敗時 B.hp 不變
- **UI**：自身 target 被拒絕

### 已知陷阱
- **`checkResult` 注入機制**：`skill-use.ts:18` 的 server action 簽名本身接受 `checkResult` 參數（Explore 確認），spec 可直接用 `page.evaluate` 呼叫 server action 繞過前端擲骰。這比 stub `Math.random` 穩定。
- **`targetType='other' vs 'any'`**：Flow #5 只驗 'other' 禁自己的分支，'any' 可自選自己的分支延後。
- **`character.affected` 的 channel 是 target 的 channel**：斷言 channel 時要用 `character-${B_id}` 而非 A 的。

---

## #5.3 多 effect 執行順序 + 空 effects 反向驗證

### 進入點
- Player（A）

### 前置 seed
- 2 角色 A/B，active game
- Skill #1 on A：`skill-combo` — checkType=none，effects 含：
  ```
  [
    { type: 'stat_change', targetType: 'self', targetStat: '魔力', value: -10 },
    { type: 'stat_change', targetType: 'other', targetStat: '生命值', value: -20 },
    { type: 'task_reveal', targetType: 'self', targetTaskId: 'task-hidden-1' },
  ]
  ```
- Skill #2 on A：`skill-empty` — checkType=none，`effects: []`
- A 有 task-hidden-1（isRevealed=false）

### 操作步驟

**Phase A — 複合效果**
1. 進 Skills tab → `skillCard('skill-combo').click()` → 選 B → use
2. 等待 `skill.used` 事件
3. 斷言：`effectsApplied` 陣列順序 `[stat_change(mp), stat_change(hp), task_reveal]`
4. `loadRuntimeChar(A)`：`stats.mp.value -= 10`
5. `loadRuntimeChar(B)`：`stats.hp.value -= 20`
6. `loadRuntimeChar(A)`：`tasks.find(t => t.id === 'task-hidden-1').isRevealed === true`
7. WebSocket 事件：`skill.used` + `character.affected`(B) + `task.revealed`(A) 皆被捕捉

**Phase B — 空效果反向驗證**
8. `wsCapture.clear()`
9. `skillCard('skill-empty').click()` → use（無 targetType 需要選擇）
10. 等待 `skill.used` 事件
11. 斷言：`effectsApplied === []`
12. 斷言：**無** `character.affected`、**無** `role.updated`、**無** `task.revealed`
13. 斷言：`loadRuntimeChar(A).skills[empty].lastUsedAt` 仍更新（代表 use 真的執行）

### 已知陷阱
- **空 effects 仍要發 `skill.used`**：這是「使用 = 行為日誌」的語意，即使無副作用也要記錄
- **`task_reveal` 只對 hidden task 有效**：seed 必須先建一個 hidden task，否則 `executeSkillEffects` 會 silent skip
- **Effect 執行順序**：`executeSkillEffects` 是 sequential for-loop，順序固定。spec 斷言 `effectsApplied` 陣列順序可以防止未來改成並行時漏掉依賴

---

## #5.4 限制條件：usageLimit 耗盡 + cooldown 守門

### 進入點
- Player（A）

### 前置 seed
- active game + 1 角色
- Skill #1：`skill-limited` — `usageLimit: 1, cooldown: 0`
- Skill #2：`skill-cooldown` — `usageLimit: 0, cooldown: 30`（秒）

### 操作步驟

**Phase A — usageLimit=1 第一次成功**
1. use `skill-limited`
2. 斷言：`skill.used` 事件、runtime `skill-limited.usageCount === 1`

**Phase B — usageLimit=1 第二次 UI 守門**
3. 重新開啟 Sheet（`skillCard('skill-limited').click()`）
4. 斷言：`useSkillBtn` disabled
5. 斷言：`skillCardDisabled('skill-limited')` 顯示「次數已耗盡」badge
6. （選擇性）直接透過 `page.evaluate` 呼叫 server action 繞過 UI → 斷言 server 回 error code（雙層守門）

**Phase C — cooldown=30 第一次成功**
7. use `skill-cooldown`
8. 斷言：runtime `skill-cooldown.lastUsedAt` 設定、`usageCount` 不增（因 usageLimit=0）

**Phase D — cooldown=30 第二次 server 守門**
9. 立即重用（不等 30 秒）
10. 若 UI 先守門：斷言 `useSkillBtn` disabled + cooldown 遮罩
11. 直接繞 UI 呼叫 server action → 斷言回傳 `{ success: false, error: 'ON_COOLDOWN', remainingSeconds: ~30 }`

### 已知陷阱
- **不等 cooldown 自然過期**：Flow #5 禁止 sleep 30s，會 flaky。cooldown 解除驗證延後至未來 flow 或用 server time mock。
- **UI 守門與 server 守門是雙層**：spec 必須都驗，因為實作可能只改一邊造成漏洞
- **Cooldown 的 `remainingSeconds` 精度**：可能是 29 或 30，斷言用 `expect(remaining).toBeGreaterThan(25).and.lessThan(31)` 寬鬆比對

---

## #5.5 readOnly 模式遮蔽互動 + TemporaryEffect record 建立

### 進入點
- **兩階段**，同一個 test

### 前置 seed
- active game + 1 角色
- Skill：`skill-buff` — checkType=none, effects=[{ type: 'stat_change', targetType: 'self', targetStat: '力量', value: 5, duration: 60 }]
- ⚠ **角色必須設 `hasPinLock: true, pin: '...'`**，否則 readOnly 永遠不生效（規則 24）

### 操作步驟

**Phase A — readOnly 遮蔽互動**
1. `asPlayer({ characterId, readOnly: true })`（角色需有 `hasPinLock: true`）
2. `goto('/c/{id}')` → 技能 tab → `skillCard('skill-buff').click()`
3. 斷言：Sheet 開啟，按鈕文字為「預覽模式」且 `disabled`

**Phase B — 切換到 fullAccess**
4. `asPlayer({ characterId })`（fullAccess 預設 true）
5. `page.reload()`（⚠ 不可用 `networkidle`，規則 26）
6. 技能 tab → `skillCard('skill-buff').click()` → `useSkillBtn.click()`

**Phase C — TemporaryEffect 斷言**
7. 等待 `skill.used` WS 事件
8. `const runtimeDocs = await dbQuery('character_runtime', { refId: charId })`
9. 斷言：`runtime.stats.find(s => s.name === '力量').value === 15`（10 + 5）
10. 斷言：`runtime.temporaryEffects[0]` 含：
    ```
    { targetStat: '力量', deltaValue: 5, sourceType: 'skill', sourceId: 'skill-buff',
      sourceName: '力量增幅', duration: 60, isExpired: false, expiresAt: <future> }
    ```
11. **不驗證** 過期行為（延後）

### 已知陷阱
- **`asPlayer` 切換模式需同時更新 session + localStorage**：單純切 cookie 不夠，CharacterCardView 讀的是 localStorage
- **`page.reload()` 後的 hydration**：readOnly 狀態是 useEffect 讀 localStorage 得出的，reload 後必須等 hydration 完成才能斷言 UI
- **TemporaryEffect 儲存位置**：可能在 `runtime.temporaryEffects` 陣列或獨立 collection（`TemporaryEffectModel`），需先讀 `lib/effects/create-temporary-effect.ts` 確認

---

## #5.6 授權與錯誤處理（實作後修正）

> ⚠ **重大修正**：原 spec 假設 `skill-use.ts` 有 `GAME_INACTIVE` check，但實際完全沒有。Phase B 已改為測試 PIN gate。

### 進入點
- Player A，嘗試存取 PIN-locked 角色 B

### 前置 seed
- active game + 角色 A（無 PIN）+ 角色 B（`hasPinLock: true, pin: '9999'`，有技能）

### 操作步驟

**Phase A — PIN gate 阻擋未授權存取**
1. `asPlayer({ characterId: A })`（只有 A 在 session 中）
2. `page.goto('/c/{B_id}')`
3. 斷言：PinUnlock 畫面出現（角色名可見）
4. 斷言：導覽列（`<nav>`）**不可見**
5. 斷言：技能內容（`page.getByText('秘密技能')`）**不可見**

### 已知陷阱
- **`validatePlayerAccess` 邏輯**：session 中有 characterId **或** 角色無 PIN lock 即通過。只有 `hasPinLock: true` 且 characterId 不在 session 中才會被擋
- **UI 層 PIN gate 先於 server 層**：CharacterCardView 在 `hasPinLock && !isUnlocked` 時直接顯示 PinUnlock 畫面，根本不會渲染技能 tab，因此無需測試 server-side reject
- ~~**`GAME_INACTIVE` check**~~：`skill-use.ts` **無此檢查**，原 spec Phase B 整段已刪除

---

## 跨 Case 已知陷阱

### 陷阱 #1：baseline/runtime 隔離是 Flow #5 的核心價值
Flow #5 全程在 active game 下跑，所有 stats/skills 寫入都應該進 runtime。**每個 case 必須至少一次** 斷言 baseline 未變動（#5.1 Phase F 已示範），這是證明「#4 是 inactive / #5 是 active」分工有效的唯一手段。若某 case 忘記 baseline 對照，等於沒驗證隔離。

### 陷阱 #2：contest 技能刻意不在 Flow #5
若有人誤把 `checkType='contest'` 技能加進 seed，並斷言「使用後 stats 變動」——會 fail，因為 `skill-use.ts:237` 提早 return，effects 未執行。Flow #5 的所有 seed 必須 `checkType ∈ { 'none', 'random' }`，**禁止** 出現 contest。

### 陷阱 #3：item_take / item_steal 刻意不在 Flow #5
同上原則。若 seed 出現 item_take 且 checkPassed=true 且 targetItemId 未給 → server 回 `needsTargetItemSelection`，Flow #5 沒有處理 TargetItemSelectionDialog 的 helper。禁止在 Flow #5 seed 使用這兩種 effect。完整覆蓋見 Flow #6b（#6b.1/#6b.2 對抗路徑、#6b.3 非對抗路徑）。

### 陷阱 #4：`waitForWebSocketEvent` 必須在 action 前建立 promise
~~`wsCapture.clear()` 後再 `waitFor`~~ → 實際使用 `waitForWebSocketEvent`，必須先建 promise 再觸發 action 再 await（防 race）。

### 陷阱 #5：`runtime` 文件初始化時機
`getCharacterData` 在 active game 第一次呼叫時會複製 baseline → runtime。這意味 `loadRuntimeChar` 在技能**未使用前** 可能回 null。斷言 runtime 必須在**使用後**。

### 陷阱 #6：`lastUsedAt` 的 Date 序列化
MongoDB 的 Date 在 `.lean()` 後是 Date 物件，但透過 WebSocket 傳到 browser 會變 ISO string。斷言 runtime 用 `instanceof Date`，斷言事件 payload 用 `typeof 'string'`。

### 陷阱 #7：`role.updated` vs `character.affected` 的 channel 差異
- `role.updated`：通常發在「當事角色」的 channel（GM console 聽）
- `character.affected`：發在「被影響角色」的 channel（該玩家聽）
這兩個常混淆。Flow #5 的斷言必須明確指定 channel。

### 陷阱 #8：`asPlayer` fixture — ✅ 已完成
~~`asPlayer()` fixture 是 blocker~~ → 已在 Phase 3 的 `e2e/fixtures/index.ts` 中實作。

---

## Fixture 需求 — ✅ 全部已完成

所有 fixture 統一在 `e2e/fixtures/index.ts`（`test.extend()` pattern）：
- `asPlayer({ characterId, readOnly? })` — session + localStorage 設定
- `seed` builder — `seed.gmWithGame()`, `seed.game()`, `seed.character()`, `seed.characterRuntime()`, `seed.gameRuntime()`
- `dbQuery(collection, filter)` — DB 查詢 fixture
- `resetDb` — auto per-test reset
- `waitForWebSocketEvent(page, { event, channel })` — WS 事件捕捉 helper
- `waitForToast(page, text)` — Sonner toast helper

不需要 `window.__E2E_HARNESS__`，`Math.random` 注入即可控制擲骰。

---

## 延後 / 排除 / 橫切追溯

| 項目 | 狀態 | 去處 |
|---|---|---|
| `checkType='contest' / 'random_contest'` | 橫切 | Flow #6 |
| `item_take / item_steal` 延遲選擇 | 橫切 | Flow #7 |
| `effect.expired` 過期事件 | 延後 | 後續 flow 或 unit test |
| Cooldown 自然解除 | 延後 | 時間依賴 |
| 多 TemporaryEffect 累疊 | 延後 | edge case |
| GM runtime console 接收事件 | 橫切 | GM 側 flow |
| 技能 id 不存在 | 延後 | 機器錯誤層 |
| `TARGET_IN_CONTEST` 錯誤 | 橫切 | Flow #6 |
| `targetType='any'` 下拉選擇自己 | 延後 | 非主線 |
| SkillCard cooldown countdown 動畫 | 排除 | 動畫斷言 flaky，改 unit test |
| 過期 TemporaryEffect 在技能使用前被 `checkExpiredEffects` 清除 | 延後 | 副作用驗證 |

---

## 實作順序（實際執行順序）

✅ 按 spec 編號順序實作：#5.1 → #5.2 → #5.3 → #5.4 → #5.5 → #5.6
- #5.1 扮演「探路者」角色，集中暴露 selector / URL / toast / WS event 差異
- #5.2–#5.4 共用 #5.1 建立的 pattern，一次通過
- #5.5 發現 `hasPinLock` 隱性前置條件（2 次修正）
- #5.6 簡化為 PIN gate 測試（原 GAME_INACTIVE 假設不成立）
