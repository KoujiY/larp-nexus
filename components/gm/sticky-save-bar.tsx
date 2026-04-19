'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  GM_DIALOG_CONTENT_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import type { CharacterTabKey, CharacterDirtyState } from '@/types/gm-edit';

/** Tab key → 中文名稱對照 */
const TAB_LABELS: Record<CharacterTabKey, string> = {
  basic: '基本設定',
  background: '背景故事',
  secrets: '隱藏資訊',
  stats: '數值',
  tasks: '任務',
  items: '物品',
  skills: '技能',
};

/** 進退場動畫時長（ms）— 與下方 toast 延遲需一致 */
const TRANSITION_MS = 300;

type StickySaveBarProps = {
  dirtyState: CharacterDirtyState;
  hasDirty: boolean;
  dirtyTabKeys: CharacterTabKey[];
  dirtyTabCount: number;
  isSaving: boolean;
  onSaveAll: () => Promise<{ failedCount: number }>;
  onDiscardAll: () => void;
};

/**
 * Sticky Save Bar — 角色編輯頁底部浮動儲存列
 *
 * 有 dirty state 時從底部滑入、退出時滑下。改為 CSS transition 實作
 * （原為 framer-motion），優點：
 * - Initial bundle 少 38 KB gzip
 * - DOM 節點 always-mounted，避免 Playwright TOCTOU 問題
 * - 動畫時長/緩動由單一常數 TRANSITION_MS 控管
 *
 * 佈景：左側 icon + 摘要（粗體大寫）+ 詳細統計，右側「捨棄」「全部儲存」按鈕。
 */
export function StickySaveBar({
  dirtyState,
  hasDirty,
  dirtyTabKeys,
  dirtyTabCount,
  isSaving,
  onSaveAll,
  onDiscardAll,
}: StickySaveBarProps) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Unmount 時清除殘留 timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /** 全部儲存 + 延遲 toast（等 exit 動畫結束後才顯示） */
  const handleSaveAll = useCallback(async () => {
    const tabCount = dirtyTabCount;
    const tabNames = dirtyTabKeys.map((key) => TAB_LABELS[key]).join('、');

    const { failedCount } = await onSaveAll();

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    toastTimerRef.current = setTimeout(() => {
      if (failedCount === 0) {
        toast.success(`已儲存 ${tabCount} 個分頁的變更 (${tabNames})`);
      } else {
        toast.error(`${failedCount} 個分頁儲存失敗，請重試`);
      }
    }, TRANSITION_MS + 100);
  }, [dirtyTabCount, dirtyTabKeys, onSaveAll]);

  /** 組裝摘要文字 */
  const summaryText = `${dirtyTabCount} 個分頁有未儲存的變更 (${dirtyTabKeys
    .map((key) => TAB_LABELS[key])
    .join('、')})`;

  /** 組裝詳細統計 */
  const detailParts = dirtyTabKeys.map((key) => {
    const info = dirtyState[key];
    const parts: string[] = [];
    if (info.added > 0) parts.push(`新增 ${info.added}`);
    if (info.modified > 0) parts.push(`修改 ${info.modified}`);
    if (info.deleted > 0) parts.push(`刪除 ${info.deleted}`);
    const detail = parts.length > 0 ? parts.join(', ') : '已修改';
    return `${TAB_LABELS[key]}: ${detail}`;
  });
  const detailText = detailParts.join(' | ');

  return (
    <>
      {/* 外層負責 fixed 定位與 x 置中；內層負責 y 滑入/淡入動畫 */}
      <div
        className="fixed bottom-8 left-1/2 z-50 w-full max-w-4xl -translate-x-1/2 px-3 sm:px-6 md:pl-32"
        role="region"
        aria-label="儲存列"
        aria-hidden={!hasDirty}
      >
        <div
          data-state={hasDirty ? 'visible' : 'hidden'}
          className={cn(
            'transition-[transform,opacity] duration-300 ease-out will-change-transform',
            'data-[state=visible]:translate-y-0 data-[state=visible]:opacity-100 data-[state=visible]:pointer-events-auto',
            'data-[state=hidden]:translate-y-24 data-[state=hidden]:opacity-0 data-[state=hidden]:pointer-events-none',
          )}
        >
          <div className={cn(
            'rounded-2xl shadow-2xl backdrop-blur-xl',
            // 淺色：深底白字
            'bg-[oklch(0.15_0.02_260)] text-white',
            // 暗色：亮底深字
            'dark:bg-[oklch(0.95_0.01_80)] dark:text-[oklch(0.15_0.02_260)]',
          )}>
            <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              {/* 左側：icon + 摘要 + 詳細 */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-widest">
                    {summaryText}
                  </p>
                  <p className="mt-1 text-xs opacity-50">
                    {detailText}
                  </p>
                </div>
              </div>

              {/* 右側：按鈕（純文字，無 icon） */}
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardDialog(true)}
                  disabled={isSaving || !hasDirty}
                  className={cn(
                    'cursor-pointer rounded-lg border px-6 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50',
                    'border-white/20 text-white/70 hover:bg-white/10',
                    'dark:border-[oklch(0.15_0.02_260)]/20 dark:text-[oklch(0.15_0.02_260)]/70 dark:hover:bg-[oklch(0.15_0.02_260)]/10',
                  )}
                >
                  捨棄變更
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isSaving || !hasDirty}
                  className="cursor-pointer rounded-lg bg-linear-to-tr from-primary to-primary/80 px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? '儲存中...' : '全部儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 捨棄變更確認 Dialog */}
      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[400px] p-0 gap-0')}
          showCloseButton={false}
        >
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight">捨棄所有變更？</DialogTitle>
              <p className="text-sm text-muted-foreground">
                這將回復所有分頁的未儲存變更，包含已標記刪除的項目也會被復原。此操作無法還原。
              </p>
            </div>
          </div>

          <div className="px-8 pb-8 pt-0 flex gap-3">
            <button
              type="button"
              onClick={() => setShowDiscardDialog(false)}
              className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onDiscardAll();
                setShowDiscardDialog(false);
              }}
              className="flex-1 py-3 px-4 rounded-lg text-sm font-bold cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/10 transition-all active:scale-[0.98]"
            >
              捨棄所有變更
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
