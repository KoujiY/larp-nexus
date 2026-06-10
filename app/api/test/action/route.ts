/**
 * 壓測專用 server action 分發 route（PERF_INCIDENT_2026-06 Step 2.3）
 *
 * 為什麼需要：Next.js server action 的 HTTP 介面以 build 雜湊的
 * `Next-Action` ID 識別，k6 等外部工具無法跨部署穩定呼叫。
 * 本 route 以固定名稱分發到「同一個」action 函數——量測的熱路徑
 * （驗證、DB 來回、Pusher fan-out）與真實玩家操作完全一致，
 * 僅略過 server action 的 RSC 序列化層（對延遲量測影響可忽略）。
 *
 * 安全性與 session 行為：
 * - 與其他 /api/test/* 相同，受 `isTestRouteAllowed` 守門
 *   （本機 E2E=1 或 staging LOADTEST_TOKEN，詳見 lib/test-route-guard.ts）。
 * - action 內部的 `validatePlayerAccess` / `getCurrentGMUserId` 照常生效：
 *   呼叫端須先以 /api/test/login 取得 session cookie。
 *
 * Request body: `{ action: '<name>', args: [...] }`（args 依各 action 簽名）
 * Response: 該 action 的 ApiResponse JSON 原樣回傳。
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isTestRouteAllowed } from '@/lib/test-route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  action: z.enum([
    'use-skill',
    'use-item',
    'respond-contest',
    'transfer-item',
    'get-game-logs',
  ]),
  args: z.array(z.unknown()),
});

type ActionName = z.infer<typeof bodySchema>['action'];

/**
 * 以 never[] 參數型別承接任意簽名的 action 函數。
 * 參數正確性由呼叫端（壓測腳本）負責；action 內部本就對輸入做執行期驗證。
 */
type AnyAction = (...args: never[]) => Promise<unknown>;

const ACTION_LOADERS: Record<ActionName, () => Promise<AnyAction>> = {
  'use-skill': async () => (await import('@/app/actions/skill-use')).useSkill as AnyAction,
  'use-item': async () => (await import('@/app/actions/item-use')).useItem as AnyAction,
  'respond-contest': async () =>
    (await import('@/app/actions/contest-respond')).respondToContest as AnyAction,
  'transfer-item': async () => (await import('@/app/actions/item-use')).transferItem as AnyAction,
  'get-game-logs': async () => (await import('@/app/actions/logs')).getGameLogs as AnyAction,
};

export async function POST(request: Request): Promise<Response> {
  if (!isTestRouteAllowed(request)) {
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

  try {
    const fn = await ACTION_LOADERS[parsed.data.action]();
    const result = await fn(...(parsed.data.args as never[]));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[test/action] dispatch failed', { action: parsed.data.action, message });
    return NextResponse.json({ error: 'ACTION_FAILED', message }, { status: 500 });
  }
}
