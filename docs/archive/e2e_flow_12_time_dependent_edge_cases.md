# E2E Flow #12 — 時間依賴 edge case

> **定位**：集中處理跨 Flow 共通的時間依賴項目。這些 case 無法歸入任何單一 flow，因為它們測試的是「時間經過後」的系統行為，而非即時操作。
>
> **為什麼獨立一個 flow**：時間依賴的測試需要特殊策略（`page.clock` mock、Seed 過去時間 + 手動觸發 Cron endpoint），與其他 flow 的測試模式根本不同。集中處理可統一 timer mock 基礎設施。
>
> **前置依賴**：E2E 環境需設定 `CRON_SECRET` 環境變數（或繞過驗證），使 spec 可直接呼叫 `/api/cron/check-expired-effects`。

---

## 設計背景

### 時間依賴邏輯分類

本專案的時間依賴邏輯分為兩大類，E2E 測試策略截然不同：

#### A. Server-side timer — Playwright `page.clock` 不可用

| 機制 | 位置 | 觸發方式 |
|------|------|----------|
| TemporaryEffect 過期 | Cron job 每 60 秒呼叫 `processExpiredEffects()` | `check-expired-effects.ts:40-107` |
| PendingEvent TTL 過期 | 同一 Cron job 呼叫 `cleanupPendingEvents()` | `clean-pending-events.ts:20-69` |

**E2E 策略**：Seed `expiresAt` 為過去時間 → 直接呼叫 Cron endpoint（或 server action）→ 驗證結果

#### B. Client-side time comparison — `page.clock` 可直接 mock

| 機制 | 位置 | 判斷邏輯 |
|------|------|----------|
| Skill cooldown | `skill-validators.ts:21-28` | `Date.now() - lastUsedAt < cooldown * 1000` |
| Item cooldown | `item-validators.ts:26-33` | 同上 |

**E2E 策略**：`page.clock.install()` + `page.clock.fastForward()` 推進瀏覽器時間

### 核心程式碼參照

| 位置 | 功能 |
|------|------|
| `lib/effects/check-expired-effects.ts:40-107` | `processExpiredEffects()`：查詢 `expiresAt <= now && isExpired: false` 的效果 |
| `lib/effects/check-expired-effects.ts:120-316` | `processExpiredEffect()`：stat rollback + emit `effect.expired` + Log |
| `lib/effects/check-expired-effects.ts:150-181` | stat value/maxValue 恢復邏輯（反向 delta + clamp） |
| `lib/effects/check-expired-effects.ts:228-244` | `emitEffectExpired()` WS 事件推送 |
| `lib/effects/check-expired-effects.ts:287-298` | `emitRoleUpdated()` silentSync 副作用同步 |
| `lib/effects/create-temporary-effect.ts:41-83` | 效果建立：`expiresAt = now + duration * 1000` |
| `app/actions/temporary-effects.ts:22` | `checkExpiredEffects()` server action（可被 client 直接呼叫） |
| `app/api/cron/check-expired-effects/route.ts:18-71` | Cron endpoint：`processExpiredEffects()` + `cleanupPendingEvents()` |
| `lib/utils/skill-validators.ts:12-32` | `canUseSkill()`：cooldown 判斷 |
| `lib/utils/skill-validators.ts:39-48` | `getCooldownRemaining()`：剩餘秒數計算 |
| `lib/utils/item-validators.ts:12-37` | `canUseItem()`：cooldown 判斷 |
| `lib/utils/item-validators.ts:44-53` | `getCooldownRemaining()`：同上 |
| `lib/websocket/pending-events.ts:31-59` | `writePendingEvent()`：`expiresAt = now + 24h` |
| `lib/websocket/clean-pending-events.ts:20-69` | `cleanupPendingEvents()`：刪除 `expiresAt < now` |
| `lib/contest-tracker.ts:22-31` | contest timeout `setInterval` 每 60 秒清理 > 3 分鐘的 contest（降級為 unit test） |

