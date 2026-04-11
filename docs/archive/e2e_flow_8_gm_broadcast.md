# E2E Flow #8 — GM 廣播與單角色訊息

> **上游索引**：本檔案為 [../archive/e2e-flows-plan.md](./../archive/e2e-flows-plan.md) 中 Flow #8 的完整規格。主 plan 僅保留 anchor 與指標。
> **對應 spec**：`e2e/flows/gm-broadcast.spec.ts`
> **關聯 flow**：
> - [e2e_flow_3_gm_edit.md](./e2e_flow_3_gm_edit.md) — GM 編輯流程（含 runtime console 入口）
> - Flow #9（未寫）— 預設事件 runtime 執行（含預設事件觸發的 broadcast，走不同路徑）

---

## ⚠ 基礎設施依賴（Blocker）

1. **WebSocket 事件擷取**
   - 繼承 Flow #5 的 `wsCaptureHelper`：需攔截 `game.broadcast` 和 `role.message` 事件
   - Player context 需同時綁定 `private-game-{gameId}`（broadcast）和 `private-character-{characterId}`（character message）兩個 channel
2. **DB 直接查詢 helper**
   - `PendingEvent.findOne({ targetGameId, eventType: 'game.broadcast' })` — 驗證 broadcast 有寫入
   - `PendingEvent.find({ targetGameId })` — 驗證 character message **沒有**寫入（反向斷言）
   - `Log.findOne({ gameId, action })` — 驗證 Log 記錄
3. **GM context 雙 page 設定**
   - GM page：`asGm(pageGM, { gameId })`
   - Player page：`asPlayer(pagePlayer, { characterId, gameId })`
   - 兩個 page 需在同一 browser context 或各自獨立 context

---

## 設計背景

Flow #8 驗證 **GM → Player 的反向資訊流**。系統提供兩種推送模式：

1. **broadcast 模式**（`pushEvent` type='broadcast'）：
   - `emitGameBroadcast()` → Pusher channel `private-game-{gameId}` + `writePendingGameEvent()`
   - 寫入 `Log`（action='broadcast'，game-level，無 characterId）
   - PendingEvent 用於離線 player 重連後補收

2. **character 模式**（`pushEvent` type='character'）：
   - 直接 `pusher.trigger()` → channel `private-character-{characterId}` + event `role.message`
   - 寫入 `Log`（action='character_message'，character-level，含 characterId）
   - **不寫 PendingEvent**（刻意設計，character 訊息無重連補償）

**GM UI 入口**：`game-broadcast-panel.tsx` — PillToggle 切換模式（全體廣播 / 指定角色），表單含 title（必填）+ message（選填）+ 角色選擇（character 模式必填）。

**與預設事件 broadcast 的分界**：
預設事件的 broadcast（`execute-preset-event.ts:111`）走獨立路徑——直接 `pusher.trigger()` + `writeLog()`，**不經過 `pushEvent()`**，也**不寫 PendingEvent**。該路徑屬 Flow #9 範疇，本 flow 不涉及。

---

## 範圍定義

### 測
- Broadcast 全體廣播：GM 送出 → player 收到通知 + PendingEvent 寫入 + Log 寫入（#8.1）
- Character 指定角色訊息：GM 送出 → player 收到通知 + Log 寫入 + PendingEvent **不存在**（#8.2）
- 表單驗證 + 模式切換：PillToggle 互動 + 必填欄位守門（#8.3）
- Authorization guard：非 GM session 呼叫 → UNAUTHORIZED（#8.4）

### 不測（延後/排除/橫切）
| 項目 | 狀態 | 去處 |
|---|---|---|
| PendingEvent 離線重連 replay | 延後 | 需斷開 WebSocket + 重連的複雜編排 |
| `_eventId` 去重（WebSocket + PendingEvent 同時到達） | 延後 | 需精確控制事件時序，屬 integration test |
| 預設事件觸發的 broadcast（`executeBroadcast`） | 排除 | Flow #9（不同入口、不同 server action、不寫 PendingEvent） |
| Pusher disabled / unavailable | 排除 | E2E 環境 Pusher 必定啟用 |
| 超長 title/message（Pusher 4KB 限制） | 排除 | 基礎設施限制，非應用層邏輯 |
| 多次快速連發 broadcast | 排除 | 無 rate limiting，行為等同單次重複 |
| 目標角色不屬於當前 game | 排除 | `pushEvent` 不做此驗證，無可觀察行為 |
| PendingEvent 24h TTL 過期 | 排除 | 時間依賴 |

