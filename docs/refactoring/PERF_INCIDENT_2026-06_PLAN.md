# 效能事故調查與修復計畫（Performance Incident）

> 狀態：**改前基準線完成（Step 1–3 結案，根因已坐實）→ 進入 Step 4 修復** ｜ 建立：2026-06-10 ｜ 基準線：2026-06-11 ｜ 事故：上週末（約 2026-06-06/07）下午 13:30–17:30
>
> 本文件為跨 session 交接用，自足可讀。處理時請先讀完「環境事實」與「Step 1 假設總表」，避免重走已排除的路。

---

## 背景 / 事故描述

- **活動規模**：10 玩家端 + 1 GM 端 + 2 NPC 角色（NPC 等同玩家端、有角色卡但不頻繁操作）≈ 13 活躍角色。
- **症狀**：
  1. 玩家使用技能/道具時**嚴重延遲、堵塞**；攻擊通知**延遲數十分鐘**才送達。
  2. GM 端也堵塞，**畫面空白 + 一行「負載過重」提示**。
  3. **非全程**，而是**間歇性爆發**，與「多人同時操作」的尖峰高度相關。

---

## 環境事實（已確認）

| 項目 | 值 | 備註 |
|------|----|----|
| DB | MongoDB Atlas **M0（Free）**, AWS **Tokyo (ap-northeast-1)** | M0 官方標示「不可用於 production」 |
| Host | Vercel **Hobby**, region **Tokyo (hnd1)** | `vercel.json` 無 `regions` 設定，預設即 hnd1 |
| WebSocket | Pusher, cluster **ap3（Singapore）** | 與 function（東京）**跨區** |
| Function timeout | Hobby 預設約 **10s** | 超時 → function 被砍 |
| Mongoose 連線 | 標準 global cache（`lib/db/mongodb.ts`） | **未設 `maxPoolSize`**（預設池上限 100/容器） |
| pending_events | **無 TTL index**（僅普通 index），無清理 cron | 長期會膨脹（`lib/db/models/PendingEvent.ts`） |

---

## 關鍵觀測證據（已蒐集）

- **Atlas Opcounters（事故時段 13:30–17:30）**：所有操作 ≤ **~2 ops/秒**（peak）。
- **Atlas Connections（同時段）**：peak **58 / 上限 500** → 連線**遠未飽和**。
- **`getCharacterData` 一次呼叫 = 3 次循序 DB 查詢**（`Character.findById` + `Game.findById` + `CharacterRuntime.findOne`），且每個動作被呼叫多次、常重複抓同一角色。（`lib/game/get-character-data.ts`）
- **估算：一場「對抗檢定結算」≈ 20–40 次循序 DB 來回 + 5–15 次 Pusher HTTP 呼叫**，全部 `await` 循序。
- **Region**：Vercel（東京）↔ Atlas（東京）**同區**（DB 往返低）；但 Pusher（新加坡）↔ function（東京）**跨區**（每 emit ~70–100ms）。

> ⚠️ Vercel raw runtime log 與當下「負載過重」訊息**均已過期/遺失**（Hobby + M0 保留期短），retroactive 證明走不通 → 改用「製造可控證據」（見 Step 2）。

---

## 核心觀念（避免重蹈覆轍）

> **這是「延遲受限（latency-bound）」問題，不是「吞吐受限（throughput-bound）」問題。**
>
> Atlas Opcounters 量的是**吞吐量**；瓶頸是**單動作延遲**。系統「每秒只做 2 個操作」卻「每動作等數秒~超時」，因為操作是**一個接一個循序等待**，而非塞爆頻寬。**DB 很閒（58/500、2 ops/秒）正說明大家都在排隊等上一步，不是在擠爆 DB。** 大半延遲（Pusher 跨區往返、Hobby 冷啟動、循序等待）**落在 Atlas 視野之外**。
>
> 推論：**升級 Atlas/Vercel 是止痛，減少 per-action fan-out 才是治本。先改碼，再決定要不要花錢升級。**

---

## Step 1 — 所有可能原因（含已排除）

