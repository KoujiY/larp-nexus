'use client';

import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveButtonProps {
  /** 是否有未儲存變更 */
  isDirty: boolean;
  /** 是否儲存中 */
  isLoading: boolean;
  /** 按鈕文字（預設：儲存變更） */
  label?: string;
  /** 點擊事件（type="button" 時使用） */
  onClick?: () => void;
  /** 按鈕類型（預設：submit） */
  type?: 'submit' | 'button';
  /** 額外的禁用條件（與 isLoading 合併） */
  disabled?: boolean;
  /** 額外的 className */
  className?: string;
}

/**
 * 增強版儲存按鈕
 *
 * 在有未儲存變更時顯示視覺高亮（ring 效果 + 文字前綴「●」），
 * 引導使用者注意到需要儲存。
 *
 * @example
 * ```tsx
 * // 表單內的 submit 按鈕
 * <SaveButton isDirty={isDirty} isLoading={isLoading} />
 *
 * // 獨立按鈕（如 Skills/Tasks 的主儲存按鈕）
 * <SaveButton
 *   isDirty={isDirty}
 *   isLoading={isLoading}
 *   label="儲存所有變更"
 *   type="button"
 *   onClick={handleSaveAll}
 * />
 * ```
 */
export function SaveButton({
  isDirty,
  isLoading,
  label = '儲存變更',
  onClick,
  type = 'submit',
  disabled = false,
  className,
}: SaveButtonProps) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      className={cn(
        'transition-all duration-300',
        isDirty && !isLoading && 'ring-2 ring-primary ring-offset-2',
        className
      )}
    >
      <Save className="mr-2 h-4 w-4" />
      {isLoading ? '儲存中...' : isDirty ? `● ${label}` : label}
    </Button>
  );
}
