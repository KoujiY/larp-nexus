# 開發待辦清單（Backlog）

> 本文件收容「已結案計畫文件中尚未完成的殘留事項」與「已知但尚未排程的工作」。
> 計畫文件結案封存時，**必須**把尾部的未完成議題搬到這裡（流程見 `.claude/CLAUDE.md`「結案與封存」）。
> 項目排入正式開發時，移出本清單、建立對應計畫文件。

## 驗證項（有時效性）

| 項目 | 來源 | 說明 |
|------|------|------|
| 效能事故殘留症狀觀察（攻擊方 pending 等待被跳過 / dialog 提前消失、通知延遲） | [PERF_INCIDENT_2026-06_PLAN](../archive/PERF_INCIDENT_2026-06_PLAN.md) 尾部議題 | 2026-06-13 `fix/contest-consistency` 拍板（D5）：原「重現測試」因難以人工重現當下場景，改為**下次真實團務觀察**，與通知延遲觀察合併（同一事故的待觀察殘留）。仍復發才成立為獨立 bug，屆時另開分支處理 |

## 待修 bug（已確認獨立）

| 項目 | 來源 | 說明 |
|------|------|------|
| ~~瀏覽器歷史導航返回角色頁不觸發 pending 補送 → 對抗孤兒化~~ | [PERF_INCIDENT_2026-06_PLAN](../archive/PERF_INCIDENT_2026-06_PLAN.md) 尾部議題 | ✅ 2026-06-14 `fix/item-flow-log-and-pending`：新增 `hooks/use-pending-events-refetch.ts`，於 **mount**（SPA 客戶端導航如「世界觀」連結 `router.push` 返回時角色頁 remount，server component 不重跑——驗收揭露這才是 in-app 返回的主要路徑）+ `pageshow`(persisted，bfcache) + `visibilitychange`(→visible) 重抓並餵進既有投遞管線。**關鍵：非破壞性讀取 + 投遞後 ack**——`fetchPendingEvents` 加 `markDelivered` 選項（預設 true，SSR 不變）、新增 `acknowledgePendingEvents`；client 以 `markDelivered:false` 讀取不消費，投遞到 UI 後才 ack 標記 delivered。理由：破壞性讀取放 client 端在 dev StrictMode（mount→cleanup→mount 把 in-flight fetch 跨過、`isActive` 守衛擋投遞）會消費卻未投遞 → 連刷新都撈不回（驗收第二輪揭露此回歸）。串接於 `use-game-event-handler.ts`，+7 hook 測試 + 5 server action 測試。**影響盤點與測試清單見下方** |
| ~~物品轉移/偷取無 GM log~~ | 2026-06-13 `refactor/infra-and-form-guards` C1 驗收時發現 | ✅ 2026-06-14 `fix/item-flow-log-and-pending`：縱向分析修正原描述——**偷取/移除其實已有 log**（item / skill / contest 三條 executor 路徑皆寫 `item_use` / `skill_use` / `contest_result`，含「偷竊了 X」訊息）；真正缺口僅**轉移（give）**：`transferItem` 補 `writeLog({ action: 'item_transfer' })`（記轉出方），`event-log.tsx` 的 `getEventCategory` + `EventDescription` 加對應分類與渲染。+3 測試（server log + UI 渲染） |

## Code review 殘留發現（2026-06-12 feat/perf-instrumentation 分支 review）

> 當輪已修：test-route-guard 加 `VERCEL_ENV=production` 硬封鎖 + timingSafeEqual、
> updateCharacterData 快取分支補「找不到角色」throw、contest emitter 全數改經 `timePusher()` 計時。
> 以下為驗證屬實但需要設計決策或縱向分析、不適合 release 前夕倉促修改的項目。

### 正確性（需縱向分析）

