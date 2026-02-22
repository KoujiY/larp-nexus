# 外部設定檢查清單

## 版本：v1.0
## 更新日期：2025-11-29

---

## ⚠️ 重要提醒

本文件列出**所有需要在 Next.js 專案外部完成的設定項目**。這些項目無法透過程式碼自動化，需要人工操作完成。

建議在開始開發前，先完成「Phase 1：基礎服務」的所有設定。

---

## 📋 設定階段劃分

### Phase 1：基礎服務（⏱️ 預估 1-2 小時）

開發前必須完成，否則無法啟動專案。

---

### Phase 2：開發階段服務（⏱️ 預估 1 小時）

開發特定功能時才需要。

---

### Phase 3：部署前設定（⏱️ 預估 30 分鐘）

準備部署至生產環境前完成。

---

### Phase 4：生產環境優化（⏱️ 預估 1 小時，選用）

正式上線後的進階設定。

---

## 🔧 Phase 1：基礎服務設定

### 1.1 MongoDB Atlas 設定

**用途**：資料庫服務  
**方案**：M0 Free Tier  
**預估時間**：20 分鐘

#### 設定步驟

1. **註冊帳號**
   - 前往 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
   - 使用 Google/GitHub 帳號快速註冊

2. **建立 Cluster**
   - 點擊「Build a Cluster」
   - 選擇「Shared」（免費方案）
   - **Region**：選擇 `Hong Kong (GCP)` 或 `Singapore (AWS)`
   - Cluster Name：保持預設或命名為 `larp-nexus`
   - 點擊「Create Cluster」（等待 5-10 分鐘建立完成）

3. **建立資料庫使用者**
   - 左側選單 → Database Access
   - 點擊「Add New Database User」
   - Authentication Method：選擇「Password」
   - Username：`larpnexus`（或自訂）
   - Password：**自動生成強密碼並記錄**
   - Database User Privileges：選擇 `Atlas admin`
   - 點擊「Add User」

4. **設定網路存取**
   - 左側選單 → Network Access
   - 點擊「Add IP Address」
   - **開發環境**：點擊「Add Current IP Address」
   - **生產環境**：輸入 `0.0.0.0/0`（允許所有 IP，Vercel 需要）
   - 點擊「Confirm」

5. **取得連線字串**
   - 回到 Database → Clusters
   - 點擊「Connect」
   - 選擇「Connect your application」
   - Driver：選擇 `Node.js` 版本 `5.5 or later`
   - 複製連線字串：
     ```
     mongodb+srv://larpnexus:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - **重要**：將 `<password>` 替換為實際密碼
   - **重要**：在 `.net/` 後加入資料庫名稱，例如：
     ```
     mongodb+srv://larpnexus:mypassword@cluster0.xxxxx.mongodb.net/larp-nexus?retryWrites=true&w=majority
     ```

6. **驗證設定**
   ```bash
   # 使用 MongoDB Compass 或 mongosh 測試連線
   mongosh "mongodb+srv://larpnexus:password@cluster0.xxxxx.mongodb.net/larp-nexus"
   ```

#### ✅ 完成檢查
- [ ] Cluster 建立成功
- [ ] 資料庫使用者已建立
- [ ] IP 白名單已設定
- [ ] 連線字串已取得並測試成功
- [ ] 連線字串已記錄至 `.env.local`

---

### 1.2 GitHub Repository 設定

**用途**：版本控制與 CI/CD  
**預估時間**：15 分鐘

#### 設定步驟

1. **建立 Repository**
   - 前往 [GitHub](https://github.com/new)
   - Repository name：`larp-nexus`
   - Visibility：Private（建議）
   - 不勾選「Initialize with README」（專案已有）
   - 點擊「Create repository」

2. **推送現有專案**
   ```bash
   git remote add origin https://github.com/your-username/larp-nexus.git
   git branch -M main
   git push -u origin main
   ```

3. **建立分支**
   ```bash
   git checkout -b develop
   git push -u origin develop
   
   git checkout -b staging
   git push -u origin staging
   ```

4. **設定分支保護規則**
   - Settings → Branches → Add branch protection rule
   - Branch name pattern：`main`
   - 勾選：
     - ✅ Require a pull request before merging
     - ✅ Require status checks to pass before merging
     - ✅ Require conversation resolution before merging
   - 點擊「Create」
   - 重複步驟為 `develop` 分支設定

5. **設定 GitHub Actions Secrets**（部署時需要）
   - Settings → Secrets and variables → Actions
   - 新增以下 Secrets（後續設定其他服務後回填）：
     - `MONGODB_URI_STAGING`
     - `MONGODB_URI_PRODUCTION`
     - `SESSION_SECRET_STAGING`
     - `SESSION_SECRET_PRODUCTION`

#### ✅ 完成檢查
- [ ] Repository 已建立
- [ ] 程式碼已推送至 GitHub
- [ ] `main`, `develop`, `staging` 分支已建立
- [ ] 分支保護規則已設定

---

### 1.3 本地開發環境安裝

**用途**：本地開發工具  
**預估時間**：30 分鐘

#### 設定步驟

1. **安裝 Node.js**
   - 前往 [Node.js](https://nodejs.org/)
   - 下載 **LTS 版本**（20.x 或更高）
   - 安裝完成後驗證：
     ```bash
     node --version  # 應顯示 v20.x.x
     ```

2. **安裝 pnpm**
   ```bash
   npm install -g pnpm
   
   # 驗證安裝
   pnpm --version  # 應顯示 9.x.x
   ```

3. **安裝 Git**（若未安裝）
   - Windows：[Git for Windows](https://git-scm.com/download/win)
   - Mac：`brew install git`
   - Linux：`sudo apt install git`
   - 驗證：
     ```bash
     git --version
     ```

4. **設定 Git 使用者資訊**
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your-email@example.com"
   ```

