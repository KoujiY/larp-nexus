# E2E 測試架構

> 本文件說明 LARP Nexus 的 E2E 測試架構設計，供開發者理解測試基礎設施與撰寫新 spec 時參考。

## 架構總覽

E2E 測試使用 **Playwright** + **mongodb-memory-server**，完全離線可跑（不依賴 Atlas、Pusher、SMTP、Docker、WSL）。

```
                     ┌──────────────────────────────────┐
                     │       Playwright Runner          │
                     │  (global-setup / global-teardown)│
                     └─────────┬────────────────────────┘
                               │ spawn
                     ┌─────────▼────────────────────────┐
                     │   Next.js webServer (port 3100)   │
                     │   E2E=1 + webpack alias 啟用      │
                     └─────────┬────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌──────▼────────┐
     │ Pusher Stub   │  │ Test API   │  │ mongodb-      │
     │ (server+client)│  │ Routes     │  │ memory-server │
     └───────────────┘  └────────────┘  └───────────────┘
```

### 關鍵設計決策

| 決策 | 選擇 | 原因 |
|------|------|------|
| 資料庫 | mongodb-memory-server | 離線可跑，每個 test 前清空，無殘留狀態 |
| WebSocket | Pusher stub + SSE IPC | 不依賴外部服務，事件流完整可控 |
| Build 模式 | `next build --webpack` + `next start` | 接近 production 行為，避免 dev HMR 造成超時 |
| 並行度 | `workers: 1` | 共享同一 in-memory DB，避免競態 |
| 重試 | 本地 1 次、CI 2 次 | 兜底非確定性失敗，但不取代根因修復 |

## MongoMemoryServer URI 傳遞機制（Temp File）

### 問題

`global-setup.ts` 在 `process.env.MONGODB_URI` 設定 MongoMemoryServer 的 URI，但 Next.js 的 `loadEnvConfig` 會從 `.env.local` 重新載入環境變數，**覆蓋** `process.env.MONGODB_URI`。結果 Next.js webServer 連到 Atlas 而非 MongoMemoryServer，導致：
- E2E `reset` 操作清空真實資料
- 測試結果不穩定（資料在 Atlas 殘留）

### 解法：Temp File 雙重寫入

```
global-setup.ts
  ├── process.env.MONGODB_URI = uri     （Playwright runner 自己用）
  └── fs.writeFileSync('.e2e-mongo-uri', uri)  （跨進程傳遞）

lib/db/mongodb.ts（resolveMongoUri()）
  └── E2E=1 時優先讀 .e2e-mongo-uri temp file → 取得正確 URI
```

| 檔案 | 變更 |
|------|------|
| `e2e/global-setup.ts` | 導出 `E2E_MONGO_URI_FILE`，啟動後寫入 temp file |
| `e2e/global-teardown.ts` | 清理 temp file |
| `lib/db/mongodb.ts` | 新增 `resolveMongoUri()`，`E2E=1` 時讀 temp file |
| `.gitignore` | 加入 `.e2e-mongo-uri` |

### 驗證方式

連線成功時印出 `[MongoDB] Connected successfully → host/dbName`，spec 中可從 console log 確認連到 `larp-nexus-e2e` 而非 `larp-nexus`。

## Pusher Stub 機制（SSE IPC）

E2E 環境透過 `webpack alias` 將 Pusher 替換為 stub 實作，不連真正的 Pusher cluster。

### 事件傳遞流程

```
Server Action 呼叫 getPusherServer().trigger(channel, event, data)
    │
    ▼
pusher-server.e2e.ts — 寫入 EventEmitter (event-bus.ts)
    │
    ▼
/api/test/events (SSE route) — 監聽 EventEmitter，將事件以 SSE 格式推送
    │
    ▼
Browser EventSource — 接收 SSE 資料
    │
    ▼
pusher-client.e2e.ts — 解析 payload，分派到 channel/event callback
    │
    ▼
React component — 收到 WebSocket 事件，更新 UI
```

### 相關檔案

| 檔案 | 角色 |
|------|------|
| `lib/websocket/pusher-server.e2e.ts` | Server stub：`trigger()` → EventEmitter |
| `lib/websocket/pusher-client.e2e.ts` | Client stub：EventSource → channel callback 分派 |
| `lib/websocket/__e2e__/event-bus.ts` | Singleton EventEmitter，`globalThis` 保護防 HMR 分裂 |
| `app/api/test/events/route.ts` | SSE route：EventEmitter → `text/event-stream` |

