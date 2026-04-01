'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createCharacter, checkPinAvailability } from '@/app/actions/characters'; // Phase 10.9.3
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { UserPlus } from 'lucide-react';
import { DashedAddButton } from '@/components/gm/dashed-add-button';

interface CreateCharacterButtonProps {
  gameId: string;
  /** 'button'（預設）= header 按鈕；'card' = grid 內的空狀態卡片 */
  variant?: 'button' | 'card';
}

export function CreateCharacterButton({ gameId, variant = 'button' }: CreateCharacterButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasPinLock: false,
    pin: '',
  });

  // Phase 10.9.3: PIN 即時檢查狀態
  const [pinCheckStatus, setPinCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'
  >('idle');

  // Phase 10.9.3: PIN 即時檢查（防抖 500ms）
  const checkPin = useCallback(
    async (pin: string) => {
      const trimmedPin = pin.trim();

      // 驗證格式（4-6 位數字）
      if (!trimmedPin || trimmedPin.length < 4 || !/^\d{4,6}$/.test(trimmedPin)) {
        setPinCheckStatus('invalid');
        return;
      }

      setPinCheckStatus('checking');

      try {
        const result = await checkPinAvailability(gameId, trimmedPin);
        if (result.success && result.data) {
          setPinCheckStatus(result.data.isAvailable ? 'available' : 'unavailable');
        } else {
          setPinCheckStatus('invalid');
        }
      } catch (err) {
        console.error('Error checking PIN:', err);
        setPinCheckStatus('invalid');
      }
    },
    [gameId]
  );

  // Phase 10.9.3: 當對話框關閉時，重置 PIN 檢查狀態
  useEffect(() => {
    if (!open) {
      setPinCheckStatus('idle');
    }
  }, [open]);

  // Phase 10.9.3: 當 PIN 變更時，觸發即時檢查（防抖 500ms）
  useEffect(() => {
    if (!formData.hasPinLock || !formData.pin) {
      setPinCheckStatus('idle');
      return;
    }

    const timeoutId = setTimeout(() => {
      checkPin(formData.pin);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.hasPinLock, formData.pin, checkPin]);

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

  const trigger = variant === 'card' ? (
    <DashedAddButton
      label="建立新角色"
      onClick={() => setOpen(true)}
      className="min-h-[180px] py-5"
    />
  ) : (
    <Button
      onClick={() => setOpen(true)}
      className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all"
    >
      <UserPlus className="h-4 w-4 mr-2" />
      新增角色
    </Button>
  );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
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
                角色名稱 <span className="text-destructive">*</span>
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
                rows={6}
                className="resize-none max-h-[200px] overflow-y-auto"
              />
              <p className="text-xs text-muted-foreground">
                可輸入多行文字，建議不超過 500 字
              </p>
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
                  PIN 碼（4-6 位數字） <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]{4,6}"
                    placeholder="例：1234"
                    value={formData.pin}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        pin: e.target.value.replace(/\D/g, '').slice(0, 6)
                      }))
                    }
                    disabled={isLoading}
                    required={formData.hasPinLock}
                    className="pr-20"
                  />
                  {/* Phase 10.9.3: PIN 檢查狀態指示器 */}
                  <div className="absolute right-12 top-1/2 -translate-y-1/2">
                    {pinCheckStatus === 'checking' && (
                      <span className="text-gray-400 text-sm">⏳</span>
                    )}
                    {pinCheckStatus === 'available' && (
                      <span className="text-success text-sm">✓</span>
                    )}
                    {pinCheckStatus === 'unavailable' && (
                      <span className="text-destructive text-sm">✗</span>
                    )}
                    {pinCheckStatus === 'invalid' && (
                      <span className="text-warning text-sm">⚠</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPin ? '🙈' : '👁️'}
                  </button>
                </div>
                {/* Phase 10.9.3: PIN 檢查狀態提示 */}
                {pinCheckStatus === 'checking' && (
                  <p className="text-xs text-gray-500">檢查中...</p>
                )}
                {pinCheckStatus === 'available' && (
                  <p className="text-xs text-success">此 PIN 可以使用</p>
                )}
                {pinCheckStatus === 'unavailable' && (
                  <p className="text-xs text-destructive">
                    此 PIN 在本遊戲中已被使用，請使用其他 PIN
                  </p>
                )}
                {pinCheckStatus === 'invalid' && (
                  <p className="text-xs text-warning">
                    PIN 格式錯誤（需要 4-6 位數字）
                  </p>
                )}
                {pinCheckStatus === 'idle' && (
                  <p className="text-xs text-muted-foreground">
                    請記住此 PIN 碼，玩家需要此碼才能查看角色卡
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-foreground text-sm border border-destructive/20">
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
              type="submit"
              disabled={
                isLoading ||
                (formData.hasPinLock &&
                  (pinCheckStatus === 'checking' ||
                    pinCheckStatus === 'unavailable' ||
                    pinCheckStatus === 'invalid'))
              }
            >
              {isLoading ? '建立中...' : '建立角色'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  );
}