---

## Test Case 獨立性設計

| Case | 獨立 seed | 雙 context | Game 狀態 |
|---|---|---|---|
| #8.1 Broadcast 全體廣播 | 1 GM + 1 角色 + 1 active game | ✅（GM + Player） | active |
| #8.2 Character 指定角色訊息 | 1 GM + 1 角色 + 1 active game | ✅（GM + Player） | active |
| #8.3 表單驗證 + 模式切換 | 1 GM + 1 角色 + 1 active game | ❌（僅 GM） | active |
| #8.4 Authorization guard | 1 active game（無 GM session） | ❌（僅 Player） | active |

---

## 共用規格

### 關鍵 Selectors

```ts
// GM 廣播面板
const broadcastPanel = (page: Page) => page.locator('.bg-card').filter({ hasText: '快速廣播' });
const modeToggle = (page: Page, mode: 'broadcast' | 'character') =>
  broadcastPanel(page).getByRole('button', { name: mode === 'broadcast' ? '全體廣播' : '指定角色' });
const titleInput = (page: Page) =>
  broadcastPanel(page).locator('input[placeholder="輸入廣播標題..."]');
const messageTextarea = (page: Page) =>
  broadcastPanel(page).locator('textarea[placeholder*="傳送給玩家"]');
const characterSelect = (page: Page) =>
  broadcastPanel(page).getByRole('combobox');
const sendButton = (page: Page) =>
  broadcastPanel(page).getByRole('button', { name: /發送廣播|發送中/ });

// Player 通知
const notificationWithTitle = (page: Page, title: string) =>
  page.locator('[data-notification]').filter({ hasText: title });
```

### Helpers

```ts
// 等待 toast 成功訊息
async function waitForToastSuccess(page: Page, text: string, timeoutMs = 5000) {
  await page.getByText(text).waitFor({ state: 'visible', timeout: timeoutMs });
}

// 等待 toast 錯誤訊息
async function waitForToastError(page: Page, text: string, timeoutMs = 5000) {
  await page.getByText(text).waitFor({ state: 'visible', timeout: timeoutMs });
}
```

---

## #8.1 Broadcast 全體廣播（happy path）