5. **安裝 VS Code**（建議）
   - 前往 [VS Code](https://code.visualstudio.com/)
   - 下載並安裝

6. **安裝 VS Code 擴充套件**
   - ESLint (`dbaeumer.vscode-eslint`)
   - Prettier (`esbenp.prettier-vscode`)
   - Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`)
   - TypeScript Vue Plugin (Volar) (`Vue.volar`)

7. **複製專案並安裝依賴**
   ```bash
   git clone https://github.com/your-username/larp-nexus.git
   cd larp-nexus
   pnpm install
   ```

#### ✅ 完成檢查
- [ ] Node.js 20+ 已安裝
- [ ] pnpm 已安裝
- [ ] Git 已安裝並設定
- [ ] VS Code 與擴充套件已安裝
- [ ] 專案依賴已安裝（`pnpm install` 成功）

---

## 🔌 Phase 2：開發階段服務設定

### 2.1 Pusher 設定（WebSocket）

**用途**：即時事件推送  
**方案**：Sandbox Free Tier  
**預估時間**：10 分鐘  
**需要時機**：實作即時事件功能時

#### 設定步驟

1. **註冊帳號**
   - 前往 [Pusher](https://dashboard.pusher.com/accounts/sign_up)
   - 使用 Google/GitHub 帳號註冊

2. **建立 App**
   - 點擊「Create app」
   - App name：`larp-nexus`
   - Cluster：選擇 `ap3`（Asia Pacific - Singapore）
   - Frontend tech：選擇 `React`
   - Backend tech：選擇 `Node.js`
   - 點擊「Create app」

3. **取得憑證**
   - 進入 App 後，點擊「App Keys」
   - 記錄以下資訊（供伺服端 trigger 與前端 subscribe 共用）：
     ```
     app_id: 1234567
     key: xxxxxxxxxxxxxxxxxx        # 同時用於後端/前端
     secret: xxxxxxxxxxxxxxxxxx     # 只給後端
     cluster: ap3
     ```

4. **測試連線**（可選）
   - 於 Dashboard 的「Debug Console」測試推送事件
   - 或使用 Pusher 提供的測試工具

#### ✅ 完成檢查
- [ ] Pusher 帳號已註冊
- [ ] App 已建立（Cluster = ap3）
- [ ] App ID, Key, Secret 已取得
- [ ] 憑證已記錄至 `.env.local`：
  ```
  # 伺服端（trigger 用）
  PUSHER_APP_ID=
  PUSHER_KEY=
  PUSHER_SECRET=
  PUSHER_CLUSTER=ap3

  # 前端（subscribe 用，與 PUSHER_KEY/CLUSTER 值相同）
  NEXT_PUBLIC_PUSHER_KEY=
  NEXT_PUBLIC_PUSHER_CLUSTER=ap3
  ```

---

### 2.2 Resend 設定（Email 服務）

**用途**：Magic Link 登入郵件發送  
**方案**：Free Tier (100 emails/day)  
**預估時間**：15 分鐘  
**需要時機**：實作 GM 登入功能時

#### 設定步驟

1. **註冊帳號**
   - 前往 [Resend](https://resend.com/signup)
   - 使用 Email 或 GitHub 註冊

2. **取得 API Key**
   - 進入 Dashboard → API Keys
   - 點擊「Create API Key」
   - Name：`larp-nexus-production`
   - Permission：選擇 `Sending access`
   - 點擊「Create」
   - **立即複製 API Key**（僅顯示一次）

3. **驗證發送者網域**（生產環境）
   - Dashboard → Domains → Add Domain
   - 輸入您的網域（例：`larpnexus.com`）
   - 按照指示設定 DNS 記錄：
     - SPF 記錄
     - DKIM 記錄
   - 等待驗證完成（可能需要數小時）

4. **使用測試網域**（開發環境）
   - 若暫無網域，可使用 Resend 提供的測試地址：
     ```
     EMAIL_FROM=onboarding@resend.dev
     ```
   - 測試地址僅能發送至您註冊 Resend 的 Email

5. **測試發送**
   ```bash
   # 使用 curl 測試
   curl -X POST https://api.resend.com/emails \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "onboarding@resend.dev",
       "to": "your-email@example.com",
       "subject": "Test Email",
       "html": "<p>Hello from LARP Nexus!</p>"
     }'
   ```

#### ✅ 完成檢查
- [ ] Resend 帳號已註冊
- [ ] API Key 已取得
- [ ] 發送者網域已驗證（或使用測試網域）
- [ ] 測試郵件發送成功
- [ ] 憑證已記錄至 `.env.local`：
  ```
  RESEND_API_KEY=re_xxxxxxxxxxxx
  EMAIL_FROM=onboarding@resend.dev
  ```

---

### 2.3 Session Secret 生成

**用途**：加密 Session Cookie  
**預估時間**：1 分鐘

#### 設定步驟

```bash
# 使用 openssl 生成 32 字元隨機字串
openssl rand -base64 32

