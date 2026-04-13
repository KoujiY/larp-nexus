# AI 角色匯入

## 概述

AI 角色匯入功能讓 GM 可以透過貼上文字或上傳 .docx 檔案，由 AI 自動解析角色資料並建立角色。

## AI 設定

使用前需至 **個人設定頁** 設定 AI 服務：

- **Provider**：OpenAI / Google Gemini / 自訂（任何 OpenAI 相容 API）
- **API Key**：以 AES-256-GCM 加密儲存（`lib/crypto.ts`），系統不保留明文
- **Base URL**：API 端點位址
- **Model**：使用的模型名稱

設定流程分為「儲存」和「驗證」兩步驟：
1. `saveAiConfig`：加密 API Key 並儲存設定
2. `testAiConfig`：發送最小測試請求驗證連線是否正常，成功後記錄 `keyProvider`

## 匯入流程

狀態機：`input → parsing → preview → creating → done`

1. **Input**：貼上文字（最多 50,000 字）或上傳 .docx（最大 5MB）
   - 選項：包含隱藏資訊、允許 AI 補足欄位
   - 可選：自訂提示（最多 500 字，server-side 會清除 markdown heading 和控制字元）
2. **Parsing**：呼叫 AI 服務解析，使用段落索引法（見下方）
3. **Preview**：顯示解析結果，可微調基本欄位（名稱、描述、標語）
4. **Creating**：先 `createCharacter` 建立基本角色，再 `updateCharacter` 填入所有欄位
5. **Done**：導航至角色編輯頁

## 段落索引法

核心設計原則：**AI 不複製原文，只回傳段落編號索引**。

1. 前處理：將原文按換行拆成帶編號的段落 `[1] 第一段` `[2] 第二段`...
2. AI 回傳：段落索引（如 `backgroundSections: [{ title: "出身", paragraphs: [4, 5] }]`）
3. 後處理：程式碼根據索引從原文直接複製，徹底消除 AI 改寫問題

AI 使用 4 步驟分類思路（reasoning 欄位）：
- Step 1：找出所有標題段落
- Step 2：判斷每個標題區段的內容性質
- Step 3：提取短欄位（name、description、slogan、stats）
- Step 4：列出最終分配結果

## 解析欄位

AI 會解析以下欄位：
- 基本資訊：名稱、描述、標語
- 公開資訊：背景故事（段落結構）、性格、關係
- 隱藏資訊：秘密（標題 + 內容）
- 任務：標題 + 描述
- 數值：名稱 + 值 + 最大值

### 匯入選項

| 選項 | 說明 |
|------|------|
| 包含隱藏資訊 | 啟用後解析秘密與隱藏任務 |
| 允許 AI 補足 | 原文中完全沒有的欄位由 AI 根據角色形象補足 |
| 自訂提示 | 使用者額外指示（如「性格請拆成多個特質條列」） |

## 安全考量

- API Key 以 AES-256-GCM 加密，明文不回傳前端
- 自訂提示 server-side 驗證長度 + 清除 markdown heading / 控制字元（防止 prompt injection）
- .docx 上傳有 server-side 副檔名 + 檔案大小驗證

## 相關檔案

| 類別 | 路徑 |
|------|------|
| 加解密 | `lib/crypto.ts` |
| 結果 Schema | `lib/ai/schemas/character-import.ts` |
| 索引 Schema | `lib/ai/schemas/character-import-index.ts` |
| 段落處理器 | `lib/ai/processors/paragraph-indexer.ts` |
| System Prompt | `lib/ai/prompts/character-import.ts` |
| AI Provider | `lib/ai/provider.ts` |
| DOCX 解析 | `lib/ai/parsers/docx.ts` |
| Server Actions | `app/actions/ai-config.ts`, `app/actions/character-import.ts` |
| UI 元件 | `components/gm/ai-settings-form.tsx`, `components/gm/character-import-*.tsx` |
