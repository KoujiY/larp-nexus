# E2E Flow #6b — 物品轉移效果（item_take / item_steal 延遲選擇）

> **上游索引**：本檔案為 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 中 Flow #6 的姊妹檔。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/item-transfer-effects.spec.ts`
> **關聯 flow**：
> - [e2e_flow_6_contest.md](./e2e_flow_6_contest.md) — 對抗檢定主線（三階段事件、勝負分支、防禦過濾）
> - [e2e_flow_5_player_use_skill.md](./e2e_flow_5_player_use_skill.md) — 非對抗技能基礎設施
> - [e2e_flow_7_item_operations.md](./e2e_flow_7_item_operations.md) — 道具操作（use/equip/showcase/transfer）

---

## ⚠ 基礎設施依賴（Blocker）

繼承 Flow #6 全部依賴（#6b.1/#6b.2），**額外**增加：

1. **TargetItemSelectionDialog selector**
   - 對抗結算後若 `needsTargetItemSelection === true`，勝方瀏覽器會彈出道具選擇 dialog
   - 需確認此 dialog 的 test selector（可能需要新增 `data-testid`）
2. **`selectTargetItemForContest` server action 測試路徑**（#6b.1/#6b.2）
   - `app/actions/contest-select-item.ts` — 對抗路徑延遲物品選擇的 server action
   - 需確認此 action 在 E2E 中可透過 UI 觸發（點擊 dialog 中的道具 → 呼叫 action）
3. **`selectTargetItemAfterUse` server action 測試路徑**（#6b.3）
   - `app/actions/select-target-item.ts` — 非對抗路徑延遲物品選擇的 server action
   - 由 `skill-use.ts:266` 或 `item-use.ts:295` 回傳 `needsTargetItemSelection: true` 後觸發
   - 需確認 TargetItemSelectionDialog 在非對抗情境也能正確彈出

---

## 設計背景

Flow #6b 驗證**延遲物品選擇**——當技能或道具帶有 `item_take` / `item_steal` 效果，且使用時未指定目標物品時，系統延遲效果執行並彈出道具選擇 dialog。

本 Flow 涵蓋**兩條觸發路徑**：

**路徑 A — 對抗後延遲選擇**（#6b.1, #6b.2）：
1. `contest-respond.ts` 結算勝負但**跳過效果執行**（因 `needsTargetItemSelection === true`）
2. 勝方收到 `result` 事件（含 `needsTargetItemSelection: true`）→ 彈出道具選擇 dialog
3. 勝方在 dialog 中選擇目標道具 → 呼叫 `selectTargetItemForContest()`
4. 效果執行 → 道具轉移 → `effect` 事件送出 → tracker 清除

**路徑 B — 非對抗直接使用後延遲選擇**（#6b.3）：
1. `skill-use.ts:266` 或 `item-use.ts:295` 檢定通過但 `hasItemTakeOrSteal && !targetItemId` → 回傳 `needsTargetItemSelection: true`
2. 使用方收到回應 → 彈出道具選擇 dialog
3. 使用方在 dialog 中選擇目標道具 → 呼叫 `selectTargetItemAfterUse()`
4. 效果執行 → 道具轉移 → `skill.used` / `item.used` 事件送出

**兩種效果類型的差異**：
- **`item_take`**：道具從目標移除，**不加入**使用方背包（銷毀式）
- **`item_steal`**：道具從目標移除，**加入**使用方背包（轉移式）

**刻意排除**：
- 防守方技能/道具帶 item_take/item_steal 的延遲選擇（defender_wins 路徑）— 邏輯對稱但 UX 較少見，延後處理
- 「放棄選擇」（不選道具直接關閉 dialog）— 待查證 UI 是否支援
- 多個 item_take/item_steal 效果同時存在 — edge case
- 非對抗 item_take（銷毀式）的獨立 case — 與 item_steal 共用 `selectTargetItemAfterUse`，邏輯差異已在 #6b.1 vs #6b.2 覆蓋

---

## 範圍定義

### 測
- `item_take` 對抗延遲選擇：attacker_wins → 選目標道具 → 道具從 defender 移除、不入 attacker 背包（#6b.1）
- `item_steal` 對抗延遲選擇：attacker_wins → 選目標道具 → 道具從 defender 移除、入 attacker 背包（#6b.2）
- `item_steal` 非對抗延遲選擇：技能使用 → checkType='none' → 選目標道具 → 道具轉移（#6b.3）

