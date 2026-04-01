'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCharacter } from '@/app/actions/characters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">刪除角色</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>確認刪除角色</DialogTitle>
          <DialogDescription>
            此操作無法復原，請確認是否要刪除以下角色：
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
            <p className="font-semibold text-destructive">{characterName}</p>
            <p className="text-sm text-muted-foreground">
              刪除角色將同時移除角色圖片與相關資料
            </p>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-foreground text-sm border border-destructive/20">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
          >
            {isLoading ? '刪除中...' : '確認刪除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

