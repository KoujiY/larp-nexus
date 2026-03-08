/**
 * Phase 8.7: 玩家端活躍效果面板
 * 顯示所有活躍的時效性效果，包含倒數計時
 */

'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, Package } from 'lucide-react';
import type { TemporaryEffect } from '@/types/character';

interface ActiveEffectsPanelProps {
  effects?: TemporaryEffect[];
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
 * 活躍效果面板組件
 *
 * @param effects - 時效性效果列表
 */
export function ActiveEffectsPanel({ effects, onEffectExpired }: ActiveEffectsPanelProps) {
  // 使用 lazy initializer 確保首次掛載時就正確計算活躍效果
  const [activeEffects, setActiveEffects] = useState<Array<TemporaryEffect & { remainingSeconds: number }>>(
    () => computeActiveEffects(effects)
  );
  const [prevEffects, setPrevEffects] = useState(effects);

  /**
   * 當 effects props 變化時重新計算
   * （配合 lazy initializer，首次掛載和後續更新都能正確處理）
   */
  if (effects !== prevEffects) {
    setPrevEffects(effects);
    setActiveEffects(computeActiveEffects(effects));
  }

  /**
   * 每秒更新倒數計時
   * 當有效果倒數歸零時，觸發 onEffectExpired 回調以執行伺服器端過期檢查
   */
  useEffect(() => {
    if (activeEffects.length === 0) return;

    const timer = setInterval(() => {
      setActiveEffects((prevEffects) => {
        const updated = prevEffects.map((effect) => ({
          ...effect,
          remainingSeconds: Math.max(0, effect.remainingSeconds - 1),
        }));

        // 檢查是否有效果剛好歸零
        const hasNewlyExpired = updated.some((effect) => effect.remainingSeconds <= 0);

        // 如果有效果歸零，觸發伺服器端過期檢查
        if (hasNewlyExpired) {
          // 使用 setTimeout 避免在 setState 回調中直接執行副作用
          setTimeout(() => onEffectExpired?.(), 0);
        }

        return updated.filter((effect) => effect.remainingSeconds > 0);
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeEffects.length, onEffectExpired]);

  /**
   * 如果沒有活躍效果，不顯示
   */
  if (activeEffects.length === 0) {
    return null;
  }

  /**
   * 格式化剩餘時間（HH:MM:SS 或 MM:SS）
   */
  const formatRemainingTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  /**
   * 取得變化量顯示文字
   */
  const getChangeText = (effect: TemporaryEffect): string => {
    const { statChangeTarget, deltaValue, deltaMax } = effect;

    if (statChangeTarget === 'value' && deltaValue !== undefined) {
      return deltaValue > 0 ? `+${deltaValue}` : `${deltaValue}`;
    }

    if (statChangeTarget === 'maxValue' && deltaMax !== undefined) {
      return deltaMax > 0 ? `最大值 +${deltaMax}` : `最大值 ${deltaMax}`;
    }

    return '';
  };

  /**
   * 取得效果圖示
   */
  const getEffectIcon = (sourceType: 'skill' | 'item') => {
    return sourceType === 'skill' ? (
      <Zap className="h-3 w-3" />
    ) : (
      <Package className="h-3 w-3" />
    );
  };

  /**
   * 取得 Badge 顏色（根據剩餘時間）
   */
  const getBadgeVariant = (remainingSeconds: number): 'default' | 'secondary' | 'destructive' => {
    if (remainingSeconds < 60) return 'destructive'; // 少於 1 分鐘
    if (remainingSeconds < 300) return 'secondary'; // 少於 5 分鐘
    return 'default';
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center space-x-2">
        <Clock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-primary">活躍效果</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {activeEffects.map((effect) => (
          <Badge
            key={effect.id}
            variant={getBadgeVariant(effect.remainingSeconds)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-normal transition-all duration-300"
          >
            {/* 效果圖示 */}
            {getEffectIcon(effect.sourceType)}

            {/* 效果名稱 */}
            <span className="font-medium">{effect.sourceName}</span>

            {/* 數值變化 */}
            <span className="text-xs opacity-90">
              ({effect.targetStat} {getChangeText(effect)})
            </span>

            {/* 剩餘時間 */}
            <span className="ml-1 font-mono text-xs opacity-80 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {formatRemainingTime(effect.remainingSeconds)}
            </span>
          </Badge>
        ))}
      </div>

      {/* 說明文字 */}
      <p className="text-xs text-muted-foreground">
        效果到期後會自動恢復數值
      </p>
    </div>
  );
}