### 不測（延後/排除）
| 項目 | 狀態 | 去處 |
|---|---|---|
| defender_wins + defender 技能帶 item_take/steal | 延後 | 對稱路徑，低優先 |
| 放棄選擇（不選道具） | 延後 | 待查證 UI |
| 多 item_take/steal 效果同時 | 排除 | edge case |
| 轉移後自動揭露 | 橫切 | Flow #10 auto-reveal |
| 非對抗 item_take 獨立 case | 排除 | 與 #6b.1 邏輯差異僅在 server action 入口 |
| 由道具（非技能）觸發的非對抗延遲選擇 | 排除 | 共用 `selectTargetItemAfterUse`，入口差異由 unit test 覆蓋 |

---

## Test Case 獨立性設計

| Case | 獨立 seed | 雙 context | Game 狀態 |
|---|---|---|---|
| #6b.1 item_take 對抗延遲選擇 | 2 角色 + 1 攻擊技能（item_take effect）+ defender 有道具 | ✅ | active |
| #6b.2 item_steal 對抗延遲選擇 | 2 角色 + 1 攻擊技能（item_steal effect）+ defender 有道具 | ✅ | active |
| #6b.3 item_steal 非對抗延遲選擇 | 2 角色 + 1 技能（checkType='none', item_steal effect）+ 目標有道具 | ❌（單 context） | active |

---

## 共用規格

### 關鍵 Selectors

```ts
// 繼承 Flow #6 的 selectors，額外新增：

// TargetItemSelectionDialog — 勝方選擇目標道具
const itemSelectionDialog = (page: Page) => page.getByRole('dialog', { name: /選擇道具|物品/ });
const targetItemOption = (page: Page, itemId: string) =>
  itemSelectionDialog(page).getByTestId(`target-item-${itemId}`);
const confirmItemSelectionBtn = (page: Page) =>
  itemSelectionDialog(page).getByRole('button', { name: /確認|選擇/ });
```

### Helpers

```ts
// 繼承 Flow #6 helpers，額外新增：

// 等待 TargetItemSelectionDialog 出現
async function waitForItemSelectionDialog(page: Page, timeoutMs = 5000) {
  await itemSelectionDialog(page).waitFor({ state: 'visible', timeout: timeoutMs });
}
```

---

## #6b.1 item_take 延遲物品選擇（attacker_wins → 道具銷毀）

### 進入點
- Context A（attacker）：`/characters/{A_id}`
- Context B（defender）：`/characters/{B_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 80, maxValue: 100 }]
  skills: [{
    id: 'skill-disarm',
    name: '繳械',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 0,
      opponentMaxSkills: 0,
      tieResolution: 'attacker_wins',
    },
    effects: [
      { type: 'item_take', target: 'other' },  // ← item_take 效果
    ],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  items: []   // ← attacker 背包空（方便驗證不會收到道具）
  ```
- 角色 B（defender）：
  ```
  stats: [{ key: 'str', label: '力量', value: 30, maxValue: 100 }]
  items: [
    { id: 'item-sword', name: '長劍', type: 'tool', quantity: 1 },
    { id: 'item-potion', name: '藥水', type: 'consumable', quantity: 3 },
  ]
  ```

### Phase A — Attacker 發動對抗

1. `asPlayer(pageA, { characterId: A, gameId })`
2. `asPlayer(pageB, { characterId: B, gameId })`
3. pageA: 技能 tab → 點擊 skill-disarm → 選目標 = B → 按「使用技能」

### Phase B — Defender 回應（不防禦）

4. pageB: 等待 contestDialog → 按「直接回應」

### Phase C — 結果（attacker_wins + needsTargetItemSelection）

5. A 力量 80 > B 力量 30 → `attacker_wins`
6. 等待 A 的 `result` 事件：
   ```ts
   const resultA = await waitForContestEvent(wsCaptureA, A_id, 'result');
   expect(resultA.result).toBe('attacker_wins');
   expect(resultA.needsTargetItemSelection).toBe(true);  // ← 延遲選擇標記
   ```
7. **斷言 — 效果尚未執行**：
   - B 的 items 仍有 `item-sword` 和 `item-potion`（contest-respond.ts 跳過了效果執行）

### Phase D — Attacker 選擇目標道具

8. pageA: 等待 `TargetItemSelectionDialog` 出現
9. **斷言 — dialog 顯示 B 的道具列表**：
   - `targetItemOption(pageA, 'item-sword')` → 可見（長劍）
   - `targetItemOption(pageA, 'item-potion')` → 可見（藥水）
10. pageA: 選擇「長劍」→ 按「確認」
11. 等待 `effect` 事件：
    ```ts
    const effectA = await waitForContestEvent(wsCaptureA, A_id, 'effect');
    expect(effectA.effectsApplied).toBeDefined();
    ```

### Phase E — DB 最終狀態驗證

12. **B 的 items**：
    - `item-sword` 已移除（quantity 1 → 被 $pull）
    - `item-potion` 仍存在（quantity 3，未受影響）
