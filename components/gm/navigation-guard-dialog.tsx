'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NavigationGuardDialogProps {
  /** 是否顯示對話框 */
  open: boolean;
  /** 使用者確認離開時呼叫 */
  onConfirm: () => void;
  /** 使用者取消離開時呼叫 */
  onCancel: () => void;
  /** 對話框標題 */
  title?: string;
  /** 對話框描述 */
  description?: string;
}

/**
 * 導航攔截確認對話框
 *
 * 當使用者在有未儲存變更時嘗試離開頁面，顯示此對話框。
 * 搭配 `useGuardedNavigation` Hook 使用。
 *
 * @example
 * ```tsx
 * const { showDialog, confirmNavigation, cancelNavigation } =
 *   useGuardedNavigation(isDirty);
 *
 * <NavigationGuardDialog
 *   open={showDialog}
 *   onConfirm={confirmNavigation}
 *   onCancel={cancelNavigation}
 * />
 * ```
 */
export function NavigationGuardDialog({
  open,
  onConfirm,
  onCancel,
  title = '有未儲存的變更',
  description = '你有尚未儲存的修改，離開此頁面將會遺失這些變更。確定要離開嗎？',
}: NavigationGuardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            留在頁面
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            捨棄變更並離開
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
