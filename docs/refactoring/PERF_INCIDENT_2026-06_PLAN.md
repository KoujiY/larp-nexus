# 效能事故調查與修復計畫（Performance Incident）

> 狀態：**Step 2.1 埋點完成 + 壓測環境就緒（待 k6 腳本與壓測）** ｜ 建立：2026-06-10 ｜ 事故：上週末（約 2026-06-06/07）下午 13:30–17:30
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
| 4 | **單一動作 fan-out 過大（latency-bound）** | **領先（主因）** | 每動作 20–40 次循序 DB+Pusher 來回 |
| 5 | Pusher emit + pending event 寫入為**阻塞式 `await`** | **領先（加重因子）** | `lib/websocket/events.ts` 每 emit `await` 了 trigger + DB 寫入 |
| 6 | `getCharacterData` 3 查詢 × 重複呼叫 | **領先（加重因子）** | `lib/game/get-character-data.ts` 已確認 |
| 7 | Hobby 冷啟動 + 10s timeout → 慢動作被砍 → 通知靠 pending events 延遲補送 | **領先（解釋「數十分鐘」）** | Hobby 限制 + pending events 補送機制 |
| 8 | GM 端「收到事件就重抓 `getGameLogs`」→ 尖峰自我放大 → Hobby 併發耗盡 | **存疑（GM 崩潰主嫌）** | `components/gm/runtime-console-ws-listener.tsx` 的 `onLogRefresh` |
| 9 | pending_events 無 TTL → 集合膨脹 → 查詢漸慢 | **次要/長期** | `lib/db/models/PendingEvent.ts` 無 `expireAfterSeconds` |
| 10 | Pusher 免費層 message-rate 限流 | **待查** | 13 連線 OK，但 burst 訊息率未確認（Pusher dashboard） |
| 11 | M0 操作限流（throttling）單獨成因 | **暫排除** | ops 太低；burst 瞬間仍可能，但無證據，非主因 |

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

## Step 3 — 鎖定根因 + 驗收方法

- **領先根因**：latency-bound per-action fan-out（#4 + 加重因子 #5/#6/#7）；GM 崩潰 = #8。
- **確認標準（壓測 + 埋點後）**：
  - 單一對抗 function 耗時 **數秒**、其中 **emit/DB 佔大半**、**emit 次數 ≥ 10** → 坐實 #4/#5。
  - burst 時 GM 的 `getGameLogs` 被**高頻觸發 + 排隊/超時** → 坐實 #8。
- **建立基準線（改前）**：記錄 p50/p95 單動作耗時、每動作 emit 次數、GM log 刷新率、10–15 併發下的 timeout 比例。

---

## Step 4 — 修復（候選，依優先序）

| 優先 | 措施 | 預期效果 | 風險 | 主要檔案 |
|------|------|----------|------|----------|
| **最高** | **emit + pending event 非阻塞化（fire-and-forget）** | 動作提交完 DB 即回傳，通知背景扇出 → 單動作延遲砍半以上 | 中（須保留必要事件順序，見下方注意） | `lib/websocket/events.ts`, `lib/websocket/pending-events.ts` |
| **最高** | **消除重複 `getCharacterData`**（傳遞已讀 doc，不重抓同一角色） | 每省一次 = 少 3 次來回 | 中 | `app/actions/skill-use.ts`, `app/actions/item-use.ts`, `app/actions/contest-respond.ts`, `lib/contest/*` |
| 高 | **`getCharacterData` 自身減查詢**（快取 `game.isActive` / 合併查詢） | 被呼叫上百次，單點優化全域受惠 | 中 | `lib/game/get-character-data.ts` |
| 高 | **GM log 刷新 debounce/節流**（合併刷新，如 500ms） | GM 請求量降一個量級 | 低 | `components/gm/runtime-console-ws-listener.tsx`, `components/gm/event-log.tsx` |
| 中 | **平行化獨立操作（`Promise.all`）+ 減少重複 emit** | 降低單動作牆鐘時間與 Pusher 呼叫數 | 中 | `lib/contest/contest-notification-manager.ts`, `lib/contest/contest-effect-executor.ts` |
| 低（體質） | `maxPoolSize` 設低（如 5–10）+ pending_events 加 TTL index | 防連線風暴；防集合膨脹 | 低 | `lib/db/mongodb.ts`, `lib/db/models/PendingEvent.ts` |
| 選用（產品決策） | 升 Atlas tier（M2/M5/M10）/ Vercel Pro | **止痛非治本**；先改碼再評估 | — | — |

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

| 指標 | 量測來源 | 改前基準 | **通過門檻** |
|------|----------|----------|--------------|
| 單一 `contest-respond` 動作 total（p95） | `[perf]` log | （壓測填） | **< 2000ms**，且**永不**達 10s timeout |
| 單動作 emit 次數 | `[perf]` log | （填） | 非硬門檻，但記錄並盡量降低 |
| emit 是否阻塞主流程 | `[perf]`：action 回傳時間 vs pusher 完成時間 | （填） | action 回傳**不再包含** pusher 扇出時間（已解耦） |
| S2（10–15 同時動作）function timeout 數 | Vercel log（`FUNCTION_INVOCATION_TIMEOUT`） | （填） | **= 0** |
| 端到端通知延遲（p95，S4） | k6 ws 量測 | （填） | **< 3s** |
| GM 端 burst 時「負載過重」/5xx | Vercel log + 實際觀察 | （填） | **無** |
| GM `getGameLogs` 呼叫頻率（S2） | `[perf]` / log | （填） | 較基準**降低 ≥ 一個量級**（debounce 生效） |
| 系統可承載「同時動作數」上限（S3） | 階梯壓測 | （填） | **≥ 20**（目標；至少明確量出數字） |

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
