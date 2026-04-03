'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateGameCode, checkGameCodeAvailability } from '@/app/actions/games';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Copy, Pencil, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { isValidGameCodeFormat } from '@/lib/game/generate-game-code-client';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_DIALOG_HEADER_CLASS,
  GM_DIALOG_TITLE_CLASS,
  GM_DIALOG_BODY_CLASS,
  GM_DIALOG_FOOTER_CLASS,
  GM_CANCEL_BUTTON_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';

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
    <div className={`inline-flex items-center gap-3 px-4 py-2 bg-muted/50 border border-border/30 rounded-xl ${className}`}>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Game Code:</span>
      <span className="text-xl font-black font-mono tracking-tight text-foreground">
        {gameCode}
      </span>
      <div className="flex items-center gap-1 border-l border-border/30 ml-2 pl-3">
        <IconActionButton
          icon={<Copy className="h-4 w-4" />}
          label="複製遊戲代碼"
          onClick={handleCopyGameCode}
          size="sm"
        />
        <IconActionButton
          icon={<Pencil className="h-4 w-4" />}
          label="編輯遊戲代碼"
          onClick={() => setOpen(true)}
          size="sm"
        />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[480px] p-0 gap-0')}
          showCloseButton={false}
        >
          <form onSubmit={handleSubmit}>
            <div className={GM_DIALOG_HEADER_CLASS}>
              <DialogTitle className={GM_DIALOG_TITLE_CLASS}>編輯遊戲代碼</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground/70 mt-1">
                更改代碼後玩家需要使用新代碼進入遊戲
              </DialogDescription>
            </div>

            <div className={GM_DIALOG_BODY_CLASS}>
              <div className="space-y-2">
                <label className={GM_LABEL_CLASS}>
                  新遊戲代碼 <span className="text-primary text-base ml-1 leading-none">*</span>
                </label>
                <div className="relative">
                  <Input
                    placeholder="ABC123"
                    value={newGameCode}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      setNewGameCode(value);
                    }}
                    disabled={isLoading}
                    required
                    maxLength={6}
                    className={cn(GM_INPUT_CLASS, 'pr-12 font-mono text-lg h-12')}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {gameCodeCheckStatus === 'checking' && (
                      <Loader2 className="h-[18px] w-[18px] text-muted-foreground animate-spin" />
                    )}
                    {gameCodeCheckStatus === 'available' && (
                      <Check className="h-[18px] w-[18px] text-success" />
                    )}
                    {gameCodeCheckStatus === 'unavailable' && (
                      <X className="h-[18px] w-[18px] text-destructive" />
                    )}
                    {gameCodeCheckStatus === 'invalid' && (
                      <AlertTriangle className="h-[18px] w-[18px] text-warning" />
                    )}
                  </div>
                </div>
                <p className="text-xs min-h-5">
                  {gameCodeCheckStatus === 'checking' && (
                    <span className="text-muted-foreground">檢查中...</span>
                  )}
                  {gameCodeCheckStatus === 'available' && (
                    <span className="font-semibold text-success">此代碼可以使用</span>
                  )}
                  {gameCodeCheckStatus === 'unavailable' && (
                    <span className="font-semibold text-destructive">此代碼已被使用</span>
                  )}
                  {gameCodeCheckStatus === 'invalid' && (
                    <span className="text-warning">代碼格式錯誤（需要 6 位英數字）</span>
                  )}
                  {gameCodeCheckStatus === 'idle' && newGameCode === gameCode && (
                    <span className="text-muted-foreground">當前代碼：{gameCode}</span>
                  )}
                  {gameCodeCheckStatus === 'idle' && newGameCode !== gameCode && (
                    <span className="text-muted-foreground">6 位英數字，玩家將使用此代碼進入遊戲</span>
                  )}
                </p>
              </div>

              {newGameCode !== gameCode && (
                <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-sm text-foreground flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <span>更改遊戲代碼後，玩家需要使用新代碼才能進入遊戲。請確認玩家已知悉新代碼。</span>
                </div>
              )}
            </div>

            <div className={GM_DIALOG_FOOTER_CLASS}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isLoading}
                className={GM_CANCEL_BUTTON_CLASS}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={
                  isLoading ||
                  gameCodeCheckStatus === 'checking' ||
                  gameCodeCheckStatus === 'unavailable' ||
                  gameCodeCheckStatus === 'invalid' ||
                  newGameCode === gameCode
                }
                className={GM_CTA_BUTTON_CLASS}
              >
                {isLoading ? '更新中...' : '確認更新'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
