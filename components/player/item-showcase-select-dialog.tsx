'use client';

/**
 * 道具展示選擇 Dialog
 *
 * 讓玩家選擇要將道具展示給哪個角色。
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

export interface ItemShowcaseSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 欲展示的道具（null 表示尚未選擇） */
  itemToShowcase: Item | null;
  isLoadingTargets: boolean;
  showcaseTargets: TransferTargetCharacter[];
  selectedTargetId: string;
  onTargetChange: (id: string) => void;
  isShowcasing: boolean;
  onShowcase: () => void;
  onCancel: () => void;
}

export function ItemShowcaseSelectDialog({
  open,
  onOpenChange,
  itemToShowcase,
  isLoadingTargets,
  showcaseTargets,
  selectedTargetId,
  onTargetChange,
  isShowcasing,
  onShowcase,
  onCancel,
}: ItemShowcaseSelectDialogProps) {
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
          <DialogTitle>選擇展示對象</DialogTitle>
          <DialogDescription>
            將「{itemToShowcase?.name}」展示給其他角色
          </DialogDescription>
        </DialogHeader>

        {isLoadingTargets ? (
          <div className="py-8 text-center text-muted-foreground">
            載入中...
          </div>
        ) : showcaseTargets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-4" />
            <p>沒有其他角色可以展示</p>
          </div>
        ) : (
          <Select value={selectedTargetId} onValueChange={onTargetChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="選擇角色..." />
            </SelectTrigger>
            <SelectContent>
              {showcaseTargets.map((target) => (
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
            onClick={onShowcase}
            disabled={!selectedTargetId || isShowcasing}
          >
            {isShowcasing ? '展示中...' : '確認展示'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
