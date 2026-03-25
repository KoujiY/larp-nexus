'use client';

import { useState } from 'react';
import { PlayerThemeContext } from './player-theme-context';

interface PlayerThemeWrapperProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'player-theme';

/**
 * 玩家端主題包裹器
 *
 * 提供主題 Context（isDark + toggleTheme）給所有玩家端子元件。
 * 不再自行渲染固定按鈕，由各個畫面（CharacterCardView）依其佈局決定按鈕的位置。
 *
 * - 使用 useState lazy initializer 直接讀取 localStorage，避免 useEffect 中呼叫 setState
 * - SSR 無 window 時回傳 true（深色），client 端讀取儲存偏好
 * - suppressHydrationWarning 消除 SSR/client 初始值不一致的警告
 */
export function PlayerThemeWrapper({ children }: PlayerThemeWrapperProps) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null || stored === 'dark';
  });

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  };

  return (
    <PlayerThemeContext.Provider value={{ isDark, toggleTheme }}>
      <div className={isDark ? 'dark' : ''} suppressHydrationWarning>
        {children}
      </div>
    </PlayerThemeContext.Provider>
  );
}
