'use client';

import {
  forwardRef,
  useTransition,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type ComponentPropsWithoutRef,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'onClick'> & {
  /** render prop：根據 isPending 狀態自訂內容 */
  render?: (isPending: boolean) => ReactNode;
  /** 導航中顯示覆蓋層（適用卡片連結） */
  showOverlay?: boolean;
};

/**
 * 帶有即時 loading 回饋的導航連結
 * 透過 useTransition + router.push 在點擊瞬間提供視覺回饋，
 * 解決 Next.js App Router 路由切換時畫面凍結的體驗問題
 */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink({ href, className, children, render, showOverlay, ...rest }, ref) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
      // 保留瀏覽器原生行為：Cmd/Ctrl+Click 開新分頁
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      startTransition(() => {
        router.push(typeof href === 'string' ? href : href.pathname ?? '/');
      });
    };

    return (
      <Link
        ref={ref}
        href={href}
        className={cn(className, showOverlay && 'relative')}
        onClick={handleClick}
        {...rest}
      >
        {render ? render(isPending) : children}
        {isPending && showOverlay && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-[inherit] z-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </Link>
    );
  },
);