---

## 共用 fixture 需求

### Seed 結構

```
gmUser
game (isActive: true, gameCode: 'TIME12')
character-timer (hasPinLock: true, pin: '1234')
  stats: [
    { name: '生命值', value: 80, maxValue: 100 },
    { name: '魔力值', value: 50, maxValue: 50 },
  ]
  skills: [
    skill-slash (checkType: 'none', cooldown: 10, effects: [{ targetType: 'self', effectType: 'stat_change', targetStat: '生命值', value: 5 }])
  ]
  items: [
    item-potion (type: 'consumable', quantity: 3, cooldown: 10, effects: [{ targetType: 'self', effectType: 'stat_change', targetStat: '生命值', value: 10 }])
  ]
```

### Cron 端點呼叫方式

E2E 環境有兩條路呼叫過期處理：

1. **Cron endpoint**（需 `CRON_SECRET`）：
   ```
   GET /api/cron/check-expired-effects
   Authorization: Bearer {CRON_SECRET}
   ```
   同時處理 TemporaryEffect 過期 + PendingEvent 清理

2. **Server action**（不需認證，但只處理 TemporaryEffect）：
   ```typescript
   checkExpiredEffects(characterId)  // app/actions/temporary-effects.ts:22
   ```

**建議**：#12.1/#12.2 用 server action（可指定 characterId，較精確）；#12.5 用 Cron endpoint（PendingEvent 清理只在 Cron 中觸發）。

### `page.clock` 使用注意事項

`page.clock.install()` 必須在頁面導航**之前**呼叫，否則已執行的 `Date.now()` 不受影響。

```typescript
// ✅ 正確順序
await page.clock.install({ time: new Date('2026-04-09T12:00:00Z') });
await page.goto('/c/{characterId}');

// ❌ 錯誤順序 — 頁面已載入的 Date.now() 快取不受影響
await page.goto('/c/{characterId}');
await page.clock.install({ time: new Date('2026-04-09T12:00:00Z') });
```

---

## Test Cases

### #12.1 TemporaryEffect 過期 stat rollback + `effect.expired` 事件

**標籤**：`effect-expiry` `stat-rollback` `ws-event`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: false })`

**前置 seed**：

```
共用 seed +
CharacterRuntime.temporaryEffects: [
  {
    id: 'teff-expired-hp',
    sourceType: 'skill',
    sourceId: 'skill-slash-id',
    sourceCharacterId: character-timer-id,
    sourceCharacterName: 'Timer',
    sourceName: '斬擊',
    effectType: 'stat_change',
    targetStat: '生命值',
    deltaValue: 20,
    statChangeTarget: 'value',
    duration: 60,
    appliedAt: new Date(Date.now() - 120_000),   // 2 分鐘前施加
    expiresAt: new Date(Date.now() - 60_000),    // 1 分鐘前已過期
    isExpired: false,
  }
]
CharacterRuntime.stats[0].value: 100  // 80 (base) + 20 (effect delta)
```

**操作步驟**：

1. 進入角色卡頁面，確認 HP 顯示 100（含效果加成）
2. 設定 WebSocket event listener 監聽 `effect.expired`
3. 呼叫 server action `checkExpiredEffects(characterId)` 觸發過期處理

**非同步等待點**：

- 收到 `effect.expired` WebSocket 事件
- 頁面 HP 數值更新（`role.updated` silentSync 觸發 refresh）

**斷言**：

| 層 | 斷言 |
|----|------|
| WS event | `effect.expired` payload 包含：`effectId: 'teff-expired-hp'`、`targetStat: '生命值'`、`restoredValue: 80`、`deltaValue: 20`、`statChangeTarget: 'value'` |
| UI — Stats | HP 從 100 回滾到 **80** |
| DB 層 | CharacterRuntime `temporaryEffects[0].isExpired === true` |
| DB 層 | CharacterRuntime `stats[0].value === 80` |
| Log 層 | Log collection 有一筆 `action: 'effect_expired'`、`details.effectId: 'teff-expired-hp'` |

**反向驗證**：

- 移除 `processExpiredEffect()` 中的 stat rollback 邏輯（`check-expired-effects.ts:154`）→ HP 仍為 100 → spec fail

---

### #12.2 多 TemporaryEffect 累疊與逐步過期

**標籤**：`multi-effect` `stacking` `sequential-rollback`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: false })`

