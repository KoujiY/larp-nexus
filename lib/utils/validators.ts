import { z } from 'zod';

// Email 驗證
export const emailSchema = z.string().email('無效的 Email 格式');

// PIN 驗證（4位數字）
export const pinSchema = z
  .string()
  .length(4, 'PIN 必須是 4 位數字')
  .regex(/^\d{4}$/, 'PIN 只能包含數字');

// 劇本標題驗證
export const gameTitleSchema = z
  .string()
  .min(1, '標題不能為空')
  .max(100, '標題不能超過 100 字元');

// 劇本描述驗證
export const gameDescriptionSchema = z.string().max(500, '描述不能超過 500 字元').optional();

// 角色名稱驗證
export const characterNameSchema = z
  .string()
  .min(1, '名稱不能為空')
  .max(50, '名稱不能超過 50 字元');

// URL 驗證
export const urlSchema = z.string().url('無效的 URL 格式').optional();

// 劇本建立驗證
export const createGameSchema = z.object({
  title: gameTitleSchema,
  description: gameDescriptionSchema,
  coverImage: urlSchema,
  publicInfo: z.object({
    intro: z.string(),
    worldSetting: z.string(),
    chapters: z.array(
      z.object({
        title: z.string(),
        content: z.string(),
        order: z.number(),
      })
    ),
  }),
});

// 角色建立驗證
export const createCharacterSchema = z.object({
  name: characterNameSchema,
  avatar: urlSchema,
  hasPinLock: z.boolean(),
  pin: pinSchema.optional(),
  publicInfo: z.object({
    background: z.string(),
    personality: z.string(),
    relationships: z.array(
      z.object({
        targetName: z.string(),
        description: z.string(),
      })
    ),
  }),
  secretInfo: z.object({
    secrets: z.array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    ),
    hiddenGoals: z.string(),
  }),
});

// 驗證輔助函式
export function validateEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

export function validatePin(pin: string): boolean {
  return pinSchema.safeParse(pin).success;
}

