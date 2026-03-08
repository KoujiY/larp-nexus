'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * useGuardedNavigation Hook 的回傳值
 */
interface UseGuardedNavigationReturn {
  /** 受保護的 router.back()：isDirty 時先顯示確認對話框 */
  guardedBack: () => void;
  /** 受保護的 router.push()：isDirty 時先顯示確認對話框 */
  guardedPush: (path: string) => void;
  /** 是否正在顯示確認對話框 */
  showDialog: boolean;
  /** 使用者確認離開時呼叫 */
  confirmNavigation: () => void;
  /** 使用者取消離開時呼叫 */
  cancelNavigation: () => void;
}

/**
 * 受保護的導航 Hook
 *
 * 包裝 Next.js router 的導航函數，當 isDirty 時先顯示確認對話框。
 * 搭配 `NavigationGuardDialog` 元件使用。
 *
 * @param isDirty - 表單是否有未儲存的變更
 *
 * @example
 * ```tsx
 * const { guardedBack, showDialog, confirmNavigation, cancelNavigation } =
 *   useGuardedNavigation(isDirty);
 *
 * // 取代原本的 router.back()
 * <Button onClick={guardedBack}>取消</Button>
 *
 * // 搭配 NavigationGuardDialog
 * <NavigationGuardDialog
 *   open={showDialog}
 *   onConfirm={confirmNavigation}
 *   onCancel={cancelNavigation}
 * />
 * ```
 */
export function useGuardedNavigation(isDirty: boolean): UseGuardedNavigationReturn {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const guardedBack = useCallback(() => {
    if (isDirty) {
      setPendingAction(() => () => router.back());
      setShowDialog(true);
    } else {
      router.back();
    }
  }, [isDirty, router]);

  const guardedPush = useCallback(
    (path: string) => {
      if (isDirty) {
        setPendingAction(() => () => router.push(path));
        setShowDialog(true);
      } else {
        router.push(path);
      }
    },
    [isDirty, router]
  );

  const confirmNavigation = useCallback(() => {
    setShowDialog(false);
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  const cancelNavigation = useCallback(() => {
    setShowDialog(false);
    setPendingAction(null);
  }, []);

  return {
    guardedBack,
    guardedPush,
    showDialog,
    confirmNavigation,
    cancelNavigation,
  };
}
