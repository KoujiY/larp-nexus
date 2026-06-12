# 開發待辦清單（Backlog）

> 本文件收容「已結案計畫文件中尚未完成的殘留事項」與「已知但尚未排程的工作」。
> 計畫文件結案封存時，**必須**把尾部的未完成議題搬到這裡（流程見 `.claude/CLAUDE.md`「結案與封存」）。
> 項目排入正式開發時，移出本清單、建立對應計畫文件。

## 驗證項（有時效性）

| 項目 | 來源 | 說明 |
|------|------|------|
| 攻擊方 pending 等待狀態被跳過 / dialog 提前消失 — 重新驗證 | [PERF_INCIDENT_2026-06_PLAN](../archive/PERF_INCIDENT_2026-06_PLAN.md) 尾部議題 | 效能修復上線（merge 至 production）後重現測試；部分案例疑為效能事故「路徑 a」症狀。**仍重現才成立為獨立 bug**，屆時另開分支處理 |
| 通知延遲症狀觀察 | 同上 | 下次真實團務留意是否復發（壓測之外的終極驗證） |

## 待修 bug（已確認獨立）

| 項目 | 來源 | 說明 |
|------|------|------|
| 瀏覽器歷史導航返回角色頁不觸發 pending 補送 → 對抗孤兒化 | [PERF_INCIDENT_2026-06_PLAN](../archive/PERF_INCIDENT_2026-06_PLAN.md) 尾部議題 | 補送只掛在頁面重新載入（`getPublicCharacter` → `fetchPendingEvents`），bfcache / client-side 路由返回不會重拉。候選方向：`pageshow` / `visibilitychange` 觸發補送、或 bfcache 還原時 revalidate。碰核心補送語意，需縱向分析 |

## Code review 殘留發現（2026-06-12 feat/perf-instrumentation 分支 review）

> 當輪已修：test-route-guard 加 `VERCEL_ENV=production` 硬封鎖 + timingSafeEqual、
> updateCharacterData 快取分支補「找不到角色」throw、contest emitter 全數改經 `timePusher()` 計時。
> 以下為驗證屬實但需要設計決策或縱向分析、不適合 release 前夕倉促修改的項目。

### 正確性（需縱向分析）

| 項目 | 位置 | 說明 |
|------|------|------|
| 對抗效果 emit 先於 temporaryEffects 寫入 | `lib/contest/contest-effect-executor.ts:292` | 平行化後 `character.affected` 可在同角色的 temp-effect `$push`（line ~310 才統一 await）落地前發出；client 收事件即重抓會看到數值已變但無倒數條目。修法需權衡：await 順序（犧牲批 2 平行度）vs 寫入併入同 bucket vs client 端不依賴順序 |
| ~~GM 編輯分頁 fallback 髒頁丟失~~ | `components/gm/game-edit-tabs.tsx` | ✅ 2026-06-12 `fix/backlog-quick-wins`：fallback 改為 render-phase setActiveTab 提交回 state，重新開始後停留原分頁，附 6 條元件回歸測試。**注意**：分析中發現編輯內容丟失的另一病灶（見下方「GameEditForm reset-on-refresh」新條目） |
| GameEditForm reset-on-refresh 髒頁丟失 | `components/gm/game-edit-form.tsx:68` | 2026-06-12 修分頁跳頁時發現：`initialData !== prevInitialData`（reference 比較）在任何 `router.refresh()` 後必為 true（RSC 重新序列化 → `game` prop 新 reference）→ `setFormData(initialData)` 洗掉編輯中內容，與分頁無關。修法需設計：dirty 時不 reset 有資料一致性地雷——`formData.isActive` 是舊快照且會回寫（`game-edit-form.tsx` handleSubmit），跨 lifecycle 保留髒頁再儲存可能把進行中遊戲的 isActive 蓋回 false，需先釐清 updateGame payload 設計 |
| isActive 快取放大既有 TOCTOU | `lib/game/game-request-cache.ts` | 既有 race 的視窗放大（單次讀寫間 → 整個 action 期間）；正確修法是寫入帶 isActive 條件或版本欄位（動核心資料層）。endGame 的 snapshot→deleteMany→isActive=false 三步無交易為根因 |
| ~~dev 環境 TTL index 衝突被靜默吞掉~~ | `lib/db/models/PendingEvent.ts` | ✅ 2026-06-12 `fix/backlog-quick-wins`：操作面已對開發 DB（`larp-nexus`）跑 `check-indexes --sync` 解掉衝突；程式面 index check 擴大為全環境（E2E 除外）執行，autoIndex=true 時建立靜默失敗從此會被 warn 出來（文案提示跑 `--sync`）。production/loadtest 已於更早前手動同步，2026-06-12 以報告模式複驗兩環境全數一致，**無殘留待辦** |

### 流程 / 通用化（設計題）

| 項目 | 說明 |
|------|------|
| Index 治理自動化 | autoIndex 關閉後，未來新 schema index 在 production 永不自動建立，唯一防線是無人監看的 console.warn。候選：CI/deploy 跑 `check-indexes`（report mode 非 0 exit 即擋）|
| Pusher 413 防護通用化 | equip 的 stats-only 修復是點修；物品轉移與偷取仍推完整 items 陣列（`app/actions/item-use.ts:689`、`shared-effect-executor.ts:249`），大物品欄會原樣復發 413 且被 trigger() 吞掉。應在共用 emit 層設計 payload 大小策略 |
| perf 包裝統一 | `runWithPerf` 三種巢狀順序（dbConnect 計時窗不一致），多個 action 完全未包裝且無機制提醒。候選：name 參數併入 `withAction` 統一包裝（注意：統一後新舊 [perf] 數據不可比）|

### 效率 / 清理（低風險，可順手做）

| 項目 | 說明 |
|------|------|
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
| 玩家端「道具」→「物品」用詞統一 | GM 端已統一為「物品」；玩家端 UI 文字仍用「道具」，需整批替換（保留 `tool` 型別標籤不動） |
| UI 視覺改版（神祕奇幻方向） | 設計規格見 `.impeccable.md` / `docs/specs/DESIGN.md`，未排實作 |
