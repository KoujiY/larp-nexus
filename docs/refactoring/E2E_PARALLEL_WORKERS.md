# E2E 平行化方案：Per-File Worker Isolation

> 狀態：**規劃中** | 預估工時：**2-3 小時**
> 此文件僅供開發參考，不納入 commit。

## 問題背景

目前 E2E 測試以 `workers: 1` 單線程執行，原因是所有 spec 共享同一個 `mongodb-memory-server` 實例。隨著 spec 數量增長（目前 15 個檔案），單線程執行時間已成為開發瓶頸，且單一 worker 的資源壓力偶爾導致 flaky failure（如 `router.refresh()` timeout）。

### 現行架構限制

```
┌─────────────────────────────────────────────┐
│  mongodb-memory-server (global-setup 啟動)   │
│  ↑ 所有 spec 共用，每個 test 前 resetDb 清空  │
└─────────────────────────────────────────────┘
        ↑
┌───────┴───────┐
│   Worker #0    │  ← 唯一 worker，跑完 15 個 spec
│  (sequential)  │
└────────────────┘
```

**衝突點**：
1. `gameCodeCounter` 是 module-level global，`resetDb` 歸零 → 多 worker 會產生相同的 `E2E001`
2. `resetDb` 呼叫 `/api/test/reset` 清空**所有** collection → Worker A 的 reset 會殺掉 Worker B 正在用的資料
3. 部分 spec 使用 hardcoded `gameCode`（如 `ORIG01`、`EXIST1`）→ 跨 worker 會碰撞

## 方案：Per-File Worker Isolation

在**不改動 DB 架構**的前提下，透過 worker index prefix 實現資料隔離。

### 目標架構

```
┌─────────────────────────────────────────────┐
│  mongodb-memory-server (global-setup 啟動)   │
│  ↑ 仍是單一實例，但 collection 內的資料靠     │
│    gameCode prefix 隔離                      │
└─────────────────────────────────────────────┘
        ↑
┌───────┼───────────┐
│   Worker #0       │   Worker #1       │
│  prefix: W0       │  prefix: W1       │
│  W0E2E001...      │  W1E2E001...      │
│  W0ORIG01...      │  W1ORIG01...      │
└───────────────────┘───────────────────┘
```

### 變更清單

#### 1. `playwright.config.ts`

```diff
- fullyParallel: false, // 測試共享同一個 in-memory DB，避免競態
- workers: 1,
+ fullyParallel: true,
+ workers: process.env.CI ? 2 : 4,  // CI 資源較少，本機可開更多
```

#### 2. `e2e/fixtures/index.ts` — gameCode prefix

```typescript
// ─── Worker-scoped gameCode ──────────────────

let gameCodeCounter = 0;

function workerPrefix(testInfo: TestInfo): string {
  return `W${testInfo.parallelIndex}`;
}

function nextGameCode(testInfo: TestInfo): string {
  gameCodeCounter += 1;
  return `${workerPrefix(testInfo)}E2E${String(gameCodeCounter).padStart(3, '0')}`;
}
```

影響範圍：
- `seed.game()` 和 `seed.gameRuntime()` 的 `gameCode` 預設值改用 `nextGameCode(testInfo)`
- 需要把 `testInfo` 傳入 seed builder（fixture 簽名本身就有 `{ request }` 可加 `testInfo`）

#### 3. `e2e/fixtures/index.ts` — resetDb 改為 scoped reset

目前 `resetDb` 呼叫 `/api/test/reset` 清空所有 collection。改為**不清空**，改用 `gameCode` prefix 隔離：

**方案 A（推薦）：移除 resetDb 的全域清空**

```typescript
resetDb: [
  async ({ request }, use, testInfo) => {
    // 不再清空 DB，改靠 prefix 隔離
    gameCodeCounter = 0;
    await use();
  },
  { auto: true, scope: 'test' },
],
```

