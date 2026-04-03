'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createGame, checkGameCodeAvailability } from '@/app/actions/games';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  generateGameCodeClient,
  isValidGameCodeFormat,
} from '@/lib/game/generate-game-code-client';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { Plus, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_INPUT_ERROR_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_DIALOG_HEADER_CLASS,
  GM_DIALOG_TITLE_CLASS,
  GM_DIALOG_BODY_CLASS,
  GM_DIALOG_FOOTER_CLASS,
  GM_CANCEL_BUTTON_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';

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
    gameCode: '',
    randomContestMaxValue: 100,
  });

  // Game Code 即時檢查狀態
  const [gameCodeCheckStatus, setGameCodeCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'
  >('idle');

  // 當對話框打開時，自動生成一個隨機的 Game Code
  useEffect(() => {
    if (open && !formData.gameCode) {
      const newGameCode = generateGameCodeClient();
      setFormData((prev) => ({ ...prev, gameCode: newGameCode }));
      setGameCodeCheckStatus('idle');
    }
  }, [open, formData.gameCode]);

  // Game Code 即時檢查（防抖 500ms）
  const checkGameCode = useCallback(async (code: string) => {
    const trimmedCode = code.trim().toUpperCase();

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

  // 當 Game Code 變更時，觸發即時檢查（防抖 500ms）
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
      const result = await createGame({
        name: formData.name,
        description: formData.description,
        gameCode: formData.gameCode,
        randomContestMaxValue: formData.randomContestMaxValue,
      });

      if (result.success && result.data) {
        setOpen(false);
        setFormData({ name: '', description: '', gameCode: '', randomContestMaxValue: 100 });
        setGameCodeCheckStatus('idle');
        router.refresh();
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

  const isGameCodeError = gameCodeCheckStatus === 'unavailable' || gameCodeCheckStatus === 'invalid';

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
      <DialogContent
        className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[520px] p-0 gap-0')}
        showCloseButton={false}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className={GM_DIALOG_HEADER_CLASS}>
            <DialogTitle className={GM_DIALOG_TITLE_CLASS}>建立新劇本</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              建立一個新的 LARP 劇本，開始管理角色與事件
            </DialogDescription>
          </div>

          {/* Body */}
          <div className={cn(GM_DIALOG_BODY_CLASS, 'max-h-[calc(90vh-200px)] overflow-y-auto')}>
            {/* 劇本名稱 */}
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>
                劇本名稱 <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="例：末日餘暉"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                disabled={isLoading}
                required
                autoFocus
                className={cn(GM_INPUT_CLASS, 'h-12')}
              />
            </div>

            {/* 遊戲代碼 */}
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>遊戲代碼</label>
              <div className="relative">
                <Input
                  placeholder="ABC123"
                  value={formData.gameCode}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    setFormData((prev) => ({ ...prev, gameCode: value }));
                  }}
                  disabled={isLoading}
                  required
                  maxLength={6}
                  className={cn(
                    GM_INPUT_CLASS,
                    'h-12 pr-10 font-mono font-bold',
                    isGameCodeError && GM_INPUT_ERROR_CLASS,
                  )}
                />
                {/* 檢查狀態指示器 */}
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
              {/* 檢查狀態提示 */}
              <p className="text-xs min-h-5">
                {gameCodeCheckStatus === 'checking' && (
                  <span className="text-muted-foreground">檢查中...</span>
                )}
                {gameCodeCheckStatus === 'available' && (
                  <span className="font-medium text-success">此代碼可以使用</span>
                )}
                {gameCodeCheckStatus === 'unavailable' && (
                  <span className="font-medium text-destructive">此代碼已被其他劇本使用，請換一個</span>
                )}
                {gameCodeCheckStatus === 'invalid' && (
                  <span className="text-warning">代碼格式錯誤（需要 6 位英數字）</span>
                )}
                {gameCodeCheckStatus === 'idle' && (
                  <span className="text-muted-foreground">6 位英數字，玩家將使用此代碼進入遊戲</span>
                )}
              </p>
            </div>

            {/* 劇本描述 */}
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>劇本描述</label>
              <Textarea
                placeholder="輸入關於此劇本的詳細背景或介紹..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                disabled={isLoading}
                rows={5}
                className={cn(GM_INPUT_CLASS, 'h-auto py-4 resize-none')}
              />
            </div>

            {/* 最大檢定值 */}
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>最大檢定值</label>
              <Input
                type="number"
                value={formData.randomContestMaxValue}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    randomContestMaxValue: parseInt(e.target.value, 10) || 100,
                  }))
                }
                disabled={isLoading}
                min={1}
                className={cn(GM_INPUT_CLASS, 'h-12')}
              />
              <p className="text-[11px] text-muted-foreground/60 font-medium tracking-wide">
                對抗檢定時的擲骰上限值（預設 100）
              </p>
            </div>

            {/* 全域錯誤 */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-foreground text-sm border border-destructive/20">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
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
                gameCodeCheckStatus === 'invalid'
              }
              className={GM_CTA_BUTTON_CLASS}
            >
              {isLoading ? '建立中...' : '建立劇本'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
