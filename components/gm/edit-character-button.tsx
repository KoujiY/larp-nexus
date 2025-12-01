'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/characters';
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
import type { CharacterData } from '@/types/character';

interface EditCharacterButtonProps {
  character: CharacterData;
  gameId: string;
}

export function EditCharacterButton({ character }: EditCharacterButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: character.name,
    description: character.description || '',
    hasPinLock: character.hasPinLock,
    pin: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const updateData: {
        name: string;
        description: string;
        hasPinLock: boolean;
        pin?: string;
      } = {
        name: formData.name,
        description: formData.description,
        hasPinLock: formData.hasPinLock,
      };

      // 只有在有輸入新 PIN 時才傳送
      if (formData.pin) {
        updateData.pin = formData.pin;
      }

      const result = await updateCharacter(character.id, updateData);

      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating character:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1">
          ✏️ 編輯
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>編輯角色</DialogTitle>
            <DialogDescription>
              修改角色的基本資訊與設定
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                角色名稱 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                disabled={isLoading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">角色描述</Label>
              <Textarea
                id="description"
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
                  啟用後玩家需輸入 PIN 才能查看
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
                  {character.hasPinLock ? '新 PIN 碼（留空保持不變）' : 'PIN 碼 *'}
                </Label>
                <Input
                  id="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  placeholder="4-6 位數字"
                  value={formData.pin}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, pin: e.target.value }))
                  }
                  disabled={isLoading}
                  required={formData.hasPinLock && !character.hasPinLock}
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
              {isLoading ? '儲存中...' : '儲存變更'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

