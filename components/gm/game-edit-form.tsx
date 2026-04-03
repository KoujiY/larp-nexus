'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateGame } from '@/app/actions/games';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useFormGuard } from '@/hooks/use-form-guard';
import { BackgroundBlockEditor } from '@/components/gm/background-block-editor';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_ERROR_RING_CLASS,
  GM_ERROR_TEXT_CLASS,
  GM_SECTION_TITLE_CLASS,
  GM_SECTION_CARD_CLASS,
} from '@/lib/styles/gm-form';
import type { GameData } from '@/types/game';
import type { BackgroundBlock } from '@/types/character';

interface GameEditFormProps {
  game: GameData;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * 劇本資訊編輯表單（v3）
 *
 * v3 變更：
 * - Input 樣式改用 GM_INPUT_CLASS（與 Wizard 統一）
 * - 必填欄位驗證 + scrollIntoView
 * - 移除「可編輯區塊」提示文字
 */
export function GameEditForm({ game, onDirtyChange }: GameEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [showNameError, setShowNameError] = useState(false);
  const nameFieldRef = useRef<HTMLDivElement>(null);

  const initialData = useMemo(() => ({
    name: game.name,
    isActive: game.isActive,
    publicInfo: {
      blocks: game.publicInfo?.blocks || [],
    },
    randomContestMaxValue: game.randomContestMaxValue || 100,
  }), [game]);

  const [formData, setFormData] = useState(initialData);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData,
    currentData: formData,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const handleBlocksChange = (blocks: BackgroundBlock[]) => {
    setFormData((prev) => ({
      ...prev,
      publicInfo: { ...prev.publicInfo, blocks },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 必填驗證：劇本名稱
    if (!formData.name.trim()) {
      setShowNameError(true);
      requestAnimationFrame(() =>
        nameFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }

    setIsLoading(true);

    try {
      const updateData = {
        name: formData.name,
        isActive: formData.isActive,
        publicInfo: {
          blocks: formData.publicInfo.blocks,
        },
        randomContestMaxValue: formData.randomContestMaxValue,
      };

      const result = await updateGame(game.id, updateData);

      if (result.success) {
        toast.success('劇本更新成功！');
        setLastSavedAt(new Date());
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating game:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const lastSavedLabel = lastSavedAt
    ? `上次儲存於 ${lastSavedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const nameHasError = showNameError && !formData.name.trim();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* 左欄：基礎設定 + 封面圖 */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          {/* 劇本基礎設定 */}
          <section className={GM_SECTION_CARD_CLASS}>
            <h2 className={GM_SECTION_TITLE_CLASS}>
              <span className="w-1 h-5 bg-primary rounded-full" />
              劇本基礎設定
            </h2>
            <div className="space-y-6 mt-6">
              <div ref={nameFieldRef} className="relative">
                <label className={GM_LABEL_CLASS}>劇本名稱 <span className="text-destructive">*</span></label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                    if (showNameError) setShowNameError(false);
                  }}
                  disabled={isLoading}
                  placeholder="請輸入劇本名稱"
                  className={cn(GM_INPUT_CLASS, nameHasError && GM_ERROR_RING_CLASS)}
                />
                {nameHasError && (
                  <p className={GM_ERROR_TEXT_CLASS}>此欄位為必填，請輸入劇本名稱</p>
                )}
              </div>
              <div>
                <label className={GM_LABEL_CLASS}>最大檢定值</label>
                <div className="w-full sm:max-w-[120px]">
                  <Input
                    type="number"
                    min={1}
                    value={formData.randomContestMaxValue}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        randomContestMaxValue: Math.max(1, parseInt(e.target.value) || 100),
                      }))
                    }
                    disabled={isLoading}
                    className={GM_INPUT_CLASS}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 劇本封面圖（預留） */}
          <section className={GM_SECTION_CARD_CLASS}>
            <h2 className={GM_SECTION_TITLE_CLASS}>
              <span className="w-1 h-5 bg-primary rounded-full" />
              劇本封面圖
            </h2>
            <div className="mt-6">
              <div className="group relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-border/40 rounded-xl bg-muted/30 hover:bg-muted/50 hover:border-primary/50 transition-all cursor-pointer">
                <ImagePlus className="h-12 w-12 text-muted-foreground/40 group-hover:text-primary mb-4" strokeWidth={1.5} />
                <p className="text-sm font-bold text-muted-foreground group-hover:text-foreground">上傳圖片</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1">建議 16:9（JPG, PNG）</p>
              </div>
            </div>
          </section>
        </div>

        {/* 右欄：世界觀公開資訊 */}
        <section className={cn('lg:col-span-7', GM_SECTION_CARD_CLASS)}>
          <h2 className={cn(GM_SECTION_TITLE_CLASS, 'mb-8')}>
            <span className="w-1 h-5 bg-primary rounded-full" />
            世界觀公開資訊
          </h2>
          <BackgroundBlockEditor
            value={formData.publicInfo.blocks}
            onChange={handleBlocksChange}
            disabled={isLoading}
          />
        </section>
      </div>

      {/* Sticky Save Footer */}
      <footer className="sticky bottom-0 z-10 mt-8 -mx-6 px-6 py-6 bg-background border-t border-border/10">
        <div className="flex items-center justify-end gap-6">
          {lastSavedLabel && (
            <span className="text-xs text-muted-foreground font-medium">{lastSavedLabel}</span>
          )}
          <button
            type="submit"
            disabled={isLoading || !isDirty}
            className="bg-primary hover:bg-primary/80 text-primary-foreground px-10 py-3 rounded-xl font-black text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? '儲存中...' : '儲存變更'}
          </button>
        </div>
      </footer>
    </form>
  );
}
