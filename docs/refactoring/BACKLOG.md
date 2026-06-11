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
