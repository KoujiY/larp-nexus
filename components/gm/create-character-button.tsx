'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createCharacter } from '@/app/actions/characters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Lock } from 'lucide-react';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { PinField, type PinCheckStatus } from '@/components/gm/pin-field';
import { cn } from '@/lib/utils';
import { useGameEditTabContext } from '@/components/gm/game-edit-tabs';
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

type CreateCharacterButtonProps = {
  gameId: string;
  /** 'button'（預設）= header 按鈕；'card' = grid 內的虛線框卡片；'empty-state' = GmEmptyState 內嵌 DashedAddButton */
  variant?: 'button' | 'card' | 'empty-state';
  /** 遊戲進行中時禁止新增角色 */
  isActive?: boolean;
};

export function CreateCharacterButton({ gameId, variant = 'button', isActive }: CreateCharacterButtonProps) {
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
  const [pinCheckStatus, setPinCheckStatus] = useState<PinCheckStatus>('idle');
  const { switchToImportTab } = useGameEditTabContext();

  const handlePinStatusChange = useCallback((status: PinCheckStatus) => {
    setPinCheckStatus(status);
  }, []);

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
        setPinCheckStatus('idle');
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

  // 遊戲進行中：顯示提示卡片或禁用按鈕
  if (isActive) {
    if (variant === 'card') {
      return (
        <div className="w-full min-h-[180px] py-5 border-2 border-dashed border-border/20 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
          <Lock className="h-6 w-6" />
          <span className="text-xs font-bold">遊戲進行中無法新增角色</span>
        </div>
      );
    }
    if (variant === 'empty-state') {
      return (
        <div className="max-w-xs py-4 text-center text-xs text-muted-foreground/50 font-bold">
          遊戲進行中無法新增角色
        </div>
      );
    }
    return (
      <Button
        disabled
        className="bg-primary/50 text-primary-foreground px-6 py-3 rounded-xl font-bold opacity-50 cursor-not-allowed"
      >
        <UserPlus className="h-4 w-4 mr-2" />
        新增角色
      </Button>
    );
  }

  const trigger = variant === 'card' ? (
    <DashedAddButton
      label="建立新角色"
      onClick={() => setOpen(true)}
      className="min-h-[180px] py-5"
    />
  ) : variant === 'empty-state' ? (
    <DashedAddButton
      label="建立第一個角色"
      onClick={() => setOpen(true)}
      className="max-w-xs py-4"
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
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[520px] p-0 gap-0')}
          showCloseButton={false}
        >
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className={GM_DIALOG_HEADER_CLASS}>
              <DialogTitle className={GM_DIALOG_TITLE_CLASS}>新增角色</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground/70 mt-1">
                建立後可在編輯頁面設定詳細資訊
              </DialogDescription>
            </div>

            {/* Body */}
            <div className={cn(GM_DIALOG_BODY_CLASS, 'max-h-[calc(90vh-200px)] overflow-y-auto')}>
              {/* 角色名稱 */}
              <div className="space-y-2">
                <label className={GM_LABEL_CLASS}>
                  角色名稱 <span className="text-primary text-base ml-1 leading-none">*</span>
                </label>
                <Input
                  placeholder="例如：流浪騎士 艾德溫"
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

              {/* 角色描述 */}
              <div className="space-y-2">
                <label className={GM_LABEL_CLASS}>角色描述</label>
                <Textarea
                  placeholder="描述角色的初步背景或核心特質..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  disabled={isLoading}
                  rows={3}
                  className={cn(GM_INPUT_CLASS, 'h-auto py-4 resize-none')}
                />
              </div>

              {/* PIN 開關區塊 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">啟用 PIN 解鎖</span>
                      <span className="text-[11px] text-muted-foreground/60">
                        防止其他玩家誤觸或窺探內容
                      </span>
                    </div>
                  </div>
                  <Switch
                    checked={formData.hasPinLock}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, hasPinLock: checked }))
                    }
                    disabled={isLoading}
                    className="cursor-pointer"
                  />
                </div>

                {/* PIN 輸入欄位（條件顯示） */}
                {formData.hasPinLock && (
                  <PinField
                    gameId={gameId}
                    value={formData.pin}
                    onChange={(value) =>
                      setFormData((prev) => ({ ...prev, pin: value }))
                    }
                    disabled={isLoading}
                    required={formData.hasPinLock}
                    placeholder="輸入 4 位數字"
                    idleHint="請記住此 PIN 碼，玩家需要此碼才能查看角色卡"
                    onStatusChange={handlePinStatusChange}
                  />
                )}
              </div>

              {/* AI 匯入引導 */}
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                <p className="text-sm text-muted-foreground">
                  有現成的角色資料？
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      switchToImportTab();
                    }}
                    className="text-primary font-bold ml-1 hover:underline cursor-pointer"
                  >
                    前往 AI 匯入
                  </button>
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
                  (formData.hasPinLock &&
                    (pinCheckStatus === 'checking' ||
                      pinCheckStatus === 'unavailable' ||
                      pinCheckStatus === 'invalid'))
                }
                className={GM_CTA_BUTTON_CLASS}
              >
                {isLoading ? '建立中...' : '建立角色'}
              </button>
            </div>
          </form>

          {/* 底部漸層裝飾線 */}
          <div className="h-1 w-full bg-linear-to-r from-transparent via-primary/20 to-transparent" />
        </DialogContent>
      </Dialog>
    </>
  );
}
