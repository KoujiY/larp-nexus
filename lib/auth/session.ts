import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

/**
 * Session 資料結構
 */
export interface SessionData {
  gmUserId?: string;
  email?: string;
  isLoggedIn: boolean;
}

/**
 * Session 配置
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

/**
 * 取得當前 Session
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * 檢查是否已登入
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session.isLoggedIn === true && !!session.gmUserId;
}

/**
 * 取得當前已登入的 GM User ID
 * @returns GM User ID or null
 */
export async function getCurrentGMUserId(): Promise<string | null> {
  const session = await getSession();
  return session.isLoggedIn ? session.gmUserId || null : null;
}

