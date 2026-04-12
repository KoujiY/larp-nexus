# AI 角色匯入功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 GM 透過貼上文字或上傳 .docx 檔案，利用 AI 自動解析角色資料並建立角色。使用者自備 API Key，系統透過 OpenAI 相容 API 呼叫 AI 服務。

**Architecture:** 分離式處理管線 — UI 層（`components/gm/`）和 AI 邏輯層（`lib/ai/`）完全分離，AI 模組可被未來其他功能重用。API Key 以 AES-256-GCM 加密存儲於 MongoDB User document，明文永不離開 server。匯入分頁使用狀態機管理四個階段（input → parsing → preview → done）。

**Tech Stack:** Next.js 16 + React 19 + TypeScript, OpenAI SDK（OpenAI 相容 API）, mammoth（.docx 解析）, Node.js crypto（AES-256-GCM）, Zod（驗證）, shadcn/ui + Framer Motion（UI）

---

## File Structure

### 新建檔案

| 檔案 | 職責 |
|------|------|
| `lib/crypto.ts` | 通用 AES-256-GCM 加解密工具 |
| `lib/ai/provider.ts` | AI client 建立、API 呼叫、統一錯誤處理 |
| `lib/ai/prompts/character-import.ts` | 角色匯入 system prompt |
| `lib/ai/schemas/character-import.ts` | AI 回傳的 JSON schema + TypeScript type |
| `lib/ai/parsers/docx.ts` | .docx → 純文字轉換 |
| `app/actions/ai-config.ts` | AI 設定相關 Server Actions |
| `app/actions/character-import.ts` | 角色匯入 Server Action |
| `components/gm/ai-settings-form.tsx` | AI 設定表單（Client Component） |
| `components/gm/character-import-tab.tsx` | 匯入分頁主元件（狀態機） |
| `components/gm/character-import-input.tsx` | 輸入階段 UI |
| `components/gm/character-import-preview.tsx` | 預覽確認階段 UI |
| `lib/ai/__tests__/crypto.test.ts` | 加解密單元測試 |
| `lib/ai/__tests__/provider.test.ts` | AI provider 單元測試 |
| `lib/ai/__tests__/schemas.test.ts` | Schema 驗證測試 |
| `lib/ai/__tests__/docx-parser.test.ts` | .docx 解析測試 |
| `app/actions/__tests__/ai-config.test.ts` | AI 設定 Server Action 測試 |
| `app/actions/__tests__/character-import.test.ts` | 角色匯入 Server Action 測試 |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `lib/db/models/GMUser.ts` | 新增 `aiConfig` schema 欄位 |
| `types/index.ts` | GMUser type 新增 `aiConfig` 欄位 |
| `app/(gm)/profile/page.tsx` | 新增 AI 設定區塊 |
| `components/gm/game-edit-tabs.tsx` | 新增「角色匯入」tab |
| `app/(gm)/games/[gameId]/page.tsx` | 傳入 `hasAiConfig` prop |
| `components/gm/create-character-button.tsx` | 新增「前往 AI 匯入」引導連結 |
| `package.json` | 新增 `openai` + `mammoth` 依賴 |

---

## Task 1: 安裝依賴

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安裝 openai 和 mammoth**

```bash
npm install openai mammoth
```

- [ ] **Step 2: 驗證安裝成功**

```bash
rtk npm ls openai mammoth
```

Expected: 顯示 `openai@x.x.x` 和 `mammoth@x.x.x` 版本

- [ ] **Step 3: Commit**

```bash
rtk git add package.json package-lock.json && rtk git commit -m "chore: add openai and mammoth dependencies for AI character import"
```

---

## Task 2: 通用加解密工具 — lib/crypto.ts

**Files:**
- Create: `lib/crypto.ts`
- Create: `lib/ai/__tests__/crypto.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// lib/ai/__tests__/crypto.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 在最上方 mock crypto module — 需要能控制環境變數
const MOCK_SECRET = 'a]3Fj!kL9#mNpQ2rStUvWxYz0123456789abcdef'; // 40 chars

describe('crypto', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, AI_ENCRYPTION_SECRET: MOCK_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('encrypt 回傳 iv:encrypted:authTag 格式', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const result = encrypt('test-api-key');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    // IV = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
  });

  it('decrypt 可還原 encrypt 的結果', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const plainText = 'sk-proj-abc123xyz';
    const encrypted = encrypt(plainText);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('不同次加密同一明文產出不同密文（IV 隨機）', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const plainText = 'same-key';
    const encrypted1 = encrypt(plainText);
    const encrypted2 = encrypt(plainText);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('密文被竄改時 decrypt 拋錯', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // 竄改 encrypted data 的第一個字元
    const tampered = parts[0] + ':' + 'ff' + parts[1].slice(2) + ':' + parts[2];
    expect(() => decrypt(tampered)).toThrow();
  });

  it('缺少 AI_ENCRYPTION_SECRET 時拋錯', async () => {
    delete process.env.AI_ENCRYPTION_SECRET;
    const { encrypt } = await import('@/lib/crypto');
    expect(() => encrypt('test')).toThrow('AI_ENCRYPTION_SECRET');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
rtk vitest run lib/ai/__tests__/crypto.test.ts
```

Expected: FAIL — 找不到 `@/lib/crypto` module

- [ ] **Step 3: 實作 crypto.ts**

```typescript
// lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * 從環境變數取得加密金鑰，hash 為固定 32 bytes
 */
function getKey(): Buffer {
  const secret = process.env.AI_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AI_ENCRYPTION_SECRET 環境變數未設定或長度不足 32 字元');
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * AES-256-GCM 加密
 * @returns 密文格式：`iv:encrypted:authTag`（皆為 hex 編碼）
 */
export function encrypt(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

/**
 * AES-256-GCM 解密
 * @param cipherText 密文格式：`iv:encrypted:authTag`（皆為 hex 編碼）
 */
export function decrypt(cipherText: string): string {
  const key = getKey();
  const [ivHex, encryptedHex, authTagHex] = cipherText.split(':');
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error('密文格式錯誤，預期格式為 iv:encrypted:authTag');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
rtk vitest run lib/ai/__tests__/crypto.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add lib/crypto.ts lib/ai/__tests__/crypto.test.ts && rtk git commit -m "feat: add AES-256-GCM encryption utilities for API key storage"
```

---

## Task 3: AI 匯入 Schema 和 Type 定義

**Files:**
- Create: `lib/ai/schemas/character-import.ts`
- Create: `lib/ai/__tests__/schemas.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// lib/ai/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import {
  characterImportSchema,
  characterImportJsonSchema,
  type CharacterImportResult,
} from '@/lib/ai/schemas/character-import';

describe('characterImportSchema', () => {
  it('驗證完整的合法輸入', () => {
    const input: CharacterImportResult = {
      name: '流浪騎士 艾德溫',
      description: '一位失落王國的騎士',
      slogan: '吾劍即正義',
      publicInfo: {
        background: [
          { type: 'title', content: '出身' },
          { type: 'body', content: '來自北方的沒落貴族' },
        ],
        personality: '正直、固執',
        relationships: [
          { targetName: '公主 莉莉安', description: '效忠對象，暗戀' },
        ],
      },
      secretInfo: {
        secrets: [
          { title: '真實身份', content: '其實是前國王的私生子' },
        ],
      },
      tasks: [
        { title: '尋找聖劍', description: '找到傳說中的聖劍並帶回王都' },
      ],
      stats: [
        { name: '力量', value: 8, maxValue: 10 },
        { name: '智力', value: 5 },
      ],
    };

    const result = characterImportSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('允許 null/空的 optional 欄位', () => {
    const input: CharacterImportResult = {
      name: '無名旅人',
      description: '',
      slogan: null,
      publicInfo: {
        background: [],
        personality: null,
        relationships: [],
      },
      secretInfo: {
        secrets: [],
      },
      tasks: [],
      stats: [],
    };

    const result = characterImportSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('name 為空字串時驗證失敗', () => {
    const input = {
      name: '',
      description: '',
      slogan: null,
      publicInfo: { background: [], personality: null, relationships: [] },
      secretInfo: { secrets: [] },
      tasks: [],
      stats: [],
    };

    const result = characterImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('JSON schema 結構正確（有 name property）', () => {
    expect(characterImportJsonSchema.type).toBe('object');
    expect(characterImportJsonSchema.properties).toHaveProperty('name');
    expect(characterImportJsonSchema.properties).toHaveProperty('publicInfo');
    expect(characterImportJsonSchema.required).toContain('name');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
rtk vitest run lib/ai/__tests__/schemas.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 實作 schema**

```typescript
// lib/ai/schemas/character-import.ts
import { z } from 'zod';

