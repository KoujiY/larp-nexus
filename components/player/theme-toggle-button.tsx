'use client';

/**
 * 主題切換按鈕
 *
 * 從 CharacterCardView 提取的共用元件，支援兩種模式：
 * - `fixed`：固定右上角浮動（用於無 header 的頁面，如解鎖頁、世界觀頁）
 * - `inline`：行內按鈕（用於嵌入 header 等容器中）
 */

import { Sun, Moon } from 'lucide-react';
import { usePlayerTheme } from './player-theme-context';

interface ThemeToggleButtonProps {
  variant?: 'fixed' | 'inline';
}

export function ThemeToggleButton({ variant = 'inline' }: ThemeToggleButtonProps) {
  const { isDark, toggleTheme, mounted } = usePlayerTheme();
  // hydration 完成前以 server 預設值（dark=true）渲染
  const themeResolved = mounted ? isDark : true;

  if (variant === 'fixed') {
    return (
      <button
        onClick={toggleTheme}
        aria-label={themeResolved ? '切換至淺色模式' : '切換至深色模式'}
        className="fixed top-4 right-4 z-50 w-9 h-9 rounded-full bg-card/80 backdrop-blur-sm border border-primary/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all duration-200"
      >
        {themeResolved ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={themeResolved ? '切換至淺色模式' : '切換至深色模式'}
      className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors active:scale-95 duration-200"
    >
      {themeResolved ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
