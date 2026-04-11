/**
 * E2E 專用 test-login route
 *
 * 僅在 `process.env.E2E === '1'` 時可用；正式環境回 404。
 *
 * 透過 manipulate iron-session 直接蓋入 GM / player 的登入狀態，
 * 避免 E2E 測試每次都要走完整 OTP / PIN 流程（純基礎設施層）。
 *
 * Request body:
 * ```
 * { mode: 'gm', gmUserId: string, email: string }
 * { mode: 'player', characterIds: string[] }
 * ```
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const gmSchema = z.object({
  mode: z.literal('gm'),
  gmUserId: z.string().min(1),
  email: z.string().email(),
});

const playerSchema = z.object({
  mode: z.literal('player'),
  characterIds: z.array(z.string().min(1)).min(1),
});

const bodySchema = z.union([gmSchema, playerSchema]);

export async function POST(request: Request): Promise<Response> {
  if (process.env.E2E !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const session = await getSession();

  if (parsed.data.mode === 'gm') {
    session.isLoggedIn = true;
    session.gmUserId = parsed.data.gmUserId;
    session.email = parsed.data.email;
    await session.save();
    return NextResponse.json({ ok: true, mode: 'gm' });
  }

  // player mode: 記錄已解鎖的角色 ID 清單，繞過 PIN 驗證
  session.unlockedCharacterIds = parsed.data.characterIds;
  await session.save();
  return NextResponse.json({ ok: true, mode: 'player' });
}
