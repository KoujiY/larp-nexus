'use client';

import * as React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * GM 側 underline 風格的 TabsList
 * 覆蓋 shadcn 預設的 bg-muted / rounded-lg / p-[3px]
 * 不含 border-b — 由使用端的父層 wrapper 控制滿版底線
 */
function GmTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        'h-auto w-auto gap-0 rounded-none bg-transparent p-0',
        className,
      )}
      {...props}
    />
  );
}

/**
 * GM 側 underline 風格的 TabsTrigger
 * 覆蓋 shadcn 預設的 border / shadow / bg / rounded-md
 */
function GmTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        // reset shadcn defaults (including dark mode background overrides)
        'rounded-none border-0 border-b-2 border-transparent shadow-none outline-none ring-0',
        'bg-transparent dark:bg-transparent',
        // base
        'px-8 py-4 text-sm font-medium text-muted-foreground transition-all cursor-pointer',
        // focus
        'focus-visible:ring-0 focus-visible:outline-none',
        // active — primary 色文字 + 底線，無背景色變化
        'data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:shadow-none',
        'data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent',
        // 覆蓋 shadcn 底層的 dark:data-[state=active]:text-foreground
        'dark:data-[state=active]:text-primary dark:data-[state=active]:border-b-primary',
        className,
      )}
      {...props}
    />
  );
}

export { GmTabsList, GmTabsTrigger };