13. **A 的 items**：
    - 仍為空陣列 → **item_take 不轉移，只銷毀**
14. **WebSocket 驗證**：
    - B 收到 `inventory.updated` 事件（item-sword action='deleted'）
    - B 收到 `character.affected` 事件（effectType='item_take'）
15. **contest-tracker**：已清除

---

## #6b.2 item_steal 延遲物品選擇（attacker_wins → 道具轉移）

### 進入點
- Context A / Context B 同 #6b.1

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（attacker）：
  ```
  stats: [{ key: 'str', label: '力量', value: 80, maxValue: 100 }]
  skills: [{
    id: 'skill-steal',
    name: '偷竊',
    checkType: 'contest',
    contestConfig: {
      relatedStat: 'str',
      opponentMaxItems: 0,
      opponentMaxSkills: 0,
      tieResolution: 'attacker_wins',
    },
    effects: [
      { type: 'item_steal', target: 'other' },  // ← item_steal 效果
    ],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  items: []   // ← attacker 背包空
  ```
- 角色 B（defender）：
  ```
  stats: [{ key: 'str', label: '力量', value: 30, maxValue: 100 }]
  items: [
    { id: 'item-gem', name: '寶石', type: 'tool', quantity: 2 },
  ]
  ```

### Phase A — Attacker 發動對抗

1. 同 #6b.1 Phase A 步驟

### Phase B — Defender 回應（不防禦）

2. 同 #6b.1 Phase B 步驟

### Phase C — 結果（attacker_wins + needsTargetItemSelection）

3. A 力量 80 > B 力量 30 → `attacker_wins`
4. `resultA.needsTargetItemSelection === true`
5. B 的 items 仍完整（效果尚未執行）

### Phase D — Attacker 選擇目標道具

6. pageA: 等待 `TargetItemSelectionDialog` 出現
7. pageA: 選擇「寶石」→ 按「確認」
8. 等待 `effect` 事件

### Phase E — DB 最終狀態驗證（item_steal 轉移）

9. **B 的 items**：
   - `item-gem` quantity 從 2 降至 1（steal 只取 1 個，shared-effect-executor.ts:157-165 的減量邏輯）
10. **A 的 items**：
    - **新增** `item-gem`，quantity = 1（shared-effect-executor.ts:190-198 新增完整複本）
    - `equipped === false`（轉移時自動卸除裝備狀態）
    - `acquiredAt` 為新時間戳
11. **WebSocket 驗證**：
    - B 收到 `inventory.updated` 事件（item-gem action='updated'，因 quantity > 0）
    - B 收到 `character.affected` 事件（effectType='item_steal'）
    - A 和 B 都收到 `role.updated` 事件（GM 端同步，shared-effect-executor.ts:238-254）
12. **contest-tracker**：已清除

### Phase F — quantity 邊界驗證（隱含在 seed 中）

> B 的寶石 quantity=2，steal 後 quantity=1（>0），所以 item 不被 $pull 而是更新 quantity。
> 若需驗證 quantity=1 → steal → $pull（完全移除），可在此 case 加一輪：再次對抗並偷走剩餘的寶石。
> 但這會讓單一 case 過長，建議先用 DB 層 unit test 覆蓋 quantity=1 的邊界。

---

## #6b.3 item_steal 非對抗延遲物品選擇（技能直接使用 → 道具轉移）

> **與 #6b.1/#6b.2 的關鍵差異**：
> - **無對抗流程**：技能 `checkType='none'`，不經過 contest-respond.ts
> - **不同 server action**：選擇道具後呼叫 `selectTargetItemAfterUse`（非 `selectTargetItemForContest`）
> - **無 contest-tracker**：不需 contest tracker 管理，無 `USER_IN_CONTEST` 風險
> - **單 context**：只需攻擊方瀏覽器（無 defender 回應階段）

