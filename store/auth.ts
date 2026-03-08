import { atom } from 'jotai';
import type { GMUser, SessionData } from '@/types';

// GM 使用者資訊
export const gmUserAtom = atom<GMUser | null>(null);

// 是否已登入
export const isAuthenticatedAtom = atom((get) => {
  const gmUser = get(gmUserAtom);
  return !!gmUser;
});

// Session 資料
export const sessionAtom = atom<SessionData | null>(null);

