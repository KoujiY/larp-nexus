# E2E Flow #7 — 道具操作（use / equip / showcase / transfer）

> **上游索引**：本檔案為 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 中 Flow #7 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/item-operations.spec.ts`
> **關聯 flow**：
> - [e2e_flow_5_player_use_skill.md](./e2e_flow_5_player_use_skill.md) — 技能使用（共用基礎設施 + 類似效果管線）
> - [e2e_flow_6_contest.md](./e2e_flow_6_contest.md) — 對抗檢定（道具的 contest 路徑由 Flow #6 覆蓋）
> - [e2e_flow_6b_contest_item_transfer.md](./e2e_flow_6b_contest_item_transfer.md) — item_take/steal 延遲選擇（對抗 + 非對抗）

---

## ⚠ 基礎設施依賴（Blocker）

繼承 Flow #5 的全部基礎設施（`asPlayer()` fixture、`wsCapture` helper、active game seed），無額外 blocker。

雙 context case（#7.4 showcase、#7.5 transfer）可複用 Flow #6 的 `createDualPlayerContext` fixture。

---

## 設計背景

Flow #7 驗證**四種道具操作**的完整閉環：

1. **Use（使用）** — 消耗品觸發效果 → quantity 遞減 → runtime 寫入 → `item.used` 事件
2. **Equip/Unequip（裝備穿脫）** — 裝備 toggle → stat boost `$inc` 原子更新 → `equipment.toggled` 事件
3. **Showcase（展示）** — 展示給其他角色 → receiver 唯讀 dialog → `viewedItems` 記錄 → `item.showcased` 事件
4. **Transfer（轉移）** — 主動贈送 → `isTransferable` 守門 → quantity 部分/全量轉移 → `item.transferred` 事件

**關鍵設計細節**：
- 消耗品 quantity=0 後**不會被刪除**，仍顯示為「耗盡」狀態
- 裝備用 `$inc` + `arrayFilters` 原子更新，非 `$set`（防並發 lost-write）
- 展示只傳送安全欄位（name/description/type/quantity/tags），隱藏 effects/checkType/statBoosts
- 轉移 equipment 時自動 `equipped: false`（卸除後轉移）

**刻意排除**：
- **道具的 contest/random_contest 路徑** — Flow #6 已覆蓋
- **非對抗 item_take/item_steal 延遲選擇**（`selectTargetItemAfterUse`）— 已在 **Flow #6b #6b.3** 覆蓋。#6b.3 測試技能入口（skill-use.ts:266）的完整流程；道具入口（item-use.ts:295）共用同一 server action，差異（consumable quantity 預扣）由 unit test 覆蓋
- **`$inc` 並發 race condition** — 超出 smoke 範圍，留給 property-test
- **recordItemView 自身查看** — auto-reveal 觸發屬 Flow #10
- **Equipment effects panel 顯示** — 純 display，unit test 足夠
- **TemporaryEffect 過期** — 時間依賴，延後
- **Auto-reveal 觸發**（showcase/transfer 後的自動揭露）— Flow #10

---

## 範圍定義

### 測
- consumable self-target + stat_change + quantity 遞減 + baseline/runtime 隔離（#7.1）
- consumable cross-target + `checkType='random'` pass/fail 雙分支（#7.2）
- equipment equip/unequip toggle + stat boost apply/revert + Maximum Value Recovery Rule（#7.3）
- showcase + receiver readonly dialog + viewedItems 記錄 + 安全欄位驗證（#7.4）
- transfer + isTransferable + partial quantity + equipment auto-unequip（#7.5）
- usageLimit + cooldown 雙層守門 + readOnly 隱藏按鈕 + error 拒絕（#7.6）

### 不測（延後/排除/橫切）
| 項目 | 狀態 | 去處 |
|---|---|---|
| `checkType='contest'/'random_contest'` 道具 | 排除 | Flow #6 |
| 非對抗 item_take/item_steal 延遲選擇（技能或道具觸發）| 已覆蓋 | Flow #6b #6b.3（技能入口）；道具入口差異由 unit test 覆蓋 |
| `$inc` 並發 race condition | 排除 | property-test |
| recordItemView 自身查看 + auto-reveal | 橫切 | Flow #10 |
| Equipment effects panel 顯示 | 延後 | unit test |
| TemporaryEffect 過期 | 延後 | 時間依賴 |
| ItemCard cooldown countdown 動畫 | 排除 | UI 動畫斷言 flaky |