### 進入點
- Context A（使用方）：`/characters/{A_id}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（使用方）：
  ```
  stats: [{ key: 'dex', label: '敏捷', value: 50, maxValue: 100 }]
  skills: [{
    id: 'skill-pickpocket',
    name: '扒竊',
    checkType: 'none',          // ← 非對抗、無檢定
    effects: [
      { type: 'item_steal', target: 'other' },  // ← item_steal 效果
    ],
    tags: [],
    usageLimit: 0,
    cooldown: 0,
  }]
  items: []   // ← 使用方背包空
  ```
- 角色 B（目標）：
  ```
  stats: [{ key: 'dex', label: '敏捷', value: 50, maxValue: 100 }]
  items: [
    { id: 'item-ring', name: '戒指', type: 'tool', quantity: 1 },
    { id: 'item-coin', name: '金幣', type: 'tool', quantity: 5 },
  ]
  ```

### Phase A — 使用方發動技能

1. `asPlayer(pageA, { characterId: A, gameId })`
2. pageA: 技能 tab → 點擊 skill-pickpocket → 選目標 = B → 按「使用技能」

### Phase B — 回應（無對抗、無 defender 互動）

3. 技能 `checkType='none'` → **直接通過**（無 contestDialog、無 defender 回應）
4. Server 回傳 `needsTargetItemSelection: true`（skill-use.ts:266-288）
5. **斷言 — 效果尚未執行**：
   - B 的 items 仍有 `item-ring` 和 `item-coin`

### Phase C — 使用方選擇目標道具

6. pageA: 等待 `TargetItemSelectionDialog` 出現
7. **斷言 — dialog 顯示 B 的道具列表**：
   - `targetItemOption(pageA, 'item-ring')` → 可見（戒指）
   - `targetItemOption(pageA, 'item-coin')` → 可見（金幣）
8. pageA: 選擇「戒指」→ 按「確認」
9. 等待呼叫完成：`selectTargetItemAfterUse(A_id, 'skill-pickpocket', 'skill', 'item_steal', B_id, 'item-ring')`

### Phase D — DB 最終狀態驗證（item_steal 轉移）

10. **B 的 items**：
    - `item-ring` 已移除（quantity 1 → $pull 完全移除）
    - `item-coin` 仍存在（quantity 5，未受影響）
11. **A 的 items**：
    - **新增** `item-ring`，quantity = 1
    - `equipped === false`（轉移時自動卸除裝備狀態）
    - `acquiredAt` 為新時間戳
12. **WebSocket 驗證**：
    - A 收到 `skill.used` 事件（effectsApplied 含 item_steal 結果，select-target-item.ts:100-110）
    - B 收到 `character.affected` 事件（effectType='item_steal'）
    - B 收到 `inventory.updated` 事件（item-ring action='deleted'，因 quantity=1 → 完全移除）
    - A 和 B 都收到 `role.updated` 事件
13. **技能使用記錄更新**：
    - skill-pickpocket 的 `lastUsedAt` 已更新（skill-use.ts:269）

### Phase E — 與 #6b.2 的差異交叉驗證

> 此 case 刻意用 `quantity=1` 的 item-ring（與 #6b.2 的 `quantity=2` 互補），
> 驗證 quantity=1 → $pull 完全移除（而非 quantity 減量）的邊界。

---

## 跨 Case 陷阱（Cross-case Pitfalls）

1. **繼承 Flow #6 全部陷阱**：contest-tracker reset、雙 context session 分離、Runtime vs Baseline ID、事件順序等

2. **needsTargetItemSelection 是效果層判斷**：只有當 skill 的 effects 包含 `item_take` 或 `item_steal` **且** 呼叫端未傳 `targetItemId` 時才為 true（contest-respond.ts:270-289）。seed 時 effects 陣列必須包含正確的 type

3. **item_take vs item_steal 的 DB 差異**：
   - `item_take`：只做 `$pull`（+ 減量 push），**不** 寫入 attacker 的 items
   - `item_steal`：額外 `$push` 到 attacker 的 items + 設定 `pendingRevealReceiverId`
   - 斷言時兩者的 attacker items 預期完全不同

4. **TargetItemSelectionDialog 的時機**：dialog 在 `result` 事件（含 `needsTargetItemSelection: true`）到達後才出現。測試中 `waitFor` 必須在收到 result 事件**之後**才呼叫 `waitForItemSelectionDialog`，否則可能 race condition

5. **selectTargetItemForContest 清除 tracker**（#6b.1/#6b.2）：此 action 在效果執行後呼叫 `removeActiveContest`（contest-select-item.ts:389-395）。如果 action 失敗但 tracker 未清，下一個 case 會被 `USER_IN_CONTEST` 擋住

6. **quantity > 1 的減量邏輯**：`applyItemTransfer` 先 `$pull` 整個 item，再 `$push` 減量版本（shared-effect-executor.ts:157-165）。這是兩步非原子操作——在 E2E 中透過最終狀態斷言即可，不需要驗證中間狀態

7. **#6b.3 無 contest-tracker**：非對抗路徑不經過 contest-tracker，因此沒有 `USER_IN_CONTEST` 衝突風險。但仍需注意技能的 `usageCount` / `lastUsedAt` 已在 `skill-use.ts:268-276` 預先更新（在延遲選擇之前），不要重複驗證

8. **selectTargetItemAfterUse 雙入口**（#6b.3）：此 action 同時被 `skill-use.ts:266` 和 `item-use.ts:295` 使用。#6b.3 只測技能入口；道具入口的差異（consumable quantity 預扣）由 unit test 覆蓋，不在此 E2E 重複