| # | 假設 | 狀態 | 依據 |
|---|------|------|------|
| 1 | Atlas 連線數爆掉（connection storm） | **已排除** | peak 58 / 上限 500 |
| 2 | Atlas 吞吐量飽和（DB overload） | **已排除** | ~2 ops/秒 |
| 3 | Region 落差（Vercel↔Atlas） | **已排除** | 兩者同在東京 |
| 4 | **單一動作 fan-out 過大（latency-bound）** | **✅ 坐實（2026-06-11 壓測）** | `[perf]` 實測：最簡單的自身技能 = 20 dbOps；contest-respond = 19–24 dbOps |
| 5 | Pusher emit + pending event 寫入為**阻塞式 `await`** | **❌ 推翻** | `[perf]` 實測：pusher 佔比僅 11–103ms（總耗時 1–3%），即使 burst 也不變；S4 emit→送達 ≈ 0ms |
| 6 | `getCharacterData` 3 查詢 × 重複呼叫 | **✅ 坐實** | `[perf]` 實測：自身技能 getChar=5、contest-respond getChar=6（每次 = 3 查詢） |
| 7 | Hobby 冷啟動 + 10s timeout → 慢動作被砍 → 通知靠 pending events 延遲補送 | **✅ 坐實（「數十分鐘」主因）** | 冷啟動輪 total 5.6–8.0s、貼近 10s 線；S2 max 10.63s；S4 證明送達瞬時 → 延遲只可能來自「動作沒完成 → 補送」 |
| 8 | GM 端「收到事件就重抓 `getGameLogs`」→ 尖峰自我放大 → Hobby 併發耗盡 | **存疑（基準輪未測）** | 壓測未含 GM 端模擬；`get-game-logs` 埋點已就位，修復驗證輪補測 |
| 9 | pending_events 無 TTL → 集合膨脹 → 查詢漸慢 | **次要/長期** | `lib/db/models/PendingEvent.ts` 無 `expireAfterSeconds` |
| 10 | Pusher 免費層 message-rate 限流 | **❌ 排除** | 壓測峰值 157 msg/s，dashboard 無 error / 限流；S4 端到端延遲 p95 ≤ 21ms |
| 11 | M0 操作限流（throttling）單獨成因 | **暫排除** | ops 太低；burst 瞬間仍可能，但無證據，非主因 |
| 12 | **（新發現）同 instance 併發 + M0 → DB 單操作延遲放大** | **✅ 坐實** | Vercel Fluid 把多請求塞進同一 instance（log `concurrency` 達 5）：同樣 ~20 ops，無競爭時 db≈95ms，burst 時膨脹至 2000–4800ms（單操作 ~4ms → 100–200ms） |

---

## Step 2 — 盤查（量測基礎建設 + 壓測規格）

舊 log 已蒸發 → 自己製造可控證據。分三部分：**埋點 → 壓測環境 → 壓測情境**。

### 2.1 埋點（measurement substrate）— 第一步、純觀測、低風險 ✅ 完成（2026-06-10，分支 `feat/perf-instrumentation`）

> 實作摘要：`lib/perf/perf-context.ts`（AsyncLocalStorage 累加器 + `runWithPerf`）+
> `lib/perf/db-timing.ts`（包 `Query.exec`/`Aggregate.exec`/`save`/`insertMany`，全 model 查詢自動計時）。
> 包裝範圍：skill-use、item-use、item-transfer、contest-respond、select-target-item、
> contest-select-item、get-game-logs（#8 量尺）。
> 輸出含 `dbOps=<n>` 擴充欄位；入口另印 `[perf:start]`（與 `[perf]` 配對找出被 timeout 砍掉的請求）。
> 開關 `PERF_LOG=1`，預設關閉、零行為改變。已通過本機驗收。

在熱路徑各 server action 與 emit 層加結構化計時，**每個動作輸出一行** `[perf]` log：

- 固定格式（方便 grep 與後續解析）：
  ```
  [perf] action=<name> reqId=<id> total=<ms> db=<ms> pusher=<ms> getChar=<n> emits=<n> result=<ok|timeout|error>
  ```
- 量測點：
  - server actions：`app/actions/skill-use.ts`、`app/actions/item-use.ts`、`app/actions/contest-respond.ts`、`app/actions/select-target-item.ts`、`app/actions/contest-select-item.ts`
  - emit 層 `lib/websocket/events.ts`：累計 Pusher trigger **總耗時**與**次數**
  - `lib/game/get-character-data.ts`：累計**呼叫次數**
- 實作建議：用 `AsyncLocalStorage` 持有一個 per-request `perf` 累加器，避免污染所有函數簽名；統一前綴 `[perf]` 方便篩。
- **這組埋點同時是驗收的量尺**（改前/改後都用它）→ 務必先做、全程保留、最後再移除（或用 env 旗標 gate 起來）。

### 2.2 壓測環境（在哪測）— ✅ 環境決策已拍板（2026-06-10）

