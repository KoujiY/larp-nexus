'use client';

/**
 * 角色編輯 — Tab 1：基本設定
 *
 * 欄位：角色名稱（必填）、角色描述、PIN 解鎖保護、人格特質
 * 佈局：平坦 flex-col gap-8（無 Card wrapper）
 * 樣式：GM_LABEL_CLASS / GM_INPUT_CLASS 統一風格
 *
 * 從 character-edit-form.tsx 拆出，僅保留基本設定相關邏輯。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { checkPinAvailability } from '@/app/actions/characters';
import { useFormGuard } from '@/hooks/use-form-guard';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Check, X, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_SECTION_TITLE_CLASS,
} from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import type { CharacterData } from '@/types/character';

interface BasicSettingsTabProps {
  character: CharacterData;
  gameId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

type PinCheckStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid';

/**
 * Tab 1：基本設定（名稱、描述、PIN、人格特質）
 */
export function BasicSettingsTab({ character, gameId, onDirtyChange }: BasicSettingsTabProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinCheckStatus, setPinCheckStatus] = useState<PinCheckStatus>('idle');

  const initialData = useMemo(() => ({
    name: character.name,
    description: character.description || '',
    hasPinLock: character.hasPinLock,
    pin: '',
    personality: character.publicInfo?.personality || '',
  }), [character]);

  const [formData, setFormData] = useState(initialData);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  // 外部 props 變化時同步
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData,
    currentData: formData,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // ── PIN 即時檢查 ──

  const checkPin = useCallback(
    async (pin: string) => {
      const trimmedPin = pin.trim();
      if (!trimmedPin || trimmedPin.length < 4 || !/^\d{4,6}$/.test(trimmedPin)) {
        setPinCheckStatus('invalid');
        return;
      }
      setPinCheckStatus('checking');
      try {
        const result = await checkPinAvailability(gameId, trimmedPin, character.id);
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
    [gameId, character.id],
  );

  useEffect(() => {
    if (!formData.hasPinLock || !formData.pin) {
      setPinCheckStatus('idle');
      return;
    }
    const timeoutId = setTimeout(() => { checkPin(formData.pin); }, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.hasPinLock, formData.pin, checkPin]);

  // ── Submit ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const updateData: {
        name: string;
        description: string;
        hasPinLock: boolean;
        pin?: string;
        publicInfo?: { personality: string };
      } = {
        name: formData.name,
        description: formData.description,
        hasPinLock: formData.hasPinLock,
        publicInfo: { personality: formData.personality },
      };

      if (formData.pin) {
        updateData.pin = formData.pin;
      }

      const result = await updateCharacter(character.id, updateData);

      if (result.success) {
        toast.success('基本設定已儲存');
        resetDirty();
        router.refresh();
        setFormData((prev) => ({ ...prev, pin: '' }));
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating character:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const update = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* 1. 角色名稱 */}
      <section>
        <label className={GM_LABEL_CLASS}>
          角色名稱 <span className="text-destructive">*</span>
        </label>
        <Input
          value={formData.name}
          onChange={(e) => update('name', e.target.value)}
          disabled={isLoading}
          required
          placeholder="例：瑪格麗特夫人"
          className={GM_INPUT_CLASS}
        />
      </section>

      {/* 2. 角色描述 */}
      <section>
        <label className={GM_LABEL_CLASS}>角色描述</label>
        <Textarea
          value={formData.description}
          onChange={(e) => update('description', e.target.value)}
          disabled={isLoading}
          rows={8}
          className="bg-muted border-none shadow-none px-4 py-3 font-semibold focus-visible:ring-primary resize-none"
          placeholder="輸入角色的背景故事、性格特徵等..."
        />
        <p className="text-[11px] text-muted-foreground/60 font-medium mt-2">
          可輸入多行文字，建議不超過 1000 字
        </p>
      </section>

      {/* 3. 人格特質 */}
      <section>
        <label className={GM_LABEL_CLASS}>人格特質</label>
        <Textarea
          value={formData.personality}
          onChange={(e) => update('personality', e.target.value)}
          disabled={isLoading}
          rows={4}
          className="bg-muted border-none shadow-none px-4 py-3 font-semibold focus-visible:ring-primary resize-none"
          placeholder="描述角色的行為準則與個性..."
        />
      </section>

      {/* 4. PIN 解鎖保護 */}
      <section className={cn(GM_SECTION_CARD_CLASS, 'max-w-lg space-y-6')}>
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="text-sm font-bold tracking-tight">PIN 解鎖保護</h3>
            <p className="text-xs text-muted-foreground">
              啟用後玩家需輸入 PIN 才能查看角色卡
            </p>
          </div>
          <Switch
            checked={formData.hasPinLock}
            onCheckedChange={(checked) => update('hasPinLock', checked)}
            disabled={isLoading}
            className="cursor-pointer"
          />
        </div>

        {/* PIN 輸入 */}
        {formData.hasPinLock && (
          <div className="pt-4 border-t border-border/15 space-y-3">
            <div className="relative max-w-xs">
              <Input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                placeholder={character.hasPinLock ? '留空保持不變' : '4-6 位數字'}
                value={formData.pin}
                onChange={(e) =>
                  update('pin', e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={isLoading}
                required={formData.hasPinLock && !character.hasPinLock}
                className={GM_INPUT_CLASS}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="cursor-pointer text-muted-foreground/50 hover:text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
                {pinCheckStatus === 'checking' && (
                  <span className="text-muted-foreground text-sm animate-pulse">…</span>
                )}
                {pinCheckStatus === 'available' && (
                  <Check className="h-[18px] w-[18px] text-success" />
                )}
                {pinCheckStatus === 'unavailable' && (
                  <X className="h-[18px] w-[18px] text-destructive" />
                )}
                {pinCheckStatus === 'invalid' && (
                  <AlertTriangle className="h-[18px] w-[18px] text-warning" />
                )}
              </div>
            </div>
            {/* 狀態提示文字（固定位置，避免版面跳動） */}
            <p className="text-xs">
              {pinCheckStatus === 'available' && (
                <span className="font-semibold text-success">✓ PIN 碼可用</span>
              )}
              {pinCheckStatus === 'unavailable' && (
                <span className="font-semibold text-destructive">此 PIN 已被使用</span>
              )}
              {pinCheckStatus === 'invalid' && (
                <span className="text-warning">PIN 格式錯誤（需要 4-6 位數字）</span>
              )}
              {pinCheckStatus === 'idle' && (
                <span className="text-muted-foreground">
                  {character.hasPinLock
                    ? '輸入新的 PIN 碼以修改，或留空保持原 PIN 不變'
                    : '請設定 PIN 碼，玩家需要此碼才能查看角色卡'}
                </span>
              )}
              {pinCheckStatus === 'checking' && (
                <span className="text-muted-foreground">檢查中...</span>
              )}
            </p>
          </div>
        )}
      </section>
    </form>
  );
}
