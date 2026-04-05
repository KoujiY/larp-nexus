/**
 * 玩家端活躍效果面板
 *
 * 全寬卡片式顯示所有活躍的時效性效果，包含倒數計時。
 * 設計對齊 Stitch Ethereal Manuscript 風格：
 * - 琥珀豎線區段標題
 * - 全寬卡片取代行內 Badge
 * - 緊急狀態（<1 分鐘）以琥珀邊框 + 漸層背景 + 紅色倒數強調
 * - 自身來源顯示技能/道具名稱，他人來源顯示「未知來源」
 */

'use client';

import { useEffect, useState } from 'react';
import type { TemporaryEffect } from '@/types/character';

interface ActiveEffectsPanelProps {
  effects?: TemporaryEffect[];
  /** 當前角色 ID，用於判斷效果是否來自自己 */
  characterId: string;
  /** 當有效果倒數歸零時觸發，用於主動執行伺服器端過期檢查 */
  onEffectExpired?: () => void;
}

/**
 * 從 effects props 計算帶剩餘時間的活躍效果列表
 */
function computeActiveEffects(
  effects?: TemporaryEffect[]
): Array<TemporaryEffect & { remainingSeconds: number }> {
  if (!effects || effects.length === 0) return [];

  const now = new Date();
  return effects
    .filter((effect) => !effect.isExpired && new Date(effect.expiresAt) > now)
    .map((effect) => {
      const remainingMs = new Date(effect.expiresAt).getTime() - now.getTime();
      const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
      return { ...effect, remainingSeconds };
    });
}

/**
 * 格式化剩餘時間（HH:MM:SS 或 MM:SS）
 */
function formatRemainingTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * 取得變化量顯示文字
 */
function getChangeText(effect: TemporaryEffect): string {
  const { statChangeTarget, deltaValue, deltaMax } = effect;

  if (statChangeTarget === 'value' && deltaValue !== undefined) {
    return deltaValue > 0 ? `+${deltaValue}` : `${deltaValue}`;
  }

  if (statChangeTarget === 'maxValue' && deltaMax !== undefined) {
    return deltaMax > 0 ? `最大值 +${deltaMax}` : `最大值 ${deltaMax}`;
  }

  return '';
}

export function ActiveEffectsPanel({ effects, characterId, onEffectExpired }: ActiveEffectsPanelProps) {
  const [activeEffects, setActiveEffects] = useState<Array<TemporaryEffect & { remainingSeconds: number }>>(
    () => computeActiveEffects(effects)
  );
  const [prevEffects, setPrevEffects] = useState(effects);

  /** 當 effects props 變化時重新計算 */
  if (effects !== prevEffects) {
    setPrevEffects(effects);
    setActiveEffects(computeActiveEffects(effects));
  }

  /** 每秒更新倒數計時 */
  useEffect(() => {
    if (activeEffects.length === 0) return;

    const timer = setInterval(() => {
      setActiveEffects((prev) => {
        const updated = prev.map((effect) => ({
          ...effect,
          remainingSeconds: Math.max(0, effect.remainingSeconds - 1),
        }));

        const hasNewlyExpired = updated.some((effect) => effect.remainingSeconds <= 0);
        if (hasNewlyExpired) {
          setTimeout(() => onEffectExpired?.(), 0);
        }

        return updated.filter((effect) => effect.remainingSeconds > 0);
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeEffects.length, onEffectExpired]);

  if (activeEffects.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 space-y-6">
      {/* 區段標題 */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-primary rounded-full" />
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          活躍效果
        </h3>
      </div>

      {/* 效果卡片列表 */}
      <div className="space-y-4">
        {activeEffects.map((effect) => {
          const isUrgent = effect.remainingSeconds < 60;
          const isGmSource = effect.sourceType === 'preset_event';
          const isSelf = effect.sourceCharacterId === characterId;
          // GM 預設事件：sourceName 為事件名稱時顯示，否則顯示未知來源
          const displayName = isGmSource
            ? (effect.sourceName && effect.sourceName !== '預設事件' ? effect.sourceName : '未知來源')
            : isSelf ? effect.sourceName : '未知來源';

          return (
            <div
              key={effect.id}
              className={`flex items-center justify-between p-4 rounded-xl transition-all duration-300 ${
                isUrgent
                  ? 'bg-popover border border-primary/20 bg-linear-to-r from-primary/5 to-transparent'
                  : 'bg-card border border-border/10'
              }`}
            >
              {/* 左側：效果資訊 */}
              <div className="min-w-0 flex-1">
                <h5 className="font-bold text-foreground truncate">
                  {displayName}
                </h5>
                <p className="text-sm text-muted-foreground">
                  效果:{' '}
                  <span className={`font-mono font-bold ${isUrgent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {effect.targetStat} {getChangeText(effect)}
                  </span>
                </p>
              </div>

              {/* 右側：倒數計時 */}
              <div className="text-right shrink-0 ml-4">
                <p className="text-[10px] font-bold text-muted-foreground/50 tracking-widest uppercase mb-1">
                  剩餘時間
                </p>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    isUrgent ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {formatRemainingTime(effect.remainingSeconds)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