- **只對 staging 測，絕不對 production**（production 是真實遊戲 DB）。
- 前置工作項：在 staging 準備一個 **`isActive=true` 的 seed 遊戲 + N 個角色 + 可程式化登入**。
  - 可沿用既有測試登入端點 `/api/test/login`（E2E 用，受 `E2E=1` gate），或在 staging 開一個專用 seed 路由。
- 工具：**k6**（能寫 burst 情境）；S4 的 Pusher 訂閱端改用 **Node 伴隨腳本**（pusher-js 自動處理私有頻道授權，比 k6 原生 ws 手刻握手可靠）。

**已拍板的環境決策**：
- **staging = Vercel Preview 部署**（推分支即自動產生；不另建 staging 分支，直接用 `feat/perf-instrumentation` 的 preview）。
- **Atlas / Pusher 皆與 prod 共用同一個 cluster / app**（代表性優先：量到的就是事故機器/app 的真實行為，含 M0 與 Pusher 免費層限流特性）。代價是**時間隔離鐵律：壓測不得與真實活動同時進行**。
- Preview 環境變數：`MONGODB_URI` → `larp-nexus-loadtest`（名稱必須含 `test`，test route DB 防護才放行）、`PERF_LOG=1`、`LOADTEST_TOKEN`。**不設 `E2E`**。
- ⚠️ **關鍵發現：`E2E=1` 是 build-time webpack alias**，會把 Pusher server/client 換成 in-process stub —— staging 若設 E2E，壓測量到的是假 Pusher，完全失真。因此 test route 守門改為兩模式（`lib/test-route-guard.ts`）：本機 `E2E=1` 照舊；staging 憑 `LOADTEST_TOKEN` + `x-loadtest-token` header 開啟。
- Vercel Deployment Protection 維持開啟，壓測腳本以 `x-vercel-protection-bypass` header（Protection Bypass for Automation secret）通過。

### 2.3 壓測情境（怎麼測）

| 情境 | 設定 | 目的 |
|------|------|------|
| **S1 持續負載** | 13 VU，各自每 20–40s 做一次技能/道具動作，持續 5 分鐘 | 對照「平時稀疏操作」基準（預期負載低） |
| **S2 尖峰負載（主測項）** | 在 **1–2 秒窗口內**同時觸發 **10–15 個**技能/對抗動作（模擬團戰齊發），每 30s 一輪、跑 5 輪；含一場「多人同時回應同一對抗」 | **重現崩潰的關鍵情境** |
| **S3 找天花板** | 同時動作數階梯式上拉：13 → 20 → 30 …，直到出現 timeout | 量出系統實際可承載的「**同時動作數**」上限 |
| **S4 端到端延遲** | 一組 VU 訂閱 Pusher/WS，量「動作 POST 送出 → 對應通知收到」的**時間差** | **直接量使用者感受的延遲**（對應「數十分鐘」症狀） |

> ⚠️ **關鍵**：壓力來自**同時性（burst）**，不是掛機人數。平均散開的腳本會像 Atlas 那張閒置圖一樣照不出問題 —— S2/S4 的「1–2 秒內齊發」才是重點。

### 2.4 補充資料（並行進行）

- Pusher dashboard：確認 burst 時 message rate、是否觸發免費層限流。

---

## Step 3 — 鎖定根因 + 驗收方法 ✅ 結案（2026-06-11 基準線）

**最終根因判定**：

1. **主因 = #4 fan-out（DB 來回數）× #12 併發放大 × #7 冷啟動** 的三重疊加：
   - 每動作 17–24 次 DB 操作（含 `getCharacterData` 3–6 次、`updateCharacterData` 每次寫入前多 2 次查詢）。
   - burst 時 Vercel Fluid 將多請求塞進同一 instance，DB 單操作延遲放大 20–50 倍（4ms → 100–200ms）→ 20 ops × 150ms ≈ 3 秒。
   - 冷啟動再疊 1.5–2 秒（Next 啟動 + Mongoose 連線），合計貼近 10s timeout。
2. **「通知延遲數十分鐘」= 雙路徑匯流到 pending events 補送**（**不是傳輸延遲**，S4 實測 emit→送達 ≈ 0ms）：
   - 路徑 a（故障）：動作被 timeout 砍掉 → 通知從未發出 → 等補送。
   - 路徑 b（架構性，非故障）：接收方鎖屏/切後台 → WebSocket 斷線 → 即時通知無人收 → 等補送。LARP 現場玩家頻繁鎖屏，b 必然大量發生。
   - 兩條路徑的送達時間都 =「接收方下次開畫面」→ 數十分鐘。**修復只能消滅 a；b 是 pending events 照設計運作**，若要鎖屏可收通知需另立 Web Push 議題（超出本計畫範圍，驗收時須向使用者說明此界線）。
