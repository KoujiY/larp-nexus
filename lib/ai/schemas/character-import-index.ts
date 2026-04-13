import { z } from 'zod';

/**
 * 段落索引法的 AI 回傳格式
 *
 * AI 不直接複製原文，而是回傳段落編號索引。
 * 由程式碼根據索引從原文複製文字，徹底消除改寫問題。
 */

// ─── Zod Schema ─────────────────────────────────

export const characterImportIndexSchema = z.object({
  /** AI 的分類思路（chain-of-thought，不進入最終結果） */
  reasoning: z.string(),
  /** 角色名稱（AI 直接提取） */
  name: z.string(),
  /** 角色描述（AI 直接提取或生成） */
  description: z.string(),
  /** 標語（AI 直接提取） */
  slogan: z.string().nullable(),

  /** 背景故事：以 section 分組，每組可有 title 和 body 段落索引 */
  backgroundSections: z.array(z.object({
    /** 該區段的標題（AI 從原文提取），沒有則 null */
    title: z.string().nullable(),
    /** 屬於該區段的段落索引（對應 numbered paragraphs） */
    paragraphs: z.array(z.number()),
  })),

  /** 性格描述的段落索引 */
  personalityParagraphs: z.array(z.number()),

  /** 人物關係：targetName 由 AI 提取，描述由段落索引組裝 */
  relationships: z.array(z.object({
    targetName: z.string(),
    paragraphs: z.array(z.number()),
  })),

  /** 隱藏資訊 */
  secrets: z.array(z.object({
    title: z.string(),
    paragraphs: z.array(z.number()),
  })),

  /** 任務：title 由 AI 提取，描述由段落索引組裝 */
  tasks: z.array(z.object({
    title: z.string(),
    paragraphs: z.array(z.number()),
  })),

  /**
   * 數值（AI 直接提取，因為是結構化資料）
   * 注意：maxValue 用 nullable 而非 optional，因 OpenAI strict mode 要求所有欄位在 required 中。
   * assembleResult 會將 null 轉為 undefined（Result schema 使用 optional）。
   */
  stats: z.array(z.object({
    name: z.string(),
    value: z.number(),
    maxValue: z.number().nullable(),
  })),

  /** AI 補足的內容（當使用者開啟「允許 AI 補足」時使用，否則全部設 null / 空陣列） */
  aiFilled: z.object({
    description: z.string().nullable(),
    slogan: z.string().nullable(),
    personality: z.string().nullable(),
    backgroundText: z.string().nullable(),
    relationships: z.array(z.object({
      targetName: z.string(),
      description: z.string(),
    })),
    tasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
    })),
  }),
});

export type CharacterImportIndexResult = z.infer<typeof characterImportIndexSchema>;

// ─── OpenAI JSON Schema（strict mode） ──────────

export const characterImportIndexJsonSchema = {
  type: 'object' as const,
  properties: {
    reasoning: { type: 'string' as const },
    name: { type: 'string' as const },
    description: { type: 'string' as const },
    slogan: { type: ['string', 'null'] as const },

    backgroundSections: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: ['string', 'null'] as const },
          paragraphs: {
            type: 'array' as const,
            items: { type: 'number' as const },
          },
        },
        required: ['title', 'paragraphs'],
        additionalProperties: false,
      },
    },

    personalityParagraphs: {
      type: 'array' as const,
      items: { type: 'number' as const },
    },

    relationships: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          targetName: { type: 'string' as const },
          paragraphs: {
            type: 'array' as const,
            items: { type: 'number' as const },
          },
        },
        required: ['targetName', 'paragraphs'],
        additionalProperties: false,
      },
    },

    secrets: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          paragraphs: {
            type: 'array' as const,
            items: { type: 'number' as const },
          },
        },
        required: ['title', 'paragraphs'],
        additionalProperties: false,
      },
    },

    tasks: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          paragraphs: {
            type: 'array' as const,
            items: { type: 'number' as const },
          },
        },
        required: ['title', 'paragraphs'],
        additionalProperties: false,
      },
    },

    stats: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          value: { type: 'number' as const },
          maxValue: { type: ['number', 'null'] as const },
        },
        required: ['name', 'value', 'maxValue'],
        additionalProperties: false,
      },
    },

    aiFilled: {
      type: 'object' as const,
      properties: {
        description: { type: ['string', 'null'] as const },
        slogan: { type: ['string', 'null'] as const },
        personality: { type: ['string', 'null'] as const },
        backgroundText: { type: ['string', 'null'] as const },
        relationships: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              targetName: { type: 'string' as const },
              description: { type: 'string' as const },
            },
            required: ['targetName', 'description'],
            additionalProperties: false,
          },
        },
        tasks: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              title: { type: 'string' as const },
              description: { type: 'string' as const },
            },
            required: ['title', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['description', 'slogan', 'personality', 'backgroundText', 'relationships', 'tasks'],
      additionalProperties: false,
    },
  },
  required: [
    'reasoning',
    'name', 'description', 'slogan',
    'backgroundSections', 'personalityParagraphs',
    'relationships', 'secrets', 'tasks', 'stats',
    'aiFilled',
  ],
  additionalProperties: false,
};
