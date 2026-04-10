# E2E Flow #11 — 預覽模式 baseline 讀取分流

> **定位**：驗證 PIN-only 解鎖（預覽模式）下，玩家端顯示的是 Baseline 資料而非 Runtime 資料，以及 preview→full-access 切換後正確顯示 Runtime 資料。
>
> **為什麼獨立一個 flow**：Flow #1–#8 全部使用 `asPlayer({ readOnly: false })` 測試完整互動，系統性地無法覆蓋 `isReadOnly=true` 的資料來源分流語意。此 flow 填補這個橫切缺口。
>
> **前置依賴**：`asPlayer()` fixture 需支援 `readOnly: true` 模式（僅設 `session.unlockedCharacterIds` + `localStorage['character-{id}-unlocked']`，不設 `fullAccess`）。

---

## 設計背景

### 預覽模式資料源分流機制

```
PIN-only 解鎖
  → localStorage: character-{id}-unlocked = 'true'
  → localStorage: character-{id}-fullAccess 不存在
  → useLocalStorageUnlock() → hasFullAccess = false
  → isReadOnly = !storageFullAccess = true          ← character-card-view.tsx:91
  → bl = character.baselineData                     ← character-card-view.tsx:95
  → displayStats = bl?.stats ?? character.stats     ← character-card-view.tsx:96-100
  → displayItems = bl?.items ?? character.items
  → displaySkills = bl?.skills ?? character.skills
  → displayTasks = bl?.tasks ?? character.tasks
  → displaySecretInfo = bl?.secretInfo ?? character.secretInfo
```

### 核心程式碼參照

| 位置 | 功能 |
|------|------|
| `components/player/character-card-view.tsx:51-80` | `useLocalStorageUnlock` hook：從 localStorage 讀取 `unlocked` 和 `fullAccess` |
| `components/player/character-card-view.tsx:91` | `isReadOnly = !storageFullAccess` |
| `components/player/character-card-view.tsx:95-100` | Baseline/Runtime 條件讀取 |
| `components/player/character-card-view.tsx:140-147` | `handleUnlocked(readOnly)` 回調：`readOnly=true` 時不設 `fullAccess` |
| `components/player/character-card-view.tsx:153-159` | `handleRelock()` 清除兩個 key + dispatch storage event |
| `components/player/character-card-view.tsx:454,466` | `isReadOnly` 傳遞給 `ItemList` / `SkillList` |
| `app/actions/public.ts:113-143` | `getPublicCharacter` 在 `game.isActive=true` 時填充 `baselineData` |
| `components/player/character-mode-banner.tsx:29-50` | 預覽模式橫幅：顯示「遊戲準備中 — 預覽模式」+ 重新解鎖按鈕 |
| `components/player/pin-unlock.tsx:83-93` | 有 Game Code → `onUnlocked(false)`；無 Game Code → `onUnlocked(true)` |
| `app/api/characters/[characterId]/verify-game-code/route.ts:63-69` | `game.isActive=false` → 回傳 `gameNotStarted: true` 拒絕 |
| `components/player/item-detail-dialog.tsx:364,412,427,441,451` | `isReadOnly` 禁用使用/裝備/展示/轉移按鈕 |
| `components/player/skill-detail-dialog.tsx:123,158` | `isReadOnly` 禁用技能使用按鈕 |

### baselineData 型別定義

```typescript
// types/character.ts:49-55
export interface CharacterBaselineSnapshot {
  stats?: Stat[];
  items?: Item[];
  skills?: Skill[];
  tasks?: Task[];
  secretInfo?: { secrets: Secret[] };
}
```

### Runtime 分歧建立

`baselineData` 只在 Baseline 和 Runtime 有差異時才能驗出效果。Seed 必須：
1. `seed.game({ isActive: true })` — 遊戲已啟動
2. Baseline Character 保有原始值（如 HP=100）
3. CharacterRuntime 已被修改（如 HP=60、多一個 runtime-only item、技能 usageCount 增加）

這模擬「遊戲進行一段時間後」的真實狀態，確保 `getPublicCharacter` 回傳的 `baselineData` 與 top-level runtime data 確實不同。

---

## 共用 fixture 需求

### Seed 結構