**前置 seed**：

```
共用 seed +
CharacterRuntime.stats: [
  { name: '生命值', value: 90, maxValue: 97 },
  // 原始值: value=80, maxValue=100
  // 效果 A: +10 value → 90
  // 效果 B: +5 value → 仍存活（未過期）→ 不影響 seed 計算，95 尚未施加
  //   ↑ 注意: B 未過期但已加到 DB value 中 → seed value = 80 + 10 + 5 = 95
  //   修正: seed value = 95, 效果 A 過期後 → 95 - 10 = 85, 效果 C 過期後 → maxValue 97+3=100
  { name: '魔力值', value: 50, maxValue: 50 },
]
CharacterRuntime.temporaryEffects: [
  {
    id: 'teff-A',
    effectType: 'stat_change',
    targetStat: '生命值',
    deltaValue: 10,
    statChangeTarget: 'value',
    duration: 60,
    appliedAt: 2 分鐘前,
    expiresAt: 1 分鐘前,         // ← 已過期
    isExpired: false,
  },
  {
    id: 'teff-B',
    effectType: 'stat_change',
    targetStat: '生命值',
    deltaValue: 5,
    statChangeTarget: 'value',
    duration: 300,
    appliedAt: 2 分鐘前,
    expiresAt: 3 分鐘後,         // ← 未過期（仍存活）
    isExpired: false,
  },
  {
    id: 'teff-C',
    effectType: 'stat_change',
    targetStat: '生命值',
    deltaMax: -3,
    statChangeTarget: 'maxValue',
    duration: 60,
    appliedAt: 2 分鐘前,
    expiresAt: 1 分鐘前,         // ← 已過期
    isExpired: false,
  },
]
CharacterRuntime.stats[0]: { value: 95, maxValue: 97 }
// value = 80 (base) + 10 (A) + 5 (B) = 95
// maxValue = 100 (base) - 3 (C) = 97
```

**操作步驟**：

1. 進入角色卡頁面，確認 HP 顯示 95/97
2. 呼叫 `checkExpiredEffects(characterId)` 觸發過期處理

**非同步等待點**：

- 收到 2 個 `effect.expired` WS 事件（A 和 C，B 未過期不處理）
- 頁面 HP 數值更新

**斷言**：

| 層 | 斷言 |
|----|------|
| WS event | 收到 `effectId: 'teff-A'` 的 `effect.expired`，`restoredValue: 85`（95 - 10） |
| WS event | 收到 `effectId: 'teff-C'` 的 `effect.expired`，`restoredMax: 100`（97 + 3） |
| WS event | **不**收到 `effectId: 'teff-B'` 的事件（未過期） |
| UI — Stats | HP 顯示 **85 / 100**（A 回滾、C 回滾、B 仍有效） |
| DB 層 | `teff-A.isExpired === true`、`teff-C.isExpired === true`、`teff-B.isExpired === false` |
| DB 層 | `stats[0].value === 85`、`stats[0].maxValue === 100` |

**反向驗證**：

- 若 `processExpiredEffects` 的 `$elemMatch` 條件未正確過濾 `isExpired: false` → teff-B 也被回滾 → HP 顯示 80/100 而非 85/100 → spec fail

**設計考量**：

