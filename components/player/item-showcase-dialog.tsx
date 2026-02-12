'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Zap } from 'lucide-react';
import Image from 'next/image';

/** 展示道具的基本資訊（僅包含安全可公開的欄位） */
export interface ShowcasedItemInfo {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity: number;
  tags?: string[];
}

interface ItemShowcaseDialogProps {
  /** 是否顯示 Dialog */
  open: boolean;
  /** 關閉 Dialog */
  onClose: () => void;
  /** 展示方角色名稱 */
  fromCharacterName: string;
  /** 道具資訊 */
  item: ShowcasedItemInfo | null;
}

/**
 * Phase 7.7: 唯讀道具展示 Dialog
 *
 * 當其他角色展示道具時，被展示方看到此 Dialog。
 * 僅顯示基本資訊（名稱、描述、圖片、類型、數量、標籤），
 * 不包含效果、檢定設定等敏感資訊。
 */
export function ItemShowcaseDialog({
  open,
  onClose,
  fromCharacterName,
  item,
}: ItemShowcaseDialogProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={item.type === 'consumable' ? 'secondary' : 'outline'}>
              {item.type === 'consumable' ? '消耗品' : '裝備/道具'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              由 {fromCharacterName} 展示
            </Badge>
          </div>
          <DialogTitle className="text-xl">
            {item.name}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 mt-4">
              {/* 道具圖片 */}
              {item.imageUrl ? (
                <div className="relative h-48 w-full rounded-lg overflow-hidden bg-muted">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg bg-muted">
                  {item.type === 'consumable' ? (
                    <Zap className="h-12 w-12 text-muted-foreground" />
                  ) : (
                    <Package className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
              )}

              {/* 道具描述 */}
              {item.description && (
                <p className="text-foreground whitespace-pre-wrap">
                  {item.description}
                </p>
              )}

              {/* 道具屬性 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-muted-foreground mb-1">類型</div>
                  <div className="font-semibold">
                    {item.type === 'consumable' ? '消耗品' : '裝備/道具'}
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-muted-foreground mb-1">數量</div>
                  <div className="font-semibold text-lg">{item.quantity}</div>
                </div>
              </div>

              {/* 標籤 */}
              {item.tags && item.tags.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">標籤</h4>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
