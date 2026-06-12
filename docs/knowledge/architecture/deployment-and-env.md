# Deployment & Environment Variables

## Deployment Architecture
```
Users → Vercel (CDN + Edge)
          ├── MongoDB Atlas  (database)
          ├── Pusher         (WebSocket)
          ├── Vercel Blob    (images)
          └── Resend         (email)
```

## Environment Variables

### Required
```bash
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app

# Session
SESSION_SECRET=<min 32 chars, generate with: openssl rand -base64 32>

# Pusher (Backend)
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=ap3

# Pusher (Frontend)
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=ap3

# Resend (Email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@your-domain.com

# Vercel Blob
BLOB_READ_WRITE_TOKEN=

# AI Character Import (Encryption key for API credentials)
AI_ENCRYPTION_SECRET=<min 32 chars, generate with: openssl rand -base64 32>
```

### Optional（效能量測 / 壓測，預設不設）
```bash
# 效能埋點：設 1 時每個 server action 輸出一行 [perf] log
# （所有 action 統一經 withAction(name) 包裝——lib/actions/action-wrapper.ts，
#  dbConnect 計入計時窗；2026-06-13 統一後與此前的 [perf] 數據不可直接比較）
# （lib/perf/，PERF_INCIDENT_2026-06 量測基礎建設）
PERF_LOG=1

# 壓測模式開啟 /api/test/* 路由：請求須帶相符的 x-loadtest-token header
# （lib/test-route-guard.ts；與 E2E=1 互斥使用，詳見 e2e-testing.md 安全機制）
LOADTEST_TOKEN=<random hex, generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

### Local Development
Create `.env.local` (never commit to git)

### Production
Set all variables in Vercel Dashboard → Project → Settings → Environment Variables

### Vercel 環境拓撲（2026-06 起）
- **Production**：`MONGODB_URI` 指向正式資料庫。
- **Preview**（所有分支共用）：`MONGODB_URI` 指向 `larp-nexus-loadtest`（壓測 / PR 預覽共用；名稱必須含 `test` 以通過 test route 的 DB 名稱防護），並設 `PERF_LOG=1` 與 `LOADTEST_TOKEN`。
- Atlas cluster 與 Pusher app 各環境**共用同一個**（時間隔離：壓測不得與真實活動同時進行）。
- Preview 部署開啟 Deployment Protection，自動化腳本以 `x-vercel-protection-bypass` header 通過。

## MongoDB 連線設定（PERF_INCIDENT_2026-06 批 2）
`lib/db/mongodb.ts` 的 Mongoose 連線選項：
- `maxPoolSize: 10` / `minPoolSize: 1` — 對應 Vercel Fluid 同 instance 實測併發 ~5-6；保一條暖連線降低 idle 後重握手。
- `autoIndex` — **production / loadtest 為 false**（省去每次冷啟動逐 model 對 Atlas 發 createIndex 的往返）；本機 dev 與 E2E（`E2E=1`，MongoMemoryServer 全新空 DB）維持 true。

**Index 缺失警告**：所有環境（E2E 除外）連線建立後，延後約 10 秒在背景比對各 model 的 schema 宣告與 DB 實際 index（`lib/db/index-check.ts`，fire-and-forget 不阻塞請求、不與冷啟動首請求搶連線池），缺漏或 unique/TTL 屬性不符時輸出 `[index-check] ⚠️` 警告（Vercel Functions log / 本機 console 可見），並指引回本文件。autoIndex 開啟的環境（本機 dev）也檢查——mongoose 建 index 失敗（如同 key 不同選項的 IndexOptionsConflict）不會丟錯，此警告是唯一偵測點，文案會提示改跑 `pnpm check-indexes --sync`。

> ⚠️ **維運注意**：因 production 關閉 autoIndex，**在 schema 新增/修改 index 後不會自動建立**。建立方式擇一：
> 1. 直接在 Atlas UI 對目標 collection 建立新 index（推薦，最直觀）。
> 2. 本機以正確的 `MONGODB_URI` 跑一次性腳本，對受影響 model 呼叫 `Model.syncIndexes()`。
> 3. 臨時將 `autoIndex` 條件改回 true 部署一次，索引建好後還原。

## Cron Jobs
- `app/api/cron/check-expired-effects/` — checks expired temporary effects and cleans pending events
- Must be configured in `vercel.json` with appropriate schedule
- **pending_events TTL（批 3 起）**：`expiresAt` 帶 TTL index（`expireAfterSeconds: 0`），MongoDB 約每 60s 自動刪除過期文件。cron 清理**保留**：負責「已送達 >1h」的加速清理，並作為 TTL 未建立環境的兜底。

## Index 檢查 / 同步腳本
```bash
pnpm check-indexes          # 比對 schema 宣告 vs DB 實際 index（report-only）
pnpm check-indexes --sync   # 同步差異（syncIndexes：建缺漏、drop schema 未宣告的 index）
```
- 指定目標 DB：先設 `MONGODB_URI` 環境變數再執行（預設讀 `.env.local`）。
- 內建防護：建立 Character `{gameId, pin}` unique index 前自動查重，有重複資料時列出明細並跳過。
- 適用時機：schema 新增/修改 index 後、指向全新 DB 時、收到 `[index-check] ⚠️` 警告時。

## Full Setup Guide
See `docs/specs/10_EXTERNAL_SETUP_CHECKLIST.md` for step-by-step external service setup.
