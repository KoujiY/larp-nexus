# E2E Flow #5 — Player 使用技能（非對抗、非 item 轉移）

> **上游索引**：本檔案為 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 中 Flow #5 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/player-use-skill.spec.ts`
> **關聯 flow**：
> - [E2E_FLOW_2_PLAYER_PIN.md](./E2E_FLOW_2_PLAYER_PIN.md) — 玩家 PIN unlock 上游（提供 `fullAccess=true` 的前置）
> - [E2E_FLOW_6_CONTEST.md](./E2E_FLOW_6_CONTEST.md) — 對抗 (contest) 技能完整閉環
> - [E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md](./E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md) — item_take/item_steal 延遲選擇（對抗 #6b.1/#6b.2 + 非對抗 #6b.3）

---

## ⚠ 基礎設施依賴（Blocker）

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
- 授權拒絕（非擁有者）+ game inactive 拒絕（#5.6）

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
| #5.6 授權與錯誤 | 2 角色（不同玩家）+ 1 skill；+ 1 inactive game 對照組 | mixed |

**原則**：每個 case 用獨立 seed-fixture 組合，避免互相污染。所有 case 的 asPlayer 預設 `fullAccess=true` 除 #5.5 有明確 readOnly 步驟。

---

## 共用規格

### URL 模式
- 玩家角色卡頁：`/characters/{characterId}`
- 無獨立技能路由（技能 tab 是 CharacterCardView 內的 tab）

### 關鍵 Selectors

```ts
// CharacterCardView tabs
const tabSkills = page.getByRole('tab', { name: '技能' });

// SkillCard（list 中的單一卡片）
const skillCard = (skillId: string) => page.getByTestId(`skill-card-${skillId}`);
const skillCardDisabled = (skillId: string) =>
  skillCard(skillId).getByTestId('skill-disabled-reason'); // tooltip 或 badge

// SkillDetailDialog (Bottom Sheet)
const skillSheet = page.getByRole('dialog', { name: /技能/ });
const skillNameInSheet = skillSheet.getByTestId('skill-name');
const targetCharSelect = skillSheet.getByLabel('目標角色');
const useSkillBtn = skillSheet.getByRole('button', { name: '使用技能' });
const checkResultDisplay = skillSheet.getByTestId('check-result');
```

### Helpers

```ts
// 等待 skill.used 事件並回傳 payload
async function waitForSkillUsed(
  wsCapture: WsCapture,
  characterId: string,
  skillId: string
) {
  return wsCapture.waitFor(`character-${characterId}`, 'skill.used', 3000);
}

// 直接從 runtime 讀角色（Flow #5 全程 active game，斷言改對 Runtime）
async function loadRuntimeChar(gameId: string, charId: string) {
  return GameRuntimeModel
    .findOne({ gameId })
    .lean()
    .then(r => r?.characters?.find(c => c._id === charId));
}

// 對比 baseline 與 runtime（檢驗隔離）
async function loadBaselineChar(charId: string) {
  return CharacterModel.findById(charId).lean();
}
```

### Seed helpers（需新增）
- `seedFixture.skillForCharacter(charId, skillSpec)` — 直接寫入 `character.baselineData.skills`
- `seedFixture.activeGameWithCharacter(gmUserId, charSpec, skillSpecs)` — 一次 seed 完整 active game 場景
- `seedFixture.twoCharactersInActiveGame(gmUserId, specs)` — #5.2/#5.3/#5.6 需要的雙角色 seed

---

## #5.1 Happy path：checkType=none + stat_change self + baseline/runtime 隔離

