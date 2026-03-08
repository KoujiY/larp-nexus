import { Sparkles, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SkillEffect, ItemEffect } from '@/types/character';
import type { TransferTargetCharacter } from '@/app/actions/public';

interface EffectDisplayProps {
  effect: SkillEffect | ItemEffect;
  targetOptions?: TransferTargetCharacter[];
  selectedTargetId?: string;
  onTargetChange?: (targetId: string) => void;
  className?: string;
  disabled?: boolean; // 是否禁用目標選擇
}

export function EffectDisplay({
  effect,
  targetOptions = [],
  selectedTargetId,
  onTargetChange,
  className = "p-3 bg-muted rounded-lg space-y-2",
  disabled = false
}: EffectDisplayProps) {
  /**
   * 格式化持續時間（秒 → 人類可讀）
   */
  const formatDuration = (seconds: number): string => {
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return mins > 0 ? `${hours} 小時 ${mins} 分鐘` : `${hours} 小時`;
    }
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      return `${mins} 分鐘`;
    }
    return `${seconds} 秒`;
  };

  const renderEffectDescription = () => {
    if (effect.type === 'stat_change') {
      const target = effect.statChangeTarget ?? 'value';
      const syncValue = effect.syncValue;
      const value = effect.value ?? 0;
      const targetStat = effect.targetStat ?? '數值';
      const duration = effect.duration;

      if (target === 'maxValue') {
        return (
          <p>
            {targetStat} 最大值 {value > 0 ? '+' : ''}{value}
            {syncValue && '，目前值同步調整'}
            {duration && duration > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(duration)}
              </span>
            )}
          </p>
        );
      }
      return (
        <p>
          {targetStat} {value > 0 ? '+' : ''}{value}
          {duration && duration > 0 && (
            <span className="inline-flex items-center gap-0.5 ml-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(duration)}
            </span>
          )}
        </p>
      );
    }

    if (effect.type === 'task_reveal') {
      return <p>揭露任務：{effect.targetTaskId}</p>;
    }

    if (effect.type === 'task_complete') {
      return <p>完成任務：{effect.targetTaskId}</p>;
    }

    if (effect.type === 'item_steal') {
      return <p>偷竊目標角色的道具</p>;
    }

    if (effect.type === 'item_take') {
      return <p>移除目標角色的道具</p>;
    }

    if (effect.type === 'item_give') {
      return <p>給予目標角色道具</p>;
    }

    if (effect.type === 'custom' && effect.description) {
      return <p>{effect.description}</p>;
    }

    return <p>未知效果</p>;
  };

  const renderTargetInfo = () => {
    const targetType = effect.targetType;
    const requiresTarget = effect.requiresTarget;

    if (!targetType) return null;

    return (
      <div className="space-y-2">
        {/* 目標類型顯示 */}
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">目標：</span>
          <span>
            {targetType === 'self'
              ? '自己'
              : targetType === 'other'
              ? '其他玩家'
              : targetType === 'any'
              ? '任一名玩家'
              : '未指定'}
          </span>
        </div>

        {/* 目標選擇 */}
        {requiresTarget && targetOptions.length > 0 && (
          <div className="space-y-1">
            <Select
              value={selectedTargetId ?? ''}
              onValueChange={onTargetChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-full" disabled={disabled}>
                <SelectValue placeholder="選擇目標角色 *" />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 沒有可選目標的提示 */}
        {requiresTarget && targetOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">沒有可選擇的目標</p>
        )}
      </div>
    );
  };

  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
        <div className="flex-1 text-sm">
          {renderEffectDescription()}
        </div>
      </div>

      {renderTargetInfo()}
    </div>
  );
}
