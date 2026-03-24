'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateGameCode, checkGameCodeAvailability } from '@/app/actions/games';
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
import { toast } from 'sonner';
import { Copy, Edit } from 'lucide-react';
import { isValidGameCodeFormat } from '@/lib/game/generate-game-code-client';

interface GameCodeSectionProps {
  gameId: string;
  gameCode: string;
  className?: string;
}

/**
 * Phase 10: Game Code 顯示和編輯組件
 *
 * 功能：
 * - 顯示當前 Game Code（大字體、等寬字體）
 * - 複製 Game Code 到剪貼簿
 * - 編輯 Game Code（含即時唯一性檢查）
 *
 * @example
 * ```tsx
 * <GameCodeSection gameId="123" gameCode="ABC123" />
 * ```
 */
export function GameCodeSection({ gameId, gameCode, className = '' }: GameCodeSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newGameCode, setNewGameCode] = useState(gameCode ?? '');

  // Phase 10: Game Code 即時檢查狀態
  const [gameCodeCheckStatus, setGameCodeCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'
  >('idle');

  // 當對話框關閉時，重置狀態
  useEffect(() => {
    if (!open) {
      setNewGameCode(gameCode ?? '');
      setGameCodeCheckStatus('idle');
    }
  }, [open, gameCode]);

  // Phase 10: Game Code 即時檢查（防抖 500ms）
  const checkGameCode = useCallback(async (code: string) => {
    const trimmedCode = code.trim().toUpperCase();

    // 如果跟原本的 Game Code 相同，不需要檢查
    if (trimmedCode === gameCode) {
      setGameCodeCheckStatus('idle');
      return;
    }

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
  }, [gameCode]);

  // Phase 10: 當 Game Code 變更時，觸發即時檢查（防抖 500ms）
  useEffect(() => {
    if (!newGameCode) {
      setGameCodeCheckStatus('idle');
      return;
    }

    const timeoutId = setTimeout(() => {
      checkGameCode(newGameCode);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [newGameCode, checkGameCode]);

  /**
   * 複製 Game Code 到剪貼簿
   */
  const handleCopyGameCode = async () => {
    try {
      await navigator.clipboard.writeText(gameCode);
      toast.success('遊戲代碼已複製到剪貼簿！');
    } catch (err) {
      console.error('Error copying game code:', err);
      toast.error('複製失敗，請手動複製');
    }
  };

  /**
   * 提交編輯 Game Code
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const trimmedCode = newGameCode.trim().toUpperCase();
      const result = await updateGameCode(gameId, trimmedCode);

      if (result.success) {
        toast.success('遊戲代碼更新成功！');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating game code:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Game Code 顯示 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg">
        <span className="text-xs text-muted-foreground">遊戲代碼</span>
        <span className="text-2xl font-bold font-mono tracking-wider text-primary">
          {gameCode}
        </span>
      </div>

      {/* 複製按鈕 */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyGameCode}
        className="shrink-0"
      >
        <Copy className="h-4 w-4 mr-2" />
        複製
      </Button>

      {/* 編輯對話框 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0">
            <Edit className="h-4 w-4 mr-2" />
            編輯
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>編輯遊戲代碼</DialogTitle>
              <DialogDescription>
                修改此劇本的遊戲代碼。請注意，更改代碼後玩家需要使用新代碼進入遊戲。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="gameCode">
                  新遊戲代碼 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="gameCode"
                    placeholder="ABC123"
                    value={newGameCode}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      setNewGameCode(value);
                    }}
                    disabled={isLoading}
                    required
                    maxLength={6}
                    className="pr-10 font-mono text-lg"
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
                {gameCodeCheckStatus === 'idle' && newGameCode === gameCode && (
                  <p className="text-xs text-muted-foreground">
                    當前代碼：{gameCode}
                  </p>
                )}
                {gameCodeCheckStatus === 'idle' && newGameCode !== gameCode && (
                  <p className="text-xs text-muted-foreground">
                    6 位英數字，玩家將使用此代碼進入遊戲
                  </p>
                )}
              </div>

              {/* 警告訊息 */}
              {newGameCode !== gameCode && (
                <div className="p-3 rounded-lg bg-warning/10 text-foreground text-sm border border-warning/30">
                  ⚠️ 更改遊戲代碼後，玩家需要使用新代碼才能進入遊戲。請確認玩家已知悉新代碼。
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
                  gameCodeCheckStatus === 'invalid' ||
                  newGameCode === gameCode // 如果跟原本一樣，不允許提交
                }
              >
                {isLoading ? '更新中...' : '確認更新'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
