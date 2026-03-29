'use client';

/**
 * 共用 Bottom Sheet 元件
 *
 * 從底部滑入的對話框，包含遮罩、拖曳把手、可捲動內容區和固定底部區域。
 * 供道具詳情、隱藏資訊等 dialog 共用。
 */

import { useEffect, type ReactNode } from 'react';

interface BottomSheetProps {
  /** 是否開啟 */
  open: boolean;
  /** 關閉 callback */
  onClose: () => void;
  /** 是否鎖定（阻止 Escape / 點擊遮罩關閉） */
  locked?: boolean;
  /** 無障礙標籤 */
  ariaLabel?: string;
  /** 可捲動的主要內容 */
  children: ReactNode;
  /** 固定在底部的 footer（操作按鈕等） */
  footer?: ReactNode;
  /** 自訂內容區 className（額外 padding 等） */
  contentClassName?: string;
}

export function BottomSheet({
  open,
  onClose,
  locked = false,
  ariaLabel,
  children,
  footer,
  contentClassName = '',
}: BottomSheetProps) {
  // Escape 鍵關閉
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, locked, onClose]);

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

  if (!open) return null;

  const handleOverlayClick = () => {
    if (!locked) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      {/* Bottom Sheet 容器 */}
      <div
        className="w-full max-w-[896px] mx-auto rounded-t-[2.5rem] border-t border-border/30 shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden bg-background/94 backdrop-blur-[28px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {/* 拖曳把手 */}
        <div className="flex justify-center pt-4 pb-1 shrink-0">
          <div className="w-12 h-1 bg-border/40 rounded-full" />
        </div>

        {/* 可捲動內容區 */}
        <div
          className={`overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-primary/70 ${contentClassName}`}
        >
          {children}
        </div>

        {/* 固定 Footer */}
        {footer && (
          <div className="shrink-0 px-6 py-4 bg-background/80 backdrop-blur-sm border-t border-border/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