此 case 驗證三個關鍵語意：
1. **選擇性過期**：只處理 `expiresAt <= now && isExpired: false` 的效果
2. **獨立回滾**：每個效果各自記錄 `deltaValue`/`deltaMax`，回滾不影響其他效果
3. **不同 statChangeTarget 並存**：value（A/B）和 maxValue（C）作用於同一 stat，互不干擾

---

### #12.3 Skill cooldown 過期後可再使用

**標籤**：`cooldown` `skill` `clock-mock`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: false })`

**前置 seed**：

```
共用 seed（skill-slash 的 cooldown: 10 秒）+
CharacterRuntime.skills[0].lastUsedAt: null  // 尚未使用過
```

**操作步驟**：

1. `page.clock.install({ time: baseTime })` — 安裝 clock mock（**必須在 goto 之前**）
2. 進入角色卡頁面
3. 切換到 skills tab → 點開 skill-slash → 點擊使用按鈕 → 使用成功
4. 關閉 dialog → 再次點開 skill-slash → 觀察使用按鈕狀態
5. `page.clock.fastForward(11_000)` — 快轉 11 秒（超過 10 秒 cooldown）
6. 等待 UI 更新（cooldown 倒數消失）
7. 再次點擊使用按鈕

**非同步等待點**：

- 步驟 3：`skill.used` WS 事件
- 步驟 6：cooldown 倒數文字從「冷卻中 (Xs)」消失

**斷言**：

| 層 | 斷言 |
|----|------|
| UI — 步驟 4 | 使用按鈕顯示「冷卻中 (10s)」或類似文字，且 `disabled=true` |
| UI — 步驟 6 | 快轉後使用按鈕恢復為正常文字，`disabled` 由 cooldown 以外的條件決定 |
| Server — 步驟 7 | 第二次使用成功（server-side `canUseSkill()` 通過），收到第二個 `skill.used` 事件 |

**反向驗證**：

- 將 `page.clock.fastForward` 改為 `5_000`（5 秒，未超過 cooldown）→ 按鈕仍為 disabled → spec fail（於第二次使用處）

**已知限制**：

`page.clock` 只影響瀏覽器端 `Date.now()`，server-side 的 `canUseSkill()` 驗證使用 Node.js 的 `Date.now()`（不受 mock 影響）。解決方案：
- **方案 A**：Seed `lastUsedAt` 為過去時間（`Date.now() - cooldown * 1000 - 1000`），跳過「先使用一次」的步驟，直接驗證「cooldown 已過期 → 可使用」
- **方案 B**：真實使用一次後，等 10+ 秒真實時間再使用第二次（速度慢但忠實）
- **方案 C**：在 E2E 環境下 mock server 時間（需 test-only middleware）

建議 **方案 A** 作為主路徑，**方案 B** 作為 fallback（若 cooldown 設短如 3 秒）。

---

### #12.4 Item cooldown 過期後可再使用

**標籤**：`cooldown` `item` `clock-mock`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: false })`

**前置 seed**：

```
共用 seed（item-potion 的 cooldown: 10 秒）+
方案 A seed:
  CharacterRuntime.items[0].lastUsedAt: new Date(Date.now() - 11_000)  // 11 秒前使用過（cooldown 已過期）
  CharacterRuntime.items[0].usageCount: 1
```

**操作步驟**（方案 A — seed 過去時間）：

1. 進入角色卡頁面
2. 切換到 items tab → 點開 item-potion
3. 確認使用按鈕可用（cooldown 已過期）
4. 點擊使用 → 使用成功
5. 關閉 dialog → 再次點開 item-potion
6. 確認使用按鈕顯示「冷卻中」（剛使用完，新的 cooldown 開始）

**非同步等待點**：

- 步驟 4：`item.used` WS 事件
- 步驟 5：dialog 重新開啟

**斷言**：

