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