**方案 B：scoped cleanup（依 worker prefix 清除）**

```typescript
resetDb: [
  async ({ request }, use, testInfo) => {
    const prefix = workerPrefix(testInfo);
    const response = await request.post('/api/test/reset', {
      data: { gameCodePrefix: prefix },
    });
    // ...
    gameCodeCounter = 0;
    await use();
  },
  { auto: true, scope: 'test' },
],
```

方案 B 需要修改 `/api/test/reset` API 支援 prefix filter，但隔離更乾淨。

#### 4. Hardcoded gameCode — 需要加 prefix 的 spec

以下 spec 在 `seed.game()` 中傳入了 hardcoded `gameCode`，需要改為 worker-scoped：

| Spec 檔案 | 行號 | Hardcoded 值 | 用途 |
|-----------|------|-------------|------|
| `gm-game-lifecycle.spec.ts` | 98 | `EXIST1` | 測試 gameCode 重複偵測 |
| `gm-game-lifecycle.spec.ts` | 115 | `ORIG01` | 測試 gameCode 修改 |
| `gm-game-lifecycle.spec.ts` | 116 | `TAKEN1` | 測試 gameCode 已被佔用 |
| `gm-game-lifecycle.spec.ts` | 193 | `EDIT01` | 編輯遊戲設定 |
| `gm-game-lifecycle.spec.ts` | 369 | `EVNT01` | 事件系統 |
| `gm-game-lifecycle.spec.ts` | 502 | `LIFE01` | 生命週期 |
| `gm-game-lifecycle.spec.ts` | 644, 671 | `DELA01` | 刪除流程 |
| `gm-game-lifecycle.spec.ts` | 683 | `ISOL01` | 隔離測試 |
| `preview-mode.spec.ts` | 29, 200 | `PREV11` | 預覽模式需填入 game code |

**修改策略**：提供 `testGameCode(testInfo, suffix)` helper：

```typescript
function testGameCode(testInfo: TestInfo, suffix: string): string {
  return `${workerPrefix(testInfo)}${suffix}`;
}

// 使用範例
const code = testGameCode(testInfo, 'ORIG01'); // → "W0ORIG01" or "W1ORIG01"
await seed.game({ gmUserId: gm._id, gameCode: code });
```

**注意**：`preview-mode.spec.ts` 第 200 行的 `gameCodeInput.fill('PREV11')` 是 UI 操作填入值，也需要改為動態值。

#### 5. `NEWCD1` 斷言值（gm-game-lifecycle.spec.ts:148）

```typescript
expect(games[0].gameCode).toBe('NEWCD1');
```

這是 UI 操作產生的值（使用者在 input 中手動輸入 `NEWCD1`），不經過 `nextGameCode()`。需要：
- 把 UI 填入的值也改為帶 prefix（例如 `W0NEWCD1`）
- 或者確認此值不會跨 worker 碰撞（手動輸入的 code 不在 DB 中查詢唯一性時碰到其他 worker 的 seed data）

### 不需修改的部分

- **Session / cookie 隔離**：Playwright 每個 worker 有獨立 browser context，session cookie 天然隔離
- **localStorage 隔離**：同上，每個 browser context 獨立
- **PIN 值**：PIN 唯一性是 per-game 的，game 已被 prefix 隔離，PIN 不會跨 worker 碰撞
- **`asGm` / `asPlayer` fixture**：使用 `page.request` 或 `context.request`，cookie 綁定在 context 上

### 執行步驟

1. **建立 `testGameCode` 和修改 `nextGameCode`**（~30 min）
   - 在 `e2e/fixtures/index.ts` 加入 `workerPrefix()`、`testGameCode()` helper
   - 修改 `nextGameCode()` 接受 `testInfo` 參數
   - 修改 `seed.game()` 和 `seed.gameRuntime()` 使用新的 `nextGameCode`