### 為何用 `globalThis`

Next.js dev 模式下 HMR 會 re-instantiate module，導致 EventEmitter 實例分裂——server 發到實例 A，SSE route 監聽實例 B，事件丟失。掛在 `globalThis.__LARP_E2E_BUS__` 確保只有一個。

## Test API Routes

E2E 環境提供 4 個僅在 `E2E=1` 時可用的 API route：

| Route | 方法 | 用途 |
|-------|------|------|
| `/api/test/login` | POST | 注入 GM / Player session（iron-session） |
| `/api/test/reset` | POST | 清空 DB + contest-tracker + event bus listeners |
| `/api/test/seed` | POST | 批次建立測試資料（Mongoose model 驗證） |
| `/api/test/db-query` | GET | 查詢 DB 狀態（spec 斷言用） |

### 安全機制

1. **環境檢查**：所有 test route 在第一行檢查 `process.env.E2E !== '1'` → 404，production 環境永遠不可達。
2. **DB 名稱防護**：`reset`、`seed`、`db-query` 三個 route 在操作前檢查連線的資料庫名稱必須包含 `e2e` 或 `test`，否則回傳 403。這是防禦縱深——即使 URI 設定錯誤連到 Atlas，也不會清空/汙染真實資料。

```typescript
const dbName = db.databaseName;
if (!dbName.includes('e2e') && !dbName.includes('test')) {
  return NextResponse.json(
    { error: `Refusing to reset non-test database: "${dbName}"` },
    { status: 403 },
  );
}
```

## Fixtures（`e2e/fixtures/index.ts`）

所有 spec 必須從 `e2e/fixtures` import `test` 和 `expect`，不直接用 `@playwright/test`。

同時導出 `E2E_BASE_URL`（`'http://127.0.0.1:3100'`）和 Playwright 型別（`Page`、`Browser`、`BrowserContext`），供自行建立 context 時使用。

### 提供的 fixture

| Fixture | 類型 | 說明 |
|---------|------|------|
| `resetDb` | auto, per-test | 每個 test 前自動清空 DB + 重設 gameCode 計數器 |
| `seed` | builder | 建立測試資料（`gmUser`、`game`、`character` 等） |
| `dbQuery` | function | 查詢 DB 斷言用，回傳 `any[]` |
| `asGm` | function | 設定 GM session |
| `asPlayer` | function | 設定 Player session + localStorage unlock |
| `asGmAndPlayer` | function | 建立兩個獨立 BrowserContext（GM + Player） |

### Fixture 參數詳解

**`asGm({ gmUserId, email? })`**
- `gmUserId`：必填，GM user 的 `_id`
- `email`：選填，預設 `'e2e-gm@test.com'`

**`asPlayer({ characterId, readOnly? })`**
- `characterId`：必填，角色的 `_id`
- `readOnly`：選填，預設 `false`。為 `true` 時只設 `unlocked`，不設 `fullAccess`（模擬 PIN 預覽模式）

**`asGmAndPlayer({ gmUserId, characterId, email?, readOnly? })`**
- 建立兩個獨立 BrowserContext，分別套用 GM 和 Player session
- 回傳 `{ gmPage, playerPage, gmContext, playerContext }`
- Teardown 時自動關閉兩個 context

### Seed 便利方法

```typescript
// 一步建立 GM + Game
const { gmUserId, gameId, gameCode } = await seed.gmWithGame();

// 一步建立 GM + Game + Character
const { gmUserId, gameId, gameCode, characterId } =
  await seed.gmWithGameAndCharacter();
```

## Helpers（`e2e/helpers/`）

| Helper | 用途 |
|--------|------|
| `waitForToast(page, text)` | 等待 Sonner toast 出現（`[data-sonner-toast]`） |
| `waitForWebSocketEvent(page, opts)` | 等待 SSE 推送的 WebSocket 事件 |
| `waitForDbState(request, opts)` | Polling 等待 DB 達到預期狀態 |
| `clickSaveBar(page, opts?)` | 安全點擊 AnimatePresence 動畫中的 StickySaveBar |
| `setupDualPlayerContext(browser, charAId, charBId)` | 建立雙 Player BrowserContext（對抗、物品轉移用） |

### `waitForWebSocketEvent` 參數