3. **#5（阻塞 emit）與 #10（Pusher 限流）正式出局**：pusher 佔比 1–3%、157 msg/s 無限流。
4. **「整個系統卡死」的體感放大器**：對抗越慢 → 角色被 `USER_IN_CONTEST`/`TARGET_IN_CONTEST` 鎖越久 → 其他玩家的動作被規則擋下（S2 實測 ~30% 被擋），單點延遲透過遊戲規則擴散成全場堵塞感。
5. **#8（GM 端自我放大）基準輪未測**，`get-game-logs` 埋點已就位，修復驗證輪補測。

**關鍵情境重現確認**：S2（13 人齊發）對抗結算 med 3.87s、p90 10.69s、max 10.85s —— 與事故症狀（間歇性爆發、與多人同時操作高度相關）完全吻合；S3 證明暖機下 30 併發也不會 timeout → 觸發條件是「burst 撞上冷啟動」的組合，不是單純人數。

---

## Step 4 — 修復（依基準線數據改寫優先序，2026-06-11）

> 改寫理由：基準線推翻了「阻塞 emit 是大頭」的預設（實測佔比 1–3%），坐實了「DB 來回數 × 併發放大」才是延遲主體。優先序從「省 emit 時間」全面轉向「**省 DB 來回數**」。

| 優先 | 措施 | 預期效果（依實測推算） | 風險 | 主要檔案 |
|------|------|----------|------|----------|
| **最高** | **消除重複 `getCharacterData` / `updateCharacterData` 前置查詢**：action 內傳遞已讀 doc；`updateCharacterData` 不再每次寫入前重查 Character+Game（每動作 2–6 次寫入 × 2 查詢 = 4–12 ops 純浪費） | contest-respond 24 ops → 估 ~12 ops；burst 時單操作 150ms 計，**省 1.5–2 秒** | 中 | `lib/game/update-character-data.ts`, `app/actions/skill-use.ts`, `app/actions/item-use.ts`, `app/actions/contest-respond.ts`, `lib/contest/*` |
| **最高** | **`getCharacterData` 自身減查詢**：per-request 快取 `game.isActive`（3 查詢 → 首次 3、後續 1） | getChar 5–6 次 × 省 2 ops = **省 10–12 ops** | 中 | `lib/game/get-character-data.ts` |
| 高 | **冷啟動瘦身**：檢視啟動時工作（連線已有 global cache；`maxPoolSize` 調低、`minPoolSize`/心跳設定避免重握手） | 冷啟動懲罰 1.5–2s → 目標 <1s | 低 | `lib/db/mongodb.ts` |
| 高 | **GM log 刷新 debounce/節流**（合併刷新，如 500ms）——#8 未測，先做防禦性修復並於驗證輪量測 | GM 請求量降一個量級 | 低 | `components/gm/runtime-console-ws-listener.tsx`, `components/gm/event-log.tsx` |
| 中 | **平行化獨立操作（`Promise.all`）**：通知管理器內互不依賴的查詢/寫入並行 | 縮短牆鐘時間（ops 數不變但不再純循序） | 中 | `lib/contest/contest-notification-manager.ts`, `lib/contest/contest-effect-executor.ts` |
| **降級為中** | emit + pending event 非阻塞化（fire-and-forget） | 實測僅省 11–103ms + 2–4 次 pending 寫入；仍有價值但非主菜 | 中（須保留事件順序，見注意事項） | `lib/websocket/events.ts`, `lib/websocket/pending-events.ts` |
| 低（體質） | pending_events 加 TTL index | 防集合長期膨脹 | 低 | `lib/db/models/PendingEvent.ts` |
| 選用（產品決策） | 升 Vercel Pro（timeout 60s + 更多暖 instance）/ Atlas tier | **止痛非治本**；改碼後重新評估 | — | — |

---

## Step 5 — 驗收（明確路徑、量尺、通過門檻）

### 5.1 流程（不可跳步）

1. 部署**「只含埋點」的 build** 到 staging → 跑 S1/S2/S3/S4 → 記錄為**「改前基準」**（填 5.2 表 baseline 欄）。
2. **逐項套用修復**（依 Step 4 優先序），**每套一項就重跑 S2**，記錄 delta（確認該項有效且無回歸）。
3. 全部套完 → 重跑 **S1/S2/S3/S4** → 填 5.2 表「改後」欄。
4. 對照 5.2 的**通過門檻逐條打勾**；全綠才算驗收通過。
5. **回歸閘門**：`tsc` + `eslint` + `vitest` + `e2e/flows/contest-flow.spec.ts` 全綠。
6. 移除 `[perf]` 埋點（或以 env 旗標 gate）。

