'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { logout } from '@/app/actions/auth';
import {
  BookOpen,
  Settings,
  LogOut,
  Drama,
  Menu,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePlayerTheme } from '@/components/player/player-theme-context';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: '/games', label: '劇本管理', icon: BookOpen },
  { href: '/profile', label: '個人設定', icon: Settings },
];

const SIDEBAR_STORAGE_KEY = 'gm-sidebar-collapsed';

// ─────────────────────────────────────────────
// Mobile Header
// ─────────────────────────────────────────────

/** 行動版頂部標題列，內含 Sheet 側邊抽屜 */
export function MobileHeader() {
  return (
    <header className="flex lg:hidden items-center justify-between px-6 h-16 sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b shrink-0">
      <Link href="/games" className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Drama className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight">LARP Nexus</span>
      </Link>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="開啟導航選單">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <ExpandedNavigation />
        </SheetContent>
      </Sheet>
    </header>
  );
}

// ─────────────────────────────────────────────
// Desktop Sidebar (renders its own <aside>)
// ─────────────────────────────────────────────

/** 桌面版可收合/展開的側邊欄，含外層 aside 容器 */
export function DesktopSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
  };

  return (
    <aside
      className={cn(
        'hidden lg:flex lg:flex-col border-r bg-card shrink-0 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-72',
      )}
    >
      {collapsed ? (
        <CollapsedNavigation onToggle={toggleCollapsed} />
      ) : (
        <ExpandedNavigation onToggle={toggleCollapsed} />
      )}
    </aside>
  );
}

// ─────────────────────────────────────────────
// Expanded Navigation (w-72)
// ─────────────────────────────────────────────

function ExpandedNavigation({ onToggle }: { onToggle?: () => void }) {
  const pathname = usePathname();
  const { isDark, toggleTheme, mounted } = usePlayerTheme();
  const themeResolved = mounted ? isDark : false;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <nav className="flex flex-col h-full p-6">
      {/* Logo */}
      <div className="mb-10">
        <Link href="/games" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Drama className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xl font-black tracking-tight">
              LARP Nexus
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/60">
              GM Console
            </span>
          </div>
        </Link>
      </div>

      {/* Nav Items */}
      <div className="space-y-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all font-medium',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 font-bold'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="space-y-2 border-t mt-6 pt-6">
        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          {themeResolved ? (
            <Sun className="h-5 w-5 shrink-0" />
          ) : (
            <Moon className="h-5 w-5 shrink-0" />
          )}
          <span className="font-medium">
            {themeResolved ? '淺色模式' : '深色模式'}
          </span>
        </button>

        {/* Collapse Toggle */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <PanelLeftClose className="h-5 w-5 shrink-0" />
            <span className="font-medium">收合側欄</span>
          </button>
        )}

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="font-medium">登出</span>
        </button>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────
// Collapsed Navigation (72px)
// ─────────────────────────────────────────────

function CollapsedNavigation({ onToggle }: { onToggle: () => void }) {
  const pathname = usePathname();
  const { isDark, toggleTheme, mounted } = usePlayerTheme();
  const themeResolved = mounted ? isDark : false;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <nav className="flex flex-col items-center h-full py-6">
        {/* Logo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/games" className="mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Drama className="h-6 w-6 text-primary-foreground" />
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="flex flex-col">
              <span className="font-bold text-sm">LARP Nexus</span>
              <span className="text-[10px] text-muted-foreground">
                GM Console
              </span>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Nav Items */}
        <div className="flex flex-col items-center gap-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center justify-center w-12 h-12 rounded-xl transition-all active:scale-95',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col items-center gap-4 border-t mt-6 pt-6">
          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer"
              >
                {themeResolved ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">切換主題</TooltipContent>
          </Tooltip>

          {/* Expand Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                className="flex items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">展開側欄</TooltipContent>
          </Tooltip>

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all cursor-pointer"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">登出系統</TooltipContent>
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  );
}
