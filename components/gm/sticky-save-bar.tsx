'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CharacterTabKey, CharacterDirtyState } from '@/types/gm-edit';

/** Tab key → 中文名稱對照 */
const TAB_LABELS: Record<CharacterTabKey, string> = {
  basic: '基本設定',
  background: '背景故事',
  secrets: '隱藏資訊',
  stats: '數值',
  tasks: '任務',
  items: '道具',
  skills: '技能',
};

interface StickySaveBarProps {
  dirtyState: CharacterDirtyState;
  hasDirty: boolean;
  dirtyTabKeys: CharacterTabKey[];
  dirtyTabCount: number;
  isSaving: boolean;
  onSaveAll: () => Promise<void>;
  onDiscardAll: () => void;
}

/**
 * Sticky Save Bar — 角色編輯頁底部浮動儲存列
 *
 * 有 dirty state 時從底部滑入，顯示：
 * - 左側 icon + 摘要文字（粗體大寫）+ 詳細統計（第二行，永遠顯示）
 * - 右側「捨棄變更」+「全部儲存」按鈕（純文字，無 icon）
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
      <AnimatePresence>
        {hasDirty && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-8 left-1/2 z-50 w-full max-w-4xl -translate-x-1/2 px-6 md:pl-32"
          >
            <div className="rounded-2xl bg-[oklch(0.15_0.02_260)] text-white shadow-2xl backdrop-blur-xl">
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
                    <p className="mt-1 text-xs text-white/50">
                      {detailText}
                    </p>
                  </div>
                </div>

                {/* 右側：按鈕（純文字，無 icon） */}
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDiscardDialog(true)}
                    disabled={isSaving}
                    className="rounded-lg border border-white/20 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    捨棄變更
                  </button>
                  <button
                    type="button"
                    onClick={onSaveAll}
                    disabled={isSaving}
                    className="rounded-lg bg-linear-to-tr from-primary to-primary/80 px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? '儲存中...' : '全部儲存'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 捨棄變更確認 Dialog */}
      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>捨棄所有變更？</DialogTitle>
            <DialogDescription>
              這將回復所有分頁的未儲存變更，包含已標記刪除的項目也會被復原。此操作無法還原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDiscardDialog(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDiscardAll();
                setShowDiscardDialog(false);
              }}
            >
              捨棄所有變更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
