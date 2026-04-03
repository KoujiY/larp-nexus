'use client';

/**
 * 可摺疊段落區塊
 *
 * 標題左側帶 primary amber vertical bar，點擊可展開/收合子內容。
 * 預設展開。用於世界觀頁面和角色故事中的標題段落。
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-4 w-full text-left group"
      >
        <span className="w-1.5 h-8 bg-primary rounded-full shrink-0" />
        <h3 className="text-2xl font-bold text-primary font-headline tracking-tight flex-1">
          {title}
        </h3>
        <ChevronDown
          className={`h-5 w-5 text-primary/60 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      {isOpen && (
        <div className="space-y-4 text-muted-foreground leading-[2] text-base font-light">
          {children}
        </div>
      )}
    </section>
  );
}
