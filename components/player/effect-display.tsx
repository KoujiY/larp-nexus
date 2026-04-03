import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SkillEffect, ItemEffect } from '@/types/character';
import type { TransferTargetCharacter } from '@/app/actions/public';

interface EffectDisplayProps {
  effect: SkillEffect | ItemEffect;
  targetOptions?: TransferTargetCharacter[];
  selectedTargetId?: string;
  onTargetChange?: (targetId: string) => void;
  className?: string;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours} 小時 ${mins} 分鐘` : `${hours} 小時`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)} 分鐘`;
  }
  return `${seconds} 秒`;
}

export function EffectDisplay({
  effect,
  targetOptions = [],
  selectedTargetId,
  onTargetChange,
  className = "p-3 bg-muted rounded-lg space-y-2",
  disabled = false
}: EffectDisplayProps) {
  const renderEffectDescription = () => {
    if (effect.type === 'stat_change') {
      const isMax = effect.statChangeTarget === 'maxValue';
      const value = effect.value ?? 0;
      const stat = effect.targetStat ?? '數值';
      const text = isMax
        ? `${stat} 最大值 ${value > 0 ? '+' : ''}${value}${effect.syncValue ? '，目前值同步調整' : ''}`
        : `${stat} ${value > 0 ? '+' : ''}${value}`;
      return <p className="text-xs font-medium text-foreground">{text}</p>;
    }
    if (effect.type === 'task_reveal') {
      return <p className="text-xs font-medium text-foreground">揭露任務：{effect.targetTaskId}</p>;
    }
    if (effect.type === 'task_complete') {
      return <p className="text-xs font-medium text-foreground">完成任務：{effect.targetTaskId}</p>;
    }
    if (effect.type === 'item_steal') {
      return <p className="text-xs font-medium text-foreground">偷竊目標角色的道具</p>;
    }
    if (effect.type === 'item_take') {
      return <p className="text-xs font-medium text-foreground">移除目標角色的道具</p>;
    }
    if (effect.type === 'item_give') {
      return <p className="text-xs font-medium text-foreground">給予目標角色道具</p>;
    }
    if (effect.type === 'custom' && effect.description) {
      return <p className="text-xs font-medium text-foreground">{effect.description}</p>;
    }
    return <p className="text-xs font-medium text-foreground">未知效果</p>;
  };

  const renderTargetInfo = () => {
    const { targetType, requiresTarget } = effect;
    if (!targetType) return null;

    const targetLabel =
      targetType === 'self' ? '自己'
      : targetType === 'other' ? '其他玩家'
      : targetType === 'any' ? '任一名玩家'
      : '未指定';

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">目標：</span>
          {targetLabel}
        </p>
        {requiresTarget && targetOptions.length > 0 && (
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
        )}
      </div>
    );
  };

  const duration = effect.duration;

  return (
    <div className={className}>
      <div>{renderEffectDescription()}</div>
      {renderTargetInfo()}
      {duration && duration > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">時效性：</span>
          {formatDuration(duration)}
        </p>
      )}
    </div>
  );
}