```typescript
waitForWebSocketEvent(page, {
  event: string;          // 必填：event name（如 'role.updated'）
  channel?: string;       // 可選：channel 名稱
  filter?: FilterMatcher; // 可選：結構化 filter
  timeout?: number;       // 可選：超時 ms，預設 10000
})

// FilterMatcher：用 dot-notation path 做 nested property 匹配
{ path: 'payload.subType', value: 'request' }
// 等效於 data?.payload?.subType === 'request'
```

**使用模式**（避免 race condition）：先建立 promise，再觸發動作，最後 await。

```typescript
const p = waitForWebSocketEvent(page, { event: 'role.updated' });
await triggerAction();
const data = await p;
```

### `waitForDbState` 參數

```typescript
waitForDbState(request, {
  collection: string;                                    // 必填：collection 名稱
  filter?: Record<string, unknown>;                      // 可選：查詢 filter
  predicate?: (docs: Record<string, unknown>[]) => boolean; // 可選：判斷條件，預設 docs.length > 0
  timeout?: number;                                      // 可選：超時 ms，預設 10000
  interval?: number;                                     // 可選：輪詢間隔 ms，預設 200
})
```

HTTP 5xx 會立即拋錯（不靜默重試），確保 server 端錯誤能即時暴露。

### `clickSaveBar` 參數與原理

Framer Motion `AnimatePresence` 的 spring 動畫會在 Playwright locator 的 actionability check（①找元素 → ②click）之間 detach DOM 節點。`clickSaveBar` 將「找 + `isConnected` 檢查 + click」合併為單一 `page.evaluate()` 呼叫，消除 TOCTOU gap。

```typescript
clickSaveBar(page, {
  timeout?: number;  // 可選：超時 ms，預設 10000
  interval?: number; // 可選：輪詢間隔 ms，預設 200
})
```

### `setupDualPlayerContext` 用途

建立兩個獨立的 Player BrowserContext（各自有獨立 cookie jar 和 localStorage），用於對抗檢定、物品轉移等雙人互動測試。與 `asGmAndPlayer` 不同——`asGmAndPlayer` 是 GM + Player，`setupDualPlayerContext` 是 Player + Player。

```typescript
const { ctxA, pageA, ctxB, pageB } = await setupDualPlayerContext(browser, charA._id, charB._id);
try {
  // ... test logic
} finally {
  await ctxA.close();
  await ctxB.close();
}
```

注意：需手動關閉 context（不像 `asGmAndPlayer` 有 fixture teardown 自動清理）。

## 測試檔案結構

```
e2e/
├── global-setup.ts          # 啟動 mongodb-memory-server
├── global-teardown.ts       # 關閉 mongodb-memory-server
├── fixtures/
│   └── index.ts             # Playwright custom fixtures
├── helpers/
│   ├── click-save-bar.ts              # AnimatePresence 安全點擊
│   ├── setup-dual-player-context.ts   # 雙 Player context（對抗/轉移用）
│   ├── wait-for-toast.ts              # Toast 等待
│   ├── wait-for-websocket-event.ts    # WebSocket 事件等待
│   └── wait-for-db-state.ts           # DB 狀態 polling
├── smoke/                   # 基礎設施 + 登入 smoke test
│   ├── infrastructure.spec.ts
│   ├── gm-can-login.spec.ts
│   └── player-can-unlock.spec.ts
└── flows/                   # 業務流程 integration test（12 個 flow）
    ├── gm-game-lifecycle.spec.ts
    ├── gm-character-crud.spec.ts
    ├── gm-ability-wizard.spec.ts
    ├── gm-broadcast.spec.ts
    ├── player-use-skill.spec.ts
    ├── item-operations.spec.ts
    ├── item-transfer-effects.spec.ts
    ├── contest-flow.spec.ts
    ├── preset-event-runtime.spec.ts
    ├── auto-reveal.spec.ts
    ├── preview-mode.spec.ts
    └── time-dependent-edges.spec.ts
```

## 撰寫規範

> 開發任何新的 E2E spec 之前，必須先讀完本節所有規則。歷史教訓：Flow #10 反覆失敗 13+ 次，多次是踩到既有規則已記錄的坑。
>
> Flow 設計規格（seed/操作/斷言）見 `docs/archive/e2e-flows-plan.md`。

### 基本原則

