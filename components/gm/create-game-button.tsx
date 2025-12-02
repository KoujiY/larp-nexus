'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createGame } from '@/app/actions/games';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function CreateGameButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await createGame(formData);

      if (result.success && result.data) {
        setOpen(false);
        setFormData({ name: '', description: '' });
        router.refresh();
        // 導向到新建立的劇本頁面
        router.push(`/games/${result.data.id}`);
      } else {
        setError(result.message || '建立失敗');
      }
    } catch (err) {
      console.error('Error creating game:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <span className="mr-2">➕</span>
          建立劇本
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>建立新劇本</DialogTitle>
            <DialogDescription>
              建立一個新的 LARP 劇本，開始管理角色與事件
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                劇本名稱 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="例：末日餘暉"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                disabled={isLoading}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">劇本描述（選填）</Label>
              <Textarea
                id="description"
                placeholder="簡短描述這個劇本的主題與背景..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                disabled={isLoading}
                rows={5}
                className="resize-none max-h-[150px] overflow-y-auto"
              />
              <p className="text-xs text-muted-foreground">
                建議不超過 300 字
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? '建立中...' : '建立劇本'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