### 進入點
- GM context：`/games/{gameId}`（runtime console）
- Player context：`/c/{characterId}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：基本角色（stats 不影響本 case）
- `PendingEvent` collection 中無此 gameId 的記錄

### Phase A — GM 發送全體廣播

1. `asGm(pageGM, { gameId })`
2. `asPlayer(pagePlayer, { characterId: A, gameId })`
3. pageGM: 確認 broadcastPanel 可見，modeToggle('broadcast') 預設選中
4. pageGM: titleInput 填入 `'Boss 出現'`
5. pageGM: messageTextarea 填入 `'全員警戒'`
6. pageGM: 點擊 sendButton

### Phase B — 送出結果驗證（GM 端）

7. **GM toast**：等待 `'已推送'` toast 出現
8. **表單重置**：titleInput 和 messageTextarea 的 value 已清空

### Phase C — Player 端接收驗證

9. **WebSocket 事件**：
   ```ts
   const broadcastEvent = await waitForWsEvent(wsCapturePlayer, 'game.broadcast');
   expect(broadcastEvent.payload.title).toBe('Boss 出現');
   expect(broadcastEvent.payload.message).toBe('全員警戒');
   expect(broadcastEvent.payload.priority).toBe('normal');
   ```
10. **Player UI 通知**：notificationWithTitle(pagePlayer, 'Boss 出現') 可見

### Phase D — DB 驗證

11. **PendingEvent**：
    ```ts
    const pending = await PendingEvent.findOne({
      targetGameId: gameId,
      eventType: 'game.broadcast',
    });
    expect(pending).toBeTruthy();
    expect(pending.eventPayload.payload.title).toBe('Boss 出現');
    expect(pending.isDelivered).toBe(false);  // 或 true（取決於 player 是否已消費）
    ```
12. **Log**：
    ```ts
    const log = await Log.findOne({ gameId, action: 'broadcast' });
    expect(log).toBeTruthy();
    expect(log.actorType).toBe('gm');
    expect(log.details.title).toBe('Boss 出現');
    expect(log.details.message).toBe('全員警戒');
    expect(log.characterId).toBeUndefined();  // broadcast 是 game-level，無 characterId
    ```

---

## #8.2 Character 指定角色訊息（happy path + PendingEvent 反向驗證）

### 進入點
- 同 #8.1

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A：`name: '勇者'`
- `PendingEvent` collection 中無此 gameId 的記錄

### Phase A — GM 切換至指定角色模式並發送

1. `asGm(pageGM, { gameId })`
2. `asPlayer(pagePlayer, { characterId: A, gameId })`
3. pageGM: 點擊 modeToggle('character')
4. **斷言 — 角色選擇下拉出現**：characterSelect(pageGM) 可見
5. pageGM: characterSelect 選擇 `'勇者'`
6. pageGM: titleInput 填入 `'密令'`
7. pageGM: messageTextarea 填入 `'前往地下城'`
8. pageGM: 點擊 sendButton

### Phase B — 送出結果驗證（GM 端）

9. **GM toast**：等待 `'已推送'` toast
10. **表單重置**：titleInput、messageTextarea、characterSelect 的 value 已清空

### Phase C — Player 端接收驗證

11. **WebSocket 事件**：
    ```ts
    const msgEvent = await waitForWsEvent(wsCapturePlayer, 'role.message');
    expect(msgEvent.payload.characterId).toBe(A_baselineId);
    expect(msgEvent.payload.from).toBe('GM');
    expect(msgEvent.payload.title).toBe('密令');
    expect(msgEvent.payload.message).toBe('前往地下城');
    expect(msgEvent.payload.style).toBe('info');
    ```
12. **Player UI 通知**：notificationWithTitle(pagePlayer, '密令') 可見

### Phase D — DB 驗證（含反向斷言）

13. **Log**：
    ```ts
    const log = await Log.findOne({ gameId, action: 'character_message' });
    expect(log).toBeTruthy();
    expect(log.actorType).toBe('gm');
    expect(log.characterId.toString()).toBe(A_characterId);  // character-level log 含 characterId
    expect(log.details.title).toBe('密令');
    ```
14. **PendingEvent 反向驗證**（本 case 核心價值）：
    ```ts
    const pending = await PendingEvent.findOne({
      targetGameId: gameId,
      eventType: 'role.message',
    });
    expect(pending).toBeNull();  // character 模式 **不寫** PendingEvent
    ```

---

## #8.3 表單驗證 + 模式切換

### 進入點
- GM context only：`/games/{gameId}`

### 前置 seed
- 1 GMUser + 1 **active** Game
- 角色 A（用於角色選擇下拉列表）、角色 B

### Phase A — PillToggle 模式切換

1. `asGm(pageGM, { gameId })`
2. **斷言 — 預設 broadcast 模式**：modeToggle('broadcast') 有 active 樣式
3. **斷言 — 角色下拉隱藏**：characterSelect(pageGM) 不可見
4. 點擊 modeToggle('character')
5. **斷言 — 角色下拉出現**：characterSelect(pageGM) 可見
6. 點擊 modeToggle('broadcast')
7. **斷言 — 角色下拉再次隱藏**：characterSelect(pageGM) 不可見

### Phase B — Broadcast 模式必填守門

8. **title 為空時點擊送出**：
   - titleInput 留空，點擊 sendButton
   - **斷言 — 按鈕 disabled**：sendButton 的 `disabled` 為 true（`canSubmit` 判斷 `title.trim()` 為空）
   - 或者若按鈕未 disabled：等待 toast.error `'標題為必填'`

### Phase C — Character 模式必填守門

9. 切換至 character 模式
10. titleInput 填入 `'測試'`，但**不選角色**
11. **斷言 — 按鈕 disabled**：`canSubmit` 需要 `targetCharacterId.trim()` 非空
12. characterSelect 選擇角色 A
13. **斷言 — 按鈕 enabled**：sendButton 的 `disabled` 為 false

### Phase D — 角色下拉列表內容

14. **斷言 — 下拉顯示所有角色**：
    - SelectItem 包含角色 A 的 name
    - SelectItem 包含角色 B 的 name

---

## #8.4 Authorization guard（非 GM session）

### 進入點
- Player context only：`/c/{characterId}`

### 前置 seed
- 1 **active** Game + 1 角色 A
- **不** 執行 `asGm()` — 無 GM session

### Phase A — 直接呼叫 server action

> 此 case 不透過 UI 操作（因為 Player 頁面無 broadcast panel），
> 而是透過 `page.evaluate` 或測試 helper 直接呼叫 `pushEvent` server action。

1. `asPlayer(pagePlayer, { characterId: A, gameId })`
2. 透過測試 helper 呼叫：
   ```ts
   const result = await callServerAction('pushEvent', {
     type: 'broadcast',
     gameId,
     title: '惡意廣播',
     message: '不該出現',
   });
   ```

### Phase B — 驗證拒絕

3. **回應**：
   ```ts
   expect(result.success).toBe(false);
   expect(result.error).toBe('UNAUTHORIZED');
   ```
4. **DB 反向驗證**：
   - `PendingEvent.find({ targetGameId: gameId })` → 空
   - `Log.findOne({ gameId, action: 'broadcast' })` → null

---

## 跨 Case 陷阱（Cross-case Pitfalls）

1. **PendingEvent 反向斷言是 #8.2 的核心**：character 模式不寫 PendingEvent 是刻意設計（events.ts:61-73 只走 `pusher.trigger`，不呼叫 `writePendingGameEvent`）。如果未來有人「修正」為也寫 PendingEvent，#8.2 的反向斷言會立即捕獲

2. **`emitGameBroadcast` 注入 `_eventId`**：broadcast 路徑的 `emitGameBroadcast()` 會透過 `generateEventId()` 注入 `_eventId` 到 payload（events.ts:137-142）。WebSocket 斷言時 payload 會多出 `_eventId` 欄位，不要 `toEqual` 嚴格比對整個 payload，改用 `toMatchObject` 或逐欄位 `toBe`

3. **`revalidatePath` 導致 GM 頁面刷新**：`pushEvent` 成功後呼叫 `revalidatePath('/games/${gameId}')`（events.ts:89），GM context 的 page 可能觸發 re-render。#8.1/#8.2 在 Phase B 驗證 toast 和表單重置時，要等 revalidate 完成後再斷言，避免 race condition

4. **Log.characterId 的型別差異**：broadcast 的 Log 不含 `characterId`（game-level），character message 的 Log 含 `characterId`。#8.1 斷言 `characterId` 不存在，#8.2 斷言 `characterId` 等於目標角色——兩者互為反向驗證

5. **character message 的 `from` 欄位**：`pushEvent` character 模式硬編碼 `from: 'GM'`（events.ts:67）。Player 端 `mapRoleMessage()` 使用此欄位（role-events.ts:66-76），斷言時確認 `from === 'GM'`

6. **PillToggle 狀態不持久化**：`game-broadcast-panel.tsx` 的 `type` state 為 `useState('broadcast')` 初始值（line 31）。頁面刷新後回到 broadcast 模式。#8.3 Phase A 的模式切換測試在同一 page 生命週期內完成即可

7. **角色選擇清空**：成功送出 character message 後，`setTargetCharacterId('')`（line 59）清空角色選擇。#8.2 Phase B 應驗證 characterSelect 回到 placeholder 狀態

8. **#8.4 的 server action 直接呼叫**：Player 頁面無 broadcast panel UI，需要透過 `page.evaluate` 或測試 helper 直接呼叫 server action。確認測試基礎設施支援此模式（可能需要 import `pushEvent` 並在 server-side 執行）

---

## 與預設事件 broadcast 的差異（參考用）

| 面向 | Flow #8 `pushEvent` | Flow #9 `executeBroadcast` |
|---|---|---|
| 入口 | `game-broadcast-panel.tsx` | runtime console → `runPresetEvent` |
| Server action | `pushEvent()` | `executePresetEventAction()` |
| PendingEvent | **寫入**（`writePendingGameEvent`） | **不寫**（`execute-preset-event.ts:154` 刻意避免重複） |
| 目標解析 | 固定 broadcast 或單一角色 | `resolveTargets(broadcastTargets)` — 支援 `'all'` 或角色清單 |
| Log action | `'broadcast'` / `'character_message'` | `'broadcast'`（統一） |

> 此對照表僅供參考。預設事件 broadcast 的 E2E 覆蓋屬 Flow #9 範疇。