# 輸出範例：
# Ab3dEf6gHi9jKl2mNo5pQr8sTu1vWx4yZ=
```

將生成的字串記錄至 `.env.local`：
```
SESSION_SECRET=Ab3dEf6gHi9jKl2mNo5pQr8sTu1vWx4yZ=
```

#### ✅ 完成檢查
- [ ] Session Secret 已生成
- [ ] 已記錄至 `.env.local`

---

### 2.4 `.env.local` 建立

**用途**：本地環境變數  
**預估時間**：5 分鐘

#### 設定步驟

1. **複製範本**（需手動建立，因 .env.example 被 gitignore）
   
   建立 `.env.local` 檔案並填入以下內容：

   ```bash
   # MongoDB Atlas
   MONGODB_URI=mongodb+srv://larpnexus:password@cluster0.xxxxx.mongodb.net/larp-nexus?retryWrites=true&w=majority
   
   # Next.js App URL
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   
   # Session Secret
   SESSION_SECRET=Ab3dEf6gHi9jKl2mNo5pQr8sTu1vWx4yZ=
   
   # Pusher
   PUSHER_APP_ID=1234567
   NEXT_PUBLIC_PUSHER_KEY=xxxxxxxxxxxxxxxxxx
   PUSHER_SECRET=xxxxxxxxxxxxxxxxxx
   NEXT_PUBLIC_PUSHER_CLUSTER=ap3
   
   # Vercel Blob（部署後才有）
   BLOB_READ_WRITE_TOKEN=
   
   # Resend
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=onboarding@resend.dev
   ```

2. **驗證設定**
   ```bash
   pnpm dev
   ```
   - 若有缺少環境變數，終端會顯示錯誤

#### ✅ 完成檢查
- [ ] `.env.local` 已建立
- [ ] 所有必要變數已填入
- [ ] `pnpm dev` 啟動成功

---

## 🚀 Phase 3：部署前設定

### 3.1 Vercel 帳號與專案設定

**用途**：部署平台  
**方案**：Hobby Free Tier  
**預估時間**：15 分鐘

#### 設定步驟

1. **註冊 Vercel**
   - 前往 [Vercel](https://vercel.com/signup)
   - 使用 GitHub 帳號登入（推薦）
   - 授權 Vercel 存取 GitHub

2. **匯入專案**
   - 點擊「Add New Project」
   - 選擇 `larp-nexus` Repository
   - Framework Preset：自動偵測為 `Next.js`
   - Root Directory：保持預設 `./`
   - 點擊「Deploy」（**先不要急著部署，需先設定環境變數**）

3. **取消部署並設定環境變數**
   - 若已開始部署，可取消
   - 進入 Project Settings → Environment Variables
   - 新增以下變數（**針對 Production 環境**）：

   | Key | Value | Environment |
   |-----|-------|-------------|
   | `MONGODB_URI` | `mongodb+srv://...` | Production |
   | `NEXT_PUBLIC_APP_URL` | `https://your-domain.vercel.app` | Production |
   | `SESSION_SECRET` | `生成新的 Secret` | Production |
   | `PUSHER_APP_ID` | `1234567` | Production |
   | `NEXT_PUBLIC_PUSHER_KEY` | `xxx` | Production |
   | `PUSHER_SECRET` | `xxx` | Production |
   | `NEXT_PUBLIC_PUSHER_CLUSTER` | `ap3` | Production |
   | `RESEND_API_KEY` | `re_xxx` | Production |
   | `EMAIL_FROM` | `noreply@your-domain.com` | Production |

