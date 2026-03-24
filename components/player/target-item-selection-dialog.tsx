/**
 * 目標道具選擇 Dialog 組件
 * 用於對抗檢定獲勝後選擇目標道具（攻擊方和防守方都可以使用）
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { selectTargetItemForContest } from '@/app/actions/contest-select-item';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';

export interface TargetItemSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contestId: string;
  characterId: string;
  defenderId: string;
  sourceType: 'skill' | 'item';
  sourceId: string;
  onSelectionComplete: () => void;
}

export function TargetItemSelectionDialog({
  open,
  onOpenChange,
  contestId,
  characterId,
  defenderId,
  sourceType,
  sourceId,
  onSelectionComplete,
}: TargetItemSelectionDialogProps) {
  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemId, setSelectedTargetItemId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  // 載入目標角色的道具清單
  useEffect(() => {
    if (open && defenderId) {
      setIsLoading(true);
      getTargetCharacterItems(defenderId)
        .then((result) => {
          if (result.success && result.data) {
            setTargetItems(result.data);
            // 如果沒有道具，自動選擇空值（允許確認）
            if (result.data.length === 0) {
              setSelectedTargetItemId('');
            }
          } else {
            setTargetItems([]);
            setSelectedTargetItemId('');
          }
        })
        .catch((error) => {
          console.error('載入目標道具清單錯誤:', error);
          setTargetItems([]);
          setSelectedTargetItemId('');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, defenderId]);

  // 當 dialog 關閉時重置狀態
  useEffect(() => {
    if (!open) {
      setSelectedTargetItemId('');
      setTargetItems([]);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (isSelecting) return;

    // 如果沒有選擇道具，但目標也沒有道具，仍然執行效果（stat_change 等非偷竊效果需要執行）
    if (!selectedTargetItemId && targetItems.length === 0) {
      setIsSelecting(true);
      try {
        // Step 9.2: 呼叫 selectTargetItemForContest 而非 cancelContestItemSelection
        // 即使目標沒有道具，仍需執行所有延遲效果（steal 會產生「無道具」訊息，stat_change 正常執行）
        const result = await selectTargetItemForContest(
          contestId,
          characterId,
          '', // 無目標道具
          defenderId,
          sourceId,
          sourceType
        );
        if (result.success) {
          toast.success(result.message || '對抗檢定效果已執行');
        } else {
          toast.error(result.message || '執行效果失敗');
        }
        onSelectionComplete();
        onOpenChange(false);
      } catch (error) {
        console.error('執行對抗檢定效果失敗:', error);
        toast.error('執行對抗檢定效果時發生錯誤');
      } finally {
        setIsSelecting(false);
      }
      return;
    }

    // 如果有選擇道具，執行選擇
    if (selectedTargetItemId) {
      setIsSelecting(true);
      try {
        const result = await selectTargetItemForContest(
          contestId,
          characterId,
          selectedTargetItemId,
          defenderId,
          sourceId, // 傳入防守方的技能/道具 ID（當防守方選擇時）
          sourceType // 傳入防守方的技能/道具類型（當防守方選擇時）
        );

        if (result.success) {
          toast.success(result.message || '目標道具選擇成功');
          onSelectionComplete();
          onOpenChange(false);
        } else {
          toast.error(result.message || '選擇目標道具失敗');
        }
      } catch (error) {
        console.error('選擇目標道具錯誤:', error);
        toast.error('選擇目標道具時發生錯誤');
      } finally {
        setIsSelecting(false);
      }
    } else {
      toast.warning('請選擇目標道具');
    }
  };

  const handleDialogOpenChange = async (newOpen: boolean) => {
    if (!newOpen) {
      // 當目標有道具時，不允許關閉 dialog，必須選擇道具
      if (targetItems.length > 0) {
        return; // 阻止關閉
      }

      // Step 9.2: 當目標沒有道具時，允許關閉並執行所有延遲效果
      try {
        await selectTargetItemForContest(
          contestId,
          characterId,
          '', // 無目標道具
          defenderId,
          sourceId,
          sourceType
        );
      } catch (error) {
        console.error('執行對抗檢定效果失敗:', error);
      }
      // 調用完成回調
      onSelectionComplete();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent 
        className="max-w-md"
        showCloseButton={targetItems.length === 0}
        onInteractOutside={(e) => {
          // 當目標有道具時，禁用點擊外部關閉 dialog，強制用戶選擇
          if (targetItems.length > 0) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // 當目標有道具時，禁用按 ESC 關閉 dialog，強制用戶選擇
          if (targetItems.length > 0) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            對抗檢定成功！請選擇目標道具
          </DialogTitle>
          <DialogDescription>
            請選擇要{sourceType === 'skill' ? '偷竊或移除' : '偷竊或移除'}的道具
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <p>載入目標道具清單中...</p>
            </div>
          ) : targetItems.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4" />
                選擇目標道具：
              </div>
              <Select
                value={selectedTargetItemId}
                onValueChange={setSelectedTargetItemId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選擇要偷竊或移除的道具..." />
                </SelectTrigger>
                <SelectContent>
                  {targetItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                目標角色沒有道具
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                點擊確認按鈕結束流程
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={isSelecting || (targetItems.length > 0 && !selectedTargetItemId)}
            className="w-full"
          >
            {isSelecting
              ? '處理中...'
              : targetItems.length === 0
              ? '確認'
              : '確認選擇'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