/**
 * AI 角色匯入結果的 Zod schema
 *
 * 設計原則：
 * - name 為必填（角色至少要有名字）
 * - 其餘所有欄位皆為 optional（AI 盡量填、沒有就留空）
 * - 陣列欄位預設為空陣列
 * - 字串 optional 欄位用 nullable（JSON schema 相容性較好）
 */

const backgroundBlockSchema = z.object({
  type: z.enum(['title', 'body']),
  content: z.string(),
});

const relationshipSchema = z.object({
  targetName: z.string(),
  description: z.string(),
});

const secretSchema = z.object({
  title: z.string(),
  content: z.string(),
});

const taskSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const statSchema = z.object({
  name: z.string(),
  value: z.number(),
  maxValue: z.number().optional(),
});

export const characterImportSchema = z.object({
  name: z.string().min(1, '角色名稱不可為空'),
  description: z.string(),
  slogan: z.string().nullable(),
  publicInfo: z.object({
    background: z.array(backgroundBlockSchema),
    personality: z.string().nullable(),
    relationships: z.array(relationshipSchema),
  }),
  secretInfo: z.object({
    secrets: z.array(secretSchema),
  }),
  tasks: z.array(taskSchema),
  stats: z.array(statSchema),
});

export type CharacterImportResult = z.infer<typeof characterImportSchema>;

/**
 * 供 OpenAI structured output 使用的 JSON Schema
 *
 * OpenAI `response_format.json_schema` 要求 strict JSON Schema 格式。
 * 手動定義以確保與 OpenAI API 的相容性（Zod 自動轉換的 schema
 * 可能包含不被 strict mode 支援的關鍵字）。
 */
export const characterImportJsonSchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, description: '角色名稱' },
    description: { type: 'string' as const, description: '角色描述/簡介' },
    slogan: {
      type: ['string', 'null'] as const,
      description: '角色標語/座右銘，沒有則為 null',
    },
    publicInfo: {
      type: 'object' as const,
      properties: {
        background: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['title', 'body'] },
              content: { type: 'string' as const },
            },
            required: ['type', 'content'],
            additionalProperties: false,
          },
          description: '背景故事，以 title/body 區塊交替呈現',
        },
        personality: {
          type: ['string', 'null'] as const,
          description: '性格描述，沒有則為 null',
        },
        relationships: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              targetName: { type: 'string' as const, description: '關係對象名稱' },
              description: { type: 'string' as const, description: '關係描述' },
            },
            required: ['targetName', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['background', 'personality', 'relationships'],
      additionalProperties: false,
    },
    secretInfo: {
      type: 'object' as const,
      properties: {
        secrets: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              title: { type: 'string' as const, description: '秘密標題' },
              content: { type: 'string' as const, description: '秘密內容' },
            },
            required: ['title', 'content'],
            additionalProperties: false,
          },
        },
      },
      required: ['secrets'],
      additionalProperties: false,
    },
    tasks: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const, description: '任務標題' },
          description: { type: 'string' as const, description: '任務描述' },
        },
        required: ['title', 'description'],
        additionalProperties: false,
      },
    },
    stats: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: '數值名稱' },
          value: { type: 'number' as const, description: '數值' },
          maxValue: { type: 'number' as const, description: '最大值（可選）' },
        },
        required: ['name', 'value'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'name',
    'description',
    'slogan',
    'publicInfo',
    'secretInfo',
    'tasks',
    'stats',
  ],
  additionalProperties: false,
};
```

- [ ] **Step 4: 執行測試確認通過**

```bash
rtk vitest run lib/ai/__tests__/schemas.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add lib/ai/schemas/character-import.ts lib/ai/__tests__/schemas.test.ts && rtk git commit -m "feat: add character import schema and JSON schema for OpenAI structured output"
```

---

## Task 4: .docx 解析器

**Files:**
- Create: `lib/ai/parsers/docx.ts`
- Create: `lib/ai/__tests__/docx-parser.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// lib/ai/__tests__/docx-parser.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock mammoth — 不在測試中實際讀取 .docx 檔案
vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

import { parseDocx } from '@/lib/ai/parsers/docx';
import { extractRawText } from 'mammoth';

