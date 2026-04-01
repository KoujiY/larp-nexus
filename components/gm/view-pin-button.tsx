'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCharacterPin } from '@/app/actions/characters';
import { updateCharacter } from '@/app/actions/character-update';
import { toast } from 'sonner';
import { Eye } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
    if (!/^\d{4,6}$/.test(editPin)) {
      toast.error('PIN 碼必須為 4-6 位數字');
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
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:bg-muted"
              >
                <Eye className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">檢視 PIN</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>角色 PIN 碼</DialogTitle>
          <DialogDescription>
            <strong>{characterName}</strong> 的 PIN 碼管理
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <div className="py-8 text-center text-muted-foreground">
            載入中...
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {!currentPin ? (
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-foreground text-sm">
                ⚠️ 此角色尚未設定 PIN 碼
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="pin">
                    PIN 碼 <span className="text-xs text-muted-foreground">（4-6 位數字）</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="pin"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      value={isEditing ? editPin : currentPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      disabled={!isEditing || isLoading}
                      className="pr-24 text-lg font-mono"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title={showPin ? '隱藏 PIN' : '顯示 PIN'}
                        tabIndex={-1}
                      >
                        {showPin ? '🙈' : '👁️'}
                      </button>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="複製 PIN"
                          tabIndex={-1}
                        >
                          📋
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!isEditing && (
                  <div className="p-3 rounded-lg bg-info/10 text-foreground text-sm border border-info/30">
                    💡 <strong>提示</strong>
                    <p className="mt-1">
                      您可以將此 PIN 碼複製並傳送給玩家，玩家需要此碼才能查看角色卡。
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex space-x-2">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isLoading || editPin.length < 4}
                className="flex-1"
              >
                {isLoading ? '儲存中...' : '儲存'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                關閉
              </Button>
              <Button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex-1"
              >
                ✏️ 編輯 PIN
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
