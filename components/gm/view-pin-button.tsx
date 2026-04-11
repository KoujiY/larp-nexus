'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getCharacterPin } from '@/app/actions/characters';
import { updateCharacter } from '@/app/actions/character-update';
import { PIN_REGEX, PIN_ERROR_MESSAGE } from '@/lib/character/pin-constants';
import { toast } from 'sonner';
import { Eye, EyeOff, Copy, Loader2 } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
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

interface ViewPinButtonProps {
  characterId: string;
  characterName: string;
}

export function ViewPinButton({ characterId, characterName }: ViewPinButtonProps) {
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [editPin, setEditPin] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // 載入目前的 PIN
  const loadCurrentPin = useCallback(async () => {
    setIsFetching(true);
    try {
      const result = await getCharacterPin(characterId);
      if (result.success && result.data) {
        setCurrentPin(result.data.pin);
        setEditPin(result.data.pin);
      } else {
        toast.error(result.message || '無法載入 PIN');
      }
    } catch (err) {
      console.error('Error loading PIN:', err);
      toast.error('載入失敗');
    } finally {
      setIsFetching(false);
    }
  }, [characterId]);

  // 當對話框開啟時，載入目前的 PIN
  useEffect(() => {
    if (open) {
      loadCurrentPin();
    } else {
      // 關閉時重設狀態
      setIsEditing(false);
      setShowPin(false);
      setEditPin('');
    }
  }, [open, loadCurrentPin]);

  const handleSave = async () => {
    if (!PIN_REGEX.test(editPin)) {
      toast.error(PIN_ERROR_MESSAGE);
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, {
        pin: editPin,
        hasPinLock: true,
      });

      if (result.success) {
        setCurrentPin(editPin);
        setIsEditing(false);
        toast.success('PIN 碼已更新！');
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating PIN:', err);
      toast.error('發生錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentPin);
    toast.success('PIN 已複製到剪貼簿');
  };

  const handleCancel = () => {
    setEditPin(currentPin);
    setIsEditing(false);
  };

  return (
    <>
      <IconActionButton
        icon={<Eye className="h-[18px] w-[18px]" />}
        label="檢視 PIN"
        onClick={() => setOpen(true)}
        size="sm"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[440px] p-0 gap-0')}
          showCloseButton={false}
        >
          <div className={GM_DIALOG_HEADER_CLASS}>
            <DialogTitle className={GM_DIALOG_TITLE_CLASS}>角色 PIN 碼</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground/70 mt-1">
              <strong className="text-foreground">{characterName}</strong> 的 PIN 碼管理
            </DialogDescription>
          </div>

          <div className={GM_DIALOG_BODY_CLASS}>
            {isFetching ? (
              <div className="py-8 flex flex-col items-center space-y-3">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm">載入中...</p>
              </div>
            ) : !currentPin ? (
              <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-sm text-foreground flex items-start gap-3">
                <Eye className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <span>此角色尚未設定 PIN 碼</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className={GM_LABEL_CLASS}>
                    PIN 碼（4 位數字）
                  </label>
                  <div className="relative">
                    <Input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      value={isEditing ? editPin : currentPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      disabled={!isEditing || isLoading}
                      className={cn(GM_INPUT_CLASS, 'pr-20 text-lg font-mono h-12')}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="cursor-pointer text-muted-foreground/50 hover:text-primary transition-colors"
                        title={showPin ? '隱藏 PIN' : '顯示 PIN'}
                        tabIndex={-1}
                      >
                        {showPin ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="cursor-pointer text-muted-foreground/50 hover:text-primary transition-colors"
                          title="複製 PIN"
                          tabIndex={-1}
                        >
                          <Copy className="h-[18px] w-[18px]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!isEditing && (
                  <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-sm text-foreground">
                    <p className="font-semibold mb-1">提示</p>
                    <p className="text-muted-foreground">
                      您可以將此 PIN 碼複製並傳送給玩家，玩家需要此碼才能查看角色卡。
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={cn(GM_DIALOG_FOOTER_CLASS, 'gap-3')}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isLoading || editPin.length < 4}
                  className={cn(GM_CTA_BUTTON_CLASS, 'flex-1 py-3')}
                >
                  {isLoading ? '儲存中...' : '儲存'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
                >
                  關閉
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className={cn(GM_CTA_BUTTON_CLASS, 'flex-1 py-3')}
                >
                  編輯 PIN
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
