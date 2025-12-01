import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from './lib/auth/session';

/**
 * 需要認證的路徑前綴
 */
const protectedPaths = ['/dashboard', '/games', '/profile'];

/**
 * 登入頁面路徑
 */
const authPaths = ['/auth/login', '/auth/verify'];

/**
 * Session 配置（與 lib/auth/session.ts 保持一致）
 */
const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'larp-nexus-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 檢查是否為需要保護的路徑
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  // 檢查是否為登入頁面
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  // 如果不是受保護的路徑也不是登入頁面，直接放行
  if (!isProtectedPath && !isAuthPath) {
    return NextResponse.next();
  }

  // 取得 Session
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  const isAuthenticated = session.isLoggedIn === true && !!session.gmUserId;

  // 如果訪問受保護的路徑但未登入，重導向到登入頁
  if (isProtectedPath && !isAuthenticated) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 如果已登入卻訪問登入頁，重導向到儀表板
  if (isAuthPath && isAuthenticated && pathname !== '/auth/verify') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - c/ (player pages, public)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|c/).*)',
  ],
};