describe('parseDocx', () => {
  it('回傳 mammoth 解析的純文字', async () => {
    vi.mocked(extractRawText).mockResolvedValueOnce({
      value: '角色名稱：艾德溫\n\n背景故事：\n來自北方的騎士',
      messages: [],
    });

    const buffer = Buffer.from('fake-docx-content');
    const result = await parseDocx(buffer);

    expect(result).toBe('角色名稱：艾德溫\n\n背景故事：\n來自北方的騎士');
    expect(extractRawText).toHaveBeenCalledWith({ buffer });
  });

  it('mammoth 拋錯時包裝為使用者友善訊息', async () => {
    vi.mocked(extractRawText).mockRejectedValueOnce(new Error('Invalid file'));

    const buffer = Buffer.from('not-a-docx');
    await expect(parseDocx(buffer)).rejects.toThrow('文件格式無法解析');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
rtk vitest run lib/ai/__tests__/docx-parser.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 實作 docx parser**

```typescript
// lib/ai/parsers/docx.ts
import { extractRawText } from 'mammoth';

/**
 * 將 .docx Buffer 轉為純文字
 *
 * 使用 mammoth 的 extractRawText 取得純文字內容，
 * 保留段落分隔但過濾圖片、表格等非文字內容。
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await extractRawText({ buffer });
    return result.value;
  } catch {
    throw new Error('文件格式無法解析，請改用貼上文字');
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
rtk vitest run lib/ai/__tests__/docx-parser.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add lib/ai/parsers/docx.ts lib/ai/__tests__/docx-parser.test.ts && rtk git commit -m "feat: add .docx to plain text parser using mammoth"
```

---

## Task 5: AI Prompt 定義

**Files:**
- Create: `lib/ai/prompts/character-import.ts`

- [ ] **Step 1: 建立 prompt 檔案**

```typescript
// lib/ai/prompts/character-import.ts

/**
 * 角色匯入的 AI system prompt
 *
 * 設計策略：
 * 1. 明確說明任務是 LARP 角色資料結構化解析
 * 2. 列出所有欄位及其用途
 * 3. 強調「有就填、沒有留空」原則
 * 4. Few-shot 範例輔助理解欄位邊界
 * 5. 模糊情境指引
 */
export const CHARACTER_IMPORT_SYSTEM_PROMPT = `你是一位 LARP（實境角色扮演遊戲）角色資料解析專家。你的任務是從使用者提供的角色文字資料中，提取並結構化角色資訊。

## 欄位說明

- **name**: 角色的名稱或稱號（必填）
- **description**: 角色的簡短描述或一句話介紹
- **slogan**: 角色的標語、座右銘或口頭禪。如果文字中沒有明確的標語，設為 null
- **publicInfo.background**: 角色的背景故事。拆分為多個區塊：
  - type "title": 段落標題（如「出身」「經歷」）
  - type "body": 段落內文
  如果原文沒有明確標題，用 body 類型呈現即可
- **publicInfo.personality**: 角色的性格特質描述。如果沒有明確的性格描述，設為 null
- **publicInfo.relationships**: 角色與其他角色的關係列表。每項包含對象名稱 (targetName) 和關係描述 (description)
- **secretInfo.secrets**: 角色的隱藏秘密，只有 GM 和角色本人知道的資訊。每項包含標題 (title) 和內容 (content)
- **tasks**: 角色的任務或目標。每項包含標題 (title) 和描述 (description)
- **stats**: 角色的數值屬性。每項包含名稱 (name)、數值 (value)、最大值 (maxValue，選填)

## 解析原則

1. **有就填、沒有留空** — 只提取文字中明確提到的資訊，不要憑空捏造
2. **背景 vs 性格** — 如果一段文字同時像背景描述也像性格描述，優先歸入 background
3. **秘密判定** — 文字中標示為「秘密」「隱藏」「只有自己知道」等字眼的資訊歸入 secrets
4. **任務判定** — 標示為「目標」「任務」「使命」等字眼的歸入 tasks
5. **數值判定** — 明確的數字屬性（如「力量: 8」）歸入 stats；純文字描述（如「力量很大」）不歸入 stats
6. **保持原文** — 盡量保留原文的措辭和表達，不要改寫或潤色
7. **關係提取** — 文中提到的其他角色名稱及其關係，提取至 relationships

## 範例

輸入文字：
"""
角色名：暗影刺客 凱恩
「在黑暗中，我才是規則。」

凱恩原是帝國禁衛軍的精銳成員，五年前目睹了皇帝暗殺忠臣的真相後叛離軍隊。
他性格冷酷寡言，但對無辜者有著不為人知的溫柔。

與商人吉爾伯特保持秘密合作關係，透過他獲取情報。

【隱藏資訊】
凱恩手中握有皇帝暗殺忠臣的證據信件。

【目標】
找到其他叛軍同伴，組織反抗力量。
保護商人吉爾伯特的安全。

力量: 7/10
敏捷: 9/10
智力: 6
"""

期望輸出（概要）：
- name: "暗影刺客 凱恩"
- slogan: "在黑暗中，我才是規則。"
- background: 兩個區塊 — 禁衛軍經歷
- personality: "冷酷寡言，但對無辜者有著不為人知的溫柔"
- relationships: 商人吉爾伯特 → 秘密合作關係
- secrets: 握有皇帝暗殺忠臣的證據信件
- tasks: 找到叛軍同伴 + 保護吉爾伯特
- stats: 力量 7/10, 敏捷 9/10, 智力 6`;
```

- [ ] **Step 2: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

Expected: 0 errors（或只有與此檔案無關的既有 errors）

- [ ] **Step 3: Commit**

```bash
rtk git add lib/ai/prompts/character-import.ts && rtk git commit -m "feat: add character import system prompt for AI parsing"
```

---

## Task 6: AI Provider 模組

**Files:**
- Create: `lib/ai/provider.ts`
- Create: `lib/ai/__tests__/provider.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// lib/ai/__tests__/provider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/GMUser', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn().mockReturnValue('sk-decrypted-key'),
}));
vi.mock('openai', () => {
  const mockParse = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      beta: {
        chat: {
          completions: {
            parse: mockParse,
          },
        },
      },
    })),
    __mockParse: mockParse,
  };
});

import { callAiForCharacterImport } from '@/lib/ai/provider';
import GMUser from '@/lib/db/models/GMUser';

describe('callAiForCharacterImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('使用者無 aiConfig 時拋出明確錯誤', async () => {
    vi.mocked(GMUser.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'user1', email: 'test@test.com' }),
    } as never);

    await expect(
      callAiForCharacterImport('user1', '角色文字')
    ).rejects.toThrow('尚未設定 AI 服務');
  });

  it('使用者有 aiConfig 時呼叫 OpenAI client', async () => {
    vi.mocked(GMUser.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'user1',
        aiConfig: {
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          encryptedApiKey: 'iv:enc:tag',
        },
      }),
    } as never);

    // 取得 mock parse function
    const openaiModule = await import('openai');
    const mockParse = (openaiModule as unknown as { __mockParse: ReturnType<typeof vi.fn> }).__mockParse;
    mockParse.mockResolvedValueOnce({
      choices: [{
        message: {
          parsed: {
            name: '測試角色',
            description: '',
            slogan: null,
            publicInfo: { background: [], personality: null, relationships: [] },
            secretInfo: { secrets: [] },
            tasks: [],
            stats: [],
          },
        },
      }],
    });

    const result = await callAiForCharacterImport('user1', '角色名稱：測試角色');
    expect(result.name).toBe('測試角色');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
rtk vitest run lib/ai/__tests__/provider.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 實作 provider**

```typescript
// lib/ai/provider.ts
import OpenAI from 'openai';
import dbConnect from '@/lib/db/mongodb';
import GMUser from '@/lib/db/models/GMUser';
import { decrypt } from '@/lib/crypto';
import { CHARACTER_IMPORT_SYSTEM_PROMPT } from '@/lib/ai/prompts/character-import';
import {
  characterImportJsonSchema,
  characterImportSchema,
  type CharacterImportResult,
} from '@/lib/ai/schemas/character-import';

/**
 * 從 DB 讀取使用者 AI 設定，解密 API Key，建立 OpenAI client
 */
async function createClientForUser(
  userId: string
): Promise<{ client: OpenAI; model: string }> {
  await dbConnect();
  const user = await GMUser.findById(userId).lean();

  if (!user?.aiConfig) {
    throw new Error('尚未設定 AI 服務，請先至個人設定頁完成 AI 設定');
  }

  const { baseUrl, model, encryptedApiKey } = user.aiConfig;
  const apiKey = decrypt(encryptedApiKey);

  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
  });

  return { client, model };
}

/**
 * 呼叫 AI 解析角色文字資料
 *
 * 使用 OpenAI SDK 的 structured output (beta.chat.completions.parse)
 * 確保回傳符合 CharacterImportResult schema。
 */
export async function callAiForCharacterImport(
  userId: string,
  text: string
): Promise<CharacterImportResult> {
  const { client, model } = await createClientForUser(userId);

  const response = await client.beta.chat.completions.parse({
    model,
    messages: [
      { role: 'system', content: CHARACTER_IMPORT_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'character_import',
        strict: true,
        schema: characterImportJsonSchema,
      },
    },
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error('AI 回傳格式異常，請稍後重試');
  }

  // 用 Zod 再次驗證以確保型別安全
  return characterImportSchema.parse(parsed);
}

/**
 * 發送最小測試請求驗證 AI 設定是否有效
 *
 * 用於儲存設定前的驗證：最小 prompt + maxTokens: 1
 */
export async function testAiConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<void> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });

  await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
  });
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
rtk vitest run lib/ai/__tests__/provider.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add lib/ai/provider.ts lib/ai/__tests__/provider.test.ts && rtk git commit -m "feat: add AI provider module with OpenAI-compatible client and test connection"
```

---

## Task 7: DB Schema 變更 — GMUser + Types

**Files:**
- Modify: `lib/db/models/GMUser.ts`
- Modify: `types/index.ts`

- [ ] **Step 1: 更新 GMUser Mongoose Schema**

在 `lib/db/models/GMUser.ts` 的 `GMUserSchema` 定義中，在 `avatarUrl` 之後新增 `aiConfig` 欄位：

```typescript
// lib/db/models/GMUser.ts — 在 avatarUrl 欄位後新增：
    aiConfig: {
      type: {
        provider: { type: String, required: true },
        baseUrl: { type: String, required: true },
        model: { type: String, required: true },
        encryptedApiKey: { type: String, required: true },
      },
      required: false,
      default: undefined,
    },
```

- [ ] **Step 2: 更新 GMUser TypeScript type**

在 `types/index.ts` 的 `GMUser` interface 中新增：

```typescript
// types/index.ts — GMUser interface 內，avatarUrl 之後新增：
  aiConfig?: {
    provider: string;
    baseUrl: string;
    model: string;
    encryptedApiKey: string;
  };
