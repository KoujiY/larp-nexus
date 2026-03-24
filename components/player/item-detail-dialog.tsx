'use client';

/**
 * 道具詳情 Dialog
 *
 * 顯示道具完整資訊（圖片、描述、屬性、標籤、檢定資訊、效果），
 * 並提供使用、展示、轉移操作按鈕。
 *
 * 所有互動狀態均由父元件（ItemList）管理，透過 props 傳入。
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRightLeft,
  Clock,
  Eye,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import type { Item } from '@/types/character';
import type { TargetItemInfo } from '@/app/actions/public';
import type { UsePostUseTargetItemSelectionReturn } from '@/hooks/use-post-use-target-item-selection';
import { formatDate } from '@/lib/utils/date';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import { EffectDisplay } from './effect-display';
import { UseResultDisplay } from './use-result-display';
import { CheckInfoDisplay } from './check-info-display';
import { TargetSelectionSection } from './target-selection-section';

export interface ItemDetailDialogProps {
  /** 當前選中的道具；null 表示 Dialog 關閉 */
  selectedItem: Item | null;
  /** Dialog 是否被鎖定（對抗檢定進行中或後續道具選擇中） */
  isDialogLocked: boolean;
  onClose: () => void;

  // ── 檢定 / 使用結果 ──
  checkResult: number | undefined;
  randomContestMaxValue: number;
  useResult: { success: boolean; message: string } | null;
  isUsing: boolean;

  // ── 目標選擇 ──
  useTargets: Array<{ id: string; name: string }>;
  selectedUseTargetId: string | undefined;
  setSelectedUseTargetId: (id: string | undefined) => void;
  isLoadingUseTargets: boolean;
  isTargetConfirmed: boolean;
  setIsTargetConfirmed: (v: boolean) => void;
  targetItems: TargetItemInfo[];
  selectedTargetItemId: string;
  setSelectedTargetItemId: (id: string) => void;
  isLoadingTargetItems: boolean;

  // ── 衍生狀態 ──
  requiresTarget: boolean;
  isContestInProgress: boolean;
  isPostUseSelecting: boolean;

  // ── 事件處理 ──
  handleUseItem: () => void;
  handleConfirmTarget: () => Promise<void>;
  handleCancelTarget: () => void;
  handleOpenShowcase: () => void;
  handleOpenTransfer: () => void;

  /** 非對抗偷竊/移除後的目標道具選擇流程 */
  postUseSelection: UsePostUseTargetItemSelectionReturn;

  /** 是否為唯讀模式（隱藏所有互動按鈕） */
  isReadOnly: boolean;
  /** 確認道具是否可使用 */
  canUseItem: (item: Item) => { canUse: boolean; reason?: string };
  /** 是否顯示使用按鈕（道具有效果且 onUseItem 已提供） */
  showUseButton: boolean;
  /** 是否顯示展示按鈕（需要 gameId 與 characterId） */
  showShowcaseButton: boolean;
  /** 是否顯示轉移按鈕 */
  showTransferButton: boolean;
}

