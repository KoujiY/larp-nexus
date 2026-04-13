# AI 角色匯入功能設計規格

> 日期：2026-04-12
> 狀態：Implemented
> 範圍：MVP — 單角色匯入，OpenAI 相容 API

## 概述

讓 GM 透過貼上文字或上傳 .docx 檔案，利用 AI 自動解析角色資料並建立角色。使用者需自備 AI API Key，系統透過 OpenAI 相容 API 呼叫 AI 服務。

## 功能範圍

### 包含

- 貼上文字 / .docx 上傳匯入
- AI 解析角色的所有敘述性 + 數值性欄位（段落索引法）
- 預覽確認介面（欄位級微調）
- GM 個人設定頁 AI 配置（Provider 選擇、API Key、Base URL、Model）
- API Key Server-side DB 加密儲存
- 匯入選項：包含隱藏資訊、允許 AI 補足欄位
- 自訂提示功能（使用者可提供額外指示給 AI）

### 不包含

- Items / Skills 的機制性欄位（效果系統、檢定類型、冷卻時間等）
- Anthropic API 支援（API 格式不相容，留待後續迭代）
- 批次匯入多個角色
- Google 文件直接連結匯入

---

## 系統架構

### 架構方案：分離式處理管線（方案 B）

UI 和 AI 邏輯分離，AI 模組可被未來其他功能重用。

```
components/gm/                        ← UI 層
  ├── character-import-tab.tsx         ← 匯入分頁主元件（狀態機）
  ├── character-import-input.tsx       ← 輸入階段
  ├── character-import-preview.tsx     ← 預覽確認階段
  ├── ai-settings-form.tsx            ← AI 設定表單
  └── create-character-button.tsx      ← 修改：新增匯入引導

lib/ai/                               ← AI 處理管線
  ├── provider.ts                      ← AI client 建立與呼叫
  ├── prompts/
  │     └── character-import.ts        ← system prompt（段落索引法）
  ├── schemas/
  │     ├── character-import.ts        ← 最終結果 schema
  │     └── character-import-index.ts  ← AI 回傳索引 schema + OpenAI JSON schema
  ├── processors/
  │     └── paragraph-indexer.ts       ← 段落拆分、編號、索引組裝
  └── parsers/
        └── docx.ts                    ← .docx → 純文字

lib/crypto.ts                          ← 通用加解密工具（不限 AI 用途）

app/actions/
  ├── character-import.ts              ← 匯入相關 Server Actions
  └── ai-config.ts                     ← AI 設定相關 Server Actions

app/(gm)/profile/page.tsx             ← 修改：新增 AI 設定區塊
components/gm/game-edit-tabs.tsx       ← 修改：新增匯入分頁
```

### 資料流

```
GM 個人設定頁
  │  Provider 選擇 + API Key + Base URL + Model
  │  ↓ (HTTPS POST)
  Server Action: saveAiConfig（儲存 key）/ updateAiSettings（更新 provider/model）
  │  → AES-256-GCM 加密 API Key
  │  → 儲存至 MongoDB User.aiConfig
  Server Action: testAiConfig（驗證連線）
  │  → 最小 prompt 測試呼叫（maxTokens: 1）
  │
角色匯入 Tab
  │  文字 / .docx
  │  ↓
  Server Action: parseCharacterFromText
  │  ├─ lib/ai/parsers/docx.ts      (.docx → 純文字)
  │  ├─ lib/ai/provider.ts           (從 DB 讀取 + 解密 API Key, 建立 client)
  │  ├─ lib/ai/prompts/...           (system prompt)
  │  ├─ lib/ai/schemas/...           (JSON schema)
  │  └─ AI API structured output 呼叫
  │       ↓
  預覽確認階段（欄位級微調）
  │  ↓ 確認建立
  現有 Server Actions: createCharacter + updatePublicInfo
    + updateSecretInfo + updateStats + updateTasks
  │  ↓
  自動導航至角色編輯頁
```

---

## DB Schema 變更

### User Model 新增欄位

```typescript
aiConfig?: {
  provider: string            // "openai" | "gemini" | "groq" | ... | "custom"
  baseUrl: string             // e.g. "https://api.openai.com/v1"
  model: string               // e.g. "gpt-4o"
  encryptedApiKey: string     // AES-256-GCM 加密後密文，格式 "iv:encrypted:authTag"
}
```

- `aiConfig` 為 optional，不存在代表使用者尚未設定
- `baseUrl` 和 `model` 明文儲存（非敏感）
- 不需要 migration — MongoDB schema-less，既有文件自然為 `undefined`

---

## AI 模組設計

### provider.ts

- 從 DB 讀取使用者的 aiConfig
- 呼叫 `lib/crypto.ts` 解密 API Key
- 建立 OpenAI client（帶自訂 baseURL）
- 發送 structured output 請求
- 統一錯誤處理