```

- [ ] **Step 3: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

Expected: 0 new errors

- [ ] **Step 4: Commit**

```bash
rtk git add lib/db/models/GMUser.ts types/index.ts && rtk git commit -m "feat: add aiConfig field to GMUser model and types"
```

---

## Task 8: AI 設定 Server Actions

**Files:**
- Create: `app/actions/ai-config.ts`
- Create: `app/actions/__tests__/ai-config.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// app/actions/__tests__/ai-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentGMUserId: vi.fn(),
}));
vi.mock('@/lib/db/models/GMUser', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn().mockReturnValue('iv:encrypted:tag'),
}));
vi.mock('@/lib/ai/provider', () => ({
  testAiConnection: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getAiConfig, saveAiConfig, deleteAiConfig } from '@/app/actions/ai-config';
import { getCurrentGMUserId } from '@/lib/auth/session';
import GMUser from '@/lib/db/models/GMUser';
import { testAiConnection } from '@/lib/ai/provider';

describe('AI Config Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAiConfig', () => {
    it('未登入時回傳 UNAUTHORIZED', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce(null);
      const result = await getAiConfig();
      expect(result.success).toBe(false);
      expect(result.error).toBe('UNAUTHORIZED');
    });

    it('未設定 aiConfig 時回傳 hasApiKey: false', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(GMUser.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'user1', email: 'test@test.com' }),
      } as never);

      const result = await getAiConfig();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasApiKey: false });
    });

    it('已設定 aiConfig 時回傳 hasApiKey: true 及明文設定（不含 key）', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(GMUser.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'user1',
          aiConfig: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            encryptedApiKey: 'iv:enc:tag',
          },
        }),
      } as never);

      const result = await getAiConfig();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        hasApiKey: true,
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });
    });
  });

  describe('saveAiConfig', () => {
    it('驗證測試失敗時不儲存', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(testAiConnection).mockRejectedValueOnce(new Error('Invalid API key'));

      const result = await saveAiConfig({
        provider: 'openai',
        apiKey: 'sk-invalid',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });

      expect(result.success).toBe(false);
      expect(GMUser.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('驗證通過時加密並儲存', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(testAiConnection).mockResolvedValueOnce(undefined);
      vi.mocked(GMUser.findByIdAndUpdate).mockResolvedValueOnce({});

      const result = await saveAiConfig({
        provider: 'openai',
        apiKey: 'sk-valid-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });

      expect(result.success).toBe(true);
      expect(GMUser.findByIdAndUpdate).toHaveBeenCalledWith('user1', {
        $set: {
          aiConfig: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            encryptedApiKey: 'iv:encrypted:tag',
          },
        },
      });
    });
  });

  describe('deleteAiConfig', () => {
    it('清除 aiConfig 欄位', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(GMUser.findByIdAndUpdate).mockResolvedValueOnce({});

      const result = await deleteAiConfig();

      expect(result.success).toBe(true);
      expect(GMUser.findByIdAndUpdate).toHaveBeenCalledWith('user1', {
        $unset: { aiConfig: 1 },
      });
    });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
rtk vitest run app/actions/__tests__/ai-config.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 實作 ai-config.ts**

```typescript
// app/actions/ai-config.ts
'use server';

import { z } from 'zod';
import dbConnect from '@/lib/db/mongodb';
import { getCurrentGMUserId } from '@/lib/auth/session';
import GMUser from '@/lib/db/models/GMUser';
import { encrypt } from '@/lib/crypto';
import { testAiConnection } from '@/lib/ai/provider';
import { revalidatePath } from 'next/cache';
import type { ApiResponse } from '@/types/api';

/** getAiConfig 回傳型別 */
type AiConfigResponse = {
  hasApiKey: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
};

/** saveAiConfig 輸入驗證 */
const saveAiConfigSchema = z.object({
  provider: z.string().min(1, 'Provider 不可為空'),
  apiKey: z.string().min(1, 'API Key 不可為空').transform((s) => s.trim()),
  baseUrl: z.string().url('Base URL 格式不正確'),
  model: z.string().min(1, 'Model 不可為空'),
});

type SaveAiConfigInput = z.infer<typeof saveAiConfigSchema>;

/**
 * 取得當前使用者的 AI 設定（不含 API Key 明文）
 */
export async function getAiConfig(): Promise<ApiResponse<AiConfigResponse>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  await dbConnect();
  const user = await GMUser.findById(userId).lean();

  if (!user?.aiConfig) {
    return { success: true, data: { hasApiKey: false } };
  }

  return {
    success: true,
    data: {
      hasApiKey: true,
      provider: user.aiConfig.provider,
      baseUrl: user.aiConfig.baseUrl,
      model: user.aiConfig.model,
    },
  };
}

/**
 * 儲存 AI 設定（含驗證測試呼叫）
 */
export async function saveAiConfig(
  input: SaveAiConfigInput
): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  // 驗證輸入
  const parsed = saveAiConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message || '輸入驗證失敗',
    };
  }

  const { provider, apiKey, baseUrl, model } = parsed.data;

  // 測試 AI 連線
  try {
    await testAiConnection(apiKey, baseUrl, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 根據 OpenAI SDK 錯誤訊息分類
    if (message.includes('401') || message.includes('Incorrect API key')) {
      return { success: false, error: 'INVALID_INPUT', message: 'API Key 驗證失敗，請檢查設定' };
    }
    if (message.includes('429') || message.includes('quota')) {
      return { success: false, error: 'INVALID_INPUT', message: 'API 額度不足，請檢查您的帳戶' };
    }
    if (message.includes('model')) {
      return { success: false, error: 'INVALID_INPUT', message: '指定的模型不可用，請檢查設定' };
    }
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, error: 'INVALID_INPUT', message: '無法連線至 AI 服務，請檢查 Base URL' };
    }
    return { success: false, error: 'INVALID_INPUT', message: 'AI 服務回傳錯誤，請檢查您的 API 設定' };
  }

  // 加密 API Key 並儲存
  await dbConnect();
  const encryptedApiKey = encrypt(apiKey);

  await GMUser.findByIdAndUpdate(userId, {
    $set: {
      aiConfig: {
        provider,
        baseUrl,
        model,
        encryptedApiKey,
      },
    },
  });

  revalidatePath('/profile');
  return { success: true };
}

/**
 * 刪除 AI 設定
 */
export async function deleteAiConfig(): Promise<ApiResponse<undefined>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  await dbConnect();
  await GMUser.findByIdAndUpdate(userId, {
    $unset: { aiConfig: 1 },
  });

  revalidatePath('/profile');
  return { success: true };
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
rtk vitest run app/actions/__tests__/ai-config.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add app/actions/ai-config.ts app/actions/__tests__/ai-config.test.ts && rtk git commit -m "feat: add AI config server actions with encryption and validation"
```

---

## Task 9: 角色匯入 Server Action

**Files:**
- Create: `app/actions/character-import.ts`
- Create: `app/actions/__tests__/character-import.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// app/actions/__tests__/character-import.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentGMUserId: vi.fn(),
}));
vi.mock('@/lib/ai/provider', () => ({
  callAiForCharacterImport: vi.fn(),
}));
vi.mock('@/lib/ai/parsers/docx', () => ({
  parseDocx: vi.fn(),
}));

import { parseCharacterFromText, parseCharacterFromDocx } from '@/app/actions/character-import';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { callAiForCharacterImport } from '@/lib/ai/provider';
import { parseDocx } from '@/lib/ai/parsers/docx';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';

const MOCK_RESULT: CharacterImportResult = {
  name: '測試角色',
  description: '測試描述',
  slogan: null,
  publicInfo: { background: [], personality: null, relationships: [] },
  secretInfo: { secrets: [] },
  tasks: [],
  stats: [],
};

describe('parseCharacterFromText', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('未登入時回傳 UNAUTHORIZED', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce(null);
    const result = await parseCharacterFromText('角色文字');
    expect(result.success).toBe(false);
    expect(result.error).toBe('UNAUTHORIZED');
  });

  it('文字超過 50000 字元時回傳錯誤', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    const longText = 'a'.repeat(50001);
    const result = await parseCharacterFromText(longText);
    expect(result.success).toBe(false);
  });

  it('空文字時回傳錯誤', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    const result = await parseCharacterFromText('');
    expect(result.success).toBe(false);
  });

  it('成功呼叫 AI 並回傳解析結果', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    vi.mocked(callAiForCharacterImport).mockResolvedValueOnce(MOCK_RESULT);

    const result = await parseCharacterFromText('角色名稱：測試角色');
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('測試角色');
    expect(callAiForCharacterImport).toHaveBeenCalledWith('user1', '角色名稱：測試角色');
  });

  it('AI 呼叫失敗時回傳錯誤訊息', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    vi.mocked(callAiForCharacterImport).mockRejectedValueOnce(new Error('API error'));

    const result = await parseCharacterFromText('角色文字');
    expect(result.success).toBe(false);
  });
});

describe('parseCharacterFromDocx', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('解析 .docx 後呼叫 AI', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    vi.mocked(parseDocx).mockResolvedValueOnce('從 docx 提取的文字');
    vi.mocked(callAiForCharacterImport).mockResolvedValueOnce(MOCK_RESULT);

    const formData = new FormData();
    const blob = new Blob(['fake-docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    formData.append('file', blob, 'test.docx');

    const result = await parseCharacterFromDocx(formData);
    expect(result.success).toBe(true);
    expect(parseDocx).toHaveBeenCalled();
    expect(callAiForCharacterImport).toHaveBeenCalledWith('user1', '從 docx 提取的文字');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
rtk vitest run app/actions/__tests__/character-import.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 實作 character-import.ts**

```typescript
// app/actions/character-import.ts
'use server';

import { getCurrentGMUserId } from '@/lib/auth/session';
import { callAiForCharacterImport } from '@/lib/ai/provider';
import { parseDocx } from '@/lib/ai/parsers/docx';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';
import type { ApiResponse } from '@/types/api';

const MAX_TEXT_LENGTH = 50_000;
const MAX_DOCX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * 從純文字解析角色資料
 */
export async function parseCharacterFromText(
  text: string
): Promise<ApiResponse<CharacterImportResult>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  if (!text || text.trim().length === 0) {
    return { success: false, error: 'INVALID_INPUT', message: '請輸入角色資料文字' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return { success: false, error: 'INVALID_INPUT', message: `文字長度超過上限 (${MAX_TEXT_LENGTH} 字)` };
  }

  try {
    const result = await callAiForCharacterImport(userId, text.trim());
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[parseCharacterFromText] AI 呼叫失敗:', message);

    if (message.includes('尚未設定 AI 服務')) {
      return { success: false, error: 'INVALID_INPUT', message };
    }
    if (message.includes('AI 回傳格式異常')) {
      return { success: false, error: 'INVALID_INPUT', message: '解析失敗，請稍後重試或調整輸入內容' };
    }
    return { success: false, error: 'INVALID_INPUT', message: 'AI 服務呼叫失敗，請稍後重試' };
  }
}

/**
 * 從 .docx 檔案解析角色資料
 */
export async function parseCharacterFromDocx(
  formData: FormData
): Promise<ApiResponse<CharacterImportResult>> {
  const userId = await getCurrentGMUserId();
  if (!userId) {
    return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return { success: false, error: 'INVALID_INPUT', message: '請選擇 .docx 檔案' };
  }

  if (file.size > MAX_DOCX_SIZE) {
    return { success: false, error: 'INVALID_INPUT', message: '檔案大小超過上限 (5MB)' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await parseDocx(buffer);

    if (!text || text.trim().length === 0) {
      return { success: false, error: 'INVALID_INPUT', message: '文件內容為空，請確認文件是否正確' };
    }

    const result = await callAiForCharacterImport(userId, text.trim());
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[parseCharacterFromDocx] 解析失敗:', message);

    if (message.includes('文件格式無法解析')) {
      return { success: false, error: 'INVALID_INPUT', message: '文件格式無法解析，請改用貼上文字' };
    }
    return { success: false, error: 'INVALID_INPUT', message: 'AI 服務呼叫失敗，請稍後重試' };
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
rtk vitest run app/actions/__tests__/character-import.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add app/actions/character-import.ts app/actions/__tests__/character-import.test.ts && rtk git commit -m "feat: add character import server actions for text and docx parsing"
```

---

## Task 10: AI 設定表單 UI

**Files:**
- Create: `components/gm/ai-settings-form.tsx`
- Modify: `app/(gm)/profile/page.tsx`

- [ ] **Step 1: 建立 AI Provider 設定檔**

在 `ai-settings-form.tsx` 內定義 provider 列表（不另外開檔案，因為只有這個元件使用）：

```typescript
// components/gm/ai-settings-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bot, ChevronDown, ChevronUp, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SELECT_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_SECTION_TITLE_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import { saveAiConfig, deleteAiConfig, getAiConfig } from '@/app/actions/ai-config';
import { cn } from '@/lib/utils';

/**
 * AI Provider 預設設定
 *
 * 新增 provider 只需在此陣列加一筆資料。
 * model 為預設值，使用者可自由修改。
 */
const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    id: 'custom',
    label: '自訂 (Custom)',
    baseUrl: '',
    defaultModel: '',
  },
] as const;

type ProviderId = (typeof AI_PROVIDERS)[number]['id'];

interface AiSettingsFormProps {
  initialConfig: {
    hasApiKey: boolean;
    provider?: string;
    baseUrl?: string;
    model?: string;
  };
}

export function AiSettingsForm({ initialConfig }: AiSettingsFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 表單狀態
  const [provider, setProvider] = useState<ProviderId>(
    (initialConfig.provider as ProviderId) || 'openai'
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl || AI_PROVIDERS[0].baseUrl);
  const [model, setModel] = useState(initialConfig.model || AI_PROVIDERS[0].defaultModel);

  // Provider 切換時自動帶入預設值
  const handleProviderChange = (newProvider: string) => {
    const p = newProvider as ProviderId;
    setProvider(p);
    const preset = AI_PROVIDERS.find((x) => x.id === p);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
    // custom 時展開進階設定
    if (p === 'custom') {
      setShowAdvanced(true);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('請輸入 API Key');
      return;
    }

    setIsLoading(true);
    try {
      const result = await saveAiConfig({
        provider,
        apiKey: apiKey.trim(),
        baseUrl,
        model,
      });

      if (result.success) {
        toast.success('AI 設定已儲存');
        setApiKey(''); // 清除輸入的 key
        router.refresh();
      } else {
        toast.error(result.message || 'AI 設定儲存失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAiConfig();
      if (result.success) {
        toast.success('AI 設定已刪除');
        setProvider('openai');
        setBaseUrl(AI_PROVIDERS[0].baseUrl);
        setModel(AI_PROVIDERS[0].defaultModel);
        setApiKey('');
        router.refresh();
      } else {
        toast.error(result.message || '刪除失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className={cn(GM_SECTION_CARD_CLASS, 'space-y-6')}>
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <Bot className="h-5 w-5 text-primary" />
          AI 服務設定
        </h2>
        {initialConfig.hasApiKey && (
          <div className="flex items-center gap-2 text-xs text-success font-bold">
            <CheckCircle2 className="h-4 w-4" />
            已設定
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        設定 AI 服務以啟用角色匯入功能。您的 API Key 將加密儲存，系統不會保留明文。
      </p>

      {/* Provider 選擇 */}
      <div className="space-y-2">
        <label className={GM_LABEL_CLASS}>Provider</label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger className={GM_SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className={GM_LABEL_CLASS}>API Key</label>
        <Input
          type="password"
          placeholder={initialConfig.hasApiKey ? '已設定（輸入新的 Key 可更新）' : '輸入你的 API Key'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={isLoading}
          className={cn(GM_INPUT_CLASS, 'h-12')}
        />
      </div>

      {/* 進階設定 */}
      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        進階設定
      </button>

      {showAdvanced && (
        <div className="space-y-4 pl-4 border-l-2 border-border/30">
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>Base URL</label>
            <Input
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={isLoading}
              className={GM_INPUT_CLASS}
            />
          </div>
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>Model</label>
            <Input
              placeholder="gpt-4o"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLoading}
              className={GM_INPUT_CLASS}
            />
          </div>
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="flex items-center justify-between pt-2">
        {initialConfig.hasApiKey ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isLoading}
            className="flex items-center gap-1.5 text-xs font-bold text-destructive hover:text-destructive/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? '刪除中...' : '刪除設定'}
          </button>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading || (!apiKey.trim() && !initialConfig.hasApiKey)}
          className={GM_CTA_BUTTON_CLASS}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              驗證中...
            </span>
          ) : initialConfig.hasApiKey ? (
            '更新設定'
          ) : (
            '儲存設定'
          )}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 修改 Profile 頁面嵌入 AI 設定區塊**

在 `app/(gm)/profile/page.tsx` 中：

1. Import `getAiConfig` 和 `AiSettingsForm`
2. 在 `ProfilePage` async function 中呼叫 `getAiConfig()` 取得設定
3. 在「帳號資訊卡片」section 和「提示卡片」之間插入 `<AiSettingsForm>`

具體改動：

```typescript
// 新增 imports（檔案頂部）
import { getAiConfig } from '@/app/actions/ai-config';
import { AiSettingsForm } from '@/components/gm/ai-settings-form';

// 在 ProfilePage function 中，redirect 判斷之後，formatDate 之前：
const aiConfigResult = await getAiConfig();
const aiConfig = aiConfigResult.success && aiConfigResult.data
  ? aiConfigResult.data
  : { hasApiKey: false };

// 在 JSX 中，帳號資訊 section 和提示卡片之間插入：
<AiSettingsForm initialConfig={aiConfig} />
```

- [ ] **Step 3: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -10
```

- [ ] **Step 4: 啟動 dev server 手動驗證**

```bash
rtk npm run dev
```

前往 `/profile` 確認：
- AI 設定區塊出現在帳號資訊下方
- Provider 下拉選單可切換
- 切換 Provider 自動帶入 Base URL 和 Model
- 進階設定可展開收合
- 已設定狀態顯示綠色「已設定」標籤

- [ ] **Step 5: Commit**

```bash
rtk git add components/gm/ai-settings-form.tsx app/\(gm\)/profile/page.tsx && rtk git commit -m "feat: add AI settings form to GM profile page"
```

---

## Task 11: 角色匯入 — Input 階段 UI

**Files:**
- Create: `components/gm/character-import-input.tsx`

- [ ] **Step 1: 建立 Input 階段元件**

```typescript
// components/gm/character-import-input.tsx
'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_CTA_BUTTON_CLASS,
  GM_SECTION_CARD_CLASS,
} from '@/lib/styles/gm-form';
import { cn } from '@/lib/utils';

interface CharacterImportInputProps {
  /** 是否正在解析中 */
  isParsing: boolean;
  /** 是否已設定 AI */
  hasAiConfig: boolean;
  /** 保留的上次文字輸入（重新匯入時回填） */
  initialText?: string;
  /** 送出文字 */
  onSubmitText: (text: string) => void;
  /** 送出 .docx FormData */
  onSubmitDocx: (formData: FormData) => void;
}

export function CharacterImportInput({
  isParsing,
  hasAiConfig,
  initialText = '',
  onSubmitText,
  onSubmitDocx,
}: CharacterImportInputProps) {
  const [text, setText] = useState(initialText);
  const [inputMode, setInputMode] = useState<'text' | 'docx'>('text');
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = () => {
    if (!text.trim()) {
      toast.error('請輸入角色資料文字');
      return;
    }
    onSubmitText(text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast.error('僅支援 .docx 格式');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('檔案大小超過上限 (5MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    onSubmitDocx(formData);
  };

  return (
    <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-6')}>
      <div className="space-y-2">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI 角色匯入
        </h3>
        <p className="text-sm text-muted-foreground">
          貼上角色文字資料或上傳 .docx 檔案，AI 將自動解析並填入角色欄位。
        </p>
      </div>

      {/* 輸入模式切換 */}
      <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'text' | 'docx')}>
        <TabsList className="w-full">
          <TabsTrigger value="text" className="flex-1 gap-1.5">
            <FileText className="h-4 w-4" />
            貼上文字
          </TabsTrigger>
          <TabsTrigger value="docx" className="flex-1 gap-1.5">
            <Upload className="h-4 w-4" />
            上傳 .docx
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>角色資料文字</label>
            <Textarea
              placeholder="在此貼上角色的背景故事、數值、任務等資料..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isParsing}
              rows={12}
              className={cn(GM_INPUT_CLASS, 'h-auto py-4 resize-y min-h-[200px]')}
            />
            <p className="text-xs text-muted-foreground text-right">
              {text.length.toLocaleString()} / 50,000
            </p>
          </div>

          <button
            type="button"
            onClick={handleTextSubmit}
            disabled={isParsing || !hasAiConfig || !text.trim()}
            className={cn(GM_CTA_BUTTON_CLASS, 'w-full py-3')}
          >
            {isParsing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在分析...
              </span>
            ) : (
              '開始解析'
            )}
          </button>
        </TabsContent>

        <TabsContent value="docx" className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>.docx 檔案</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              onChange={handleFileChange}
              disabled={isParsing || !hasAiConfig}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                file:cursor-pointer cursor-pointer
                disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              僅支援 .docx 格式，最大 5MB
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* 建議格式範本 */}
      <div>
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showGuide && 'rotate-180')} />
          建議格式範本
        </button>
        {showGuide && (
          <div className="mt-3 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground space-y-2 font-mono whitespace-pre-wrap">
{`角色名：[角色名稱]
「[標語/座右銘]」

[背景故事段落...]

性格：[性格描述]

關係：
- [角色名稱] — [關係描述]

【隱藏資訊】
[只有 GM 和角色本人知道的秘密]

【目標/任務】
- [任務描述]

數值：
力量: 7/10
智力: 8`}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

Expected: 0 new errors

- [ ] **Step 3: Commit**

```bash
rtk git add components/gm/character-import-input.tsx && rtk git commit -m "feat: add character import input stage component"
```

---

## Task 12: 角色匯入 — Preview 階段 UI

**Files:**
- Create: `components/gm/character-import-preview.tsx`

- [ ] **Step 1: 建立 Preview 階段元件**

```typescript
// components/gm/character-import-preview.tsx
'use client';

import { useState } from 'react';
import { Eye, Edit3, RotateCcw, Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_CTA_BUTTON_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import { cn } from '@/lib/utils';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';

interface CharacterImportPreviewProps {
  data: CharacterImportResult;
  isCreating: boolean;
  onConfirm: (data: CharacterImportResult) => void;
  onReimport: () => void;
}

export function CharacterImportPreview({
  data,
  isCreating,
  onConfirm,
  onReimport,
}: CharacterImportPreviewProps) {
  const [editData, setEditData] = useState<CharacterImportResult>(data);
  const [editingField, setEditingField] = useState<string | null>(null);

  const updateField = <K extends keyof CharacterImportResult>(
    key: K,
    value: CharacterImportResult[K]
  ) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-2')}>
        <div className="flex items-center gap-2 text-primary">
          <Eye className="h-5 w-5" />
          <h3 className="text-lg font-bold">預覽解析結果</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          確認 AI 解析的內容，點擊編輯按鈕可微調各欄位。
        </p>
      </div>

      {/* 基本資訊 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-4')}>
        <h4 className={GM_LABEL_CLASS}>基本資訊</h4>

        <PreviewField
          label="角色名稱"
          value={editData.name}
          isEditing={editingField === 'name'}
          onEdit={() => setEditingField('name')}
          onDone={() => setEditingField(null)}
          renderEditor={
            <Input
              value={editData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={cn(GM_INPUT_CLASS, 'h-10')}
              autoFocus
            />
          }
        />

        <PreviewField
          label="角色描述"
          value={editData.description}
          isEditing={editingField === 'description'}
          onEdit={() => setEditingField('description')}
          onDone={() => setEditingField(null)}
          renderEditor={
            <Textarea
              value={editData.description}
              onChange={(e) => updateField('description', e.target.value)}
              className={cn(GM_INPUT_CLASS, 'h-auto py-2 resize-none')}
              rows={3}
              autoFocus
            />
          }
        />

        <PreviewField
          label="標語"
          value={editData.slogan}
          isEditing={editingField === 'slogan'}
          onEdit={() => setEditingField('slogan')}
          onDone={() => setEditingField(null)}
          renderEditor={
            <Input
              value={editData.slogan || ''}
              onChange={(e) => updateField('slogan', e.target.value || null)}
              className={cn(GM_INPUT_CLASS, 'h-10')}
              autoFocus
            />
          }
        />
      </div>

      {/* 背景故事 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_LABEL_CLASS}>背景故事</h4>
        {editData.publicInfo.background.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          editData.publicInfo.background.map((block, i) => (
            <div key={i} className={block.type === 'title' ? 'font-bold text-sm' : 'text-sm text-muted-foreground'}>
              {block.content}
            </div>
          ))
        )}
      </div>

      {/* 性格 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_LABEL_CLASS}>性格</h4>
        <p className="text-sm">
          {editData.publicInfo.personality || <span className="text-muted-foreground/50 italic">未偵測到</span>}
        </p>
      </div>

      {/* 關係 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_LABEL_CLASS}>關係</h4>
        {editData.publicInfo.relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="space-y-2">
            {editData.publicInfo.relationships.map((rel, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold">{rel.targetName}</span>
                <span className="text-muted-foreground"> — {rel.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 隱藏資訊 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_LABEL_CLASS}>隱藏資訊</h4>
        {editData.secretInfo.secrets.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="space-y-3">
            {editData.secretInfo.secrets.map((secret, i) => (
              <div key={i} className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-bold">{secret.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{secret.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 任務 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_LABEL_CLASS}>任務</h4>
        {editData.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="space-y-2">
            {editData.tasks.map((task, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold">{task.title}</span>
                <span className="text-muted-foreground"> — {task.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 數值 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_LABEL_CLASS}>數值</h4>
        {editData.stats.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {editData.stats.map((stat, i) => (
              <div key={i} className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground font-bold uppercase">{stat.name}</p>
                <p className="text-lg font-extrabold mt-1">
                  {stat.value}
                  {stat.maxValue != null && (
                    <span className="text-sm text-muted-foreground font-normal">/{stat.maxValue}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky bar */}
      <div className="sticky bottom-0 z-10 -mx-8 px-8 py-6 bg-background/80 backdrop-blur-sm border-t border-border/10">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onReimport}
            disabled={isCreating}
            className={cn(GM_CANCEL_BUTTON_CLASS, 'flex items-center gap-1.5')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重新匯入
          </button>
          <button
            type="button"
            onClick={() => onConfirm(editData)}
            disabled={isCreating || !editData.name.trim()}
            className={cn(GM_CTA_BUTTON_CLASS, 'flex items-center gap-2')}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                建立中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                確認建立
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 可編輯的預覽欄位 */
function PreviewField({
  label,
  value,
  isEditing,
  onEdit,
  onDone,
  renderEditor,
}: {
  label: string;
  value: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  renderEditor: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        {isEditing ? (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-primary font-bold cursor-pointer hover:underline"
          >
            完成
          </button>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isEditing ? (
        renderEditor
      ) : (
        <p className="text-sm font-semibold">
          {value || <span className="text-muted-foreground/50 italic font-normal">未偵測到</span>}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
rtk git add components/gm/character-import-preview.tsx && rtk git commit -m "feat: add character import preview stage component with inline editing"
```

---

## Task 13: 角色匯入 — Tab 主元件（狀態機）

**Files:**
- Create: `components/gm/character-import-tab.tsx`

- [ ] **Step 1: 建立狀態機主元件**

```typescript
// components/gm/character-import-tab.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Settings, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { CharacterImportInput } from '@/components/gm/character-import-input';
import { CharacterImportPreview } from '@/components/gm/character-import-preview';
import { parseCharacterFromText, parseCharacterFromDocx } from '@/app/actions/character-import';
import { createCharacter } from '@/app/actions/characters';
import { updateCharacter } from '@/app/actions/character-update';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';
import type { UpdateCharacterInput } from '@/types/character';
import { GM_SECTION_CARD_CLASS, GM_CTA_BUTTON_CLASS } from '@/lib/styles/gm-form';
import { cn } from '@/lib/utils';

type ImportStage = 'input' | 'parsing' | 'preview' | 'creating';

interface CharacterImportTabProps {
  gameId: string;
  hasAiConfig: boolean;
  isActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CharacterImportTab({ gameId, hasAiConfig, isActive, onDirtyChange }: CharacterImportTabProps) {
  const router = useRouter();
  const [stage, setStage] = useState<ImportStage>('input');
  const [lastText, setLastText] = useState('');
  const [parseResult, setParseResult] = useState<CharacterImportResult | null>(null);

  // Dirty state：有解析結果但尚未建立角色
  const isDirty = parseResult !== null && stage !== 'creating';

  // 通知父層 dirty 狀態（用於 tab 琥珀金圓點）
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // beforeunload 防護
  useEffect(() => {
    if (!isDirty && stage !== 'parsing') return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, stage]);

  // Runtime 模式提示
  if (isActive) {
    return (
      <div className={cn(GM_SECTION_CARD_CLASS, 'text-center py-12')}>
        <p className="text-muted-foreground font-medium">
          遊戲進行中無法匯入角色，請先結束遊戲再進行匯入。
        </p>
      </div>
    );
  }

  // 未設定 AI 提示
  if (!hasAiConfig) {
    return (
      <div className={cn(GM_SECTION_CARD_CLASS, 'text-center py-12 space-y-4')}>
        <Settings className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <div className="space-y-2">
          <p className="font-bold">尚未設定 AI 服務</p>
          <p className="text-sm text-muted-foreground">
            使用 AI 角色匯入功能前，請先至個人設定頁完成 AI 服務設定。
          </p>
        </div>
        <Link href="/profile">
          <button type="button" className={GM_CTA_BUTTON_CLASS}>
            前往設定
          </button>
        </Link>
      </div>
    );
  }

  const handleSubmitText = async (text: string) => {
    setLastText(text);
    setStage('parsing');

    const result = await parseCharacterFromText(text);
    if (result.success && result.data) {
      setParseResult(result.data);
      setStage('preview');
    } else {
      toast.error(result.message || '解析失敗');
      setStage('input');
    }
  };

  const handleSubmitDocx = async (formData: FormData) => {
    setStage('parsing');

    const result = await parseCharacterFromDocx(formData);
    if (result.success && result.data) {
      setParseResult(result.data);
      setStage('preview');
    } else {
      toast.error(result.message || '解析失敗');
      setStage('input');
    }
  };

  const handleReimport = () => {
    setParseResult(null);
    setStage('input');
  };

  const handleConfirm = async (data: CharacterImportResult) => {
    setStage('creating');

    try {
      // Step 1: 建立角色（基本欄位）
      const createResult = await createCharacter({
        gameId,
        name: data.name,
        description: data.description || undefined,
        hasPinLock: false,
      });

      if (!createResult.success || !createResult.data) {
        toast.error(createResult.message || '角色建立失敗');
        setStage('preview');
        return;
      }

      const characterId = createResult.data.id;

      // Step 2: 更新所有匯入的欄位
      const updateData: UpdateCharacterInput = {
        slogan: data.slogan || undefined,
        publicInfo: {
          background: data.publicInfo.background,
          personality: data.publicInfo.personality || undefined,
          relationships: data.publicInfo.relationships,
        },
        secretInfo: {
          secrets: data.secretInfo.secrets.map((s) => ({
            id: crypto.randomUUID(),
            title: s.title,
            content: s.content,
            isRevealed: false,
            isHidden: false,
          })),
        },
        tasks: data.tasks.map((t) => ({
          id: crypto.randomUUID(),
          title: t.title,
          description: t.description,
          isHidden: false,
          isRevealed: true,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        })),
        stats: data.stats.map((s) => ({
          id: crypto.randomUUID(),
          name: s.name,
          value: s.value,
          maxValue: s.maxValue,
        })),
      };

      const updateResult = await updateCharacter(characterId, updateData);

      if (!updateResult.success) {
        // 角色已建立但更新失敗 — 導航到編輯頁讓使用者手動完成
        toast.warning('角色已建立，但部分欄位更新失敗。請在編輯頁手動補全。');
        router.push(`/games/${gameId}/characters/${characterId}`);
        return;
      }

      toast.success(`角色「${data.name}」建立成功！`);
      router.push(`/games/${gameId}/characters/${characterId}`);
    } catch (error) {
      console.error('[CharacterImportTab] 建立失敗:', error);
      toast.error('角色建立失敗，請稍後重試');
      setStage('preview');
    }
  };

  // Parsing 中間狀態
  if (stage === 'parsing') {
    return (
      <div className={cn(GM_SECTION_CARD_CLASS, 'text-center py-16 space-y-4')}>
        <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
        <div className="space-y-2">
          <p className="font-bold">AI 正在分析您的角色資料</p>
          <p className="text-sm text-muted-foreground">
            請勿重新整理頁面，解析可能需要 10-30 秒...
          </p>
        </div>
      </div>
    );
  }

  // Preview 階段
  if (stage === 'preview' && parseResult) {
    return (
      <CharacterImportPreview
        data={parseResult}
        isCreating={stage === 'creating'}
        onConfirm={handleConfirm}
        onReimport={handleReimport}
      />
    );
  }

  // Input 階段（預設）
  return (
    <CharacterImportInput
      isParsing={false}
      hasAiConfig={hasAiConfig}
      initialText={lastText}
      onSubmitText={handleSubmitText}
      onSubmitDocx={handleSubmitDocx}
    />
  );
}
```

- [ ] **Step 2: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
rtk git add components/gm/character-import-tab.tsx && rtk git commit -m "feat: add character import tab with state machine (input/parsing/preview/creating)"
```

---

## Task 14: 整合至 GameEditTabs 和 Game Page

**Files:**
- Modify: `components/gm/game-edit-tabs.tsx`
- Modify: `app/(gm)/games/[gameId]/page.tsx`

- [ ] **Step 1: 修改 GameEditTabs — 新增 import tab + dirty 圓點**

在 `components/gm/game-edit-tabs.tsx` 中：

1. Import `CharacterImportTab`
2. 新增 `hasAiConfig` prop
3. 新增 `importDirty` state（boolean）
4. 在 GmTabsList 中新增 `<GmTabsTrigger value="import">` 含條件琥珀金圓點（位於 `characters` 之後）
5. 新增 `<TabsContent value="import" forceMount>`，使用 `className` 控制 `hidden`，以保留 state
6. `CharacterImportTab` 透過 `onDirtyChange` callback 通知 dirty 狀態

具體改動：

```typescript
// game-edit-tabs.tsx 頂部新增 import
import { CharacterImportTab } from '@/components/gm/character-import-tab';

// Props interface 新增
interface GameEditTabsProps {
  game: GameData;
  characters: CharacterData[];
  charactersTab: React.ReactNode;
  consoleTab?: React.ReactNode;
  hasAiConfig: boolean;  // <-- 新增
}

// Component 參數解構新增 hasAiConfig
export function GameEditTabs({ game, characters, charactersTab, consoleTab, hasAiConfig }: GameEditTabsProps) {
  // 既有 state...
  const [importDirty, setImportDirty] = useState(false);  // <-- 新增

// GmTabsList 中，characters trigger 之後新增（含琥珀金圓點）：
<GmTabsTrigger value="import">
  角色匯入
  {importDirty && (
    <span className="ml-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
  )}
</GmTabsTrigger>

// characters TabsContent 之後新增（使用 forceMount 保留 state）：
<TabsContent
  value="import"
  forceMount
  className={activeTab !== 'import' ? 'hidden' : 'space-y-6'}
>
  <CharacterImportTab
    gameId={game.id}
    hasAiConfig={hasAiConfig}
    isActive={game.isActive}
    onDirtyChange={setImportDirty}
  />
</TabsContent>
```

同時在 `CharacterImportTab` 的 props 中新增 `onDirtyChange`，並在 `isDirty` 變化時呼叫：

```typescript
// character-import-tab.tsx — props 新增
interface CharacterImportTabProps {
  gameId: string;
  hasAiConfig: boolean;
  isActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;  // <-- 新增
}

// component 內，isDirty 計算之後新增 useEffect：
useEffect(() => {
  onDirtyChange?.(isDirty);
}, [isDirty, onDirtyChange]);
```

- [ ] **Step 2: 修改 Game Page — 傳入 hasAiConfig**

在 `app/(gm)/games/[gameId]/page.tsx` 中：

1. Import `getAiConfig`
2. 在 `GamePage` function 中呼叫 `getAiConfig()`
3. 將結果傳給 `GameEditTabs`

```typescript
// 頂部新增 import
import { getAiConfig } from '@/app/actions/ai-config';

// 在 const characters = ... 之後新增：
const aiConfigResult = await getAiConfig();
const hasAiConfig = aiConfigResult.success && aiConfigResult.data?.hasApiKey === true;

// GameEditTabs 新增 prop：
<GameEditTabs
  game={game}
  characters={characters}
  consoleTab={...}
  charactersTab={...}
  hasAiConfig={hasAiConfig}  // <-- 新增
/>
```

- [ ] **Step 3: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

Expected: 0 errors

- [ ] **Step 4: 啟動 dev server 手動驗證**

```bash
rtk npm run dev
```

前往 `/games/[gameId]` 確認：
- 「角色匯入」tab 出現在「角色列表」之後
- 未設定 AI 時顯示「前往設定」引導
- 已設定 AI 時顯示輸入介面
- 切換其他 tab 再回來時 state 保留（forceMount）
- Runtime 模式下顯示 disabled 提示

- [ ] **Step 5: Commit**

```bash
rtk git add components/gm/game-edit-tabs.tsx app/\(gm\)/games/\[gameId\]/page.tsx && rtk git commit -m "feat: integrate character import tab into game edit page"
```

---

## Task 15: 建立角色 Dialog 內新增 AI 匯入引導

**Files:**
- Modify: `components/gm/create-character-button.tsx`

- [ ] **Step 1: 新增引導連結**

在 `components/gm/create-character-button.tsx` 的 Dialog body 底部（PIN lock 區塊之後，error 之前），新增 AI 匯入引導區塊：

```typescript
// 在 Dialog 的 body 區域中，error block 之前新增：

{/* AI 匯入引導 */}
<div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
  <p className="text-sm text-muted-foreground">
    有現成的角色資料？
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        // 透過 URL search params 觸發 tab 切換
        // GameEditTabs 會讀取此 param
      }}
      className="text-primary font-bold ml-1 hover:underline cursor-pointer"
    >
      前往 AI 匯入
    </button>
  </p>
</div>
```

注意：此處的「前往 AI 匯入」按鈕需要能切換到 import tab。最簡單的實作方式是關閉 dialog 後呼叫一個 callback prop，讓父層切換 tab。

在 `GameEditTabs` 或其父層決定最佳實作方式。最低限度的 MVP：

1. `CreateCharacterButton` 新增 optional `onNavigateToImport` prop
2. 按鈕點擊時 `setOpen(false)` + `onNavigateToImport?.()`
3. `GameEditTabs` 將 `setActiveTab('import')` 包裝成 callback 傳入 `charactersTab` render

由於 `charactersTab` 是 React.ReactNode（已在 page.tsx 組裝），需要改為 render prop 或在 GameEditTabs 內部包裝。

**推薦實作**：在 `GameEditTabs` 中 export 一個 context，讓 `CreateCharacterButton` 直接讀取 `setActiveTab`。

```typescript
// game-edit-tabs.tsx 新增 context（檔案頂部）
import { createContext, useContext } from 'react';

const GameEditTabContext = createContext<{
  switchToImportTab: () => void;
}>({
  switchToImportTab: () => {},
});

export function useGameEditTabContext() {
  return useContext(GameEditTabContext);
}

// 在 GameEditTabs return 中包裝 provider：
return (
  <GameEditTabContext.Provider value={{ switchToImportTab: () => setActiveTab('import') }}>
    <Tabs ...>
      {/* 既有內容 */}
    </Tabs>
  </GameEditTabContext.Provider>
);
```

```typescript
// create-character-button.tsx 中：
import { useGameEditTabContext } from '@/components/gm/game-edit-tabs';

// 在 component 內：
const { switchToImportTab } = useGameEditTabContext();

// AI 匯入引導按鈕 onClick：
onClick={() => {
  setOpen(false);
  switchToImportTab();
}}
```

- [ ] **Step 2: 確認型別檢查通過**

```bash
rtk tsc --noEmit --pretty 2>&1 | head -5
```

- [ ] **Step 3: 手動驗證**

前往 `/games/[gameId]` → 點「新增角色」→ 確認「前往 AI 匯入」連結出現 → 點擊後 dialog 關閉、tab 切換至匯入

- [ ] **Step 4: Commit**

```bash
rtk git add components/gm/game-edit-tabs.tsx components/gm/create-character-button.tsx && rtk git commit -m "feat: add AI import navigation link in create character dialog"
```

---

## Task 16: 靜態分析 + Lint 全面通過

**Files:**
- 可能微調上述任何檔案

- [ ] **Step 1: TypeScript 型別檢查**

```bash
rtk tsc --noEmit --pretty
```

Expected: 0 errors。若有 error，修復後重跑。

- [ ] **Step 2: ESLint**

```bash
rtk lint
```

Expected: 0 errors。修復所有 lint issue。

- [ ] **Step 3: 中文亂碼掃描**

```bash
grep -r "��" lib/ai/ lib/crypto.ts app/actions/ai-config.ts app/actions/character-import.ts components/gm/ai-settings-form.tsx components/gm/character-import-tab.tsx components/gm/character-import-input.tsx components/gm/character-import-preview.tsx || echo "No encoding issues found"
```

Expected: "No encoding issues found"

- [ ] **Step 4: 執行全部測試**

```bash
rtk vitest run
```

Expected: 所有新增和既有測試 PASS

- [ ] **Step 5: Commit（若有修復）**

```bash
rtk git add -A && rtk git commit -m "fix: resolve type errors and lint issues"
```

---

## Task 17: 知識庫和文件更新

**Files:**
- 可能新增/修改 `docs/knowledge/` 下的相關文件

- [ ] **Step 1: 新增 AI 匯入知識庫文件**

評估是否需要在 `docs/knowledge/gm/` 下新增 AI 角色匯入的知識庫文件，涵蓋：
- AI 設定流程（provider、加密儲存）
- 匯入流程（input → parsing → preview → done）
- 支援的輸入格式

- [ ] **Step 2: 更新架構知識庫**

在 `docs/knowledge/architecture/` 中更新：
- `data-models.md`：新增 GMUser.aiConfig 欄位說明
- 確認其他文件是否需要更新

- [ ] **Step 3: 更新開發規劃文件**

檢查 `docs/refactoring/` 下是否有相關的開發規劃文件，標記 AI 匯入項目為完成。

- [ ] **Step 4: Commit**

```bash
rtk git add docs/ && rtk git commit -m "docs: add AI character import knowledge base documentation"
```

---

## Task 18: 環境變數設定文件

**Files:**
- Modify: `.env.example`（如果存在）或在知識庫中記錄

- [ ] **Step 1: 更新環境變數文件**

確認 `.env.example` 或相關設定文件中加入：

```
# AI 角色匯入：API Key 加密金鑰（至少 32 字元的隨機字串）
AI_ENCRYPTION_SECRET=
```

- [ ] **Step 2: Commit**

```bash
rtk git add .env.example && rtk git commit -m "chore: add AI_ENCRYPTION_SECRET to env example"
```
