/**
 * 對抗檢定後目標道具選擇區塊組件
 * 統一處理對抗檢定獲勝後選擇目標道具的 UI
 * 
 * Phase 7: 拆分 Dialog 組件
 */

'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';

export interface TargetItemSelectionSectionProps {
  needsTargetItemSelection: {
    contestId: string;
    sourceId: string;
    defenderId: string;
  } | null;
  targetItemsForSelection: Array<{ id: string; name: string; quantity: number }>;
  selectedTargetItemForContest: string;
  setSelectedTargetItemForContest: (id: string) => void;
  isLoadingTargetItemsForContest: boolean;
  isSelectingTargetItem: boolean;
  onSelectTargetItem: () => Promise<void>;
  onCancelSelection: () => void;
  onCloseDialog?: () => void;
  showIcon?: boolean;
}

/**
 * 對抗檢定後目標道具選擇區塊組件
 * 處理對抗檢定獲勝後選擇目標道具的 UI
 */
export function TargetItemSelectionSection({
  needsTargetItemSelection,
  targetItemsForSelection,
  selectedTargetItemForContest,
  setSelectedTargetItemForContest,
  isLoadingTargetItemsForContest,
  isSelectingTargetItem,
  onSelectTargetItem,
  onCloseDialog,
  showIcon = false,
}: TargetItemSelectionSectionProps) {
  if (!needsTargetItemSelection) {
    return null;
  }

  return (
    <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
      {showIcon ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
            <p className="font-medium text-blue-800">對抗檢定成功！請選擇目標道具</p>
          </div>
          {isLoadingTargetItemsForContest ? (
            <p className="text-sm text-blue-700">載入目標道具清單中...</p>
          ) : targetItemsForSelection.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-blue-800">選擇目標道具：</p>
              <Select 
                value={selectedTargetItemForContest} 
                onValueChange={setSelectedTargetItemForContest}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選擇要偷竊或移除的道具..." />
                </SelectTrigger>
                <SelectContent>
                  {targetItemsForSelection.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={async () => {
                  await onSelectTargetItem();
                  // 關閉 dialog
                  if (onCloseDialog) {
                    setTimeout(() => {
                      onCloseDialog();
                    }, 100);
                  }
                }}
                disabled={!selectedTargetItemForContest || isSelectingTargetItem}
                className="w-full"
              >
                {isSelectingTargetItem ? '處理中...' : '確認選擇'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-blue-700">目標角色沒有道具</p>
              <p className="text-xs text-blue-600">點擊確認按鈕結束流程</p>
              <Button
                onClick={async () => {
                  await onSelectTargetItem();
                  // 關閉 dialog
                  if (onCloseDialog) {
                    setTimeout(() => {
                      onCloseDialog();
                    }, 100);
                  }
                }}
                disabled={isSelectingTargetItem}
                className="w-full"
              >
                {isSelectingTargetItem ? '處理中...' : '確認'}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-blue-800 mb-3">
            對抗檢定獲勝！請選擇要偷竊或移除的道具：
          </p>
          {isLoadingTargetItemsForContest ? (
            <p className="text-sm text-blue-600">載入目標道具清單中...</p>
          ) : targetItemsForSelection.length > 0 ? (
            <div className="space-y-3">
              <Select 
                value={selectedTargetItemForContest} 
                onValueChange={setSelectedTargetItemForContest}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選擇目標道具..." />
                </SelectTrigger>
                <SelectContent>
                  {targetItemsForSelection.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={async () => {
                  await onSelectTargetItem();
                  // 關閉 dialog
                  if (onCloseDialog) {
                    setTimeout(() => {
                      onCloseDialog();
                    }, 0);
                  }
                }}
                disabled={!selectedTargetItemForContest || isSelectingTargetItem}
                className="w-full"
              >
                {isSelectingTargetItem ? '處理中...' : '確認選擇'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-blue-600">目標角色沒有道具</p>
              <p className="text-xs text-blue-500">點擊確認按鈕結束流程</p>
              <Button
                onClick={async () => {
                  await onSelectTargetItem();
                  // 關閉 dialog
                  if (onCloseDialog) {
                    setTimeout(() => {
                      onCloseDialog();
                    }, 0);
                  }
                }}
                disabled={isSelectingTargetItem}
                className="w-full"
              >
                {isSelectingTargetItem ? '處理中...' : '確認'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

