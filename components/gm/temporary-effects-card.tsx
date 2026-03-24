/**
 * Phase 8.6: GM 端時效性效果卡片
 * 顯示角色所有活躍的時效性效果，包含倒數計時
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTemporaryEffects, checkExpiredEffects } from '@/app/actions/temporary-effects';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, Package } from 'lucide-react';
import type { TemporaryEffect } from '@/types/character';
import type { BaseEvent } from '@/types/event';

interface TemporaryEffectsCardProps {
  characterId: string;
}

/**
 * 時效性效果卡片組件
 *
 * @param characterId - 角色 ID
 */
export function TemporaryEffectsCard({ characterId }: TemporaryEffectsCardProps) {
  const [effects, setEffects] = useState<Array<TemporaryEffect & { remainingSeconds: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 載入時效性效果
   * 初次載入顯示 loading 狀態，後續刷新保持顯示舊資料以避免閃爍
   */
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
      // 無論初次或後續載入，完成後都關閉 loading
      setIsLoading(false);
    }
  }, [characterId]);

  /**
   * 初始載入效果列表
   */
  useEffect(() => {
    loadEffects();
  }, [loadEffects]);

  /**
   * 監聽 WebSocket 事件，當角色受到技能/道具影響或效果過期時重新載入效果列表
   */
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'character.affected' || event.type === 'skill.used' || event.type === 'effect.expired') {
      console.log('[TemporaryEffectsCard] 收到相關事件，重新載入效果列表', { type: event.type });
      loadEffects();
    }
  });

  /**
   * 防止重複觸發過期檢查
   */
  const isCheckingExpiredRef = useRef(false);

  /**
   * 每秒更新倒數計時
   * 當有效果倒數歸零時，主動觸發伺服器端過期檢查
   */
  useEffect(() => {
    if (effects.length === 0) return;

    const timer = setInterval(() => {
      setEffects((prevEffects) => {
        const updated = prevEffects.map((effect) => ({
          ...effect,
          remainingSeconds: Math.max(0, effect.remainingSeconds - 1),
        }));

        // 檢查是否有效果剛好歸零
        const hasNewlyExpired = updated.some((effect) => effect.remainingSeconds <= 0);

        // 如果有效果歸零，主動觸發伺服器端過期檢查
        // 不在此處呼叫 loadEffects，避免因客戶端/伺服器時間差導致已移除的效果重新出現
        // 伺服器處理完成後會透過 WebSocket effect.expired 事件觸發 loadEffects
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

    return '未知變化';
  };

  /**
   * 取得效果圖示
   */
  const getEffectIcon = (sourceType: 'skill' | 'item') => {
    return sourceType === 'skill' ? (
      <Zap className="h-4 w-4" />
    ) : (
      <Package className="h-4 w-4" />
    );
  };

  /**
   * 渲染：載入中
   */
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>⏳ 時效性效果</CardTitle>
          <CardDescription>載入中...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  /**
   * 渲染：錯誤
   */
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>⏳ 時效性效果</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  /**
   * 渲染：無活躍效果
   */
  if (effects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>⏳ 時效性效果</CardTitle>
          <CardDescription>目前沒有活躍的時效性效果</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm">當玩家使用帶有持續時間的技能或道具時，效果會顯示在這裡</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  /**
   * 渲染：效果列表
   */
  return (
    <Card>
      <CardHeader>
        <CardTitle>⏳ 時效性效果</CardTitle>
        <CardDescription>
          目前有 {effects.length} 個活躍效果
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {effects.map((effect) => (
          <div
            key={effect.id}
            className="p-4 bg-muted/50 rounded-lg border border-muted space-y-2"
          >
            {/* 第一行：來源資訊 + 剩餘時間 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* 來源類型圖示 */}
                <Badge variant="outline" className="flex items-center gap-1">
                  {getEffectIcon(effect.sourceType)}
                  <span className="text-xs">
                    {effect.sourceType === 'skill' ? '技能' : '道具'}
                  </span>
                </Badge>

                {/* 來源名稱 */}
                <span className="font-medium text-sm">{effect.sourceName}</span>
              </div>

              {/* 剩餘時間 */}
              <Badge
                variant={effect.remainingSeconds < 60 ? 'destructive' : 'secondary'}
                className="flex items-center gap-1"
              >
                <Clock className="h-3 w-3" />
                <span className="font-mono text-xs">
                  {formatRemainingTime(effect.remainingSeconds)}
                </span>
              </Badge>
            </div>

            {/* 第二行：效果詳情 */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {/* 施放者 */}
              <div className="flex items-center gap-1">
                <span>施放者:</span>
                <span className="font-medium text-foreground">
                  {effect.sourceCharacterName}
                </span>
              </div>

              {/* 目標數值 */}
              <div className="flex items-center gap-1">
                <span>數值:</span>
                <span className="font-medium text-foreground">
                  {effect.targetStat}
                </span>
              </div>

              {/* 變化量 */}
              <div className="flex items-center gap-1">
                <span>變化:</span>
                <span
                  className={`font-medium ${
                    (effect.deltaValue || 0) > 0 || (effect.deltaMax || 0) > 0
                      ? 'text-success'
                      : 'text-destructive'
                  }`}
                >
                  {getChangeText(effect)}
                </span>
              </div>
            </div>

            {/* 預留空間：未來擴展功能（暫停、延長時間按鈕） */}
            {/* <div className="flex items-center gap-2 mt-2">
              <Button size="sm" variant="outline" disabled>
                <Pause className="h-3 w-3 mr-1" />
                暫停
              </Button>
              <Button size="sm" variant="outline" disabled>
                <Plus className="h-3 w-3 mr-1" />
                延長時間
              </Button>
            </div> */}
          </div>
        ))}

        {/* 使用說明 */}
        <div className="mt-4 p-3 bg-info/10 rounded-lg text-xs text-foreground">
          <h5 className="font-medium mb-1">💡 說明</h5>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
            <li>時效性效果會在倒數結束後自動恢復數值</li>
            <li>剩餘時間少於 1 分鐘時會以紅色標示</li>
            <li>效果過期後會自動從列表中移除</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
