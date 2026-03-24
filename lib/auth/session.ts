import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

/**
 * Session 資料結構
 */
export interface SessionData {
  gmUserId?: string;
  email?: string;
  isLoggedIn: boolean;
  /** 玩家透過 PIN 解鎖後，紀錄已授權操作的角色 ID 清單 */
  unlockedCharacterIds?: string[];
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

/**
 * 驗證玩家是否已透過 PIN 解鎖指定角色
 *
 * 用於 useItem / useSkill / transferItem 等 Server Action，
 * 防止未解鎖的客戶端對任意角色執行操作。
 *
 * @param characterId - 要驗證的角色 ID
 * @returns 是否已授權
 */
export async function validatePlayerAccess(characterId: string): Promise<boolean> {
  const session = await getSession();
  return session.unlockedCharacterIds?.includes(characterId) ?? false;
}