| 項目 | 位置 | 說明 |
|------|------|------|
| ~~對抗效果 emit 先於 temporaryEffects 寫入~~ | `lib/contest/contest-effect-executor.ts` | ✅ 2026-06-13 `fix/contest-consistency`：採「寫入併入同 bucket」——時效效果與數值變更併入同一次 `updateCharacterData`（$set+$push 單文件原子），emit 於寫入落地後發出；計畫文件見 [CONTEST_CONSISTENCY_PLAN](../archive/CONTEST_CONSISTENCY_PLAN.md) |
| ~~GM 編輯分頁 fallback 髒頁丟失~~ | `components/gm/game-edit-tabs.tsx` | ✅ 2026-06-12 `fix/backlog-quick-wins`：fallback 改為 render-phase setActiveTab 提交回 state，重新開始後停留原分頁，附 6 條元件回歸測試。**注意**：分析中發現編輯內容丟失的另一病灶（見下方「GameEditForm reset-on-refresh」新條目） |
| ~~GameEditForm reset-on-refresh 髒頁丟失~~ | `components/gm/game-edit-form.tsx` | ✅ 2026-06-13 `refactor/infra-and-form-guards`：reset 加「使用者已編輯則保留」守衛（vs 編輯基準深比較，未編輯仍正常同步）；isActive 地雷以拆除 updateGame 的 isActive 死通道解決（無 UI 編輯此欄位，lifecycle 由專屬 action 管理）。元件回歸測試 +4 |
| ~~isActive 快取放大既有 TOCTOU~~ | `lib/game/end-game.ts` / `start-game.ts` | ✅ 2026-06-13 `fix/contest-consistency`：採 convert-in-place——endGame 改為 isActive=false 先行 + runtime 原地轉型 snapshot（消滅複製→刪除的 silent loss 視窗，快取與資料層零修改）；startGame 鏡像採 flag-first + 回滾重設。計畫文件見 [CONTEST_CONSISTENCY_PLAN](../archive/CONTEST_CONSISTENCY_PLAN.md) |
| ~~dev 環境 TTL index 衝突被靜默吞掉~~ | `lib/db/models/PendingEvent.ts` | ✅ 2026-06-12 `fix/backlog-quick-wins`：操作面已對開發 DB（`larp-nexus`）跑 `check-indexes --sync` 解掉衝突；程式面 index check 擴大為全環境（E2E 除外）執行，autoIndex=true 時建立靜默失敗從此會被 warn 出來（文案提示跑 `--sync`）。production/loadtest 已於更早前手動同步，2026-06-12 以報告模式複驗兩環境全數一致，**無殘留待辦** |

### 流程 / 通用化（設計題）

| 項目 | 說明 |
|------|------|
| ~~Index 治理自動化~~ | ✅ 2026-06-13 `refactor/infra-and-form-guards`：`check-indexes --ci`（差異 exit 1、永不寫 DB）+ GitHub Actions workflow（PR 觸碰 models 路徑時對 production 比對擋 merge），repo secret `MONGODB_URI_PRODUCTION` 已設定 |
| ~~Pusher 413 防護通用化~~ | ✅ 2026-06-13 `refactor/infra-and-form-guards`：全 codebase 無訂閱端讀取 `role.updated` 的 items 內容——三發送端（轉移/偷取/GM 編輯儲存）改送 `itemsChanged` 旗標、事件型別刪除 items 欄位（tsc 保證無漏網）、順帶省 2-3 次組 payload 的 DB 重讀；共用 trigger() 加 8KB 序列化大小警告作通用 backstop |
| ~~perf 包裝統一~~ | ✅ 2026-06-13 `refactor/infra-and-form-guards`：`withAction(name, handler)` 統一（runWithPerf 內建、dbConnect 入計時窗、NEXT_ 控制流錯誤重拋）；65 個 action 全對帳（62 包裝、3 合理跳過）。**統一後新舊 [perf] 數據不可比** |

### 效率 / 清理（低風險，可順手做）

