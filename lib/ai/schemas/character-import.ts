import { z } from 'zod';

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
 * 手動定義以確保與 OpenAI API strict mode 的相容性
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
    'name', 'description', 'slogan', 'publicInfo', 'secretInfo', 'tasks', 'stats',
  ],
  additionalProperties: false,
};