4. **重新部署**
   - Settings → Deployments
   - 點擊最新的部署 → Redeploy

5. **取得 Vercel Blob Token**
   - Project Settings → Storage
   - 點擊「Create Database」→ 選擇 「Blob」
   - 建立後，Token 會自動加入環境變數 `BLOB_READ_WRITE_TOKEN`

#### ✅ 完成檢查
- [ ] Vercel 帳號已註冊
- [ ] 專案已匯入
- [ ] 環境變數已設定（Production）
- [ ] Vercel Blob 已啟用
- [ ] 部署成功（綠色勾勾）
- [ ] 訪問 `https://your-project.vercel.app` 正常顯示

---

### 3.2 Vercel 環境變數（Preview & Development）

**用途**：設定 Preview 與 Development 環境變數  
**預估時間**：10 分鐘

#### 設定步驟

1. **為 Preview 環境設定變數**
   - 使用與 Production 相同的變數
   - 或使用獨立的 Staging MongoDB

2. **為 Development 環境設定變數**
   - 使用本地開發的變數
   - 或執行 `vercel env pull` 同步

3. **同步環境變數至本地**
   ```bash
   # 安裝 Vercel CLI
   pnpm add -g vercel
   
   # 連結專案
   vercel link
   
   # 拉取環境變數
   vercel env pull .env.local
   ```

#### ✅ 完成檢查
- [ ] Preview 環境變數已設定
- [ ] Development 環境變數已設定
- [ ] 本地 `.env.local` 已更新（包含 `BLOB_READ_WRITE_TOKEN`）

---

## 🌟 Phase 4：生產環境優化（選用）

### 4.1 自訂網域設定

**用途**：使用自己的網域（如 `larpnexus.com`）  
**預估時間**：30 分鐘（含 DNS 生效時間）

#### 設定步驟

