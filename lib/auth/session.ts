import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import dbConnect from '@/lib/db/mongodb';
import Character from '@/lib/db/models/Character';

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
 * 驗證玩家是否已授權操作指定角色
 *
 * 用於 useItem / useSkill / transferItem / toggleEquipment 等 Server Action，
 * 防止未授權的客戶端對任意角色執行操作。
 *
 * 授權邏輯：
 * 1. 若角色 ID 已存在於 session.unlockedCharacterIds（經 PIN 解鎖），直接通過
 * 2. 若角色沒有設定 PIN lock（hasPinLock = false），視為公開角色，直接放行
 * 3. 其他情況（有 PIN lock 但未解鎖）拒絕存取
 *
 * @param characterId - 要驗證的角色 ID（Baseline ID）
 * @returns 是否已授權
 */
export async function validatePlayerAccess(characterId: string): Promise<boolean> {
  const session = await getSession();

  // 快速路徑：已在 session 中記錄解鎖
  if (session.unlockedCharacterIds?.includes(characterId)) {
    return true;
  }

  // 查詢角色是否需要 PIN lock
  try {
    await dbConnect();
    const character = await Character.findById(characterId).lean();
    if (!character) {
      console.warn(`[validatePlayerAccess] 角色不存在: ${characterId}`);
      return false;
    }

    // 無 PIN lock 的角色視為公開，不需解鎖即可操作
    if (character.hasPinLock) {
      console.warn(
        `[validatePlayerAccess] 角色 ${characterId} 需要 PIN 但 session 中無解鎖記錄（session 可能已過期）`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[validatePlayerAccess] DB 查詢失敗: ${characterId}`, error);
    return false;
  }
}