1. **從 `e2e/fixtures` import**：`import { test, expect } from '../fixtures';` — 不直接用 `@playwright/test`
2. **斷言分層**：每個 test case 至少包含 UI 層 + DB 層（或 WebSocket 層）斷言
3. **增量驗證**：每寫完 1-2 個 test case 就跑一次，不要一口氣寫完再跑
4. **修一個 pattern 掃全部**：修完一個 locator 問題後，立即 grep `e2e/` 找同類 pattern
5. **驗證 error code 存在**：寫 error/auth test case 前，先 grep server action 確認 error code 實際存在

### A. Locator 選擇策略

**優先序**：`getByRole()` > `page.locator('scope').getByText()` > `getByText()`

| 規則 | 說明 |
|------|------|
| 預設 `exact: true` | `getByRole('button', { name, exact: true })`，避免「編輯」匹配「編輯遊戲代碼」 |
| Scope 到 `main` | `page.locator('main').getByText(...)` 排除 breadcrumb/nav 重複文字 |
| 先讀元件原始碼 | 確認文字出現幾次、是否有父元件累積文字、是否多處渲染同樣文字 |
| Seed 命名避免子字串 | 角色名稱不可包含技能/道具名稱作為前綴（「竊取者」✅ vs「竊取攻擊者」❌） |
| CSS selector 限定 scope | `page.locator('main .game-card')` 避免 RSC streaming 隱藏 DOM 副本 |

**根因**：Playwright strict mode 在 locator 匹配 2+ 元素時直接 fail。Next.js production build 搭配 Radix UI Tabs 會渲染重複的 DOM 節點（頁面出現兩份 tab content），使 `getByText()` / `locator()` / `getByPlaceholder()` / `getByLabel()` 匹配到 2 個元素。

**Radix Tabs 重複 DOM 應對**：凡是在 Radix Tabs 管理的頁面（GM 控制台、角色編輯、玩家角色卡）中使用 `page.getByPlaceholder()`、`page.locator('.bg-card')`、`page.locator('button[aria-label]')` 等非唯一 locator，**一律加 `.first()`**。常見受影響的 pattern：

```typescript
// ✅ 正確
page.getByPlaceholder('章節標題...').first().fill(...)
page.locator('.bg-card').filter({ hasText: '快速廣播' }).first()
page.locator('button[aria-label*="通知"]').first().waitFor(...)
page.getByLabel('遊戲代碼輸入').first()
page.getByRole('switch').first().click()

// ❌ 會 fail（strict mode）
page.getByPlaceholder('章節標題...').fill(...)
page.locator('.bg-card').filter({ hasText: '快速廣播' })
```

**例外**：已 scope 到 dialog（`dialog.getByPlaceholder(...)`）或 `locator('main')` 中的 locator 通常不需要 `.first()`，因為 dialog 和 `<main>` 不受 Radix Tabs 重複影響。

### B. SaveBar 操作指南

StickySaveBar 使用 Framer Motion AnimatePresence spring 動畫，操作時有多個陷阱：

**點擊**：必須用 `clickSaveBar(page)` helper，禁止直接 `saveAllBtn.click()`。`force: true` 也不行（不跳過 attached 檢查，且可能 click 到 detach 的 DOM）。

**Toast 匹配**：
- 聚合 toast：`waitForToast(page, '個分頁的變更')`（唯一匹配聚合 toast）
- 個別 tab：用完整名稱如 `'隱藏資訊已儲存'`
- 禁止用 `'已儲存'` — 會同時匹配個別和聚合 toast

**Save 後穩定化**：等 toast 全部消失再進入下一 Phase：
```typescript
await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });
```
這同時防止 stale toast 誤匹配和 `role.updated` WS 事件導致的 dirty state reset。

**Stale closure 問題**：`useCharacterEditState` 的 Map handler 在 `router.refresh()` 後可能過期。有 `<form>` 的 tab 用 `form.requestSubmit()` 繞過 Map；無 `<form>` 的 tab 合併操作為單次 save。

### C. Seed 資料準備

| 規則 | 說明 |
|------|------|
| 先讀 schema | `shared-schemas.ts` + model 定義，確認 required fields（特別是 `*.id`） |
| 嵌套逐層檢查 | `presetEvents[].id`、`actions[].id` 等嵌套 required 欄位容易遺漏 |
| Collection 名稱 | grep `collection:` 確認實際值，不要猜複數（`game_runtime` 非 `game_runtimes`） |
| `*Id` 自動轉換 | db-query 的 `convertObjectIds` 會將 `*Id` key 從 string 轉 ObjectId。若目標欄位是 String 類型會永遠不匹配，改用其他欄位查詢 |
| Active game 需 runtime | seed active game 的角色時一併 seed `characterRuntime` |
| readOnly 需 PIN | 測試 readOnly 行為時，seed 必須包含 `hasPinLock: true, pin: '...'`（否則 hook 直接回傳 fullAccess） |

