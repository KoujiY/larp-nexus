'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

interface PlayerThemeWrapperProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'player-theme';

/**
 * 玩家端主題包裹器
 *
 * 預設深色（符合玩家端設計定義），允許使用者切換至淺色。
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
    <div className={isDark ? 'dark' : ''} suppressHydrationWarning>
      {/* 主題切換按鈕：固定右上角，不干擾主要內容 */}
      <button
        onClick={toggleTheme}
        aria-label={isDark ? '切換至淺色模式' : '切換至深色模式'}
        className="fixed top-4 right-4 z-50 w-9 h-9 rounded-full bg-card/80 backdrop-blur-sm border border-primary/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all duration-200"
      >
        {isDark
          ? <Sun className="h-4 w-4" />
          : <Moon className="h-4 w-4" />
        }
      </button>
      {children}
    </div>
  );
}
