import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface DashedAddButtonProps {
  /** 按鈕文字 */
  label: string;
  /** 點擊事件 */
  onClick: () => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自訂 icon（預設 PlusCircle） */
  icon?: ReactNode;
  /**
   * 顯示模式
   * - `inline`（預設）：水平排列 icon + text，適合區塊底部
   * - `card`：垂直排列 icon + text，帶圓形 icon 容器，適合 grid 卡片空位
   */
  variant?: 'inline' | 'card';
  /** 額外 className（用於外部控制尺寸等） */
  className?: string;
}

/**
 * 虛線框新增按鈕
 *
 * GM 側通用的「新增項目」按鈕，用於卡片 grid 的空位或區塊列表底部。
 * 統一 hover 視覺：border → primary、icon → primary、bg → muted/30。
 */
export function DashedAddButton({
  label,
  onClick,
  disabled,
  icon,
  variant = 'inline',
  className,
}: DashedAddButtonProps) {
  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'group w-full border-2 border-dashed border-border/30 rounded-xl',
          'flex flex-col items-center justify-center gap-3',
          'text-muted-foreground hover:bg-muted/30 hover:border-primary',
          'transition-all cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
      >
        <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          {icon ?? (
            <PlusCircle className="h-7 w-7 text-border group-hover:text-primary transition-colors" />
          )}
        </div>
        <span className="text-sm font-bold group-hover:text-primary transition-colors">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group w-full border-2 border-dashed border-border/30 rounded-xl',
        'flex items-center justify-center gap-2',
        'text-muted-foreground hover:bg-muted/30 hover:border-primary',
        'transition-all cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      {icon ?? (
        <PlusCircle className="h-5 w-5 text-border group-hover:text-primary transition-colors" />
      )}
      <span className="text-sm font-bold">{label}</span>
    </button>
  );
}
