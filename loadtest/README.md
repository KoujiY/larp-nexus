# 壓測工具（PERF_INCIDENT_2026-06 Step 2.3）

對 staging（Vercel preview + `larp-nexus-loadtest` DB）重現效能事故並量測基準線。
計畫全文與通過門檻見 [`docs/refactoring/PERF_INCIDENT_2026-06_PLAN.md`](../docs/refactoring/PERF_INCIDENT_2026-06_PLAN.md)。

## ⚠️ 鐵律

1. **壓測不得與真實活動同時進行**——Atlas cluster 與 Pusher app 和 prod 共用，靠時間隔離。
2. **絕不對 production 網址壓測**——`STAGING_URL` 只能填 preview 部署。
3. 壓測會 **reset（清空）loadtest 資料庫**——壓測時段不要用 preview 做人工驗證。

## 前置需求（一次性）

| 項目 | 動作 |
|------|------|
| k6 | `winget install k6` |
| 密語檔 | `copy loadtest\env.example loadtest\.env` 後填值（含 `PUSHER_KEY`） |
| staging 部署 | push 分支後 Vercel 自動產生；`STAGING_URL` 建議用分支固定別名 |
| 閘門驗證 | `loadtest\smoke.cmd` → 應顯示 `PASS` |

## 基準線執行程序（對應計畫 5.1 步驟 1）

```cmd
:: 1. seed：清空 loadtest DB + 建 1 個 active 遊戲 + 30 個角色 → 寫出 state.json
node loadtest\seed.mjs

:: 2. 另開一個視窗：啟動 S4 端到端延遲訂閱端（全程保持運行）
node loadtest\s4-subscriber.mjs

:: 3. 依序執行（每個情境之間等系統靜下來 ~1 分鐘）
powershell -File loadtest\run-k6.ps1 s1
powershell -File loadtest\run-k6.ps1 s2
powershell -File loadtest\run-k6.ps1 s3

:: 4. Ctrl+C 結束 s4-subscriber → 記下它印出的 p50/p95 摘要
```

執行期間同步蒐證：

- **`[perf]` 行**：Vercel dashboard → 該 preview deployment → Logs（或 `vercel logs <url>` CLI）。
  grep `[perf]` 取 `total/db/pusher/emits`；「有 `[perf:start]` 無 `[perf]`」= 被 timeout 砍掉的請求。
- **timeout**：Vercel logs 搜 `FUNCTION_INVOCATION_TIMEOUT`。
- **Pusher 限流**（計畫 2.4）：Pusher dashboard → 該 app → Stats，看 burst 時 message rate 與 error。

跑完把數據填入計畫 **5.2 表的「改前基準」欄**。

## 情境一覽

| 情境 | 模擬 | 量什麼 |
|------|------|--------|
| S1 | 13 人各自每 20–40s 用自身技能，5 分鐘 | 無競爭基準延遲 |
| S2 | 13 人每 30s 在同一瞬間齊發完整對抗（發起+回應），5 輪 | **主測項**：重現事故 burst |
| S3 | 同時對抗數 13 → 20 → 30 階梯上拉 | 系統天花板（哪一階開始 timeout） |
| S4 | Node 腳本訂閱 13 個角色頻道（與 S2/S3 並行） | emit → 送達的端到端延遲 |

延遲語意：使用者感受 ≈ k6 的 `http_req_duration`（action 處理）+ S4 的 latencyMs（emit→送達）。

## 檔案結構

```
loadtest/
  env.example        ← 密語範本（複製為 .env 填值；.env 不進 git）
  smoke.cmd/.ps1     ← 閘門煙霧測試（400/404/401）
  seed.mjs           ← reset + seed → state.json（不進 git）
  run-k6.ps1         ← k6 啟動器（讀 .env 注入 -e 旗標）
  k6/common.js       ← 登入、action 呼叫、wall-clock 對齊 burst
  k6/s1.js s2.js s3.js
  s4-subscriber.mjs  ← pusher-js 訂閱端（端到端延遲 CSV + 摘要）
```

實作備註：

- k6 透過 `/api/test/action` 呼叫真實 server action（`Next-Action` ID 是 build 雜湊，
  無法跨部署穩定呼叫）；量測的熱路徑與真實玩家操作一致。
- 對抗用 `contest` 類型（驗證無狀態、跨 serverless instance 安全）。
  `random_contest` 依賴 in-memory tracker，burst 多 instance 下會失敗——已知議題，另行追蹤。
- 角色全員力量 80 → 平手 → `tieResolution: attacker_wins`，結果確定、效果固定 -1 HP。