### crypto.ts（通用加解密）

- `encrypt(plainText: string): string` — AES-256-GCM 加密
- `decrypt(cipherText: string): string` — 解密
- 加密金鑰來源：環境變數 `AI_ENCRYPTION_SECRET`（至少 32 bytes）
- 密文格式：`iv:encrypted:authTag`
- 放在 `lib/` 頂層，不限 AI 用途，未來其他功能可重用

### prompts/character-import.ts

Prompt 策略：
1. 說明這是 LARP 角色資料解析任務
2. 列出所有可能欄位及用途說明
3. 強調「有就填、沒有留空」
4. Few-shot 範例輔助理解欄位邊界
5. 模糊情境指引（如：同時像背景也像性格的文字，優先歸入背景）

Prompt 存放於獨立檔案，保留未來改為從 DB 讀取的彈性。

### schemas/character-import.ts

```typescript
type CharacterImportResult = {
  name: string
  description: string
  slogan: string | null
  publicInfo: {
    background: Array<{ type: 'title' | 'body'; content: string }>
    personality: string | null
    relationships: Array<{ targetName: string; description: string }>
  }
  secretInfo: {
    secrets: Array<{ title: string; content: string }>
  }
  tasks: Array<{ title: string; description: string }>
  stats: Array<{ name: string; value: number; maxValue?: number }>
}
```

同時導出為 JSON Schema 格式供 OpenAI `response_format` 使用。

### parsers/docx.ts

- 使用 `mammoth` 將 .docx 轉為純文字
- 保留段落分隔和標題結構
- 過濾圖片、表格等非文字內容

---

## UI 設計

### 入口

1. **GameEditTabs 新增「角色匯入」分頁** — 位於「角色列表」旁邊
   - Baseline 模式：劇本資訊 / 預設事件 / 角色列表 / 角色匯入
   - Runtime 模式：控制台 / 劇本資訊 / 預設事件 / 角色列表 / 角色匯入
   - Runtime 模式下 tab 顯示但內容為 disabled 提示（與角色建立一致）
2. **建立角色 Dialog 內新增引導** — 「有現成角色資料？前往 AI 匯入」按鈕，關閉 Dialog 並切換至匯入分頁

### 匯入分頁狀態機

```
                    ┌──────────────────────┐
                    │    檢查 AI 設定       │
                    └──────┬───────────────┘
                           │
                 ┌─────────▼──────────┐
          未設定 │                     │ 已設定
                 ▼                    ▼
         ┌──────────────┐    ┌──────────────┐
         │  引導設定提示  │    │   input 階段  │
         │ → 前往設定頁  │    │  文字/docx輸入 │
         └──────────────┘    └──────┬───────┘
                                    │ 送出
                                    ▼
                             ┌──────────────┐
                             │ parsing 階段  │
                             │ spinner+提示  │
                             │ 請勿重新整理  │
                             └──────┬───────┘
                                    │
                           ┌────────▼────────┐
                    成功    │                  │ 失敗
                           ▼                  ▼
                    ┌──────────────┐   toast 錯誤訊息
                    │ preview 階段  │   留在 input 階段
                    │ 欄位預覽+微調 │   可直接重試
                    └──────┬───────┘
                           │
                  ┌────────▼────────┐
           確認建立│                  │ 重新匯入
                  ▼                  ▼
           ┌──────────────┐   回到 input 階段
           │  建立中...    │   保留原始文字
           └──────┬───────┘
                  │
         ┌────────▼────────┐
  成功    │                  │ 失敗
         ▼                  ▼
  自動導航至             toast 錯誤訊息
  角色編輯頁             留在 preview 階段
```

### Tab 狀態管理

- **forceMount**：匯入分頁使用 `TabsContent forceMount`，切換其他 tab 時不 unmount，保留 React state
- **Dirty state**：有 AI 解析結果但尚未建立角色時，匯入 tab trigger 顯示琥珀金圓點（與角色編輯頁一致）
- **beforeunload**：dirty state 時，導航離開 / 關閉分頁 / 重新整理觸發瀏覽器確認提醒
- **Tab 切換不攔截**：依靠 forceMount 保留狀態，不使用 window.confirm

### 各階段 UI

**Input 階段：**
- 兩種輸入模式切換：貼上文字（textarea）/ 上傳 .docx（file input）
- 「建議格式範本」展開區塊
- 「開始解析」按鈕（未設定 AI 時 disabled）

**Parsing 階段：**
- Loading spinner + 「AI 正在分析您的角色資料，請勿重新整理頁面」
- beforeunload 防護

**Preview 階段：**
- 每個欄位區塊：欄位名稱 + 內容 + 編輯按鈕
- 空欄位以灰色「未偵測到」標示
- 底部 Sticky bar：「重新匯入」+「確認建立」（複用現有 sticky bar 元件模式）