### D. 時序與 TOCTOU 防護

**條件渲染**：`setState` 觸發新元素出現時，`fill()` 前必須 `await expect(locator).toBeVisible()`。

**Dialog 內 Radix Select**：Playwright locator 在 AnimatePresence + React re-render 交互下全部不可靠（click/force/dispatchEvent/keyboard 都會失敗）。改用 `page.evaluate()` 直接操作 DOM：
```typescript
await page.evaluate(() => {
  const triggers = document.querySelector('[role="dialog"]')
    ?.querySelectorAll('[data-slot="select-trigger"]');
  (triggers![1] as HTMLElement).click();
});
```

**TOCTOU 防護核心原則**：wait 與 click 必須在同一次 `page.evaluate()` 中完成。`waitForFunction()` + `evaluate()` 分開呼叫之間有 IPC 間隙，DOM 可能在此期間被 detach。toggle 操作用 `page.evaluate(async)` + retry loop 保證只觸發一次。

### E. Toast 與等待策略

| 場景 | 做法 |
|------|------|
| `router.refresh()` 後等重渲染 | 等 toast 出現 + 消失 |
| Server action DB 副作用 | `expect.poll()` 輪詢 DB |
| React effect chain | 保留 `waitForTimeout(500)` 並**註解原因** |
| 負面斷言（無錯誤發生） | `waitForTimeout(500)` + 檢查（無正面信號可 poll） |
| 不一定有 toast 的操作 | 用 dialog 關閉或 WS 事件作為 success indicator |

### F. 個別注意事項

| 項目 | 說明 |
|------|------|
| Cookie 隔離 | `page.request`（共享 cookie）vs `request`（獨立）。fixture 涉及 session 必須用 `page.request` |
| `goto().catch()` 後 | 頁面狀態不可靠，不要再做 goto/reload。用 DB 斷言驗證 |
| Soft delete 持久化 | 有 `<form>` 的 tab 用 `requestSubmit()` 驗證；無 `<form>` 的 tab 只驗 UI 行為 |
| `hasText` vs input value | `filter({ hasText })` 不匹配 `<input value>`，edit mode 需用其他定位策略 |
| Radix Select combobox | 無 accessible name，用 `filter({ hasText: '選擇數值' })` 定位 |
| Dialog sr-only heading | `DialogContent` 產生 sr-only `<h2>` + 可見 `<h1>`，用 `dialog.locator('h1')` 精確定位 |
| Wizard 自動選取 | 「新增效果」後 `selectedEffectIndex` 自動更新，不需手動點 sidebar |
| `networkidle` 禁用 | SSE EventSource 保持連線，`networkidle` 永遠 timeout |
| WS payload 結構 | `waitForWebSocketEvent` 回傳 `BaseEvent`，業務資料在 `.payload` |
| WS timeout 預算 | `page.goto()` 等重操作放在 listener 建立**前**，listener 只框住輕量互動區間 |
| `<button>` in `<form>` | 非 submit 按鈕必須加 `type="button"`，否則意外觸發 form submission |

### G. 失敗時的決策樹

```
Test 失敗
  ├─ 找不到元素 → 看 snapshot 確認 text/role，最多試 2 次選擇器
  ├─ detached / not stable → 不是選擇器問題，改用 page.evaluate()
  ├─ DB 值不符 → 檢查 stale closure / race，改用 expect.poll()
  ├─ 偶發失敗 → retries 兜底 + 追蹤根因
  └─ 連換 3+ 選擇器仍失敗 → 停下來，問題在更深的層級
```

`retries: process.env.CI ? 2 : 1` — 兜底層，不取代根因修復。

## 常用指令

```bash
# 跑全部 E2E
pnpm test:e2e

# 只跑 smoke
pnpm test:e2e:smoke

# 只跑 flows
pnpm test:e2e:flows

# 瀏覽器可視模式
pnpm test:e2e:headed

# Playwright Inspector debug 模式
pnpm test:e2e:debug

# Playwright UI 模式
pnpm test:e2e:ui

# 跑特定 spec
pnpm test:e2e -- e2e/flows/gm-character-crud.spec.ts

# 跑特定 test case
pnpm test:e2e -- -g "test case 名稱"
```