export function ItemDetailDialog({
  selectedItem,
  isDialogLocked,
  onClose,
  checkResult,
  randomContestMaxValue,
  useResult,
  isUsing,
  useTargets,
  selectedUseTargetId,
  setSelectedUseTargetId,
  isLoadingUseTargets,
  isTargetConfirmed,
  setIsTargetConfirmed,
  targetItems,
  selectedTargetItemId,
  setSelectedTargetItemId,
  isLoadingTargetItems,
  requiresTarget,
  isContestInProgress,
  isPostUseSelecting,
  handleUseItem,
  handleConfirmTarget,
  handleCancelTarget,
  handleOpenShowcase,
  handleOpenTransfer,
  postUseSelection,
  isReadOnly,
  canUseItem,
  showUseButton,
  showShowcaseButton,
  showTransferButton,
}: ItemDetailDialogProps) {
  return (
    <Dialog
      open={!!selectedItem}
      onOpenChange={(open) => {
        if (!open && !isDialogLocked) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={!isDialogLocked}
        onInteractOutside={(e) => {
          if (isDialogLocked) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isDialogLocked) e.preventDefault();
        }}
      >
        {selectedItem && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant={
                    selectedItem.type === 'consumable' ? 'secondary' : 'outline'
                  }
                >
                  {selectedItem.type === 'consumable' ? '消耗品' : '裝備/道具'}
                </Badge>
                {hasItemEffects(selectedItem) && (
                  <Badge variant="default">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {selectedItem.effects && selectedItem.effects.length > 0
                      ? `${selectedItem.effects.length} 個效果`
                      : '有效果'}
                  </Badge>
                )}
                {selectedItem.isTransferable && (
                  <Badge variant="outline">
                    <ArrowRightLeft className="h-3 w-3 mr-1" />
                    可轉移
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl">{selectedItem.name}</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-4 mt-4">
                  {/* 道具圖片 */}
                  {selectedItem.imageUrl && (
                    <div className="relative h-48 w-full rounded-lg overflow-hidden bg-muted">
                      <Image
                        src={selectedItem.imageUrl}
                        alt={selectedItem.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}

                  {/* 道具描述 */}
                  {selectedItem.description && (
                    <p className="text-foreground whitespace-pre-wrap">
                      {selectedItem.description}
                    </p>
                  )}

                  {/* 道具屬性 */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-muted-foreground mb-1">數量</div>
                      <div className="font-semibold text-lg">
                        {selectedItem.quantity}
                      </div>
                    </div>

                    {selectedItem.usageLimit != null && (
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground mb-1">
                          使用次數
                        </div>
                        <div className="font-semibold text-lg">
                          {Number(selectedItem.usageLimit) > 0
                            ? `${Number(selectedItem.usageLimit) - (selectedItem.usageCount || 0)} / ${selectedItem.usageLimit}`
                            : '無限制'}
                        </div>
                      </div>
                    )}

                    {selectedItem.cooldown != null && (
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground mb-1">
                          冷卻時間
                        </div>
                        <div className="font-semibold text-lg flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {selectedItem.cooldown > 0
                            ? `${selectedItem.cooldown}s`
                            : '無冷卻時間'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 標籤顯示 */}
                  {selectedItem.tags && selectedItem.tags.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">標籤</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag === 'combat'
                              ? '戰鬥'
                              : tag === 'stealth'
                                ? '隱匿'
                                : tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 檢定資訊 */}
                  {selectedItem.checkType && (
                    <CheckInfoDisplay
                      checkType={selectedItem.checkType}
                      contestConfig={selectedItem.contestConfig}
                      randomConfig={selectedItem.randomConfig}
                      checkResult={checkResult}
                      randomContestMaxValue={randomContestMaxValue}
                    />
                  )}

                  {/* 使用效果 */}
                  {hasItemEffects(selectedItem) && (
                    <div className="p-3 bg-purple-50 rounded-lg space-y-3">
                      <div className="text-sm font-medium text-purple-800 mb-1 flex items-center gap-1">
                        <Sparkles className="h-4 w-4" />
                        使用效果
                      </div>
                      <div className="space-y-3">
                        {getItemEffects(selectedItem).map((effect, index) => (
                          <div key={index} className="text-purple-700">
                            {selectedItem.effects &&
                              selectedItem.effects.length > 1 && (
                                <div className="text-xs font-medium mb-1 text-purple-600">
                                  效果 {index + 1}
                                </div>
                              )}
                            <EffectDisplay
                              effect={effect}
                              targetOptions={useTargets}
                              selectedTargetId={selectedUseTargetId}
                              onTargetChange={(targetId) => {
                                setIsTargetConfirmed(false);
                                setSelectedTargetItemId('');
                                setSelectedUseTargetId(targetId);
                              }}
                              className="bg-transparent p-0 text-purple-700"
                              disabled={
                                isTargetConfirmed || isContestInProgress
                              }
                            />

                            {/* 目標確認與目標道具選擇 */}
                            {effect.requiresTarget && (
                              <TargetSelectionSection
                                requiresTarget={true}
                                checkType={selectedItem.checkType || 'none'}
                                effect={effect}
                                selectedTargetId={selectedUseTargetId}
                                setSelectedTargetId={(targetId) => {
                                  setIsTargetConfirmed(false);
                                  setSelectedTargetItemId('');
                                  setSelectedUseTargetId(targetId);
                                }}
                                targetOptions={useTargets}
                                isLoadingTargets={isLoadingUseTargets}
                                isTargetConfirmed={isTargetConfirmed}
                                setIsTargetConfirmed={setIsTargetConfirmed}
                                targetItems={targetItems}
                                selectedTargetItemId={selectedTargetItemId}
                                setSelectedTargetItemId={
                                  setSelectedTargetItemId
                                }
                                isLoadingTargetItems={isLoadingTargetItems}
                                onConfirmTarget={handleConfirmTarget}
                                onCancelTarget={handleCancelTarget}
                                disabled={isContestInProgress}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 使用結果訊息 */}
                  <UseResultDisplay result={useResult} />

                  {/* 非對抗偷竊/移除：使用成功後的目標道具選擇 */}
                  {postUseSelection.selectionState?.sourceId ===
                    selectedItem?.id && (
                    <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                      <div className="space-y-3">
                        <p className="font-medium text-green-800">
                          使用成功！請選擇目標道具
                        </p>
                        {postUseSelection.isLoadingTargetItems ? (
                          <p className="text-sm text-green-700">
                            載入目標道具清單中...
                          </p>
                        ) : postUseSelection.targetItems.length > 0 ? (
                          <div className="space-y-2">
                            <Select
                              value={postUseSelection.selectedTargetItemId}
                              onValueChange={
                                postUseSelection.setSelectedTargetItemId
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue
                                  placeholder={`選擇要${postUseSelection.selectionState.effectType === 'item_steal' ? '偷竊' : '移除'}的道具...`}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {postUseSelection.targetItems.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name}{' '}
                                    {item.quantity > 1 &&
                                      `(x${item.quantity})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              onClick={postUseSelection.confirmSelection}
                              disabled={
                                !postUseSelection.selectedTargetItemId ||
                                postUseSelection.isSubmitting
                              }
                              className="w-full"
                            >
                              {postUseSelection.isSubmitting
                                ? '處理中...'
                                : '確認選擇'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm text-green-700">
                              目標角色沒有道具
                            </p>
                            <Button
                              onClick={postUseSelection.confirmSelection}
                              disabled={postUseSelection.isSubmitting}
                              className="w-full"
                            >
                              {postUseSelection.isSubmitting
                                ? '處理中...'
                                : '確認'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 獲得時間 */}
                  <div className="text-sm text-muted-foreground pt-2 border-t">
                    獲得於：{formatDate(selectedItem.acquiredAt)}
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>

            {/* 操作按鈕（唯讀模式下隱藏） */}
            {!isReadOnly && (
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {/* 使用按鈕 */}
                {showUseButton &&
                  (() => {
                    const { canUse, reason } = canUseItem(selectedItem);
                    return (
                      <Button
                        onClick={handleUseItem}
                        disabled={
                          !canUse ||
                          isUsing ||
                          (requiresTarget && !selectedUseTargetId) ||
                          isDialogLocked
                        }
                        className="w-full sm:w-auto"
                      >
                        {isUsing
                          ? '使用中...'
                          : isContestInProgress
                            ? '等待對抗檢定結果...'
                            : isPostUseSelecting
                              ? '請選擇目標道具...'
                              : requiresTarget && !selectedUseTargetId
                                ? '請選擇目標角色'
                                : !canUse && reason
                                  ? `使用道具 (${reason})`
                                  : '使用道具'}
                      </Button>
                    );
                  })()}

                {/* 展示按鈕 */}
                {showShowcaseButton && (
                  <Button
                    variant="outline"
                    onClick={handleOpenShowcase}
                    disabled={isContestInProgress}
                    className="w-full sm:w-auto"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    展示
                  </Button>
                )}

                {/* 轉移按鈕 */}
                {showTransferButton && selectedItem.isTransferable && (
                  <Button
                    variant="outline"
                    onClick={handleOpenTransfer}
                    disabled={isContestInProgress}
                    className="w-full sm:w-auto"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    轉移道具
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
