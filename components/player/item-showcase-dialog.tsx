'use client';

/**
 * 唯讀道具展示 Bottom Sheet（被展示方）
 *
 * 當其他角色展示道具時，被展示方看到此 Bottom Sheet。
 * 僅顯示基本資訊（名稱、描述、圖片、類型、數量、標籤），
 * 不包含效果、檢定設定等敏感資訊。
 *
 * 視覺語言對齊 item-detail-dialog（Ethereal Manuscript 風格）。
 */

import { useEffect } from 'react';
import Image from 'next/image';

/** 展示道具的基本資訊（僅包含安全可公開的欄位） */
export interface ShowcasedItemInfo {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'tool' | 'equipment';
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
 * Phase 7.7: 唯讀道具展示 Bottom Sheet
 *
 * 當其他角色展示道具時，被展示方看到此 Bottom Sheet。
 * 僅顯示基本資訊（名稱、描述、圖片、類型、數量、標籤），
 * 不包含效果、檢定設定等敏感資訊。
 */
export function ItemShowcaseDialog({
  open,
  onClose,
  fromCharacterName,
  item,
}: ItemShowcaseDialogProps) {
  // Escape 鍵關閉
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 鎖定背景滾動
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || !item) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Bottom Sheet 容器 */}
      <div
        className="w-full max-w-[896px] mx-auto rounded-t-[2.5rem] border-t border-border/30 shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden bg-background/94 backdrop-blur-[28px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${fromCharacterName} 展示了 ${item.name}`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-1 shrink-0">
          <div className="w-12 h-1 bg-border/40 rounded-full" />
        </div>

        {/* 可滾動內容區 */}
        <div className="overflow-y-auto px-6 pt-2 pb-8 flex-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-primary/70">
          {/* 道具圖片 */}
          <div className="relative w-32 h-32 mx-auto mb-4">
            <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-2xl animate-pulse" />
            <div
              className="relative z-10 w-full h-full rounded-2xl overflow-hidden border border-primary/30 bg-background"
              style={{ boxShadow: '0 0 40px -10px rgba(254,197,106,0.35)' }}
            >
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-5xl font-bold text-muted-foreground/20 select-none leading-none">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 名稱 + 展示者 + 描述 */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-primary mb-2">
              {item.name}
            </h2>

            {item.description && (
              <p className="text-muted-foreground text-xs leading-relaxed px-4 max-w-md mx-auto whitespace-pre-wrap mb-4">
                {item.description}
              </p>
            )}

            {/* 標籤 */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {item.tags.map((tag, i) => (
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

          {/* 類型 + 展示者 提示區塊 */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-card/30 border border-border/10 flex flex-col items-center">
              <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                類型
              </span>
              <span className="text-xs font-bold text-foreground">
                {{ consumable: '消耗品', tool: '道具', equipment: '裝備' }[item.type] ?? item.type}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-card/30 border border-border/10 flex flex-col items-center">
              <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                展示者
              </span>
              <span className="text-xs font-bold text-foreground">
                {fromCharacterName}
              </span>
            </div>
          </div>

        </div>

        {/* 關閉按鈕（固定底部） */}
        <div className="px-6 pb-6 pt-3 shrink-0">
          <button
            className="w-full max-w-md mx-auto block py-4 rounded-xl bg-linear-to-br from-primary to-primary/80 text-primary-foreground font-black text-sm tracking-widest uppercase shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
            onClick={onClose}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
