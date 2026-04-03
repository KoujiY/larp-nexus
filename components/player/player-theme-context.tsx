'use client';

import { createContext, useContext } from 'react';

export type PlayerThemeContextValue = {
  isDark: boolean;
  toggleTheme: () => void;
  /** true 只在 client 完成 hydration 後才為 true；用來避免 SSR/client 渲染不一致 */
  mounted: boolean;
};

export const PlayerThemeContext = createContext<PlayerThemeContextValue>({
  isDark: true,
  toggleTheme: () => {},
  mounted: false,
});

/** 在任何玩家側元件中讀取主題狀態與切換函式 */
export function usePlayerTheme() {
  return useContext(PlayerThemeContext);
}
