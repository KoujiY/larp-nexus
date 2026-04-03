import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface GmBreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * GM 側通用麵包屑導航
 * 最後一項自動標記為 active（text-primary），其餘可點擊
 */
export function GmBreadcrumb({ items }: GmBreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb">
      <ol className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/40" aria-hidden="true" />
              )}
              {isLast || !item.href ? (
                <span className={isLast ? 'text-primary font-bold truncate' : ''}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