```
gmUser
game (isActive: true, gameCode: 'PREV11')
character-preview (hasPinLock: true, pin: '1234')
  Baseline stats: [ { name: '生命值', currentValue: 100, maxValue: 100 } ]
  Baseline items: [ item-sword (quantity: 1) ]
  Baseline skills: [ skill-fireball (usageCount: 0) ]
  Baseline secrets: [ secret-A (isRevealed: true, content: 'Baseline secret') ]
  Baseline tasks: [ task-A (isHidden: false, description: 'Baseline task') ]

CharacterRuntime (refId → character-preview):
  Runtime stats: [ { name: '生命值', currentValue: 60, maxValue: 100 } ]
  Runtime items: [ item-sword (quantity: 1), item-potion (quantity: 3, runtimeOnly) ]
  Runtime skills: [ skill-fireball (usageCount: 2) ]
  Runtime secrets: [ secret-A (isRevealed: true, content: 'Baseline secret'), secret-B (isRevealed: true, content: 'Runtime revealed') ]
  Runtime tasks: [ task-A (isHidden: false), task-B (isHidden: false, runtimeOnly) ]
```

**關鍵差異點**（5 個可驗證的分歧）：

| 欄位 | Baseline | Runtime | 驗證方式 |
|------|----------|---------|----------|
| HP currentValue | 100 | 60 | `StatsDisplay` 中的數值文字 |
| items 列表 | 只有 item-sword | item-sword + item-potion | item tab 中是否出現 item-potion |
| skill usageCount | 0 | 2 | skill detail dialog 中的使用次數 |
| secrets | 只有 secret-A | secret-A + secret-B | secrets tab 中是否出現 secret-B |
| tasks | 只有 task-A | task-A + task-B | tasks tab 中是否出現 task-B |

### Auth fixture 模式

```
asPlayer({ characterId, readOnly: true })
  → session.unlockedCharacterIds = [characterId]
  → localStorage['character-{id}-unlocked'] = 'true'
  → 不設 fullAccess

asPlayer({ characterId, readOnly: false })
  → session.unlockedCharacterIds = [characterId]
  → localStorage['character-{id}-unlocked'] = 'true'
  → localStorage['character-{id}-fullAccess'] = 'true'
```

---

## Test Cases

### #11.1 Preview mode 顯示 baseline 資料

**標籤**：`baseline-read` `stats` `items` `skills`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: true })`

**前置 seed**：共用 seed（含 5 個分歧點）

**操作步驟**：

1. 進入角色卡頁面

**非同步等待點**：

- 頁面載入完成（`[data-testid="character-card"]` 可見）

**斷言**：

| 層 | 斷言 |
|----|------|
| UI — 橫幅 | `CharacterModeBanner` 顯示「遊戲準備中 — 預覽模式」文字 + 靜態圓點（無 `animate-pulse`） |
| UI — Stats | HP 顯示 **100**（baseline），不是 60（runtime） |
| UI — Items tab | 切換到 items tab → 只看到 item-sword，**不**出現 item-potion |
| UI — Skills tab | 切換到 skills tab → 點開 skill-fireball detail → 使用次數顯示 **0**（baseline），不是 2 |
| UI — Secrets tab | 切換到 info tab secrets 區 → 只看到 secret-A，**不**出現 secret-B |
| UI — Tasks tab | 切換到 tasks tab → 只看到 task-A，**不**出現 task-B |
| DB 層 | `GET /api/test/db-query?collection=characters&filter={_id}` → 確認 Baseline stats[0].currentValue === 100 |
| DB 層 | `GET /api/test/db-query?collection=characterruntimes&filter={refId}` → 確認 Runtime stats[0].currentValue === 60 |

**反向驗證**：

- 移除 `character-card-view.tsx:95` 的 `isReadOnly ? character.baselineData : undefined` 改為 `undefined` → HP 顯示 60（runtime）→ spec fail

---

### #11.2 Preview → Full access 切換後顯示 runtime 資料

**標籤**：`mode-switch` `runtime-read`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: true })`

**前置 seed**：共用 seed（同 #11.1）

**操作步驟**：

1. 進入角色卡頁面，確認橫幅顯示「遊戲準備中 — 預覽模式」
2. 確認 HP 顯示 100（baseline）
3. 點擊橫幅「重新解鎖」按鈕 → 觸發 `handleRelock()` → PIN 解鎖畫面重現
4. 輸入 PIN `1234` + Game Code `PREV11`
5. 提交表單

**非同步等待點**：

- 解鎖成功後頁面重新渲染（`CharacterModeBanner` 切換為「遊戲進行中 — Runtime 模式」+ `animate-pulse` 脈衝圓點）