---

## Test Case 獨立性設計

| Case | 獨立 seed | 雙 context | Game 狀態 |
|---|---|---|---|
| #7.1 Item Use self-target | 1 角色 + 1 消耗品（stat_change self）| ❌ | active |
| #7.2 Item Use cross-target + random | 2 角色 + 1 消耗品（stat_change other, random check）| ❌（server action 直接呼叫）| active |
| #7.3 Equip/Unequip toggle | 1 角色 + 1 裝備（多 statBoost）| ❌ | active |
| #7.4 Showcase | 2 角色 + 1 道具 | ✅ | active |
| #7.5 Transfer | 2 角色 + 2 道具（transferable + equipment）| ✅ | active |
| #7.6 Limits + errors | 1 角色 + 3 道具（limited / cooldown / equipment）| ❌ | active |

**原則**：每個 case 獨立 seed。`asPlayer` 預設 `fullAccess=true`。

---

## 共用規格

### URL 模式
- 玩家角色卡頁：`/characters/{characterId}`
- 道具 tab 在 CharacterCardView 內

### 關鍵 Selectors

```ts
// CharacterCardView tabs
const tabItems = (page: Page) => page.getByRole('tab', { name: '道具' });

// ItemCard
const itemCard = (page: Page, itemId: string) => page.getByTestId(`item-card-${itemId}`);

// ItemDetailDialog (Bottom Sheet)
const itemSheet = (page: Page) => page.getByRole('dialog', { name: /道具/ });
const useItemBtn = (page: Page) => itemSheet(page).getByRole('button', { name: '使用' });
const targetCharSelect = (page: Page) => itemSheet(page).getByLabel('目標角色');

// Equip button (in ItemDetailDialog or ItemCard)
const equipBtn = (page: Page) => page.getByRole('button', { name: /裝備|卸除/ });

// Showcase + Transfer buttons (in ItemDetailDialog)
const showcaseBtn = (page: Page) => itemSheet(page).getByRole('button', { name: '展示' });
const transferBtn = (page: Page) => itemSheet(page).getByRole('button', { name: '轉移' });

// ItemShowcaseDialog (receiver side)
const showcaseDialog = (page: Page) => page.getByRole('dialog', { name: /展示/ });

// Disabled reason badge
const itemDisabledBadge = (page: Page, itemId: string) =>
  itemCard(page, itemId).getByTestId('item-disabled-reason');
```

### Helpers

```ts
// 等待 item.used 事件
async function waitForItemUsed(
  wsCapture: WsCapture,
  characterId: string,
  timeoutMs = 3000
) {
  return wsCapture.waitFor(`character-${characterId}`, 'item.used', timeoutMs);
}

// 等待 equipment.toggled 事件
async function waitForEquipToggled(
  wsCapture: WsCapture,
  characterId: string,
  timeoutMs = 3000
) {
  return wsCapture.waitFor(`character-${characterId}`, 'equipment.toggled', timeoutMs);
}

// 等待 item.showcased 事件
async function waitForItemShowcased(
  wsCapture: WsCapture,
  characterId: string,
  timeoutMs = 3000
) {
  return wsCapture.waitFor(`character-${characterId}`, 'item.showcased', timeoutMs);
}

// 等待 item.transferred 事件
async function waitForItemTransferred(
  wsCapture: WsCapture,
  characterId: string,
  timeoutMs = 3000
) {
  return wsCapture.waitFor(`character-${characterId}`, 'item.transferred', timeoutMs);
}

// Runtime / Baseline 讀取（同 Flow #5）
async function loadRuntimeChar(gameId: string, charId: string) { /* ... */ }
async function loadBaselineChar(charId: string) { /* ... */ }
```

---

## #7.1 Item Use happy path：consumable self-target + stat_change + quantity 遞減

