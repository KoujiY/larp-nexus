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
  className,
}: DashedAddButtonProps) {
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
