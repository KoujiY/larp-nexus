'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { PlayerThemeContext } from './player-theme-context';
import { Toaster } from '@/components/ui/sonner';

interface PlayerThemeWrapperProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'player-theme';

// useSyncExternalStore helpers for hydration-safe mounted detection
const emptySubscribe = () => () => {};
const returnTrue = () => true;
const returnFalse = () => false;

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

  // mounted：server 端為 false，client 端為 true。
  // 使用 useSyncExternalStore 取代 useState+useEffect 避免 cascading render。
  const mounted = useSyncExternalStore(emptySubscribe, returnTrue, returnFalse);

  // 同步 dark class 到 <html>，讓 Portal（Dialog、Select 等）
  // 也能繼承正確的主題 CSS 變數
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  };

  return (
    <PlayerThemeContext.Provider value={{ isDark, toggleTheme, mounted }}>
      <div className={(!mounted || isDark) ? 'dark' : ''} suppressHydrationWarning>
        {children}
        <Toaster theme={isDark ? 'dark' : 'light'} />
      </div>
    </PlayerThemeContext.Provider>
  );
}