| 層 | 斷言 |
|----|------|
| UI — 步驟 3 | 使用按鈕可用，不顯示「冷卻中」 |
| Server — 步驟 4 | 使用成功，`canUseItem()` 通過 |
| UI — 步驟 6 | 使用按鈕顯示「冷卻中 (10s)」，`disabled=true`（新的 cooldown 開始） |
| DB 層 | `items[0].lastUsedAt` 更新為使用時間、`items[0].usageCount === 2` |

**反向驗證**：

- Seed `lastUsedAt` 為 5 秒前（cooldown 未過期）→ 步驟 3 按鈕為 disabled → spec fail

**與 #12.3 的差異**：

Item cooldown 和 Skill cooldown 使用完全平行的驗證邏輯（`item-validators.ts` vs `skill-validators.ts`），但保留獨立 case 的原因：
1. Item 有額外的 `quantity` 和 `type: 'consumable'` 判斷
2. Item 的 `lastUsedAt` 設定路徑與 Skill 不同（`item-use.ts:329` vs `skill-use.ts:343`）
3. Item detail dialog 的按鈕佈局與 Skill 不同（含展示/轉移按鈕）

---

### #12.5 PendingEvent TTL 過期清除

**標籤**：`pending-event` `ttl` `cleanup`

**進入點**：無 UI 操作，純 API + DB 驗證

**前置 seed**：

```
共用 seed +
PendingEvent 記錄 3 筆:
  [0] {
    id: 'pevt-expired',
    targetCharacterId: character-timer-id,
    eventType: 'role.updated',
    eventPayload: { characterId: character-timer-id },
    createdAt: 25 小時前,
    expiresAt: 1 小時前,          // ← 已過期
    isDelivered: false,
  },
  [1] {
    id: 'pevt-delivered-old',
    targetCharacterId: character-timer-id,
    eventType: 'character.affected',
    eventPayload: { ... },
    createdAt: 3 小時前,
    expiresAt: 21 小時後,         // ← 未過期
    isDelivered: true,
    deliveredAt: 2 小時前,        // ← 已送達且 > 1 小時
  },
  [2] {
    id: 'pevt-fresh',
    targetCharacterId: character-timer-id,
    eventType: 'game.broadcast',
    eventPayload: { ... },
    createdAt: 10 分鐘前,
    expiresAt: 23 小時 50 分後,   // ← 未過期
    isDelivered: false,
  },
```

**操作步驟**：

1. 呼叫 Cron endpoint `GET /api/cron/check-expired-effects`（含 `Authorization: Bearer {CRON_SECRET}`）
2. 查詢 DB 中 PendingEvent 集合

**非同步等待點**：

- Cron endpoint 回傳成功

**斷言**：

| 層 | 斷言 |
|----|------|
| API response | `pendingEventsDeleted >= 2`（至少 pevt-expired + pevt-delivered-old） |
| DB 層 | `pevt-expired` **已刪除**（`expiresAt < now`，命中 `clean-pending-events.ts:32-34`） |
| DB 層 | `pevt-delivered-old` **已刪除**（`isDelivered: true && deliveredAt < 1h ago`，命中 `clean-pending-events.ts:39-42`） |
| DB 層 | `pevt-fresh` **仍存在**（未過期且未送達） |

**反向驗證**：

- 移除 `cleanupPendingEvents()` 中的 `expiresAt: { $lt: now }` 條件 → `pevt-expired` 不被刪除 → spec fail

**設計考量**：

此 case 刻意不測「玩家重連後收不到過期事件」的 UI 行為（那需要斷線→重連的複雜編排，已列入不排程項目）。只驗證清理邏輯本身的正確性：過期的刪、已送達超時的刪、新鮮的保留。

---

## 跨 case 已知陷阱

