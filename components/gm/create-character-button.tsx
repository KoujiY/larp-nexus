'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCharacter } from '@/app/actions/characters';
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
import { Switch } from '@/components/ui/switch';

interface CreateCharacterButtonProps {
  gameId: string;
}

export function CreateCharacterButton({ gameId }: CreateCharacterButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasPinLock: false,
    pin: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await createCharacter({
        gameId,
        ...formData,
      });

      if (result.success) {
        setOpen(false);
        setFormData({ name: '', description: '', hasPinLock: false, pin: '' });
        router.refresh();
      } else {
        setError(result.message || '建立失敗');
      }
    } catch (err) {
      console.error('Error creating character:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <span className="mr-2">➕</span>
          新增角色
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>新增角色</DialogTitle>
            <DialogDescription>
              建立新的角色卡，稍後可上傳圖片並生成 QR Code
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                角色名稱 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="例：艾莉西亞"
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
              <Label htmlFor="description">角色描述</Label>
              <Textarea
                id="description"
                placeholder="角色的背景、性格、技能等..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                disabled={isLoading}
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
              <div className="space-y-0.5">
                <Label htmlFor="hasPinLock">PIN 解鎖</Label>
                <p className="text-sm text-muted-foreground">
                  啟用後玩家需輸入 PIN 才能查看角色卡
                </p>
              </div>
              <Switch
                id="hasPinLock"
                checked={formData.hasPinLock}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, hasPinLock: checked }))
                }
                disabled={isLoading}
              />
            </div>

            {formData.hasPinLock && (
              <div className="space-y-2">
                <Label htmlFor="pin">
                  PIN 碼（4-6 位數字） <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  placeholder="例：1234"
                  value={formData.pin}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, pin: e.target.value }))
                  }
                  disabled={isLoading}
                  required={formData.hasPinLock}
                />
              </div>
            )}

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
              {isLoading ? '建立中...' : '建立角色'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

