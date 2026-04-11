'use client';

/**
 * GM 側 PIN 輸入欄位（共用元件）
 *
 * 包含完整的 PIN 驗證邏輯：
 * - 格式驗證（4 位數字）
 * - 防抖 500ms 可用性檢查（checkPinAvailability）
 * - 5 狀態機：idle / checking / available / unavailable / invalid
 * - 可視切換（Eye / EyeOff icon）
 *
 * 使用場景：
 * - create-character-button.tsx（建立角色 Dialog）
 * - basic-settings-tab.tsx（角色編輯頁 PIN 設定）
 */

import { useState, useEffect, useCallback } from 'react';
import { checkPinAvailability } from '@/app/actions/characters';
import { Input } from '@/components/ui/input';
import { Check, X, AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GM_INPUT_CLASS, GM_LABEL_CLASS } from '@/lib/styles/gm-form';

type PinCheckStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid';

type PinFieldProps = {
  /** 所屬遊戲 ID */
  gameId: string;
  /** 排除的角色 ID（編輯時排除自身） */
  excludeCharacterId?: string;
  /** PIN 值 */
  value: string;
  /** PIN 變更回呼 */
  onChange: (value: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** placeholder */
  placeholder?: string;
  /** idle 狀態提示文字 */
  idleHint?: string;
  /** PIN 檢查狀態變更回呼（讓父元件控制 submit 按鈕） */
  onStatusChange?: (status: PinCheckStatus) => void;
  /** 額外的 className */
  className?: string;
};

/**
 * PIN 輸入欄位（含即時可用性檢查）
 */
export function PinField({
  gameId,
  excludeCharacterId,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = '輸入 4 位數字',
  idleHint = '請設定 PIN 碼，玩家需要此碼才能查看角色卡',
  onStatusChange,
  className,
}: PinFieldProps) {
  const [showPin, setShowPin] = useState(false);
  const [pinCheckStatus, setPinCheckStatusRaw] = useState<PinCheckStatus>('idle');

  // 包裝 setter：每次狀態變更同步通知父元件，避免 useEffect cascading render
  const setPinCheckStatus = useCallback(
    (status: PinCheckStatus) => {
      setPinCheckStatusRaw(status);
      onStatusChange?.(status);
    },
    [onStatusChange],
  );

  // PIN 即時檢查（防抖 500ms）
  const checkPin = useCallback(
    async (pin: string) => {
      const trimmedPin = pin.trim();
      if (!trimmedPin || trimmedPin.length !== 4 || !/^\d{4}$/.test(trimmedPin)) {
        setPinCheckStatus('invalid');
        return;
      }
      setPinCheckStatus('checking');
      try {
        const result = await checkPinAvailability(gameId, trimmedPin, excludeCharacterId);
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
    [gameId, excludeCharacterId, setPinCheckStatus],
  );

  // 防抖 PIN 檢查：useEffect 僅管理 timeout lifecycle，
  // setState 在 setTimeout callback 中（非同步），不觸發 set-state-in-effect
  useEffect(() => {
    if (!value) return;
    const timeoutId = setTimeout(() => {
      checkPin(value);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [value, checkPin]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/\D/g, '').slice(0, 4);
    // value 清空時立即設為 idle（event handler 中，非 effect）
    if (!newValue) {
      setPinCheckStatus('idle');
    }
    onChange(newValue);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <label className={GM_LABEL_CLASS}>
        設定 PIN {required && <span className="text-primary text-base ml-1 leading-none">*</span>}
      </label>
      <div className="relative">
        <Input
          type={showPin ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]{4}"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className={cn(GM_INPUT_CLASS, 'pr-20')}
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
            <Loader2 className="h-[18px] w-[18px] text-muted-foreground animate-spin" />
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
      {/* 狀態提示文字 */}
      <p className="text-xs min-h-5">
        {pinCheckStatus === 'available' && (
          <span className="font-semibold text-success">PIN 碼可用</span>
        )}
        {pinCheckStatus === 'unavailable' && (
          <span className="font-semibold text-destructive">此 PIN 已被使用</span>
        )}
        {pinCheckStatus === 'invalid' && (
          <span className="text-warning">PIN 格式錯誤（需要 4 位數字）</span>
        )}
        {pinCheckStatus === 'idle' && (
          <span className="text-muted-foreground">{idleHint}</span>
        )}
        {pinCheckStatus === 'checking' && (
          <span className="text-muted-foreground">檢查中...</span>
        )}
      </p>
    </div>
  );
}

export type { PinCheckStatus };