**斷言**：

| 層 | 斷言 |
|----|------|
| UI — 橫幅 | 顯示「遊戲進行中 — Runtime 模式」+ 脈衝圓點 |
| UI — Stats | HP 顯示 **60**（runtime），不再是 100 |
| UI — Items tab | 切換到 items tab → 出現 item-sword **和** item-potion |
| UI — Skills tab | 切換到 skills tab → 點開 skill-fireball detail → 使用次數顯示 **2** |
| UI — Secrets tab | 切換到 info tab secrets 區 → 出現 secret-A **和** secret-B |
| UI — Tasks tab | 切換到 tasks tab → 出現 task-A **和** task-B |
| localStorage | `localStorage.getItem('character-{id}-fullAccess')` === `'true'` |

**反向驗證**：

- 若 `handleUnlocked(false)` 沒有設 `fullAccess` → `isReadOnly` 仍為 true → HP 仍顯示 100 → spec fail

---

### #11.3 預覽模式互動鎖定

**標籤**：`readonly-guard`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: true })`

**前置 seed**：共用 seed（同 #11.1）

**操作步驟**：

1. 進入角色卡頁面
2. 切換到 items tab → 點擊 item-sword → 打開 `ItemDetailDialog`
3. 切換到 skills tab → 點擊 skill-fireball → 打開 `SkillDetailDialog`

**非同步等待點**：

- Dialog 開啟動畫完成

**斷言**：

| 層 | 斷言 |
|----|------|
| UI — ItemDetailDialog | 使用按鈕顯示「預覽模式」文字（`item-detail-dialog.tsx:430`）且 `disabled=true` |
| UI — ItemDetailDialog | 裝備按鈕 `disabled=true`（`item-detail-dialog.tsx:412`） |
| UI — ItemDetailDialog | 展示按鈕 `disabled=true`（`item-detail-dialog.tsx:441`） |
| UI — ItemDetailDialog | 轉移按鈕 `disabled=true`（`item-detail-dialog.tsx:451`） |
| UI — SkillDetailDialog | 使用按鈕顯示「預覽模式」文字（`skill-detail-dialog.tsx:161`）且 `disabled=true` |
| UI — 反向 | 以 `asPlayer({ readOnly: false })` 重新登入 → 同一個 dialog 的使用按鈕**不**顯示「預覽模式」且 `disabled` 由其他條件決定（不因 isReadOnly 鎖定） |

**反向驗證**：

- 移除 `ItemDetailDialog` 中 `isReadOnly` 的 `disabled` 判斷 → 按鈕可點擊 → spec fail

---

### #11.4 Game 未啟動時 baselineData 不填充

**標籤**：`inactive-game` `fallback`

**進入點**：Player，`/c/{characterId}`，`asPlayer({ readOnly: true })`

**前置 seed**：

```
gmUser
game (isActive: false)           ← 關鍵：遊戲未啟動
character-inactive (hasPinLock: true, pin: '1234')
  stats: [ { name: '生命值', currentValue: 100, maxValue: 100 } ]
  items: [ item-shield (quantity: 1) ]
