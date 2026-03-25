'use client';

import { createContext, useContext } from 'react';

export type PlayerThemeContextValue = {
  isDark: boolean;
  toggleTheme: () => void;
};

export const PlayerThemeContext = createContext<PlayerThemeContextValue>({
  isDark: true,
  toggleTheme: () => {},
});

/** 在任何玩家側元件中讀取主題狀態與切換函式 */
export function usePlayerTheme() {
  return useContext(PlayerThemeContext);
}
