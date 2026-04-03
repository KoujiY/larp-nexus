'use client';

/**
 * 遊戲結束對話框
 *
 * GM 結束遊戲時向玩家顯示的強制確認 Modal。
 * 防止外部點擊關閉。
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface GameEndedDialogProps {
  open: boolean;
  /** 點擊確認按鈕時的回呼 */
  onConfirm: () => void;
}

export function GameEndedDialog({ open, onConfirm }: GameEndedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => { /* 防止外部點擊關閉 */ }}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>遊戲已結束</DialogTitle>
          <DialogDescription>GM 已結束本場遊戲。感謝您的參與！</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={onConfirm}>確認</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