```

注意：`isActive: false` 時不存在 CharacterRuntime，Baseline 與 top-level data 一致。

**操作步驟**：

1. 進入角色卡頁面

**非同步等待點**：

- 頁面載入完成

**斷言**：

| 層 | 斷言 |
|----|------|
| UI — 橫幅 | 顯示「遊戲準備中 — 預覽模式」（`isReadOnly=true` 因為沒有 `fullAccess`） |
| UI — Stats | HP 顯示 **100**（Baseline，也是唯一值） |
| UI — Items | 顯示 item-shield |
| UI — 不崩潰 | 頁面正常渲染，無 JS 錯誤（`baselineData` 為 `undefined`，`??` fallback 正常運作） |
| Server 層 | `getPublicCharacter` response 中 `baselineData` 為 `undefined`（因 `game.isActive=false`，`public.ts:116` 條件不成立） |

**反向驗證**：

- 若程式在 `baselineData` 為 `undefined` 時嘗試讀取 `bl.stats`（移除 `?.`）→ TypeError → spec fail

**設計考量**：

此 case 看似平凡（Baseline === top-level），但驗證的是 `??` fallback 路徑在 `baselineData=undefined` 時不會導致白屏或資料遺失。這是一個防禦性斷言，確保 `getPublicCharacter` 的 `isActive` 條件守衛被正確尊重。

---

## 跨 case 已知陷阱

| # | 陷阱 | 對策 |
|---|------|------|
| 1 | **Runtime 分歧 seed 順序**：必須先 seed Baseline Character，再 seed CharacterRuntime，且 Runtime 的 `refId` 必須指向 Baseline `_id` | seed helper 必須回傳 `characterId`，CharacterRuntime seed 使用該 ID 作為 `refId` |
| 2 | **`getPublicCharacter` 的 `getCharacterData` 讀取 Runtime**：`isActive=true` 時 `getCharacterData` 回傳 Runtime document，top-level `character.*` 是 Runtime 值；`baselineData` 是額外查 Baseline 的結果。兩者來源不同 | seed 必須確保 Runtime 和 Baseline 的值確實不同，否則無法驗出分流 |
| 3 | **`cleanSecretData` / `cleanTaskData` 過濾**：`baselineData` 組裝時套用相同的 `isRevealed` / `isHidden` 過濾邏輯（`public.ts:124-131`）。seed 中的 baseline secret 必須 `isRevealed: true` 才會出現在 `baselineData.secretInfo` 中 | seed 的 secret-A 設為 `isRevealed: true`；secret-B 只存在於 Runtime |
| 4 | **`verify-game-code` 的 `isActive` 守衛**：Game Code 正確但遊戲未啟動時，API 回傳 `gameNotStarted: true`。#11.2 的 seed 必須 `isActive: true` 才能通過 Game Code 驗證 | 共用 seed 已設 `isActive: true` |
| 5 | **`handleRelock` 觸發 `storage` event**：`handleRelock()` 調用 `window.dispatchEvent(new Event('storage'))` 通知 `useSyncExternalStore` 重新讀取。Playwright 不需要手動觸發此 event，因為它是由 button click 的 JS handler 觸發的 | #11.2 只需 click「重新解鎖」按鈕，等待 PIN 畫面出現即可 |
| 6 | **`isReadOnly` 的 `hasPinLock` 前提**：`useLocalStorageUnlock` 在 `hasPinLock=false` 時直接回傳 `hasFullAccess=true`（`character-card-view.tsx:69`），所以 `isReadOnly` 只在有 PIN 鎖的角色上才可能為 `true` | 所有 seed character 必須設 `hasPinLock: true` |
| 7 | **`asPlayer({ readOnly: true })` 必須雙重設定**：session + localStorage 都要設。只設 session → client 仍顯示 PIN 畫面；只設 localStorage → server action 被拒 | fixture 實作必須同時處理兩端 |

---

## Flow #11 專屬 fixture 需求

### `seedRuntimeDivergence` helper

封裝「在已啟動的遊戲中，讓 Runtime 偏離 Baseline」的 seed 邏輯：

```typescript
seedRuntimeDivergence({
  characterId: string,
  runtimeOverrides: {
    stats?: Partial<Stat>[],    // 覆蓋指定 stat 的值
    addItems?: Item[],           // Runtime 額外新增的 items
    skillOverrides?: Record<string, Partial<Skill>>,  // 按 name 覆蓋 skill 欄位
    addSecrets?: Secret[],       // Runtime 額外揭露的 secrets
    addTasks?: Task[],           // Runtime 額外出現的 tasks
  }
})
```

此 helper 僅修改 CharacterRuntime document，不觸碰 Baseline Character。

### 真實 PIN 解鎖 vs fixture 繞過

- **#11.1、#11.3、#11.4**：使用 `asPlayer({ readOnly: true })` fixture 繞過 PIN 畫面
- **#11.2**：先用 `asPlayer({ readOnly: true })` 進入預覽模式，再透過**真實 UI 操作**（點擊重新解鎖 → 輸入 PIN + Game Code）完成模式切換。這驗證了真實的解鎖流程，不能用 fixture 繞過

---

## 延後項目

| 項目 | 原因 | 去向 |
|------|------|------|
| 遊戲結束後自動 relock（`character-card-view.tsx:163-167`） | 需要 WebSocket `game.ended` 事件觸發，屬於 GM 操作跨 context 測試 | 不排程，留原位紀錄 |
| `baselineData` 中 `publicInfo` / `background` 欄位 | 目前 `CharacterBaselineSnapshot` 不包含這兩個欄位（它們不會在 Runtime 中被修改） | N/A（設計上不需要） |
