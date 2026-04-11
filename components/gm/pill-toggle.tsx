'use client';

import { cn } from '@/lib/utils';

interface PillToggleOption<T extends string> {
  value: T;
  label: string;
}

interface PillToggleProps<T extends string> {
  options: PillToggleOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}

/**
 * GM 側 pill 風格切換器
 * 使用自製 pill toggle 取代 shadcn Tabs，適合二元或少量選項切換。
 * 設計：bg-muted 容器 + bg-white shadow-sm active 狀態
 */
export function PillToggle<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: PillToggleProps<T>) {
  return (
    <div className={cn('flex bg-muted p-1 rounded-lg', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onValueChange(option.value)}
          className={cn(
            'flex-1 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
            value === option.value
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground opacity-60 hover:opacity-100',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
