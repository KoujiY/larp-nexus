'use client';

/**
 * 道具詳情 Bottom Sheet
 *
 * 從底部滑出的彈出式卡片，展示道具完整資訊，
 * 並提供使用、展示、轉移操作按鈕。
 * 目標選擇為單一下拉選單，供三個操作共用。
 *
 * 所有互動狀態均由父元件（ItemList）管理，透過 props 傳入。
 */

import { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRightLeft, Eye, Zap } from 'lucide-react';
import Image from 'next/image';
import type { Item } from '@/types/character';
import { formatDate } from '@/lib/utils/date';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import { EffectDisplay } from './effect-display';

import { CheckInfoDisplay } from './check-info-display';

export interface ItemDetailDialogProps {
  /** 當前選中的道具；null 表示 Bottom Sheet 關閉 */
  selectedItem: Item | null;
  /** Sheet 是否被鎖定（對抗檢定進行中或後續道具選擇中） */
  isDialogLocked: boolean;
  onClose: () => void;

  // ── 檢定 / 使用結果 ──
  checkResult: number | undefined;
  randomContestMaxValue: number;
  isUsing: boolean;
  /** 展示操作是否進行中 */
  isShowcasing: boolean;
  /** 轉移操作是否進行中 */
  isTransferring: boolean;

  // ── 共用目標選擇（供使用/展示/轉移共用） ──
  sharedTargets: Array<{ id: string; name: string }>;
  isLoadingSharedTargets: boolean;
  useTargets: Array<{ id: string; name: string }>;
  selectedUseTargetId: string | undefined;
  setSelectedUseTargetId: (id: string | undefined) => void;
  isLoadingUseTargets: boolean;
  isTargetConfirmed: boolean;

  // ── 衍生狀態 ──
  requiresTarget: boolean;
  isContestInProgress: boolean;

  // ── 事件處理 ──
  handleUseItem: () => void;
  handleOpenShowcase: () => void;
  handleOpenTransfer: () => void;

