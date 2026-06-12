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
| GM 編輯分頁 fallback 髒頁丟失 | `components/gm/game-edit-tabs.tsx:47` | `effectiveTab` 為純衍生值，遊戲結束→編輯 info→重新開始時跳回 console，未存編輯無確認即丟失。修法選項：fallback 時 setActiveTab、或 info TabsContent 改 forceMount |
| isActive 快取放大既有 TOCTOU | `lib/game/game-request-cache.ts` | 既有 race 的視窗放大（單次讀寫間 → 整個 action 期間）；正確修法是寫入帶 isActive 條件或版本欄位（動核心資料層）。endGame 的 snapshot→deleteMany→isActive=false 三步無交易為根因 |
| dev 環境 TTL index 衝突被靜默吞掉 | `lib/db/models/PendingEvent.ts:110` | 長壽 dev DB 上 plain `expiresAt_1` 與新 TTL 宣告 IndexOptionsConflict，autoIndex 失敗無聲、index-check 只在 autoIndex=off 時排程。修法：autoIndex=true 時也排 index check，或 dev DB 手動 `check-indexes --sync` |

### 流程 / 通用化（設計題）

| 項目 | 說明 |
|------|------|
| Index 治理自動化 | autoIndex 關閉後，未來新 schema index 在 production 永不自動建立，唯一防線是無人監看的 console.warn。候選：CI/deploy 跑 `check-indexes`（report mode 非 0 exit 即擋）|
| Pusher 413 防護通用化 | equip 的 stats-only 修復是點修；物品轉移與偷取仍推完整 items 陣列（`app/actions/item-use.ts:689`、`shared-effect-executor.ts:249`），大物品欄會原樣復發 413 且被 trigger() 吞掉。應在共用 emit 層設計 payload 大小策略 |
| perf 包裝統一 | `runWithPerf` 三種巢狀順序（dbConnect 計時窗不一致），多個 action 完全未包裝且無機制提醒。候選：name 參數併入 `withAction` 統一包裝（注意：統一後新舊 [perf] 數據不可比）|

### 效率 / 清理（低風險，可順手做）

| 項目 | 說明 |
|------|------|
| 冷啟動 index check 與首請求搶 M0 連線池 | 每次冷啟動 10+ 次 listIndexes 緊接 connect 發出；候選：deferred（setTimeout）或 env 旗標 gate |
| GM log 每 tick 全量重抓 100 筆 | throttle 只限頻不減量；候選：since-cursor 增量抓取或直接套用觸發事件的 payload |
| 資料層分支邏輯四份複製 | get/update-character-data 的快取/完整路徑 ×2 檔案重複 runtime/baseline 分支；候選：共用 `resolveIsActive()`（本次 review 的靜默 no-op bug 即源於路徑分歧）|
| 其他小型重複 | batch emitter 樣板（events.ts vs contest-event-emitter）、ALS globalThis 樣板（perf-context vs game-request-cache）、PS1 env 解析（run-k6 vs smoke）、processExpiredEffects try/catch（item-use vs skill-use）、emitContestResult 已死的雙收件人路徑 |

## 條件性 / 量測後裁決

| 項目 | 來源 | 說明 |
|------|------|------|
| 動態路由 Lighthouse 本機實測 | [FRONTEND_PERFORMANCE_OPTIMIZATION](../archive/FRONTEND_PERFORMANCE_OPTIMIZATION.md) | CI 只測靜態路由；`/c/[characterId]` 等動態路由需 DB + seed，須本機跑（指引見封存文件「Lighthouse 量測指引」）。**此分數是下一項的裁決依據** |
| Phase 4：Client/Server 邊界清理 | 同上「後續可選 iteration」 | 僅當 Lighthouse mobile < 90 / desktop < 85 才執行；執行時每次僅降級 1–2 個組件 + 跑完 E2E + 個別 commit |

## 運維

| 項目 | 來源 | 說明 |
|------|------|------|
| 開啟 Vercel Log Drain 長期保存 log | [PERF_INCIDENT_2026-06_PLAN](../archive/PERF_INCIDENT_2026-06_PLAN.md)「待補資料」 | **下次活動前務必完成**——本次事故的「負載過重」原始訊息因未開而遺失 |

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
