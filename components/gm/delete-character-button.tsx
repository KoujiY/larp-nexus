'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCharacter } from '@/app/actions/characters';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, AlertTriangle } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { cn } from '@/lib/utils';
import {
  GM_DIALOG_CONTENT_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';

interface DeleteCharacterButtonProps {
  characterId: string;
  characterName: string;
  gameId: string;
}

export function DeleteCharacterButton({
  characterId,
  characterName,
  gameId,
}: DeleteCharacterButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await deleteCharacter(characterId);

      if (result.success) {
        setOpen(false);
        // 刪除成功後導航回遊戲頁面
        router.push(`/games/${gameId}`);
      } else {
        setError(result.message || '刪除失敗');
      }
    } catch (err) {
      console.error('Error deleting character:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <IconActionButton
        icon={<Trash2 className="h-[18px] w-[18px]" />}
        label="刪除角色"
        onClick={() => setOpen(true)}
        variant="destructive"
        size="sm"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[400px] p-0 gap-0')}
          showCloseButton={false}
        >
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight">確認刪除角色</DialogTitle>
            </div>

            <div className="bg-muted/50 border border-border/20 rounded-xl p-5 shadow-sm space-y-2">
              <p className="font-bold text-foreground">{characterName}</p>
              <p className="text-sm text-muted-foreground">
                刪除角色將同時移除角色圖片與相關資料，此操作無法復原。
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-foreground flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="px-8 pb-8 pt-0 flex gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              className="flex-1 py-3 px-4 rounded-lg text-sm font-bold cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? '刪除中...' : '確認刪除'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

