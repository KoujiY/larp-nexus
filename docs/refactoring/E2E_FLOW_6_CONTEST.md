# E2E Flow #6 — 對抗檢定（contest / random_contest）

> **上游索引**：本檔案為 [E2E_FLOWS_PLAN.md](./E2E_FLOWS_PLAN.md) 中 Flow #6 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/contest-flow.spec.ts`
> **關聯 flow**：
> - [E2E_FLOW_5_PLAYER_USE_SKILL.md](./E2E_FLOW_5_PLAYER_USE_SKILL.md) — 非對抗技能（基礎設施相同）
> - [E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md](./E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md) — item_take/item_steal 延遲物品選擇（姊妹檔）
> - Flow #7 — 道具操作（use / equip / showcase / transfer）

---

## ⚠ 基礎設施依賴（Blocker）

Flow #6 繼承 Flow #5 的全部基礎設施需求，**額外**增加以下：

1. **`asPlayer()` fixture** — 同 Flow #5（需支援雙 context 各自獨立 cookie jar + localStorage）
2. **`wsCapture` helper** — 同 Flow #5（需支援 channel filter，區分 attacker / defender 頻道）
3. **雙 browser context 模式**
   - 每個 test case 需要 **兩個獨立 Playwright `BrowserContext`**（非 Page）
   - 各自有獨立 cookie jar（iron-session 分離）和獨立 localStorage（解鎖狀態分離）
   - 建議在 `e2e/fixtures/dual-context.ts` 建立：
     ```ts
     async function createDualPlayerContext(browser: Browser, options: {
       attackerId: string;
       defenderId: string;
       gameId: string;
     }): Promise<{ ctxA: BrowserContext; pageA: Page; ctxB: BrowserContext; pageB: Page }>
     ```
4. **contest-tracker reset**
   - `contest-tracker.ts` 是 module-level in-memory Map，DB reset 不會清除
   - 需要新增 `/api/test/contest-tracker-reset` route 或在 `contest-tracker.ts` export `__testResetAll()`
   - `beforeEach` 必須同時呼叫 DB reset + tracker reset
5. **Seed helpers（需新增）**
   - `seedFixture.twoCharactersInActiveGame(gmUserId, { attacker: CharSpec, defender: CharSpec })` — 含 skills + items + stats
   - `seedFixture.contestSkillForCharacter(charId, skillSpec)` — 確保 `checkType` 為 contest/random_contest

**順序**：Flow #5 基礎設施 → 雙 context + tracker reset → Flow #6 spec。

---

## 設計背景

Flow #6 驗證 **「對抗檢定」的完整三階段事件閉環**（request → result → effect），是整個 E2E 套組中最複雜的 flow：

1. **雙 browser context 即時互動** — A 發動對抗，B 即時收到請求並回應
2. **三階段 WebSocket 事件序列** — `skill.contest` 的 `subType: 'request' | 'result' | 'effect'`
3. **contest / random_contest 雙路徑** — 數值型 vs 隨機型的計算差異
4. **防守方資源選擇** — 技能/道具防禦、combat tag 過濾、equipment 過濾、checkType/relatedStat 匹配
5. **三種勝負結果** — `attacker_wins` / `defender_wins` / `both_fail` 各有不同效果執行路徑
6. **contest-tracker 生命週期** — in-memory 追蹤、對抗中互鎖、結算後清除