**Done：**
- 自動導航至 `/games/[gameId]/characters/[characterId]`
- 導航後匯入分頁 state 自然重置（頁面級 unmount）

### AI 設定頁（GM 個人設定）

在 `app/(gm)/profile/page.tsx` 新增 AI 設定區塊：

- Provider 下拉選單（OpenAI / Gemini / 自訂）— 選擇後自動帶入 base URL 和預設 model
- API Key 輸入（`type="password"`）
- 進階設定（預設收起）：Base URL、Model（text input，可自行修改預設值）
- 儲存時主動驗證：發送最小測試請求確認 provider + key + model 組合有效
- 已設定時顯示「已設定」狀態，提供「更新」和「刪除」操作
- API Key 不顯示任何部分明文，只回傳 `hasApiKey: boolean`

Provider 清單和預設值寫在前端設定檔中，日後新增 provider 只需加一筆資料。Model 為自由輸入 text input，不做固定選單。具體的 provider 清單和預設 model 在實作階段決定。

---

## 錯誤處理

所有錯誤統一使用 Sonner toast 顯示，錯誤後留在當前步驟可直接重試。

### AI 設定階段

| 錯誤 | 處理 | Toast 訊息 |
|------|------|-----------|
| API Key 無效 | 不儲存，留在設定頁 | 「API Key 驗證失敗，請檢查設定」 |
| 額度不足 | 不儲存，留在設定頁 | 「API 額度不足，請檢查您的帳戶」 |
| 模型不存在 | 不儲存，留在設定頁 | 「指定的模型不可用，請檢查設定」 |
| Base URL 無法連線 | 不儲存，留在設定頁 | 「無法連線至 AI 服務，請檢查 Base URL」 |
| 非 OpenAI 格式錯誤 | 不儲存，留在設定頁 | 「AI 服務回傳錯誤，請檢查您的 API 設定」 |

### 匯入階段

| 錯誤 | 處理 | Toast 訊息 |
|------|------|-----------|
| 未設定 API Key | 阻擋在前端 | 引導設定提示（不使用 toast） |
| .docx 解析失敗 | 留在 input 階段 | 「文件格式無法解析，請改用貼上文字」 |
| AI API 呼叫失敗 | 留在 input 階段 | 視具體錯誤類型顯示對應訊息 |
| AI 回傳格式異常 | 重試一次，仍失敗留在 input | 「解析失敗，請稍後重試或調整輸入內容」 |
| 角色建立失敗 | 留在 preview 階段 | 「角色建立失敗：[具體原因]」 |

---

## 安全性

### API Key 生命週期

```
輸入(password input) → HTTPS 傳輸 → Server Action 接收
  → AES-256-GCM 加密 → MongoDB 儲存密文
  → 使用時：讀取密文 → 解密 → 呼叫 AI API
  → request 結束，記憶體中明文隨 GC 釋放
```

### 安全規則

1. API Key 明文永遠不離開 server — 前端只負責輸入
2. 取得設定 API 只回傳 `{ hasApiKey: boolean }` — 不回傳任何明文或 mask
3. 更新 key 是整把替換 — 不提供「查看完整 key」功能
4. 刪除設定時完整清除 `aiConfig` 欄位
5. 加密金鑰為環境變數 `AI_ENCRYPTION_SECRET`（至少 32 bytes 隨機字串），不在 DB 中
6. Server Action 需驗證呼叫者身份（現有 session 驗證機制），防止未授權存取他人 AI 設定

### 輸入驗證

- 文字輸入：最大 50,000 字元
- .docx 上傳：最大 5MB，僅接受 `.docx` 副檔名
- API Key：非空、去除首尾空白
- Base URL：合法 URL 格式
- Model：非空字串

---

## 新增依賴

| 套件 | 用途 | 備註 |
|------|------|------|
| `openai` | OpenAI 相容 API 呼叫 | Server-side only，不影響前端 bundle |
| `mammoth` | .docx → 純文字轉換 | Server-side only，不影響前端 bundle |

不需要額外安裝：
- 加密：Node.js 內建 `crypto`
- 驗證：已有 `zod`
- Toast：已有 `sonner`

---

## 未來擴展點

以下為本次 MVP 刻意不實作但保留擴展彈性的功能：

- **Anthropic API 支援**：需在 `lib/ai/provider.ts` 新增 Anthropic client 路由
- **批次匯入**：匯入分頁支援多角色文件拆分
- **Prompt 自訂**：將 prompt 改為從 DB 讀取，提供 UI 編輯介面
- **AI 生成角色**：重用 `lib/ai/` 管線，換 prompt 和 schema
- **Google 文件連結匯入**：新增 Google Docs API OAuth 整合
- **更多 Provider 預設**：在前端設定檔中新增 provider entry
- **Items / Skills 機制性欄位解析**：從物品/技能描述文字推斷效果系統、檢定類型等
