# AI 角色匯入

## 概述

AI 角色匯入功能讓 GM 可以透過貼上文字或上傳 .docx 檔案，由 AI 自動解析角色資料並建立角色。

## AI 設定

使用前需至 **個人設定頁** 設定 AI 服務：

- **Provider**：OpenAI / Google Gemini / 自訂（任何 OpenAI 相容 API）
- **API Key**：以 AES-256-GCM 加密儲存（`lib/crypto.ts`），系統不保留明文
- **Base URL**：API 端點位址
- **Model**：使用的模型名稱

設定時系統會先發送測試請求驗證連線是否正常。

## 匯入流程

狀態機：`input → parsing → preview → creating → done`

1. **Input**：貼上文字（最多 50,000 字）或上傳 .docx（最大 5MB）
2. **Parsing**：呼叫 AI 服務解析，使用 JSON Schema structured output
3. **Preview**：顯示解析結果，可微調基本欄位（名稱、描述、標語）
4. **Creating**：先 `createCharacter` 建立基本角色，再 `updateCharacter` 填入所有欄位
5. **Done**：導航至角色編輯頁

## 解析欄位

AI 會解析以下欄位：
- 基本資訊：名稱、描述、標語
- 公開資訊：背景故事（段落結構）、性格、關係
- 隱藏資訊：秘密（標題 + 內容）
- 任務：標題 + 描述
- 數值：名稱 + 值 + 最大值

## 相關檔案

| 類別 | 路徑 |
|------|------|
| 加解密 | `lib/crypto.ts` |
| Schema | `lib/ai/schemas/character-import.ts` |
| System Prompt | `lib/ai/prompts/character-import.ts` |
| AI Provider | `lib/ai/provider.ts` |
| DOCX 解析 | `lib/ai/parsers/docx.ts` |
| Server Actions | `app/actions/ai-config.ts`, `app/actions/character-import.ts` |
| UI 元件 | `components/gm/ai-settings-form.tsx`, `components/gm/character-import-*.tsx` |