**刻意排除**：
- **item_take / item_steal 延遲物品選擇** — 拆至 [Flow #6b](./E2E_FLOW_6B_CONTEST_ITEM_TRANSFER.md)
- **contest-tracker 3 分鐘 timeout 自動清除** — 時間依賴，E2E flaky（待查證是否可 mock timer）
- **對抗取消** — 待查證是否有 cancel API（目前僅 timeout 機制）
- **道具發動對抗**（item 的 checkType=contest）— 目前 item-use.ts 的對抗路徑與 skill-use.ts 類似但較少使用，優先測 skill 路徑
- **GM console 的對抗事件顯示** — 拆至 GM 側 flow

---

## 範圍定義

### 測
- `checkType='contest'` 技能 happy path：發動 → 不防禦 → attacker_wins → 效果執行（#6.1）
- 技能防禦 + attacker_wins + **combat tag 過濾**：defender 選技能回應，列表過濾驗證（#6.2）
- 道具防禦 + defender_wins + **combat tag + equipment 過濾**：defender 選道具回應，列表過濾驗證（#6.3）
- `checkType='random_contest'` + both_fail（tieResolution）：隨機骰 + 平手處理（#6.4）
- 單選限制 + 道具/技能互斥切換（#6.5）
- 隱匿標籤（stealth tag）+ item source 確認（#6.6）

### 不測（延後/排除/橫切）
| 項目 | 狀態 | 去處 |
|---|---|---|
| `item_take` / `item_steal` 延遲物品選擇 | 橫切 | Flow #6b |
| contest-tracker 3 分鐘 timeout | 延後 | 時間依賴，待查證 |
| 對抗取消 (cancel) | 延後 | 待查證 API 是否存在 |
| 道具發動對抗（item checkType=contest）| 延後 | 低優先 |
| GM console 對抗事件顯示 | 橫切 | GM 側 flow |
| 多 attacker 同時對同一 defender | 延後 | 並發 edge case |
| 防守方使用物品+技能混搭 | 排除 | UI 設計為互斥（items OR skills） |

---

## Test Case 獨立性設計

| Case | 獨立 seed | 雙 context | Game 狀態 |
|---|---|---|---|
| #6.1 happy path（contest + 不防禦）| 2 角色 + 1 攻擊技能 | ✅ | active |
| #6.2 技能防禦 + attacker_wins | 2 角色 + 1 攻擊技能 + 2 防禦技能（combat/non-combat）| ✅ | active |
| #6.3 道具防禦 + defender_wins | 2 角色 + 1 攻擊技能 + 3 防禦道具（tool+combat / tool-no-combat / equipment）| ✅ | active |
| #6.4 random_contest + both_fail | 2 角色 + 1 攻擊技能（random_contest, tieResolution=both_fail）| ✅ | active |
| #6.5 單選限制 + 互斥切換 | 2 角色 + 1 攻擊技能 + 2 防禦道具 + 2 防禦技能 | ✅ | active |
| #6.6 隱匿標籤 | 2 角色 + 1 攻擊技能（tags=['stealth']）| ✅ | active |

**原則**：每個 case 用獨立 seed-fixture 組合。所有 case 的 `asPlayer` 預設 `fullAccess=true`。`contest-tracker` 於 `beforeEach` 完全 reset。

---

## 共用規格

### URL 模式
- 玩家角色卡頁：`/characters/{characterId}`
- 無獨立對抗路由（ContestResponseDialog 是 CharacterCardView 內的 modal）

### 關鍵 Selectors

```ts
// CharacterCardView tabs
const tabSkills = (page: Page) => page.getByRole('tab', { name: '技能' });

// SkillCard
const skillCard = (page: Page, skillId: string) => page.getByTestId(`skill-card-${skillId}`);

// SkillDetailDialog (Bottom Sheet) — attacker 側
const skillSheet = (page: Page) => page.getByRole('dialog', { name: /技能/ });
const targetCharSelect = (page: Page) => skillSheet(page).getByLabel('目標角色');
const useSkillBtn = (page: Page) => skillSheet(page).getByRole('button', { name: '使用技能' });

// ContestResponseDialog — defender 側
const contestDialog = (page: Page) => page.getByRole('dialog', { name: /對抗/ });
const contestRespondBtn = (page: Page) => contestDialog(page).getByRole('button', { name: '回應' });
const contestNoDefenseBtn = (page: Page) => contestDialog(page).getByRole('button', { name: /不使用|直接回應/ });

// 防禦資源選擇 — ContestResponseDialog 內
const defenseItemCheckbox = (page: Page, itemId: string) =>
  contestDialog(page).getByTestId(`defense-item-${itemId}`);
const defenseSkillCheckbox = (page: Page, skillId: string) =>
  contestDialog(page).getByTestId(`defense-skill-${skillId}`);
```

### Helpers

```ts
// 等待 skill.contest 特定 subType
async function waitForContestEvent(
  wsCapture: WsCapture,
  characterId: string,
  subType: 'request' | 'result' | 'effect',
  timeoutMs = 5000
) {
  return wsCapture.waitFor(
    `character-${characterId}`,
    'skill.contest',
    timeoutMs,
    (payload) => payload.subType === subType
  );
}

// 直接從 runtime 讀角色
async function loadRuntimeChar(gameId: string, charId: string) {
  return GameRuntimeModel
    .findOne({ gameId })
    .lean()
    .then(r => r?.characters?.find(c => c._id === charId));
}

// 對比 baseline（驗證隔離）
async function loadBaselineChar(charId: string) {
  return CharacterModel.findById(charId).lean();
}

// 驗證 contest-tracker 已清除
async function assertContestCleared(contestId: string) {
  const response = await fetch('/api/test/contest-tracker-status');
  const data = await response.json();
  expect(data.activeContests).not.toContainEqual(
    expect.objectContaining({ contestId })
  );
}
```

### contestId 格式
- `${attackerId}::${sourceId}::${timestamp}`（contest-id.ts:26）
- `parseContestId()` 返回 `{ attackerId, sourceId, timestamp }` 或 `null`

---

## #6.1 Happy path：contest + 不防禦 + attacker_wins + 效果執行

### 進入點
- Context A（attacker）：`/characters/{A_id}`
- Context B（defender）：`/characters/{B_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 80, maxValue: 100 }]
  skills: [{
    id: 'skill-strike',
    name: '重擊',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 0,
      opponentMaxSkills: 0,
      tieResolution: 'attacker_wins',
    },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -20 }],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（defender）：
  ```
  stats: [
    { key: 'str', label: '力量', value: 30, maxValue: 100 },
    { key: 'hp', label: '生命值', value: 100, maxValue: 100 },
  ]
  ```
- contest-tracker reset 完畢

### Phase A — Attacker 發動對抗

1. `asPlayer(pageA, { characterId: A, gameId, fullAccess: true })`
2. `asPlayer(pageB, { characterId: B, gameId, fullAccess: true })`
3. pageA: `goto('/characters/{A_id}')` → 點擊技能 tab → 點擊 skill-strike → 選目標 = B → 按「使用技能」
4. **斷言 — 攻擊方 UI**：顯示「已對 B 發起對抗檢定」的 toast 或狀態指示

### Phase B — Defender 收到請求並回應（不防禦）

5. pageB: 等待 `contestDialog` 出現（ContestResponseDialog 彈出）
6. **斷言 — 防守方 UI**：
   - dialog 顯示攻擊方名稱（A 的角色名）
   - dialog 顯示技能名稱（重擊）
   - `opponentMaxItems=0, opponentMaxSkills=0` → 無防禦資源列表（或顯示「此對抗不允許使用防禦資源」）
7. pageB: 點擊「直接回應」（不使用防禦）
8. **WebSocket 斷言 — request 事件**（Phase A 之後、Phase B 之前已送達 B）：
   ```ts
   const reqEvent = await waitForContestEvent(wsCaptureB, B_id, 'request');
   expect(reqEvent.subType).toBe('request');
   expect(reqEvent.attackerName).toBe('A角色名');
   expect(reqEvent.checkType).toBe('contest');
   expect(reqEvent.contestId).toMatch(/^.+::.+::\d+$/);
   ```

### Phase C — 結果計算與效果執行

9. 兩個 context 等待 `result` 事件：
   ```ts
   const [resultA, resultB] = await Promise.all([
     waitForContestEvent(wsCaptureA, A_id, 'result'),
     waitForContestEvent(wsCaptureB, B_id, 'result'),
   ]);
   ```
10. **斷言 — result 事件**：
    - `resultA.result === 'attacker_wins'`（A 力量 80 > B 力量 30）
    - `resultA.attackerValue` 和 `resultA.defenderValue` 存在且前者 > 後者
11. 等待 `effect` 事件：
    ```ts
    const effectA = await waitForContestEvent(wsCaptureA, A_id, 'effect');
    ```
12. **斷言 — effect 事件**：
    - `effectA.effectsApplied` 包含 HP 變化描述

### Phase D — DB 與 UI 最終狀態驗證

13. **DB 斷言**：
    - B 的 runtime HP = 80（原 100 - 20）
    - A 的 runtime stats 不變（效果 target=other，只改 B）
    - A 與 B 的 **baseline** stats 都不變（隔離驗證）
14. **Context A UI**：顯示對抗成功結果
15. **Context B UI**：顯示對抗失敗結果 + HP 變化
16. **contest-tracker**：`assertContestCleared(contestId)`

### Phase E — 反向驗證

17. **TARGET_IN_CONTEST**：在 tracker reset 前（需另一個 test 或在 Phase A~B 之間插入），B 嘗試使用技能 → server 回 `TARGET_IN_CONTEST`
18. **INVALID_CONTEST_ID**：B 嘗試 `respondToContest('broken::id', B_id)` → server 回 `INVALID_CONTEST_ID`
19. **重複回應**：B 嘗試對同一 contestId 再次呼叫 `respondToContest` → 因 tracker 已移除應回錯誤

---

## #6.2 技能防禦 + attacker_wins + combat tag 過濾

### 進入點
- Context A / Context B 同 #6.1

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 70, maxValue: 100 }]
  skills: [{
    id: 'skill-combat-strike',
    name: '戰鬥打擊',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 0,
      opponentMaxSkills: 1,
      tieResolution: 'attacker_wins',
    },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -15 }],
    tags: ['combat'],        // ← 攻擊方有 combat tag
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（defender）：
  ```
  stats: [
    { key: 'str', label: '力量', value: 50, maxValue: 100 },
    { key: 'hp', label: '生命值', value: 100, maxValue: 100 },
  ]
  skills: [
    {
      id: 'skill-defend-combat',
      name: '戰鬥防禦',
      checkType: 'contest',
      contestConfig: { relatedStat: 'str' },
      tags: ['combat'],       // ← 有 combat tag → 應出現在列表
      effects: [],
      usageLimit: 0,
      cooldown: 0,
    },
    {
      id: 'skill-defend-noncombat',
      name: '一般防禦',
      checkType: 'contest',
      contestConfig: { relatedStat: 'str' },
      tags: [],               // ← 無 combat tag → 不應出現在列表
      effects: [],
      usageLimit: 0,
      cooldown: 0,
    },
  ]
  ```

### Phase A — Attacker 發動對抗

1. 同 #6.1 Phase A 步驟

### Phase B — Defender 收到請求 + combat tag 過濾驗證

2. pageB: 等待 `contestDialog` 出現
3. **斷言 — combat tag 過濾**：
   - `defenseSkillCheckbox(pageB, 'skill-defend-combat')` → **可見**（有 combat tag）
   - `defenseSkillCheckbox(pageB, 'skill-defend-noncombat')` → **不可見**（無 combat tag，被 contest-response-dialog.tsx:103 過濾）
4. pageB: 選擇「戰鬥防禦」技能 → 按「回應」

### Phase C — 結果（attacker_wins）

5. A 力量 70 > B 力量 50 → `contestResult === 'attacker_wins'`
6. 等待雙方 `result` + `effect` 事件
7. **斷言 — result 事件**：
   - `result === 'attacker_wins'`
8. **斷言 — effect 事件**（attacker_wins → 執行攻擊方效果）：
   - B 的 HP 從 100 降至 85

### Phase D — DB 驗證

9. B runtime HP = 85
10. B 的 `skill-defend-combat` 的 `usageCount` += 1（防禦方使用紀錄更新，contest-respond.ts:432-470）
11. Baseline 不變

---

## #6.3 道具防禦 + defender_wins + combat tag + equipment 過濾

### 進入點
- Context A / Context B 同 #6.1

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 40, maxValue: 100 }]
  skills: [{
    id: 'skill-combat-attack',
    name: '戰鬥攻擊',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 1,
      opponentMaxSkills: 0,
      tieResolution: 'attacker_wins',
    },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -10 }],
    tags: ['combat'],
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（defender）：
  ```
  stats: [
    { key: 'str', label: '力量', value: 70, maxValue: 100 },
    { key: 'hp', label: '生命值', value: 100, maxValue: 100 },
  ]
  items: [
    {
      id: 'item-shield',
      name: '戰鬥盾牌',
      type: 'tool',
      checkType: 'contest',
      contestConfig: { relatedStat: 'str' },
      tags: ['combat'],       // ← combat + tool → 應出現在列表
      quantity: 1,
      usageLimit: 0,
      cooldown: 0,
    },
    {
      id: 'item-tool-noncombat',
      name: '偵查道具',
      type: 'tool',
      checkType: 'contest',
      contestConfig: { relatedStat: 'str' },
      tags: [],               // ← 無 combat tag → 不應出現
      quantity: 1,
      usageLimit: 0,
      cooldown: 0,
    },
    {
      id: 'item-equipment',
      name: '護甲',
      type: 'equipment',
      checkType: 'none',      // ← equipment 預設 checkType=none → 被 checkType 過濾擋掉
      tags: ['combat'],
      quantity: 1,
      equipped: true,
    },
  ]
  ```

### Phase A — Attacker 發動對抗

1. 同 #6.1 Phase A 步驟

### Phase B — Defender 收到請求 + 三層過濾驗證

2. pageB: 等待 `contestDialog` 出現
3. **斷言 — 道具列表過濾**：
   - `defenseItemCheckbox(pageB, 'item-shield')` → **可見**（type=tool, checkType=contest, 有 combat tag）
   - `defenseItemCheckbox(pageB, 'item-tool-noncombat')` → **不可見**（無 combat tag，被 contest-response-dialog.tsx:88 過濾）
   - `defenseItemCheckbox(pageB, 'item-equipment')` → **不可見**（checkType=none ≠ contest，被 contest-response-dialog.tsx:89 過濾）
4. **此斷言同時驗證**：
   - combat tag 過濾（`attackerHasCombatTag && !item.tags.includes('combat')`）
   - equipment 隱式過濾（`item.checkType !== attackerCheckType` → 'none' ≠ 'contest'）
5. pageB: 選擇「戰鬥盾牌」→ 按「回應」

### Phase C — 結果（defender_wins）

6. A 力量 40 < B 力量 70 → `contestResult === 'defender_wins'`
7. 等待雙方 `result` 事件
8. **斷言 — result 事件**：
   - `result === 'defender_wins'`
9. **斷言 — effect 不執行**：
   - `defender_wins` 時，攻擊方的 `stat_change` 效果**不執行**
   - B 的 HP 維持 100（不變）

### Phase D — DB 驗證

10. B runtime HP = 100（不變，因為 defender_wins → 攻擊方效果不執行）
11. A runtime stats 不變
12. Baseline 不變

---

## #6.4 random_contest + both_fail（tieResolution）

### 進入點
- Context A / Context B 同 #6.1

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'hp', label: '生命值', value: 100, maxValue: 100 }]
  skills: [{
    id: 'skill-gamble',
    name: '賭運',
    checkType: 'random_contest',
    contestConfig: {
      opponentMaxItems: 0,
      opponentMaxSkills: 0,
      tieResolution: 'both_fail',
    },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -30 }],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（defender）：
  ```
  stats: [{ key: 'hp', label: '生命值', value: 100, maxValue: 100 }]
  ```

### Phase A — Attacker 發動 random_contest

1. 同 #6.1 Phase A 步驟
2. **斷言 — request 事件**：
   - `reqEvent.checkType === 'random_contest'`
   - `reqEvent.attackerValue === 0`（random_contest 隱匿攻擊方骰值）

### Phase B — Defender 回應（不防禦）

3. pageB: 等待 `contestDialog` 出現 → 按「直接回應」
4. 等待雙方 `result` 事件

### Phase C — 結果驗證（可能是任意結果，但驗證 both_fail 路徑）

> **注意**：random_contest 的結果不可控（雙方隨機骰）。此 case 主要驗證：
> (1) random_contest 事件序列完整
> (2) result payload 結構正確
> (3) tieResolution 欄位被傳遞

5. **斷言 — result 事件結構**：
   ```ts
   expect(resultA.checkType).toBe('random_contest');
   expect(resultA.attackerValue).toBeGreaterThanOrEqual(0);
   expect(resultA.defenderValue).toBeGreaterThanOrEqual(0);
   expect(['attacker_wins', 'defender_wins', 'both_fail']).toContain(resultA.result);
   ```
6. **條件斷言 — 根據實際結果分支**：
   ```ts
   if (resultA.result === 'attacker_wins') {
     // B 的 HP 應減少 30
     const bRuntime = await loadRuntimeChar(gameId, B_id);
     expect(bRuntime.stats.find(s => s.key === 'hp').value).toBe(70);
   } else if (resultA.result === 'defender_wins') {
     // 效果不執行，B HP 不變
     const bRuntime = await loadRuntimeChar(gameId, B_id);
     expect(bRuntime.stats.find(s => s.key === 'hp').value).toBe(100);
   } else {
     // both_fail：效果不執行
     const bRuntime = await loadRuntimeChar(gameId, B_id);
     expect(bRuntime.stats.find(s => s.key === 'hp').value).toBe(100);
   }
   ```

### Phase D — Baseline 隔離

7. A 與 B 的 baseline stats 都不變

---

## #6.5 單選限制 + 道具/技能互斥切換

### 進入點
- Context A / Context B 同 #6.1

### 設計說明
對抗回應 Dialog 的選擇行為為**單選設計**：
- 道具和技能互為互斥類別（只能選其中一類）
- 同一類別內只能選 1 個（選中後其他同類選項 disabled）
- 切換類別需先取消當前選擇，而非自動清空

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 60, maxValue: 100 }]
  skills: [{
    id: 'skill-flex-contest',
    name: '彈性對抗',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 1,
      opponentMaxSkills: 1,
      tieResolution: 'attacker_wins',
    },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -10 }],
    tags: [],                   // ← 無 combat tag → 防禦方不需要 combat tag
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（defender）：
  ```
  stats: [
    { key: 'str', label: '力量', value: 50, maxValue: 100 },
    { key: 'hp', label: '生命值', value: 100, maxValue: 100 },
  ]
  items: [
    { id: 'item-d1', name: '防具一', type: 'tool', checkType: 'contest', contestConfig: { relatedStat: 'str' }, tags: [], quantity: 1 },
    { id: 'item-d2', name: '防具二', type: 'tool', checkType: 'contest', contestConfig: { relatedStat: 'str' }, tags: [], quantity: 1 },
  ]
  skills: [
    { id: 'skill-d1', name: '防禦技一', checkType: 'contest', contestConfig: { relatedStat: 'str' }, tags: [], effects: [], usageLimit: 0, cooldown: 0 },
    { id: 'skill-d2', name: '防禦技二', checkType: 'contest', contestConfig: { relatedStat: 'str' }, tags: [], effects: [], usageLimit: 0, cooldown: 0 },
  ]
  ```

### Phase A — Attacker 發動對抗

1. 同 #6.1 Phase A 步驟

### Phase B — 單選限制與互斥驗證

2. pageB: 等待 `contestDialog` 出現
3. **斷言 — 兩個道具和兩個技能全部可見**（無 combat tag 限制，checkType 皆匹配）

4. **測試道具單選**：
   - 選 `item-d1` ✅ → 按鈕變為「確認回應」
   - **斷言**：`item-d2` disabled（視覺 opacity 降低，無法點擊）
   - **斷言**：兩個技能都 disabled（跨類別互斥）

5. **測試取消選擇 + 切換類別**：
   - 再次點擊 `item-d1` → 取消勾選 → 按鈕恢復為「使用基礎數值回應」
   - 所有選項回到可點擊狀態
   - 選 `skill-d1` ✅ → 按鈕變為「確認回應」
   - **斷言**：`skill-d2` disabled
   - **斷言**：兩個道具都 disabled

6. pageB: 保持 skill-d1 選中 → 按「確認回應」

### Phase C — 結果驗證

7. 等待 result + effect 事件（A 力量 60 > B 力量 50 → attacker_wins）
8. B 的 HP = 90（100 - 10）
9. B 的 `skill-d1` 應有 lastUsedAt（使用紀錄更新）

---

## #6.6 隱匿標籤（stealth tag）+ item source 確認

### 進入點
- Context A / Context B 同 #6.1

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 60, maxValue: 100 }]
  skills: [{
    id: 'skill-stealth-strike',
    name: '暗殺',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 0,
      opponentMaxSkills: 0,
      tieResolution: 'attacker_wins',
    },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -25 }],
    tags: ['stealth'],         // ← 隱匿標籤
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（defender）：
  ```
  stats: [
    { key: 'str', label: '力量', value: 40, maxValue: 100 },
    { key: 'hp', label: '生命值', value: 100, maxValue: 100 },
  ]
  ```

### Phase A — Attacker 發動隱匿對抗

1. 同 #6.1 Phase A 步驟

### Phase B — Defender 收到請求 + 隱匿驗證

2. pageB: 等待 `contestDialog` 出現
3. **斷言 — 隱匿標籤效果**：
   - request 事件中 `sourceHasStealthTag === true`
   - defender 側 UI **不顯示攻擊方角色名**（或顯示為「???」/「未知」）
   - defender 側 UI **不顯示技能名稱**（或顯示為隱匿提示）
4. pageB: 按「直接回應」

### Phase C — 結果 + 效果

5. A 力量 60 > B 力量 40 → `attacker_wins`
6. 等待 result + effect 事件
7. **斷言 — stealth 在 result/effect 事件中**：
   - `character.affected` 事件的 `sourceCharacterName` 為空字串（shared-effect-executor.ts:223 `hasStealthTag ? '' : sourceCharacterName`）

### Phase D — DB 驗證

8. B runtime HP = 75（100 - 25）
9. Baseline 不變

---

## 跨 Case 陷阱（Cross-case Pitfalls）

1. **contest-tracker 是 module-level in-memory**：`db-fixture` reset **不會**清 tracker。每個 case 的 `beforeEach` 必須同時呼叫 DB reset + `/api/test/contest-tracker-reset`。遺留的 tracker 會讓下一個 case 的 `useSkill` 回 `USER_IN_CONTEST`

2. **雙 context 的 iron-session 必須分開**：Playwright 的 `browser.newContext()` 才會開新 cookie jar。用 `page.context().storageState` 複製會導致 session 共用。建議 `createDualPlayerContext` fixture 內部用 `browser.newContext()` 建立兩個完全獨立的 context

3. **Runtime character `_id` ≠ Baseline `_id`**：contest-tracker 用 Baseline ID（`getBaselineCharacterId()` 在 contest-respond.ts:68-69）。斷言 tracker 狀態時要用 baseline id

4. **三階段事件順序**：`request → result → effect` 在同一 test 內可能因 stub Pusher 微延遲而亂序。`waitForContestEvent` 必須接受「從訂閱時間之後的第一筆匹配」邏輯，而非假設嚴格順序到達

5. **random_contest 結果不可控**（#6.4）：不能硬斷言 `attacker_wins` 或 `defender_wins`。用 `if/else` 條件斷言或 retry（但 retry 會 flaky）。最穩做法是只斷言事件結構正確 + DB 變化與結果一致

6. **combat tag 過濾是條件性的**：只有 attacker 有 combat tag 時才檢查 defender 的 combat tag。#6.1/#6.4/#6.5 的 attacker 無 combat tag → defender 的任何技能/道具都可用

7. **equipment 過濾是隱式的**：沒有顯式 `type === 'equipment'` 判斷，而是透過 `checkType !== attackerCheckType`（'none' ≠ 'contest'）過濾。若 GM 手動設 equipment 的 checkType 為 contest，裝備就會穿透過濾。E2E 只驗證正常 seed 行為

8. **opponentMaxItems/Skills 預設 0**：預設值代表「不允許」，不是「無限」。#6.1 的 seed 明確設為 0 以驗證此行為

9. **防禦資源選擇為單選設計**：道具與技能互為互斥類別，且同類內只能選 1 個。選中一項後，同類其他選項和跨類選項都 disabled。切換需先取消當前選擇。#6.5 專門驗證此行為

10. **wsCapture 必須區分頻道**：兩個 context 各自訂閱 `private-character-{A}` 與 `private-character-{B}`，helper 需支援 channel filter 參數。`waitForContestEvent` 用 characterId 定位頻道
