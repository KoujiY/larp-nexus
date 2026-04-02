/**
 * Phase 8.6: GM 端時效性效果區塊
 * 顯示角色所有活躍的時效性效果，包含倒數計時與進度條
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTemporaryEffects, checkExpiredEffects } from '@/app/actions/temporary-effects';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import { Clock, Zap, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GM_SECTION_TITLE_CLASS } from '@/lib/styles/gm-form';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import type { TemporaryEffect } from '@/types/character';
import type { BaseEvent } from '@/types/event';

interface TemporaryEffectsCardProps {
  characterId: string;
}

/**
 * 時效性效果區塊
 */
export function TemporaryEffectsCard({ characterId }: TemporaryEffectsCardProps) {
  const [effects, setEffects] = useState<Array<TemporaryEffect & { remainingSeconds: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEffects = useCallback(async () => {
    try {
      setError(null);
      const result = await getTemporaryEffects(characterId);
      if (result.success && result.data) {
        setEffects(result.data.effects);
      } else {
        setError(result.message || '載入失敗');
      }
    } catch (err) {
      console.error('[TemporaryEffectsCard] loadEffects error:', err);
      setError('載入時發生錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    loadEffects();
  }, [loadEffects]);

  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'character.affected' || event.type === 'skill.used' || event.type === 'effect.expired') {
      loadEffects();
    }
  });

  const isCheckingExpiredRef = useRef(false);

  useEffect(() => {
    if (effects.length === 0) return;

    const timer = setInterval(() => {
      setEffects((prevEffects) => {
        const updated = prevEffects.map((effect) => ({
          ...effect,
          remainingSeconds: Math.max(0, effect.remainingSeconds - 1),
        }));

        const hasNewlyExpired = updated.some((effect) => effect.remainingSeconds <= 0);
        if (hasNewlyExpired && !isCheckingExpiredRef.current) {
          isCheckingExpiredRef.current = true;
          setTimeout(async () => {
            try {
              await checkExpiredEffects(characterId);
            } finally {
              isCheckingExpiredRef.current = false;
            }
          }, 0);
        }

        return updated.filter((effect) => effect.remainingSeconds > 0);
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [effects.length, characterId]);

  /** 格式化剩餘時間 */
  const formatRemainingTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  /** 取得變化量顯示文字 */
  const getChangeText = (effect: TemporaryEffect): string => {
    const { statChangeTarget, deltaValue, deltaMax } = effect;
    if (statChangeTarget === 'value' && deltaValue !== undefined) {
      return deltaValue > 0 ? `+${deltaValue}` : `${deltaValue}`;
    }
    if (statChangeTarget === 'maxValue' && deltaMax !== undefined) {
      return deltaMax > 0 ? `最大值 +${deltaMax}` : `最大值 ${deltaMax}`;
    }
    return '未知變化';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          進行中的時效性效果
        </h2>
        <p className="text-sm text-muted-foreground">載入中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          進行中的時效性效果
        </h2>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (effects.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          進行中的時效性效果
        </h2>
        <GmEmptyState
          icon={<Clock className="h-10 w-10" />}
          title="目前沒有進行中的效果"
          description="當玩家使用帶有持續時間的技能或道具時，效果會顯示在這裡。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className={GM_SECTION_TITLE_CLASS}>
        <span className="w-1 h-5 bg-primary rounded-full" />
        進行中的時效性效果
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {effects.map((effect) => {
          // 估算進度（假設初始 duration 來自 effect，fallback 用 remainingSeconds）
          const totalDuration = effect.duration ?? effect.remainingSeconds;
          const progressPercent = totalDuration > 0
            ? Math.round((effect.remainingSeconds / totalDuration) * 100)
            : 0;
          const isUrgent = effect.remainingSeconds < 60;

          return (
            <div
              key={effect.id}
              className="relative overflow-hidden bg-card p-6 rounded-2xl shadow-sm border border-border/10 hover:shadow-md transition-shadow"
            >
              {/* 上方：來源 + 效果值 */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">
                    {effect.sourceType === 'skill' ? '技能' : '道具'}
                  </p>
                  <h3 className="text-xl font-extrabold text-foreground">
                    {effect.sourceName}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">
                    {effect.targetStat}
                  </p>
                  <span className="flex items-center gap-1 text-primary text-sm font-bold">
                    {effect.sourceType === 'skill' ? (
                      <Zap className="h-4 w-4" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
                    {getChangeText(effect)}
                  </span>
                </div>
              </div>

              {/* 進度條 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className={cn(
                    'font-bold uppercase tracking-wider',
                    isUrgent ? 'text-destructive' : 'text-foreground',
                  )}>
                    剩餘 {formatRemainingTime(effect.remainingSeconds)}
                  </span>
                  <span className="text-muted-foreground font-medium">
                    {progressPercent}%
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isUrgent
                        ? 'bg-destructive'
                        : 'bg-linear-to-r from-primary to-primary/60',
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* 施放者 */}
              <div className="mt-3 text-[11px] text-muted-foreground">
                施放者：<span className="font-medium text-foreground">{effect.sourceCharacterName}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