| 項目 | 說明 |
|------|------|
| **Client 端重複抓取全面盤點**（GM 端 + 玩家端） | 2026-06-13 發現（`withAction` 統一後 `[perf]` log 全覆蓋，既有冗餘首次可見）：同一份資料被多個同時掛載的元件/hook 各自獨立抓取，屬全站性模式問題。**已確認案例**：① GM 角色編輯頁——`character-edit-tabs` 全分頁 `forceMount`，SecretsTab/TasksEditForm/ItemsEditForm/SkillsEditForm 各自抓 `getGameItems`（4 次）、Items/Skills 各抓 `getGameSkills`（2 次），單次開頁 6 個冗餘 action（dev StrictMode 翻倍為 12）；② 玩家端——`getTransferTargets` 有 4 個獨立呼叫點（`item-list.tsx` + `use-item-transfer` + `use-item-showcase` + `use-target-options`），選取物品的互動流程可重複查同一份目標角色清單。**盤點方法**：逐頁操作對照 `[perf] action=` log，記錄每個進入點/互動觸發的 action 清單與次數，找出「同 action 同參數短時間多發」。**修法方向**：page 層抓一次 props 下傳（與 `initialItems` 既有傳法一致）、或共用層級的去重快取；玩家端 hooks 可抽共用的 targets provider。注意 `forceMount` 是髒資料保護的刻意設計，不可移除。**① GM 角色編輯頁 ✅ 2026-06-15 `perf/dedup-client-fetches`**：`getGameItems`/`getGameSkills` 改由 page server component `Promise.all` 抓一次後經 `CharacterEditTabs` 下傳 props 至四分頁，移除各自 client `useEffect` fetch；實測（dev StrictMode）`get-game-items` 8→1、`get-game-skills` 4→1，四元件各補 component 測試，`forceMount` 未動。**② 玩家端 `getTransferTargets`：低優先暫緩**——盤點實測選取道具僅重複 1 次（`sharedTargets` + `useTargetOptions`，2→1），查詢輕量且修復需動 `useTargetSelection`→`useTargetOptions` 鏈（含 localStorage restore / contest 狀態），效益/風險比低；未來如做採 `externalTargets` 注入（`item-list.tsx` 的 `sharedTargets` 為現成單一來源） |
| ~~冷啟動 index check 與首請求搶 M0 連線池~~ | ✅ 2026-06-12 `fix/backlog-quick-wins`：scheduleIndexCheck 延後 10 秒背景執行（timer unref），並擴大為全環境覆蓋（見上方 TTL index 條目） |
| ~~GM log 增量抓取~~ | ✅ 2026-06-12 `refactor/log-cursor-and-leftovers`：依評估採 since-cursor 增量實作完成——`getGameLogs` 加 `since`（`$gte` + client 以 id 去重），EventLog 拆全量/增量雙路徑，回歸測試 +12。固定開銷（auth + Game.findById）仍在，上線後以 `[perf] get-game-logs` 對照成效 |
| ~~資料層分支邏輯四份複製~~ | ✅ 2026-06-12 `fix/backlog-quick-wins`：抽共用 `lib/game/resolve-is-active.ts`，四路徑回歸測試 19 條；update 完整路徑 baseline 落空同步從靜默 no-op 收斂為 throw |
| ~~其他小型重複~~ | ✅ 全數清完：`fix/backlog-quick-wins`（2026-06-12）清 batch emitter 樣板（generateEventId 共用 + events.ts 收斂三 helper；兩檔發送機構錯誤語意不同屬設計，刻意不合併）、processExpiredEffects try/catch（抽 processExpiredEffectsSafe）、emitContestResult 死的雙收件人路徑；`refactor/log-cursor-and-leftovers`（同日）清 ALS globalThis 樣板（抽 getGlobalAls，Symbol.for registry）、PS1 env 解析（抽 env-utils.ps1 Import-LoadtestEnv） |

## 條件性 / 量測後裁決

