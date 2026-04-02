'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createGame, checkGameCodeAvailability } from '@/app/actions/games';
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
// Phase 10: Game Code 生成和驗證
import {
  generateGameCodeClient,
  isValidGameCodeFormat,
} from '@/lib/game/generate-game-code-client';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { Plus } from 'lucide-react';

type CreateGameButtonProps = {
  /** 顯示模式：預設 header 按鈕，card 模式為虛線框卡片 */
  variant?: 'button' | 'card';
};

export function CreateGameButton({ variant = 'button' }: CreateGameButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    gameCode: '', // Phase 10: Game Code
  });

  // Phase 10: Game Code 即時檢查狀態
  const [gameCodeCheckStatus, setGameCodeCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'
  >('idle');

  // Phase 10: 當對話框打開時，自動生成一個隨機的 Game Code
  useEffect(() => {
    if (open && !formData.gameCode) {
      const newGameCode = generateGameCodeClient();
      setFormData((prev) => ({ ...prev, gameCode: newGameCode }));
      setGameCodeCheckStatus('idle'); // 新生成的 Code 預設為 idle，等待使用者編輯後再檢查
    }
  }, [open, formData.gameCode]);

  // Phase 10: Game Code 即時檢查（防抖 500ms）
  const checkGameCode = useCallback(async (code: string) => {
    const trimmedCode = code.trim().toUpperCase();

    // 驗證格式
    if (!isValidGameCodeFormat(trimmedCode)) {
      setGameCodeCheckStatus('invalid');
      return;
    }

    setGameCodeCheckStatus('checking');

    try {
      const result = await checkGameCodeAvailability(trimmedCode);
      if (result.success && result.data) {
        setGameCodeCheckStatus(
          result.data.isAvailable ? 'available' : 'unavailable'
        );
      } else {
        setGameCodeCheckStatus('invalid');
      }
    } catch (err) {
      console.error('Error checking game code:', err);
      setGameCodeCheckStatus('invalid');
    }
  }, []);

  // Phase 10: 當 Game Code 變更時，觸發即時檢查（防抖 500ms）
  useEffect(() => {
    if (!formData.gameCode) {
      setGameCodeCheckStatus('idle');
      return;
    }

    const timeoutId = setTimeout(() => {
      checkGameCode(formData.gameCode);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.gameCode, checkGameCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await createGame(formData);

      if (result.success && result.data) {
        setOpen(false);
        setFormData({ name: '', description: '', gameCode: '' }); // Phase 10: 重置 gameCode
        setGameCodeCheckStatus('idle'); // Phase 10: 重置檢查狀態
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
        {variant === 'card' ? (
          <DashedAddButton
            label="建立新劇本"
            onClick={() => {}}
            variant="card"
            className="h-[280px]"
          />
        ) : (
          <Button className="bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
            <Plus className="h-4 w-4 mr-2" />
            建立劇本
          </Button>
        )}
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
                劇本名稱 <span className="text-destructive">*</span>
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

            {/* Phase 10: Game Code 欄位 */}
            <div className="space-y-2">
              <Label htmlFor="gameCode">
                遊戲代碼 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="gameCode"
                  placeholder="ABC123"
                  value={formData.gameCode}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    setFormData((prev) => ({ ...prev, gameCode: value }));
                  }}
                  disabled={isLoading}
                  required
                  maxLength={6}
                  className="pr-10 font-mono"
                />
                {/* 檢查狀態指示器 */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {gameCodeCheckStatus === 'checking' && (
                    <span className="text-gray-400 text-sm">⏳</span>
                  )}
                  {gameCodeCheckStatus === 'available' && (
                    <span className="text-success text-sm">✓</span>
                  )}
                  {gameCodeCheckStatus === 'unavailable' && (
                    <span className="text-destructive text-sm">✗</span>
                  )}
                  {gameCodeCheckStatus === 'invalid' && (
                    <span className="text-warning text-sm">⚠</span>
                  )}
                </div>
              </div>
              {/* 檢查狀態提示 */}
              {gameCodeCheckStatus === 'checking' && (
                <p className="text-xs text-gray-500">檢查中...</p>
              )}
              {gameCodeCheckStatus === 'available' && (
                <p className="text-xs text-success">此代碼可以使用</p>
              )}
              {gameCodeCheckStatus === 'unavailable' && (
                <p className="text-xs text-destructive">此代碼已被使用，請使用其他代碼</p>
              )}
              {gameCodeCheckStatus === 'invalid' && (
                <p className="text-xs text-warning">
                  代碼格式錯誤（需要 6 位英數字）
                </p>
              )}
              {gameCodeCheckStatus === 'idle' && (
                <p className="text-xs text-muted-foreground">
                  6 位英數字，玩家將使用此代碼進入遊戲
                </p>
              )}
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
                gameCodeCheckStatus === 'checking' ||
                gameCodeCheckStatus === 'unavailable' ||
                gameCodeCheckStatus === 'invalid'
              }
            >
              {isLoading ? '建立中...' : '建立劇本'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

