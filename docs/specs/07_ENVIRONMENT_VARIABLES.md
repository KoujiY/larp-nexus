# 環境變數配置文件

## 版本：v2.0
## 更新日期：2026-03-09

---

> ⚠️ **重要提醒**：本文件僅說明所需的環境變數。實際設定步驟請參考 [外部設定檢查清單](./10_EXTERNAL_SETUP_CHECKLIST.md)。

---

## 1. 環境變數總覽

本專案需要以下環境變數配置：

```bash
# .env.local (本地開發環境) - ⚠️ 需手動建立，無法透過程式碼自動化
# .env.production (生產環境，配置於 Vercel) - ⚠️ 需在 Vercel Dashboard 手動設定
```

---

## 2. 必要環境變數

### 2.1 MongoDB 資料庫

> ⚠️ **需外部設定**：請參考 [外部設定檢查清單 - MongoDB Atlas](./10_EXTERNAL_SETUP_CHECKLIST.md#11-mongodb-atlas-設定)

```bash
# MongoDB Atlas 連線字串
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# 範例：
# MONGODB_URI=mongodb+srv://larpnexus:password123@cluster0.xxxxx.mongodb.net/larp-nexus?retryWrites=true&w=majority
```

**取得方式**：完整步驟請參考外部設定檢查清單

---

### 2.2 Next.js 應用程式

```bash
# 應用程式基礎 URL（用於生成 QR Code、Magic Link 等）
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 生產環境範例：
# NEXT_PUBLIC_APP_URL=https://larp-nexus.vercel.app
```

---

### 2.3 Session 管理

```bash
# Session 加密金鑰（使用 openssl 生成）
SESSION_SECRET=your-super-secret-session-key-min-32-chars

# 生成方式：
# openssl rand -base64 32
```

**注意**：此金鑰用於加密 Session Cookie，請妥善保管，勿上傳至版控。

---

### 2.4 Pusher（WebSocket 服務）

> ⚠️ **需外部設定**：請參考 [外部設定檢查清單 - Pusher](./10_EXTERNAL_SETUP_CHECKLIST.md#21-pusher-設定websocket)

```bash
# Pusher App ID
PUSHER_APP_ID=1234567

# 伺服端（trigger 用）
PUSHER_APP_ID=1234567
PUSHER_KEY=xxxxxxxxxxxxxxxxxx
PUSHER_SECRET=xxxxxxxxxxxxxxxxxx
PUSHER_CLUSTER=ap3

# 前端（subscribe 用，值與 PUSHER_KEY / PUSHER_CLUSTER 相同）
NEXT_PUBLIC_PUSHER_KEY=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_PUSHER_CLUSTER=ap3
```

**取得方式**：完整步驟請參考外部設定檢查清單

---

### 2.5 Vercel Blob Storage（圖片儲存）

> ⚠️ **需外部設定**：請參考 [外部設定檢查清單 - Vercel](./10_EXTERNAL_SETUP_CHECKLIST.md#31-vercel-帳號與專案設定)

```bash
# Vercel Blob 讀取 Token
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxx
```

**取得方式**：完整步驟請參考外部設定檢查清單

**本地開發**
```bash
# 本地開發可使用 Vercel CLI
pnpm i -g vercel
vercel link
vercel env pull .env.local
```

---

### 2.6 Email 服務（Magic Link 發送）— Nodemailer + Gmail SMTP

> **v2.0 更新**：已從 Resend 遷移至 Nodemailer + Gmail SMTP。
> 詳見 [SPEC-nodemailer-migration-2026-03-09.md](./SPEC-nodemailer-migration-2026-03-09.md)

```bash
# SMTP 伺服器設定（選填，預設使用 Gmail SMTP）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465

# SMTP 認證（必填）
SMTP_USER=your@gmail.com
SMTP_PASS=abcdefghijklmnop    # Gmail App Password（16碼，無空格）

# 寄件者地址（選填，預設使用 SMTP_USER）
EMAIL_FROM=your@gmail.com
```

**取得方式**：
1. 開啟 Gmail 兩步驟驗證（Google 帳號 → 安全性）
2. 產生 App Password（安全性 → 兩步驟驗證 → 應用程式密碼）
3. 將 16 碼密碼（去掉空格）填入 `SMTP_PASS`

---

## 3. 選用環境變數

### 3.1 開發環境設定

```bash
# 啟用 Next.js Debug 模式
DEBUG=true

# 顯示詳細錯誤訊息
NODE_ENV=development
```

---

## 4. .env.example 範本

建立 `.env.example` 供團隊成員參考：

```bash
# ========================================
# LARP Nexus - 環境變數範本
# ========================================
# 複製此檔案為 .env.local 並填入實際數值

# ---- Database ----
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>

# ---- Application ----
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=

# ---- Pusher (WebSocket) ----
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=ap3
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=ap3

# ---- Vercel Blob ----
BLOB_READ_WRITE_TOKEN=

# ---- Email (Nodemailer + Gmail SMTP) ----
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your@gmail.com
SMTP_PASS=                        # Gmail App Password
EMAIL_FROM=your@gmail.com
```

---

## 5. 環境變數載入順序

Next.js 環境變數載入優先級（由高到低）：

1. `process.env`
2. `.env.$(NODE_ENV).local` (例：`.env.production.local`)
3. `.env.local` **（不會在 `test` 環境載入）**
4. `.env.$(NODE_ENV)` (例：`.env.production`)
5. `.env`

---

## 6. 安全性建議

### 6.1 敏感資料保護

❌ **不要上傳至版控**
- `.env.local`
- `.env.production.local`
- 任何包含實際金鑰的檔案

✅ **上傳至版控**
- `.env.example`（僅範本，無實際數值）

### 6.2 .gitignore 設定

確保 `.gitignore` 包含：

```gitignore
# Env files
.env
.env.local
.env.*.local
.env.production
```

---

## 7. Vercel 環境變數設定

### 7.1 設定方式

1. 前往 Vercel Dashboard
2. 選擇專案 → Settings → Environment Variables
3. 新增環境變數

### 7.2 環境分類

| 環境 | 說明 | 使用時機 |
|------|------|----------|
| Production | 正式環境 | `main` 分支部署 |
| Preview | 預覽環境 | Pull Request 部署 |
| Development | 本地開發 | `vercel dev` |

**建議**：所有環境使用相同變數名稱，僅數值不同（如不同的資料庫）。

---

## 8. 環境變數驗證

### 8.1 實作驗證邏輯

建立 `lib/env.ts` 驗證環境變數：

```typescript
// lib/env.ts
const requiredEnvVars = [
  'MONGODB_URI',
  'SESSION_SECRET',
  'PUSHER_APP_ID',
  'PUSHER_KEY',
  'PUSHER_SECRET',
  'PUSHER_CLUSTER',
  'NEXT_PUBLIC_PUSHER_KEY',
  'NEXT_PUBLIC_PUSHER_CLUSTER',
  'BLOB_READ_WRITE_TOKEN',
  'SMTP_USER',
  'SMTP_PASS',
] as const;

export function validateEnv() {
  const missing: string[] = [];
  
  requiredEnvVars.forEach((key) => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.join('\n')}`
    );
  }
}