### 進入點
- 角色 A：Player（`asPlayer(page, { characterId: A, gameId, fullAccess: true })`）
- URL：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  stats: [{ key: 'hp', label: '生命值', value: 50, maxValue: 100 }]
  items: [{
    id: 'item-potion',
    name: '治療藥水',
    type: 'consumable',
    quantity: 2,
    checkType: 'none',
    effects: [{ type: 'stat_change', target: 'self', statKey: 'hp', value: 20 }],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  ```

### Phase A — 使用消耗品

1. pageA: `goto('/characters/{A_id}')` → 點擊道具 tab → 點擊 item-potion 卡片
2. **斷言 — ItemDetailDialog 顯示**：名稱「治療藥水」、type「消耗品」、quantity「2」
3. 按「使用」按鈕
4. **斷言 — 使用成功 toast**：顯示「已使用 治療藥水」或類似提示

### Phase B — WebSocket 事件驗證

5. 等待 `item.used` 事件：
   ```ts
   const event = await waitForItemUsed(wsCaptureA, A_id);
   expect(event.itemName).toBe('治療藥水');
   expect(event.checkPassed).toBe(true);
   expect(event.effectsApplied).toContain(expect.stringContaining('HP'));
   ```

### Phase C — DB 與 UI 最終狀態

6. **DB 斷言（Runtime）**：
   - A 的 HP = 70（50 + 20）
   - `item-potion` 的 quantity = 1（2 - 1）
   - `item-potion` 的 `lastUsedAt` 已更新
7. **DB 斷言（Baseline 隔離）**：
   - Baseline HP 仍為 50
   - Baseline item quantity 仍為 2
8. **UI 斷言**：
   - HP 顯示更新為 70
   - 道具卡片 quantity 顯示 1

### Phase D — 使用到耗盡

9. 再次使用 item-potion → quantity 降至 0
10. **斷言 — 耗盡狀態**：
    - item-potion 卡片顯示耗盡視覺（grayscale + lock icon）
    - 「使用」按鈕 disabled
    - **道具仍存在於列表**（不被刪除，只顯示為耗盡）
11. 嘗試再次使用 → server 回 `ITEM_DEPLETED`

---

## #7.2 Item Use cross-target + random check pass/fail 雙分支

### 進入點
- 角色 A（使用者）：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  stats: [{ key: 'hp', label: '生命值', value: 100, maxValue: 100 }]
  items: [{
    id: 'item-dart',
    name: '毒鏢',
    type: 'consumable',
    quantity: 5,
    checkType: 'random',
    randomConfig: { maxValue: 100, threshold: 50 },
    effects: [{ type: 'stat_change', target: 'other', statKey: 'hp', value: -15 }],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  ```
- 角色 B（目標）：
  ```
  stats: [{ key: 'hp', label: '生命值', value: 80, maxValue: 100 }]
  ```

### Phase A — Random check pass（注入高骰值）

> **策略**：E2E 中透過 `page.evaluate` 或 mock `Math.random` 控制 `use-item-usage.ts` 中的 auto-roll 結果。或直接透過 server action 呼叫注入 `checkResult=75`（≥ threshold 50 → pass）。

1. pageA: 道具 tab → 點擊 item-dart → 選目標 = B → 使用
2. 前端 auto-roll 產生 checkResult（或注入 75）→ 傳至 server
3. **斷言 — check pass**：
   - `item.used` 事件：`checkPassed === true`
   - B 的 runtime HP = 65（80 - 15）
   - A 的 item-dart quantity = 4

### Phase B — Random check fail（注入低骰值）

4. 再次使用 item-dart → 注入 `checkResult=20`（< threshold 50 → fail）
5. **斷言 — check fail**：
   - `item.used` 事件：`checkPassed === false`
   - B 的 runtime HP **仍為 65**（效果不執行）
   - A 的 item-dart quantity = 3（使用仍消耗 quantity）

### Phase C — cross-target WebSocket 驗證

6. **B 側 WebSocket**（若啟用 wsCaptureB）：
   - B 收到 `character.affected` 事件（Phase A pass 時）
   - `sourceType === 'item'`、`sourceName === '毒鏢'`
7. **Baseline 隔離**：A 和 B 的 baseline stats 都不變

---

## #7.3 Equip/Unequip toggle cycle + stat boost apply/revert

### 進入點
- 角色 A：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  stats: [
    { key: 'atk', label: '攻擊力', value: 20, maxValue: 50 },
    { key: 'hp', label: '生命值', value: 30, maxValue: 100 },
  ]
  items: [{
    id: 'item-sword',
    name: '魔劍',
    type: 'equipment',
    quantity: 1,
    equipped: false,
    statBoosts: [
      { statName: 'atk', value: 10, target: 'both' },   // value +10, maxValue +10
      { statName: 'hp', value: 5, target: 'maxValue' },  // maxValue +5 only
    ],
    tags: [],
  }]
  ```

### Phase A — Equip（穿上裝備）

1. pageA: 道具 tab → 點擊 item-sword → 按「裝備」
2. **WebSocket 斷言**：
   ```ts
   const event = await waitForEquipToggled(wsCaptureA, A_id);
   expect(event.equipped).toBe(true);
   expect(event.statBoosts).toEqual([
     { statName: 'atk', value: 10, target: 'both' },
     { statName: 'hp', value: 5, target: 'maxValue' },
   ]);
   ```
3. **DB 斷言（Runtime）**：
   - `item-sword.equipped === true`
   - ATK value = 30（20 + 10）、maxValue = 60（50 + 10）
   - HP value = 30（不變，boost target='maxValue'）、maxValue = 105（100 + 5）
4. **UI 斷言**：
   - item-sword 卡片顯示「已裝備」徽章（shield icon + border）
   - ATK 數值顯示 30
   - HP maxValue 顯示 105

### Phase B — Unequip（卸除裝備）

5. 再次點擊 → 按「卸除」
6. **WebSocket 斷言**：`event.equipped === false`
7. **DB 斷言（Runtime）**：
   - `item-sword.equipped === false`
   - ATK value = 20（revert -10）、maxValue = 50（revert -10）
   - HP maxValue = 100（revert -5）
   - HP value = 30（不變——Maximum Value Recovery Rule：卸除時不恢復已消耗的 HP）
8. **Baseline 隔離**：全部 baseline stats 不變

### Phase C — Maximum Value Recovery Rule 驗證

> 此驗證內嵌在 Phase A/B 中：HP value=30 在 equip 時不變（boost target=maxValue），unequip 時也不變。
> 若改為 HP value=102（超過 new maxValue=100），revert 時 value 會被 clamp 至 100。
> 此邊界以 seed 中的數值隱含驗證，不需額外步驟。

### Phase D — 反向驗證

9. **INVALID_TYPE**：嘗試對 equipment 道具呼叫 `useItem` → server 回 `INVALID_TYPE`（item-use.ts:71-77）

---

## #7.4 Showcase + receiver readonly dialog + viewedItems 記錄

### 進入點
- Context A（showcaser）：`/characters/{A_id}`
- Context B（receiver）：`/characters/{B_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  items: [{
    id: 'item-scroll',
    name: '神秘卷軸',
    description: '上面寫著古老的文字',
    type: 'tool',
    quantity: 1,
    tags: ['stealth'],
    // 以下為隱藏欄位（不應傳送給 receiver）
    checkType: 'random',
    randomConfig: { maxValue: 100, threshold: 30 },
    effects: [{ type: 'stat_change', target: 'self', statKey: 'hp', value: 50 }],
  }]
  ```
- 角色 B：
  ```
  items: []
  ```
- B 的 `viewedItems` 初始為空

### Phase A — A 展示道具給 B

1. `asPlayer(pageA, { characterId: A, gameId })`
2. `asPlayer(pageB, { characterId: B, gameId })`
3. pageA: 道具 tab → 點擊 item-scroll → 選展示目標 = B → 按「展示」

### Phase B — B 收到展示 + 唯讀 dialog

4. pageB: 等待 `showcaseDialog` 出現
5. **斷言 — 安全欄位顯示**：
   - 名稱：「神秘卷軸」 ✅
   - 描述：「上面寫著古老的文字」 ✅
   - 類型：「道具」(tool) ✅
   - 數量：1 ✅
   - 標籤：「隱匿」 ✅
6. **斷言 — 隱藏欄位不顯示**：
   - dialog 中**不含** effects 資訊
   - dialog 中**不含** checkType / randomConfig
   - dialog 中**不含** statBoosts
7. **斷言 — 唯讀**：dialog 只有關閉按鈕，無「使用」或其他互動按鈕

### Phase C — WebSocket + DB 驗證

8. **WebSocket 斷言**：
   ```ts
   const event = await waitForItemShowcased(wsCaptureB, B_id);
   expect(event.fromCharacterName).toBe('A角色名');
   expect(event.item.name).toBe('神秘卷軸');
   // 確認 payload 不含敏感欄位
   expect(event.item.effects).toBeUndefined();
   expect(event.item.checkType).toBeUndefined();
   ```
9. **DB 斷言**：
   - B 的 `viewedItems` 新增一筆 `{ itemId: 'item-scroll', sourceCharacterId: A_id, viewedAt: ... }`
10. **A 的道具不受影響**：item-scroll quantity 仍為 1（展示不消耗）

### Phase D — 反向驗證

11. **SELF_TARGET**：A 嘗試展示給自己 → server 回 `SELF_TARGET`（item-showcase.ts:68-74）

---

## #7.5 Transfer happy path + isTransferable + partial quantity + equipment auto-unequip

### 進入點
- Context A（轉出方）：`/characters/{A_id}`
- Context B（接收方）：`/characters/{B_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  stats: [{ key: 'atk', label: '攻擊力', value: 30, maxValue: 50 }]
  items: [
    {
      id: 'item-gold',
      name: '金幣',
      type: 'tool',
      quantity: 5,
      isTransferable: true,
      tags: [],
    },
    {
      id: 'item-armor',
      name: '盔甲',
      type: 'equipment',
      quantity: 1,
      isTransferable: true,
      equipped: true,
      statBoosts: [{ statName: 'atk', value: 5, target: 'value' }],
      tags: [],
    },
    {
      id: 'item-cursed',
      name: '詛咒之物',
      type: 'tool',
      quantity: 1,
      isTransferable: false,   // ← 不可轉移
      tags: [],
    },
  ]
  ```
- 角色 B：
  ```
  items: []    // 空背包
  ```

### Phase A — Partial quantity 轉移

1. `asPlayer(pageA, { characterId: A, gameId })`
2. `asPlayer(pageB, { characterId: B, gameId })`
3. pageA: 道具 tab → 點擊 item-gold → 選轉移目標 = B → 輸入數量 3 → 按「轉移」
4. **WebSocket 斷言**：
   ```ts
   const event = await waitForItemTransferred(wsCaptureA, A_id);
   expect(event.itemName).toBe('金幣');
   expect(event.quantity).toBe(3);
   expect(event.transferType).toBe('give');
   ```
5. **DB 斷言**：
   - A 的 item-gold quantity = 2（5 - 3）
   - B 新增 item-gold，quantity = 3

### Phase B — Equipment 轉移 + auto-unequip

6. pageA: 點擊 item-armor → 選轉移目標 = B → 按「轉移」
7. **DB 斷言**：
   - A 的 item-armor 已移除（quantity 1 → 0 → `$pull`）
   - A 的 ATK value = 25（30 - 5，因裝備卸除觸發 stat revert）
   - B 新增 item-armor：`equipped === false`（auto-unequip，item-use.ts:533）、`acquiredAt` 為新時間
8. **UI 斷言（pageA）**：item-armor 消失、ATK 顯示 25
9. **WebSocket**：A 和 B 都收到 `role.updated`（GM 端同步）

### Phase C — 目標已有同 id 道具（quantity 合併）

10. pageA: 再次轉移 item-gold（剩 2 個）→ 全部轉移給 B（quantity=2）
11. **DB 斷言**：
    - A 的 item-gold 已移除（quantity 0 → `$pull`）
    - B 的 item-gold quantity = 5（3 + 2，合併至已有道具）

### Phase D — 反向驗證

12. **NOT_TRANSFERABLE**：A 嘗試轉移 item-cursed → server 回 `NOT_TRANSFERABLE`（item-use.ts:506-512）
13. **Baseline 隔離**：A 和 B 的 baseline items/stats 都不變

---

## #7.6 Usage limit + cooldown 雙層守門 + readOnly + error 拒絕

### 進入點
- 角色 A：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：
  ```
  stats: [{ key: 'hp', label: '生命值', value: 50, maxValue: 100 }]
  items: [
    {
      id: 'item-limited',
      name: '限量藥水',
      type: 'consumable',
      quantity: 10,
      checkType: 'none',
      effects: [{ type: 'stat_change', target: 'self', statKey: 'hp', value: 5 }],
      usageLimit: 2,
      usageCount: 1,          // ← 已用 1 次，剩 1 次
      cooldown: 0,
    },
    {
      id: 'item-cooldown',
      name: '冷卻道具',
      type: 'tool',
      quantity: 1,
      checkType: 'none',
      effects: [{ type: 'stat_change', target: 'self', statKey: 'hp', value: 3 }],
      usageLimit: 0,
      cooldown: 60,           // ← 60 秒冷卻
      lastUsedAt: new Date(), // ← 剛使用過 → 仍在冷卻中
    },
    {
      id: 'item-equip-only',
      name: '純裝備',
      type: 'equipment',
      quantity: 1,
      equipped: false,
      statBoosts: [{ statName: 'hp', value: 3, target: 'value' }],
    },
  ]
  ```

### Phase A — usageLimit 守門

1. pageA: 道具 tab → 點擊 item-limited → 使用一次 → 成功
2. **DB 斷言**：`usageCount` 從 1 增至 2，HP 從 50 增至 55
3. 再次嘗試使用 item-limited
4. **斷言 — UI 層守門**：「使用」按鈕 disabled 或顯示「已達上限」
5. **斷言 — Server 層守門**（直接呼叫 action）：回 `USAGE_LIMIT_REACHED`
6. **quantity 不變**：item-limited quantity 仍為 10（usageLimit 模式不消耗 quantity）

### Phase B — cooldown 守門

7. 點擊 item-cooldown
8. **斷言 — UI 層守門**：
   - 卡片顯示冷卻覆蓋（clock icon + countdown）
   - 「使用」按鈕 disabled
9. **斷言 — Server 層守門**（直接呼叫 action）：回 `ON_COOLDOWN`，包含剩餘秒數

### Phase C — readOnly 模式

10. 重新進入頁面，`asPlayer(page, { characterId: A, gameId, fullAccess: false, readOnly: true })`
11. **斷言 — 所有操作按鈕隱藏**：
    - 「使用」按鈕不存在
    - 「裝備」按鈕不存在
    - 「展示」按鈕不存在
    - 「轉移」按鈕不存在
12. **道具卡片仍可見**（唯讀展示）

### Phase D — INVALID_TYPE error

13. 恢復 fullAccess → 嘗試對 item-equip-only（equipment）呼叫 `useItem` server action
14. **斷言**：回 `INVALID_TYPE`（「裝備類型請使用裝備切換功能」）

---

## 跨 Case 陷阱（Cross-case Pitfalls）

1. **消耗品 quantity=0 不刪除**：使用到 quantity=0 後，道具仍保留在 `items` 陣列中，卡片顯示耗盡狀態。斷言時不要用 `items.length` 驗證道具消失，改用 `item.quantity === 0`

2. **裝備的 stat boost 是 materialized**：`$inc` 直接改 `stats` 陣列中的值，非 virtual 計算。`computeEffectiveStats` 是 passthrough（equipmentBonus 恆為 0），因為 boost 已經寫入 base stats

3. **Maximum Value Recovery Rule**：unequip 時 `maxValue` 恢復，但 `value` 不會自動恢復到新 `maxValue`。例如 HP value=30, maxValue=100 → equip(maxValue+5=105) → 受傷到 value=20 → unequip(maxValue=100) → value 仍為 20（不是回到 30）

4. **展示不消耗 quantity**：展示操作只記錄 `viewedItems`，不改變道具本身。斷言時驗證 quantity 不變

5. **轉移 equipment 時的 stat revert**：如果裝備正在 `equipped: true` 狀態下被轉移，需要先 unequip（觸發 stat revert）再轉移。目前 `transferItem` 只設 `equipped: false` 但**不觸發 stat revert**——這可能是 bug 或待確認的設計。E2E 應斷言實際行為並在發現不一致時標記

6. **isTransferable 欄位預設值**：Explore 報告顯示預設為 `true`（若未設定）。seed 中的 `isTransferable: false` 是明確禁止轉移。斷言 NOT_TRANSFERABLE 時確保 seed 中明確設為 false

7. **random check 的 checkResult 注入**：前端 auto-roll 在 `use-item-usage.ts:105-109` 用 `Math.random()`。E2E 有兩種策略：(a) mock `Math.random` via `page.evaluate`；(b) 繞過 UI 直接呼叫 server action 注入固定值。策略 (b) 更穩定但跳過 UI 層

8. **雙 context case 的 seed 獨立性**：#7.4 和 #7.5 各自 seed，避免 #7.4 的 viewedItems 污染 #7.5。`beforeEach` 重 seed

9. **cooldown 的時間依賴**：#7.6 的 cooldown 道具 seed `lastUsedAt: new Date()`（剛用過），在 test 執行時仍應在冷卻中（60 秒夠長）。但若 test 延遲超過 60 秒會 fail——考慮用更長的 cooldown 值（如 3600）

10. **contest-tracker 潛在干擾**：#7.1/#7.2 的 item 使用前會檢查 `isCharacterInContest`。若 Flow #6 的 tracker 殘留未清，會回 `USER_IN_CONTEST`。確保 `beforeEach` 包含 tracker reset