### 進入點
- 角色：Player（`asPlayer(page, { characterId: A, gameId, fullAccess: true })`）
- URL：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 1 角色 A：`baselineData.stats = [{ key: 'hp', label: '生命值', value: 50, maxValue: 100 }]`
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
      targetStat: 'hp',
      amount: 20,
      duration: 0,  // 永久
    }]
  }
  ```

### 操作步驟

**Phase A — 進入技能 tab**
1. `asPlayer(page, { characterId: A, gameId, fullAccess: true })`
2. `page.goto('/characters/{A_id}')`
3. 等待角色卡 render 完成
4. `tabSkills.click()`
5. 斷言：`skillCard('skill-heal')` 可見、**未** disabled

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
15. `const skillUsedEvent = await waitForSkillUsed(wsCapture, A_id, 'skill-heal')`
16. 斷言：`skillUsedEvent.skillName === '小治療'`
17. 斷言：`skillUsedEvent.checkType === 'none'`
18. 斷言：`skillUsedEvent.checkPassed === true`
19. 斷言：`skillUsedEvent.effectsApplied` 含 `stat_change { targetStat: 'hp', amount: 20 }`
20. 斷言：`role.updated` 事件也在 `character-${A_id}` channel 出現，payload 含 `updates.stats` 包含 hp=70

**Phase E — Runtime 寫入斷言**
21. `const runtime = await loadRuntimeChar(gameId, A_id)`
22. 斷言：`runtime.stats.find(s => s.key === 'hp').value === 70`
23. 斷言：`runtime.skills[0].usageCount === 1`（因 usageLimit=0，此欄位可能未 track，需確認實作）
24. 斷言：`runtime.skills[0].lastUsedAt` 已設定（Date 物件）

**Phase F — Baseline 隔離斷言（關鍵！）**
25. `const baseline = await loadBaselineChar(A_id)`
26. 斷言：`baseline.baselineData.stats.find(s => s.key === 'hp').value === 50`（**未變**）
27. 斷言：`baseline.baselineData.skills[0].lastUsedAt === undefined`（**未變**）

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
- 角色 A + 角色 B，B 有 `stats: [{ key: 'hp', value: 50, maxValue: 100 }]`
- Skill on A：
  ```
  {
    id: 'skill-bolt',
    name: '閃電箭',
    checkType: 'random',
    randomConfig: { sides: 20, successThreshold: 11 },  // 1d20 ≥ 11 成功
    usageLimit: 0,
    cooldown: 0,
    effects: [{
      type: 'stat_change',
      targetType: 'other',
      targetStat: 'hp',
      amount: -15,  // 扣血
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
    { type: 'stat_change', targetType: 'self', targetStat: 'mp', amount: -10 },
    { type: 'stat_change', targetType: 'other', targetStat: 'hp', amount: -20 },
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
- Skill：`skill-buff` — checkType=none, effects=[{ type: 'stat_change', targetType: 'self', targetStat: 'str', amount: 5, duration: 60 }]

### 操作步驟

**Phase A — readOnly 遮蔽互動（fullAccess=false）**
1. `asPlayer(page, { characterId, gameId, fullAccess: false })`（純 PIN 預覽模式）
2. `goto('/characters/{id}')` → `tabSkills.click()`
3. 斷言：`skillCard('skill-buff')` 可見
4. 點擊 → 斷言：Sheet **不開啟** 或 Sheet 開啟但 `useSkillBtn` disabled 顯示「預覽模式」tooltip
5. 若 Sheet 有開啟，關閉 Sheet

**Phase B — 切換到 fullAccess=true**
6. `asPlayer(page, { characterId, gameId, fullAccess: true })`（同 page，更新 cookie + localStorage）
7. `page.reload()`
8. `tabSkills.click()` → `skillCard('skill-buff').click()` → `useSkillBtn.click()`

**Phase C — TemporaryEffect 斷言**
9. 等待 `skill.used` 事件
10. `const runtime = await loadRuntimeChar(gameId, charId)`
11. 斷言：`runtime.stats.str.value += 5`
12. 斷言：`runtime.temporaryEffects` 陣列出現一個新 record：
    ```
    { targetStat: 'str', delta: 5, expiresAt: <now + 60s>, sourceSkillId: 'skill-buff' }
    ```
13. **不驗證** 過期行為（延後）

### 已知陷阱
- **`asPlayer` 切換模式需同時更新 session + localStorage**：單純切 cookie 不夠，CharacterCardView 讀的是 localStorage
- **`page.reload()` 後的 hydration**：readOnly 狀態是 useEffect 讀 localStorage 得出的，reload 後必須等 hydration 完成才能斷言 UI
- **TemporaryEffect 儲存位置**：可能在 `runtime.temporaryEffects` 陣列或獨立 collection（`TemporaryEffectModel`），需先讀 `lib/effects/create-temporary-effect.ts` 確認

---

## #5.6 授權與錯誤處理

### 進入點
- Player（A），但操作對象為 B

### 前置 seed
- **Seed #1**：active game G1 + 角色 A（owner: player-1）+ 角色 B（owner: player-2）
- **Seed #2**：inactive game G2 + 角色 C（owner: player-1）+ skill on C

### 操作步驟

**Phase A — 非擁有者使用別人的技能**
1. `asPlayer(page, { characterId: A, gameId: G1 })`（登入為 player-1，擁有 A）
2. 嘗試透過 `page.evaluate(() => executeSkillAction({ characterId: B_id, skillId: ... }))` 使用 B 的技能
3. 斷言：server 回 `{ success: false, error: /UNAUTHORIZED|FORBIDDEN/ }`
4. 斷言：`loadRuntimeChar(B)` 的 stats 未變

**Phase B — game inactive 下使用技能**
5. `asPlayer(page, { characterId: C, gameId: G2 })`（登入為 player-1，擁有 C，但 G2 inactive）
6. `goto('/characters/{C_id}')` → `tabSkills.click()`
7. 斷言：技能 tab 的行為——**可能** 顯示 skillCard 但點擊後 server 拒絕，**或** UI 層直接隱藏按鈕（依實作）
8. 透過 `page.evaluate` 直接呼叫 server action
9. 斷言：server 回 `{ success: false, error: /GAME_INACTIVE/ }`

### 已知陷阱
- **繞 UI 呼叫 server action 的 harness**：需有 `window.__E2E_HARNESS__` 暴露 server action，或直接 `fetch('/api/...')`。此 harness 的設計需在 infra 階段定案
- **inactive game 下玩家端的 UI 行為不一致**：CharacterCardView 可能允許進入技能 tab 但技能本身無法使用（readOnly 類似行為），也可能 redirect。spec 必須先讀實作決定斷言寫法
- **`UNAUTHORIZED` vs `FORBIDDEN` vs `NOT_OWNER`**：error code 字串需讀 `skill-use.ts:41` 的 `validatePlayerAccess` 確定實際值

---

## 跨 Case 已知陷阱

### 陷阱 #1：baseline/runtime 隔離是 Flow #5 的核心價值
Flow #5 全程在 active game 下跑，所有 stats/skills 寫入都應該進 runtime。**每個 case 必須至少一次** 斷言 baseline 未變動（#5.1 Phase F 已示範），這是證明「#4 是 inactive / #5 是 active」分工有效的唯一手段。若某 case 忘記 baseline 對照，等於沒驗證隔離。

### 陷阱 #2：contest 技能刻意不在 Flow #5
若有人誤把 `checkType='contest'` 技能加進 seed，並斷言「使用後 stats 變動」——會 fail，因為 `skill-use.ts:237` 提早 return，effects 未執行。Flow #5 的所有 seed 必須 `checkType ∈ { 'none', 'random' }`，**禁止** 出現 contest。

### 陷阱 #3：item_take / item_steal 刻意不在 Flow #5
同上原則。若 seed 出現 item_take 且 checkPassed=true 且 targetItemId 未給 → server 回 `needsTargetItemSelection`，Flow #5 沒有處理 TargetItemSelectionDialog 的 helper。禁止在 Flow #5 seed 使用這兩種 effect。完整覆蓋見 Flow #6b（#6b.1/#6b.2 對抗路徑、#6b.3 非對抗路徑）。

### 陷阱 #4：`wsCapture.clear()` 必須在每次 action 前呼叫
Stub Pusher 是 global event bus，事件會累積。若 `waitFor('skill.used')` 前沒 clear，可能拿到上一個 case 的殘留事件。**習慣性在每個操作 Phase 開頭 clear**。

### 陷阱 #5：`runtime` 文件初始化時機
`getCharacterData` 在 active game 第一次呼叫時會複製 baseline → runtime。這意味 `loadRuntimeChar` 在技能**未使用前** 可能回 null。斷言 runtime 必須在**使用後**。

### 陷阱 #6：`lastUsedAt` 的 Date 序列化
MongoDB 的 Date 在 `.lean()` 後是 Date 物件，但透過 WebSocket 傳到 browser 會變 ISO string。斷言 runtime 用 `instanceof Date`，斷言事件 payload 用 `typeof 'string'`。

### 陷阱 #7：`role.updated` vs `character.affected` 的 channel 差異
- `role.updated`：通常發在「當事角色」的 channel（GM console 聽）
- `character.affected`：發在「被影響角色」的 channel（該玩家聽）
這兩個常混淆。Flow #5 的斷言必須明確指定 channel。

### 陷阱 #8：`asPlayer` fixture 是 blocker
`asPlayer()` fixture 在本 flow 撰寫時**尚不存在**。若實作 spec 時跳過這一步直接用 cookie 設定，會遇到 localStorage 缺失導致 CharacterCardView 的 `isReadOnly` 判斷錯誤。**必須先實作 fixture 再寫 spec**。

---

## Fixture 需求

### 新增（blocker）
- `e2e/fixtures/as-player.ts` — `asPlayer(page, options)` fixture
- `e2e/fixtures/ws-capture.ts` — `captureWsEvents(page)` helper 含 `waitFor / clear / assertEmitted / getAll`
- `seedFixture.activeGameWithCharacter(gmUserId, charSpec, skillSpecs)`
- `seedFixture.twoCharactersInActiveGame(gmUserId, specs)`
- `seedFixture.skillForCharacter(charId, skillSpec)`
- `loadRuntimeChar(gameId, charId)` helper
- `loadBaselineChar(charId)` helper

### 新增（非 blocker，優化）
- `window.__E2E_HARNESS__.executeSkillAction(...)` — 繞 UI 呼叫 server action（用於注入 `checkResult` 與錯誤測試）

### 複用
- `seedFixture.gameForGm` 需支援 `isActive: true` 參數
- Stub Pusher + SSE IPC（已備妥）

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

## 實作順序建議

1. **先實作 fixtures**（`asPlayer`、`wsCapture`、active game seed helpers）
2. **#5.1 先跑通**：最簡單的 self-target happy path，也是 baseline/runtime 隔離驗證的示範 case
3. **#5.6 次之**：驗證授權層，這是每個後續 case 的前提（若 authz 壞了，後面全錯）
4. **#5.4 限制條件**：seed 變化少，適合建立 `server-action-harness` helper
5. **#5.2 跨角色 + random**：加入 `checkResult` 注入機制
6. **#5.3 多 effect**：複雜 seed，最後寫
7. **#5.5 readOnly + TemporaryEffect**：需要 asPlayer 切換模式的 helper 成熟後再寫
