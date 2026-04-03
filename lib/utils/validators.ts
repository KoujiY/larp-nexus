import { z } from 'zod';

/** Email 驗證 schema（用於 auth.ts magic link 發送） */
export const emailSchema = z.string().email('無效的 Email 格式');