| # | 陷阱 | 對策 |
|---|------|------|
| 1 | **`page.clock` 只影響瀏覽器**：server-side `Date.now()`（如 `canUseSkill()`）不受 mock 影響 | #12.3/#12.4 使用方案 A（seed `lastUsedAt` 為過去時間）繞過 server 驗證；瀏覽器端 cooldown 倒數用 `page.clock` 快轉 |
| 2 | **`page.clock.install()` 必須在 `page.goto()` 之前**：否則頁面已載入的 timer 不受控 | spec 開頭即安裝 clock |
| 3 | **Cron endpoint 需要 `CRON_SECRET`**：E2E 環境必須設定此環境變數 | `global-setup.ts` 中設定 `CRON_SECRET=test-cron-secret`，或新增 test-only 繞過 |
| 4 | **`processExpiredEffects` 冪等性**：使用 `$elemMatch: { id, isExpired: false }` 作為查詢條件，重複呼叫不會重複 rollback | 測試可安全多次呼叫，但只有第一次會產生 WS 事件 |
| 5 | **效果 A/C 的 rollback 順序不確定**：`for...of expiredEffects` 迴圈順序取決於 MongoDB 回傳順序 | 斷言不依賴事件到達順序，分別匹配 effectId |
| 6 | **`restoredValue` 含裝備加成計算**：`processExpiredEffect()` 會呼叫 `computeEffectiveStats()` 計算含裝備加成的顯示值 | seed 角色不裝備 equipment 類道具，避免顯示值與 DB 值不一致的混淆 |
| 7 | **cooldown 倒數 UI 的 `setTick` 重渲染**：client-side cooldown 倒數由 `setInterval` 每秒 `setTick(Date.now())` 驅動 | `page.clock.fastForward` 需一次推進超過 cooldown，不要 1 秒 1 秒推進（避免不必要的重渲染等待） |
| 8 | **PendingEvent seed 的時間計算**：seed 時間基於 `Date.now()`，但測試環境可能有微小時差 | 使用足夠大的時間差（如 25 小時前），避免邊界 race |

---

## 降級為 unit test 的項目

### contest-tracker 3 分鐘 timeout（`lib/contest-tracker.ts:22-31`）

**降級理由**：

1. 機制是 Node.js `setInterval`（`contest-tracker.ts:24`），Playwright 無法控制 server 計時器
2. 等真實時間需 60 秒（cleanup interval）+ 180 秒（timeout）= 最少 240 秒
3. 暴露 test endpoint 需新增 API 來手動推進 `timestamp`，且 cleanup 函數未獨立導出
4. timeout 後只從 in-memory Map 移除記錄，不涉及 DB、WS 事件或 stat 變化
5. `contest-tracker.ts` 是純邏輯模組，`jest.useFakeTimers()` 可完整測試

**建議 unit test 覆蓋**：

```typescript
// contest-tracker.test.ts
test('should auto-clear contests after 3 minutes', () => {
  jest.useFakeTimers();
  addActiveContest('c1', 'a', 'd', 'skill', 's1');
  expect(isCharacterInContest('a').inContest).toBe(true);
  jest.advanceTimersByTime(181_000);  // 超過 3 分鐘
  // 需等待 cleanup interval 觸發
  jest.advanceTimersByTime(60_000);   // 觸發 setInterval
  expect(isCharacterInContest('a').inContest).toBe(false);
});
```

---

## 延後項目

| 項目 | 原因 | 去向 |
|------|------|------|
| 玩家離線→過期事件→重連後收到 PendingEvent | 需要斷線/重連的複雜 WebSocket 編排 | 不排程，留原位紀錄 |
| 多個 TemporaryEffect 同時過期的 WS 事件順序 | 順序不確定且無業務需求保證順序 | 不排程 |
| cooldown 倒數 UI 動畫精確性 | 動畫斷言 flaky，已在 Flow #5/#7 標記為 unit test | unit test 覆蓋 |
| `cleanupOldExpiredEffects()` 清除 24h 前的已過期效果記錄 | 與 stat rollback 無關，純清理邏輯 | unit test 覆蓋 |