1. **購買網域**
   - 前往 [Namecheap](https://www.namecheap.com/) 或 [GoDaddy](https://www.godaddy.com/)
   - 搜尋並購買網域

2. **於 Vercel 新增網域**
   - Project Settings → Domains
   - 輸入網域（例：`larpnexus.com`）
   - 點擊「Add」

3. **設定 DNS 記錄**
   - Vercel 會提供 DNS 設定指示
   - 前往網域註冊商的 DNS 管理頁面
   - 新增 A 記錄或 CNAME 記錄：
     ```
     Type: A
     Name: @
     Value: 76.76.21.21
     ```
   - 若要支援 `www`：
     ```
     Type: CNAME
     Name: www
     Value: cname.vercel-dns.com
     ```

4. **等待 DNS 生效**
   - 通常需要 10 分鐘至 24 小時
   - 可使用 [DNS Checker](https://dnschecker.org/) 檢查

5. **SSL 憑證自動配置**
   - Vercel 會自動配置 Let's Encrypt SSL
   - 完成後可透過 `https://larpnexus.com` 存取

6. **更新環境變數**
   - 將 `NEXT_PUBLIC_APP_URL` 更新為新網域

#### ✅ 完成檢查
- [ ] 網域已購買
- [ ] DNS 記錄已設定
- [ ] SSL 憑證已配置
- [ ] `https://your-domain.com` 可正常存取

---

## 📝 環境變數總表

完成所有設定後，您的 `.env.local` 應包含：

```bash
# ===== 必要 =====
MONGODB_URI=mongodb+srv://...
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=xxx
PUSHER_APP_ID=xxx
PUSHER_KEY=xxx
PUSHER_SECRET=xxx
PUSHER_CLUSTER=ap3
NEXT_PUBLIC_PUSHER_KEY=xxx
NEXT_PUBLIC_PUSHER_CLUSTER=ap3
BLOB_READ_WRITE_TOKEN=xxx
RESEND_API_KEY=xxx
EMAIL_FROM=xxx
```

---

## 🎯 快速驗證

完成所有設定後，執行以下命令驗證：

```bash
# 1. 安裝依賴
pnpm install

# 2. 類型檢查
pnpm type-check

# 3. Lint 檢查
pnpm lint

# 4. 建置專案
pnpm build

# 5. 啟動開發伺服器
pnpm dev

# 6. 訪問 http://localhost:3000
# 應顯示 "LARP Nexus" 首頁
```

---

## 🆘 常見問題

### Q1：MongoDB 連線失敗

**錯誤訊息**：`MongoServerError: bad auth`

**解決方式**：
1. 確認 Username 與 Password 正確
2. 確認密碼中的特殊字元已 URL encode
3. 確認連線字串包含資料庫名稱

---

### Q2：Pusher 連線失敗

**錯誤訊息**：`Pusher : Error : {"type":"WebSocketError","error":...}`

**解決方式**：
1. 確認 `NEXT_PUBLIC_PUSHER_KEY` 正確
2. 確認 `NEXT_PUBLIC_PUSHER_CLUSTER` 與 App 設定一致
3. 檢查瀏覽器 Console 是否有 CORS 錯誤

---

### Q3：Vercel 部署失敗

**錯誤訊息**：`Build Error: ...`

**解決方式**：
1. 確認所有環境變數已設定
2. 確認 `pnpm build` 在本地可成功執行
3. 檢查 Vercel Deployment Logs

---

### Q4：圖片上傳失敗

**錯誤訊息**：`Error: Missing Blob read write token`

**解決方式**：
1. 確認 Vercel Blob 已啟用
2. 執行 `vercel env pull` 同步 Token
3. 重啟開發伺服器

---

## 📞 需要協助？

如遇到無法解決的問題，請：

1. 檢查本文件的「常見問題」章節
2. 參考 [MongoDB Atlas 文件](https://www.mongodb.com/docs/atlas/)
3. 參考 [Vercel 文件](https://vercel.com/docs)
4. 參考 [Pusher 文件](https://pusher.com/docs/)
5. 聯絡專案負責人

---

## ✅ 設定完成確認

完成所有設定後，請確認：

- [ ] **Phase 1** 所有項目已完成
- [ ] **Phase 2** 開發所需項目已完成
- [ ] **Phase 3** 部署前項目已完成（若要部署）
- [ ] **Phase 4** 選用項目已完成（若需要）
- [ ] 環境變數檔案已建立並填入
- [ ] `pnpm dev` 啟動成功
- [ ] `pnpm build` 建置成功
- [ ] 所有 API 金鑰已安全儲存（密碼管理工具）

---

**祝開發順利！🚀**

如有任何問題，請參考 `docs/specs/` 中的其他技術文件。

