'use client';

/**
 * 道具對象選擇 Dialog
 *
 * 合併「轉移」與「展示」兩種用途，以 mode prop 區分行為文案。
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

const COPY = {
  transfer: {
    title: '選擇轉移對象',
    description: (name: string) => `將「${name}」轉移給其他角色`,
    emptyState: '沒有其他角色可以轉移',
    confirm: '確認轉移',
    confirming: '轉移中...',
  },
  showcase: {
    title: '選擇展示對象',
    description: (name: string) => `將「${name}」展示給其他角色`,
    emptyState: '沒有其他角色可以展示',
    confirm: '確認展示',
    confirming: '展示中...',
  },
} as const;

export interface ItemSelectDialogProps {
  mode: 'transfer' | 'showcase';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 操作目標道具（null 表示尚未選擇） */
  item: Item | null;
  isLoadingTargets: boolean;
  targets: TransferTargetCharacter[];
  selectedTargetId: string;
  onTargetChange: (id: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ItemSelectDialog({
  mode,
  open,
  onOpenChange,
  item,
  isLoadingTargets,
  targets,
  selectedTargetId,
  onTargetChange,
  isSubmitting,
  onSubmit,
  onCancel,
}: ItemSelectDialogProps) {
  const copy = COPY[mode];

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
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.description(item?.name ?? '')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingTargets ? (
          <div className="py-8 text-center text-muted-foreground">
            載入中...
          </div>
        ) : targets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-4" />
            <p>{copy.emptyState}</p>
          </div>
        ) : (
          <Select value={selectedTargetId} onValueChange={onTargetChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="選擇角色..." />
            </SelectTrigger>
            <SelectContent>
              {targets.map((target) => (
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
            onClick={onSubmit}
            disabled={!selectedTargetId || isSubmitting}
          >
            {isSubmitting ? copy.confirming : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