| 項目 | 來源 | 說明 |
|------|------|------|
| 動態路由 Lighthouse 本機實測 | [FRONTEND_PERFORMANCE_OPTIMIZATION](../archive/FRONTEND_PERFORMANCE_OPTIMIZATION.md) | CI 只測靜態路由；`/c/[characterId]` 等動態路由需 DB + seed，須本機跑（指引見封存文件「Lighthouse 量測指引」）。**此分數是下一項的裁決依據** |
| Phase 4：Client/Server 邊界清理 | 同上「後續可選 iteration」 | 僅當 Lighthouse mobile < 90 / desktop < 85 才執行；執行時每次僅降級 1–2 個組件 + 跑完 E2E + 個別 commit |

## 運維

| 項目 | 來源 | 說明 |
|------|------|------|
| 活動期間 log 長期保存對策 | [PERF_INCIDENT_2026-06_PLAN](../archive/PERF_INCIDENT_2026-06_PLAN.md)「待補資料」 | 原方案 Vercel Log Drain 經查證（2026-06-12）**現行方案不可用**（原生 Log Drain 需 Pro，dashboard 找不到對應整合入口），短期無方案升級計畫 → 擱置。**下次活動前需重新評估替代方案**（候選：活動期間以 `vercel logs <deployment> --follow` 重導到本機檔案、或屆時再查可用整合）——事故背景：2026-06 效能事故的「負載過重」原始訊息因 log 過期而遺失 |

## 已有計畫文件、待排程

| 項目 | 計畫文件 |
|------|----------|
| E2E 平行化（workers > 1） | [E2E_PARALLEL_WORKERS.md](./E2E_PARALLEL_WORKERS.md)（含 `transition-[transform` 全專案掃描待辦） |
| CI 執行 E2E（GitHub Actions） | [ci-e2e-workflow-draft.md](./ci-e2e-workflow-draft.md)（草稿，尚未實作） |

## 未排程構想

| 項目 | 說明 |
|------|------|
| startGame in-flight 殘留視窗徹底閉合 | 來源：[CONTEST_CONSISTENCY_PLAN](../archive/CONTEST_CONSISTENCY_PLAN.md) 結案殘留。flag-first 後僅剩：已快取 `isActive=false` 的 in-flight action，其 Baseline 寫入若落在複製讀取之後 → 留在 Baseline、該場遊戲不可見（資料不毀損，賽後可見）。徹底閉合需 Character collection 加條件欄位 + migration，已評估與症狀嚴重度不成比例 → 接受殘留；語意記載於 `docs/knowledge/gm/game/game-states.md`。除非實際發生案例，否則不排程 |
| 多 GM 畫面併行時 stale 開始按鈕的邊緣情境 | 2026-06-13 釐清：正常流程 UI 已杜絕重複啟動（開始後按鈕即換為結束遊戲）。唯一殘餘情境：同一 GM 開兩個畫面（雙分頁/雙裝置），畫面 A 開始遊戲後，未刷新的畫面 B 仍留有開始按鈕，按下會觸發 `startGame` 覆蓋分支（清 runtime 重置數值），且開始確認對話框無覆蓋專屬警告。極邊緣、無實際案例；若日後要處理：覆蓋情境由 server 回傳需確認的錯誤碼讓前端二次確認、或 GM 遊戲頁訂閱 `game.started` 即時同步按鈕狀態 |
| 玩家端「道具」→「物品」用詞統一 | GM 端已統一為「物品」；玩家端 UI 文字仍用「道具」，需整批替換（保留 `tool` 型別標籤不動） |
| UI 視覺改版（神祕奇幻方向） | 設計規格見 `.impeccable.md` / `docs/specs/DESIGN.md`，未排實作 |
| 通知選單優化：點選引導至對應頁面 | 目前通知選單僅顯示內容，點選後無導航行為。需求：點選通知項目後根據通知類型（對抗結果、物品變動、任務揭露等）自動跳轉至對應角色頁面/分頁，減少 GM 手動尋找的操作路徑 |
| UIUX 重新設計 | 全面性 UI/UX 改版，涵蓋資訊架構、互動流程、視覺設計。規模較大，需先出設計規格再分階段實作 |
