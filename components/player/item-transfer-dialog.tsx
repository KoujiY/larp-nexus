'use client';

/**
 * 道具轉移 Dialog
 *
 * 讓玩家將道具轉移給同場遊戲中的其他角色。
 * 純展示元件，所有狀態由父元件（ItemList）管理。
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User } from 'lucide-react';
import type { Item } from '@/types/character';
import type { TransferTargetCharacter } from '@/app/actions/public';

export interface ItemTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 欲轉移的道具（null 表示尚未選擇） */
  transferItem: Item | null;
  isLoadingTargets: boolean;
  transferTargets: TransferTargetCharacter[];
  selectedTargetId: string;
  onTargetChange: (id: string) => void;
  isTransferring: boolean;
  onTransfer: () => void;
  onCancel: () => void;
}

export function ItemTransferDialog({
  open,
  onOpenChange,
  transferItem,
  isLoadingTargets,
  transferTargets,
  selectedTargetId,
  onTargetChange,
  isTransferring,
  onTransfer,
  onCancel,
}: ItemTransferDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>選擇轉移對象</DialogTitle>
          <DialogDescription>
            將「{transferItem?.name}」轉移給其他角色
          </DialogDescription>
        </DialogHeader>

        {isLoadingTargets ? (
          <div className="py-8 text-center text-muted-foreground">
            載入中...
          </div>
        ) : transferTargets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-4" />
            <p>沒有其他角色可以轉移</p>
          </div>
        ) : (
          <Select value={selectedTargetId} onValueChange={onTargetChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="選擇角色..." />
            </SelectTrigger>
            <SelectContent>
              {transferTargets.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            onClick={onTransfer}
            disabled={!selectedTargetId || isTransferring}
          >
            {isTransferring ? '轉移中...' : '確認轉移'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
