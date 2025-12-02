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
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="flex-1">
          🗑️ 刪除
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>確認刪除角色</DialogTitle>
          <DialogDescription>
            此操作無法復原，請確認是否要刪除以下角色：
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-2">
            <p className="font-semibold text-red-900">👤 {characterName}</p>
            <p className="text-sm text-red-700">
              ⚠️ 刪除角色將同時移除角色圖片與相關資料
            </p>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
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