// 在應用啟動時驗證
if (process.env.NODE_ENV !== 'test') {
  validateEnv();
}
```

### 8.2 使用 Zod 驗證（進階）

```typescript
import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  PUSHER_APP_ID: z.string(),
  PUSHER_KEY: z.string(),
  PUSHER_SECRET: z.string(),
  PUSHER_CLUSTER: z.string(),
  NEXT_PUBLIC_PUSHER_KEY: z.string(),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string(),
  BLOB_READ_WRITE_TOKEN: z.string(),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

---

## 9. 本地開發設定步驟

### Step 1：複製範本

```bash
cp .env.example .env.local
```

### Step 2：填入數值

編輯 `.env.local`，填入實際的 API 金鑰與連線字串。

### Step 3：驗證設定

```bash
pnpm dev
```

若有缺少的環境變數，終端會顯示錯誤訊息。

---

## 10. 常見問題排查

### Q1：MongoDB 連線失敗

**可能原因**
- 連線字串格式錯誤
- IP 未加入白名單（MongoDB Atlas）
- 使用者名稱/密碼錯誤

**解決方式**
1. 確認連線字串格式正確
2. 於 MongoDB Atlas → Network Access → 新增 `0.0.0.0/0`（允許所有 IP，僅開發環境）
3. 確認使用者權限

---

### Q2：Pusher 連線失敗

**可能原因**
- Cluster 設定錯誤
- Key/Secret 錯誤

**解決方式**
1. 確認 `NEXT_PUBLIC_PUSHER_CLUSTER` 與 Pusher App 一致
2. 確認金鑰無誤
3. 檢查瀏覽器 Console（前端）與伺服器 Log（後端）

---

### Q3：圖片上傳失敗

**可能原因**
- `BLOB_READ_WRITE_TOKEN` 未設定
- Token 權限不足

**解決方式**
1. 確認 Token 已設定於 `.env.local`
2. 若使用 Vercel，執行 `vercel env pull`
3. 確認 Token 有讀寫權限

---

## 11. 生產環境檢查清單

部署前確認：

- [ ] 所有必要環境變數已設定於 Vercel
- [ ] `NEXT_PUBLIC_APP_URL` 指向正式網域
- [ ] `SESSION_SECRET` 已更換為強密碼
- [ ] MongoDB 使用獨立的 Production 資料庫
- [ ] SMTP 配置已設定（SMTP_USER, SMTP_PASS）
- [ ] Pusher 已升級至付費方案（若需要更高流量）
- [ ] 敏感資料未暴露於前端（檢查 `NEXT_PUBLIC_*` 變數）

---

## 附註

- 所有 `NEXT_PUBLIC_*` 變數會暴露於前端，切勿儲存敏感資料
- 環境變數更新後需重啟開發伺服器
- Vercel 環境變數更新後需重新部署

此文件將隨專案需求持續更新。