### 5.2 量尺與通過門檻（pass/fail，含具體數字）

| 指標 | 量測來源 | 改前基準（2026-06-11） | **通過門檻** |
|------|----------|----------|--------------|
| 單一 `contest-respond` 動作 total（p95） | `[perf]` log / k6 | **暖 burst p95 ≈ 2.92s（max 3.9s）**；對抗完整結算（發起+回應）med 3.87s、p90 10.69s、max 10.85s | **< 2000ms**，且**永不**達 10s timeout |
| 單動作 DB 操作數 / emit 次數 | `[perf]` log | **skill-use：20 ops / 1 emit / getChar 5；contest-respond：19–24 ops / 2 emits / getChar 6** | ops 顯著下降（目標 ≤ 半數）；emit 記錄即可 |
| emit 是否阻塞主流程 | `[perf]`：pusher vs total | pusher 僅 11–103ms（1–3%）——**已證實非瓶頸** | 維持不阻塞即可（門檻改為資訊性） |
| S2（10–15 同時動作）function timeout 數 | k6 客戶端記錄（主）+ Vercel log（輔） | **0 timeout**；1×HTTP 500；max 10.63s（貼線） | **= 0** 且 max 遠離 10s 線 |
| 端到端通知延遲（p95，S4） | s4-subscriber（pusher-js） | **p95 ≤ 21ms（≈ 0，時鐘偏差內）** | **< 3s**（已達標——瓶頸不在此） |
| GM 端 burst 時「負載過重」/5xx | Vercel log + 實際觀察 | 未測（基準輪無 GM 端模擬） | **無** |
| GM `getGameLogs` 呼叫頻率（S2） | `[perf]` / log | 未測（埋點已就位，驗證輪補測） | 較基準**降低 ≥ 一個量級**（debounce 生效） |
| 系統可承載「同時動作數」上限（S3） | 階梯壓測 | **≥ 30（暖機，0 timeout；p90 4.11s）**；冷啟動 + 13 burst 即貼 10s 線 | **≥ 20**（暖機已達標；改善目標 = 冷+burst 也不貼線） |
| Pusher message rate（2.4 補充） | Pusher dashboard | 峰值 157 msg/s，無 error / 限流 | 資訊性 |
| 冷啟動單動作 total | `[perf]` log | **5.6–8.0s**（db 含連線等待 8.4–10s） | 顯著下降（目標 < 3s） |

### 5.3 簽核條件

- 5.2 表**每一條**門檻達標 **+** 回歸閘門全綠 **+** 使用者確認 → 才結案。
- 任一項無法達標 → 回 Step 4 補強，或重新評估根因（必要時才動用「選用：升 tier」）。

---

## ⚠️ 注意事項 / 已知地雷（處理時務必遵守）

1. **非阻塞化 emit ≠ 全部無腦 fire-and-forget**：codebase 有**明確的事件順序需求**（例如「對抗結果通知必須先於自動揭露通知送達」—— 見 `contest-respond.ts` 的 `pendingReveal` 延遲觸發設計）。改造時要保留必要順序，只把「彼此獨立、且失敗不影響正確性」的 best-effort 寫入/推送解耦。
2. **改的是核心對抗/技能/道具流程** → 嚴格走「縱向分析 → 改 → 測 → 使用者驗收」，不可破壞既有正確性（對抗結算事件順序、pending event 補送語意、跨通道去重 `_eventId`）。
3. **別再用 Atlas Opcounters 當主要儀器** —— 它量吞吐量，照不出延遲問題。用 Vercel function duration / 埋點。
4. **不要急著升級 tier**：數據已證明體質不是瓶頸；先改 fan-out，再用壓測決定要不要花錢。

---

## 待補資料

- Pusher 免費層當下 message rate / 是否限流（Pusher dashboard）。
- 「負載過重」訊息完整文字（本次已遺失 → **下次活動前務必開 Vercel Log Drain 長期保存 log**）。

---

## 相關但獨立的議題（非本次效能事故，僅記錄狀態）

- **對抗特定技能「攻擊方等待 dialog 提前消失」**：已暫緩，疑為**單一技能資料問題**（非通用程式碼缺陷；已排除 +0 效果、attackerValue 等因素）。與本效能事故無關。
- **latent fix `fix/contest-result-subtype`**（對抗結果事件判別改用 `subType`）：已 commit + push，**待開 PR / merge**。與本效能事故無關。