  /** 是否為唯讀模式（隱藏所有互動按鈕） */
  isReadOnly: boolean;
  /** 確認道具是否可使用 */
  canUseItem: (item: Item) => { canUse: boolean; reason?: string };
  /** 是否顯示使用按鈕 */
  showUseButton: boolean;
  /** 是否顯示展示按鈕 */
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
  isUsing,
  isShowcasing,
  isTransferring,
  sharedTargets,
  isLoadingSharedTargets,
  useTargets,
  selectedUseTargetId,
  setSelectedUseTargetId,
  isLoadingUseTargets,
  isTargetConfirmed,
  requiresTarget,
  isContestInProgress,
  handleUseItem,
  handleOpenShowcase,
  handleOpenTransfer,
  isReadOnly,
  canUseItem,
  showUseButton,
  showShowcaseButton,
  showTransferButton,
}: ItemDetailDialogProps) {
  // Escape 鍵關閉
  useEffect(() => {
    if (!selectedItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDialogLocked) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, isDialogLocked, onClose]);

  // 鎖定背景滾動
  useEffect(() => {
    if (selectedItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedItem]);

  if (!selectedItem) return null;

  // 目標選項：優先 sharedTargets（全角色），fallback 到 useTargets
  const targetOptions = sharedTargets.length > 0 ? sharedTargets : useTargets;
  const isLoadingTargets = isLoadingSharedTargets || isLoadingUseTargets;
  const hasTargets = targetOptions.length > 0 || isLoadingTargets;

  const handleClose = () => {
    if (!isDialogLocked) onClose();
  };

  // 使用按鈕標籤
  const { canUse, reason: cantUseReason } = canUseItem(selectedItem);
  const useButtonLabel = isUsing
    ? '使用中...'
    : isContestInProgress
      ? '等待對抗結果...'
      : requiresTarget && !selectedUseTargetId
        ? '請選擇目標角色'
        : !canUse && cantUseReason
          ? `使用道具 (${cantUseReason})`
          : '使用道具';
  // 目標下拉已顯示但尚未選擇目標
  const noTargetSelected = hasTargets && !selectedUseTargetId;

  const isUseDisabled =
    !canUse ||
    isUsing ||
    noTargetSelected ||
    (requiresTarget && !selectedUseTargetId) ||
    isDialogLocked;

  const showAnyAction = showUseButton || showShowcaseButton || showTransferButton;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      {/* Bottom Sheet 容器 */}
      <div
        className="w-full max-w-[896px] mx-auto rounded-t-[2.5rem] border-t border-border/30 shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden bg-background/94 backdrop-blur-[28px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={selectedItem.name}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-1 shrink-0">
          <div className="w-12 h-1 bg-border/40 rounded-full" />
        </div>

        {/* 可滾動內容區 */}
        <div className="overflow-y-auto px-6 pt-2 pb-64 flex-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-primary/70">
          {/* 道具圖片 */}
          <div className="relative w-32 h-32 mx-auto mb-4">
            <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-2xl animate-pulse" />
            <div
              className="relative z-10 w-full h-full rounded-2xl overflow-hidden border border-primary/30 bg-background"
              style={{ boxShadow: '0 0 40px -10px rgba(254,197,106,0.35)' }}
            >
              {selectedItem.imageUrl ? (
                <Image
                  src={selectedItem.imageUrl}
                  alt={selectedItem.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-5xl font-bold text-muted-foreground/20 select-none leading-none">
                    {selectedItem.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 名稱 + 描述 + 標籤 */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-primary mb-2">
              {selectedItem.name}
            </h2>
            {selectedItem.description && (
              <p className="text-muted-foreground text-xs leading-relaxed mb-4 px-4 max-w-md mx-auto">
                {selectedItem.description}
              </p>
            )}
            {selectedItem.tags && selectedItem.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {selectedItem.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-card text-muted-foreground text-[10px] font-bold uppercase tracking-widest rounded-full border border-primary/20"
                  >
                    {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 特殊效果區塊 */}
          {hasItemEffects(selectedItem) && (
            <div className="space-y-3 mb-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1 mb-2">
                特殊效果
              </h3>
              {getItemEffects(selectedItem).map((effect, i) => (
                <div
                  key={i}
                  className="p-4 rounded-r-xl bg-surface-base/40 border-l-2 border-primary/60"
                >
                  <EffectDisplay
                    effect={effect}
                    targetOptions={[]}
                    selectedTargetId={undefined}
                    onTargetChange={() => {}}
                    className="bg-transparent p-0"
                    disabled={true}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 檢定資訊 */}
          {selectedItem.checkType && selectedItem.checkType !== 'none' && (
            <div className="mb-8">
              <CheckInfoDisplay
                checkType={selectedItem.checkType}
                contestConfig={selectedItem.contestConfig}
                randomConfig={selectedItem.randomConfig}
                checkResult={checkResult}
                randomContestMaxValue={randomContestMaxValue}
              />
            </div>
          )}

          {/* 使用次數 / 冷卻 */}
          {(selectedItem.usageLimit != null || selectedItem.cooldown != null) && (
            <div className="grid grid-cols-2 gap-3 mb-8">
              {selectedItem.usageLimit != null && (
                <div className="p-3 rounded-2xl bg-card/30 border border-border/10 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                    剩餘 / 總次數
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {Number(selectedItem.usageLimit) > 0
                      ? `${Number(selectedItem.usageLimit) - (selectedItem.usageCount || 0)} / ${selectedItem.usageLimit}`
                      : '無限制'}
                  </span>
                </div>
              )}
              {selectedItem.cooldown != null && (
                <div className="p-3 rounded-2xl bg-card/30 border border-border/10 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                    冷卻時間
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {selectedItem.cooldown > 0 ? `${selectedItem.cooldown}s` : '無'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 獲得時間 */}
          <div className="text-xs text-muted-foreground pt-2 text-center">
            獲得於：{formatDate(selectedItem.acquiredAt)}
          </div>
        </div>

        {/* 固定操作區（底部漸層覆蓋） */}
        {showAnyAction && (
          <div className="absolute bottom-0 left-0 w-full px-6 pb-6 pt-12 z-20 bg-linear-to-t from-background from-70% to-transparent">
            <div className="flex flex-col gap-3 max-w-md mx-auto">
              {/* 共用目標下拉選單 */}
              {hasTargets && (
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-popover text-[9px] font-bold text-primary uppercase tracking-tighter rounded z-10 border border-primary/20">
                    目標選擇
                  </label>
                  <Select
                    value={selectedUseTargetId ?? '__none__'}
                    onValueChange={(val) =>
                      setSelectedUseTargetId(val === '__none__' ? undefined : val)
                    }
                    disabled={
                      isReadOnly ||
                      isLoadingTargets ||
                      isTargetConfirmed ||
                      isContestInProgress ||
                      isDialogLocked
                    }
                  >
                    <SelectTrigger className="w-full bg-popover border border-primary/20 text-xs rounded-xl h-auto py-3 px-4 focus-visible:border-primary/50 focus-visible:ring-0 focus-visible:ring-offset-0 [&>span]:text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-70 bg-popover border-primary/20 rounded-xl">
                      <SelectItem
                        value="__none__"
                        className="text-xs text-muted-foreground italic focus:bg-primary/10 focus:text-muted-foreground"
                      >
                        {isLoadingTargets ? '載入中...' : '— 請選擇目標角色 —'}
                      </SelectItem>
                      {targetOptions.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          className="text-xs focus:bg-primary/10 focus:text-primary"
                        >
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 使用按鈕 */}
              {showUseButton && (
                <button
                  className="w-full py-4 rounded-xl bg-linear-to-br from-primary to-primary/80 text-primary-foreground font-black text-sm tracking-widest uppercase shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleUseItem}
                  disabled={isReadOnly || isUseDisabled}
                >
                  <Zap className="h-5 w-5" />
                  {isReadOnly ? '預覽模式' : useButtonLabel}
                </button>
              )}

              {/* 展示 + 轉移按鈕列 */}
              {(showShowcaseButton || showTransferButton) && (
                <div className="flex gap-3">
                  {showShowcaseButton && (
                    <button
                      className="flex-1 py-3 rounded-xl border border-primary/40 bg-card/40 text-primary font-bold text-[11px] tracking-widest uppercase hover:bg-primary/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleOpenShowcase}
                      disabled={isReadOnly || isContestInProgress || isShowcasing || noTargetSelected}
                    >
                      <Eye className="h-4 w-4" />
                      {isShowcasing ? '展示中...' : '展示'}
                    </button>
                  )}
                  {showTransferButton && selectedItem.isTransferable && (
                    <button
                      className="flex-1 py-3 rounded-xl border border-primary/40 bg-card/40 text-primary font-bold text-[11px] tracking-widest uppercase hover:bg-primary/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleOpenTransfer}
                      disabled={isReadOnly || isContestInProgress || isTransferring || noTargetSelected}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      {isTransferring ? '轉移中...' : '轉移'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
