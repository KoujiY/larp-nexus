import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DashedAddButton } from '@/components/gm/dashed-add-button';

interface GmEmptyStateProps {
  /** 中央 icon（lucide ReactNode） */
  icon: ReactNode;
  /** 主標題 */
  title: string;
  /** 描述文字（選填） */
  description?: string;
  /** CTA 按鈕文字（選填，搭配 onAction 使用） */
  actionLabel?: string;
  /** CTA 按鈕事件 */
  onAction?: () => void;
  /** 是否禁用 CTA */
  disabled?: boolean;
  /** 自訂 CTA 區塊（取代 actionLabel + onAction） */
  children?: ReactNode;
  /** 額外 className */
  className?: string;
}

/**
 * GM 側共用空狀態元件
 *
 * 統一風格：虛線邊框容器 + icon 圓圈 + 標題 + 描述 + CTA。
 * 對齊 secrets-tab 現有空狀態設計。
 */
export function GmEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  disabled,
  children,
  className,
}: GmEmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-muted/10 border-2 border-dashed border-border/20 rounded-2xl',
        'py-16 px-8 flex flex-col items-center text-center',
        className,
      )}
    >
      <div className="w-20 h-20 mb-6 bg-muted/30 rounded-full flex items-center justify-center text-muted-foreground/40">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-muted-foreground mb-2">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-muted-foreground/70 mb-8">
          {description}
        </p>
      )}
      {children ?? (actionLabel && onAction && (
        <DashedAddButton
          label={actionLabel}
          onClick={onAction}
          disabled={disabled}
          className="max-w-xs py-4"
        />
      ))}
    </div>
  );
}