2. **修改 `resetDb`**（~15 min）
   - 選擇方案 A（移除全域清空）或方案 B（scoped cleanup）
   - 如選方案 B，需修改 `/api/test/reset` route

3. **遷移 hardcoded gameCode**（~45 min）
   - 逐一修改上表列出的 10 處 hardcoded 值
   - 特別注意 `preview-mode.spec.ts` 的 UI 填入值

4. **修改 `playwright.config.ts`**（~5 min）
   - `fullyParallel: true`
   - `workers` 設為適當數值

5. **掃描 Tailwind 4 transition 陷阱**（~10 min）
   - `grep -r "transition-\[transform" --include="*.tsx" --include="*.ts"` 確認無殘留的錯誤 transition target
   - 若有，改為 `transition-[translate,opacity]` 或 `transition-transform`（見下方「Tailwind 4 CSS Transition 陷阱」）

6. **驗證**（~30 min）
   - 單 worker 執行確認不 break：`pnpm test:e2e -- --workers=1`
   - 多 worker 執行確認無競態：`pnpm test:e2e -- --workers=4`
   - 重複執行 3-5 次確認穩定性

### 風險與注意事項

1. **gameCode 長度限制**：如果 DB schema 對 `gameCode` 有長度限制，加上 prefix（`W0`/`W1`）後可能超過。需確認 `Game` model 的 validation。

2. **resetDb 全域清空的移除**：不清空 DB 代表測試間可能累積資料。如果 spec 依賴「DB 是空的」來斷言（例如 `expect(games).toHaveLength(1)`），需要改為更精確的 filter 查詢。

3. **CI 資源**：多 worker 增加記憶體用量（每個 worker 有獨立 browser context）。CI 環境可能需要限制 `workers: 2`。

4. **spec 間的隱式依賴**：目前 `fullyParallel: false` + `workers: 1` 使得 spec 執行順序固定。開啟平行化後，任何依賴執行順序的隱式假設都會暴露。需逐一檢查 spec 是否有跨 test 的狀態依賴。

### Tailwind 4 CSS Transition 陷阱

> Save bar 的案例已在 perf PR 中修復，但專案內可能還有其他同樣問題。
> **待辦**：執行 E2E 平行化時，同步掃描全專案 `transition-[transform` 確認無漏網之魚。

Tailwind 4 將 `translate-y-*` / `scale-*` / `rotate-*` 從 `transform` shorthand 改為 CSS Individual Transform Properties（`translate` / `scale` / `rotate`）。這是不同的 CSS 屬性：

```css
/* Tailwind 3 */
.translate-y-24 { transform: translateY(6rem); }

/* Tailwind 4 */
.translate-y-24 { translate: 0 6rem; }
```

**陷阱**：`transition-[transform,opacity]` 只 transition `transform` 屬性，不會 transition `translate`。位移會瞬間跳躍，只有 opacity 有動畫。

**正確寫法**：
- `transition-[translate,opacity]` — 精確指定
- `transition-transform` — Tailwind 4 內建，自動涵蓋 `transform, translate, scale, rotate`
- `transition` / `transition-all` — 涵蓋所有屬性

**排查方式**：如果 CSS transition 看起來「有動畫但卡頓」，先確認 `transition-property` 是否對應到實際變動的 CSS 屬性。此問題不會被 tsc、ESLint 或 E2E 偵測到。

**專案內掃描**：修改 CSS 動畫時，grep `transition-[transform` 確認沒有漏網之魚。

### 預估改善

| 指標 | 現在 (workers: 1) | 預估 (workers: 4) |
|------|-------------------|-------------------|
| 總執行時間 | ~4-5 分鐘 | ~1.5-2 分鐘 |
| Flaky rate | 偶發 timeout | 預期降低（資源分散） |
| DB 記憶體 | ~50 MB | ~50 MB（同一實例） |
| Browser 記憶體 | 1 context | 4 contexts (~+300 MB) |
