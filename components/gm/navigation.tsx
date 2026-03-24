'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { logout } from '@/app/actions/auth';
import { LayoutDashboard, BookOpen, Settings, LogOut, Drama, type LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: '儀表板', icon: LayoutDashboard },
  { href: '/games', label: '劇本管理', icon: BookOpen },
  { href: '/profile', label: '個人設定', icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-8 border-b">
        <Link href="/dashboard" className="flex items-center space-x-3">
          <Drama className="h-9 w-9 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-xl font-bold">LARP Nexus</span>
            <span className="text-xs text-muted-foreground">GM 控制台</span>
          </div>
        </Link>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Logout */}
      <div className="px-3 py-6 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 mr-3" />
          登出
        </Button>
      </div>
    </nav>
  );
}

