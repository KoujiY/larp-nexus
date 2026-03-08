'use client';

import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ItemEffect, SkillEffect, Stat } from '@/types/character';

interface EffectEditorProps {
  effect: ItemEffect | SkillEffect;
  index: number;
  stats: Stat[];
  onChange: (effect: ItemEffect | SkillEffect) => void;
  onDelete: () => void;
  availableTypes: Array<'stat_change' | 'custom' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete'>;
  checkType?: 'none' | 'contest' | 'random' | 'random_contest'; // 檢定類型（用於限制目標對象）
}

export function EffectEditor({
  effect,
  index,
  stats,
  onChange,
  onDelete,
  availableTypes,
  checkType = 'none',
}: EffectEditorProps) {
  const handleTypeChange = (value: string) => {
    if (value === 'stat_change') {
      onChange({
        ...effect,
        type: 'stat_change',
        targetType: effect.targetType || 'self',
        requiresTarget: effect.targetType !== 'self',
        statChangeTarget: effect.statChangeTarget || 'value',
      } as ItemEffect | SkillEffect);
    } else if (value === 'item_take' || value === 'item_steal') {
      onChange({
        ...effect,
        type: value as 'item_take' | 'item_steal',
        targetType: 'other',
        requiresTarget: true,
      } as ItemEffect | SkillEffect);
    } else if (value === 'custom') {
      onChange({
        ...effect,
        type: 'custom',
        description: effect.description,
      } as ItemEffect | SkillEffect);
    } else if (value === 'task_reveal' || value === 'task_complete') {
      onChange({
        ...effect,
        type: value as 'task_reveal' | 'task_complete',
        targetTaskId: (effect as SkillEffect).targetTaskId,
      } as SkillEffect);
    }
  };

  const targetStatData = effect.targetStat 
    ? stats.find((s) => s.name === effect.targetStat)
    : null;
  const hasMaxValue = targetStatData?.maxValue !== undefined && targetStatData.maxValue !== null;
  const statChangeTarget = effect.statChangeTarget || 'value';
  
  // 當檢定類型是對抗檢定或隨機對抗檢定時，目標對象只能選擇「其他玩家」
  const isContestType = checkType === 'contest' || checkType === 'random_contest';
  const targetType: 'self' | 'other' | 'any' = effect.targetType || 'self';
  const restrictedTargetType = isContestType ? 'other' : targetType;
  
  // 如果檢定類型是對抗檢定，但效果的 targetType 不是 'other'，自動更新
  useEffect(() => {
    if (isContestType && effect.targetType !== 'other' && (effect.type === 'stat_change' || effect.type === 'item_take' || effect.type === 'item_steal')) {
      onChange({
        ...effect,
        targetType: 'other',
        requiresTarget: true,
      } as ItemEffect | SkillEffect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContestType, checkType]);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">效果 {index + 1}</Label>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-destructive hover:underline"
        >
          刪除
        </button>
      </div>

      <div className="space-y-2">
        <Label>效果類型</Label>
        <Select value={effect.type} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableTypes.includes('stat_change') && (
              <SelectItem value="stat_change">數值變化</SelectItem>
            )}
            {availableTypes.includes('item_take') && (
              <SelectItem value="item_take">移除道具</SelectItem>
            )}
            {availableTypes.includes('item_steal') && (
              <SelectItem value="item_steal">偷竊道具</SelectItem>
            )}
            {availableTypes.includes('task_reveal') && (
              <SelectItem value="task_reveal">揭露任務</SelectItem>
            )}
            {availableTypes.includes('task_complete') && (
              <SelectItem value="task_complete">完成任務</SelectItem>
            )}
            {availableTypes.includes('custom') && (
              <SelectItem value="custom">自訂效果</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {effect.type === 'stat_change' && (
        <>
          <div className="space-y-2">
            <Label>目標對象</Label>
            <Select
              value={restrictedTargetType}
              onValueChange={(value: 'self' | 'other' | 'any') => {
                const finalValue = isContestType ? 'other' : value;
                onChange({
                  ...effect,
                  targetType: finalValue,
                  requiresTarget: finalValue !== 'self',
                } as ItemEffect | SkillEffect);
              }}
              disabled={isContestType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self" disabled={isContestType}>自己</SelectItem>
                <SelectItem value="other">其他玩家</SelectItem>
                <SelectItem value="any" disabled={isContestType}>任一名玩家（包含自己）</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isContestType 
                ? '對抗檢定類型只能選擇其他玩家作為目標'
                : targetType === 'self' 
                  ? '只能影響自己'
                  : targetType === 'other' 
                    ? '使用時需選擇其他角色'
                    : '使用時可選擇任意角色（包含自己）'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>目標數值</Label>
              <Select
                value={effect.targetStat || ''}
                onValueChange={(value) => {
                  const stat = stats.find((s) => s.name === value);
                  const hasMax = stat?.maxValue !== undefined && stat?.maxValue !== null;
                  onChange({
                    ...effect,
                    targetStat: value,
                    statChangeTarget: hasMax ? (effect.statChangeTarget || 'value') : 'value',
                    syncValue: hasMax ? effect.syncValue : undefined,
                  } as ItemEffect | SkillEffect);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇數值" />
                </SelectTrigger>
                <SelectContent>
                  {stats.map((stat) => (
                    <SelectItem key={stat.id} value={stat.name}>
                      {stat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>變化值</Label>
              <Input
                type="number"
                value={effect.value || ''}
                onChange={(e) => onChange({
                  ...effect,
                  value: e.target.value ? parseInt(e.target.value) : undefined,
                } as ItemEffect | SkillEffect)}
                placeholder="正數增加，負數減少"
              />
            </div>
          </div>

          {hasMaxValue && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>作用目標</Label>
                <Select
                  value={statChangeTarget}
                  onValueChange={(value: 'value' | 'maxValue') => {
                    onChange({
                      ...effect,
                      statChangeTarget: value,
                    } as ItemEffect | SkillEffect);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">目前值</SelectItem>
                    <SelectItem value="maxValue">最大值</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {statChangeTarget === 'maxValue' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span>同步目前值</span>
                    <Switch
                      checked={Boolean(effect.syncValue)}
                      onCheckedChange={(checked) => onChange({
                        ...effect,
                        syncValue: checked,
                      } as ItemEffect | SkillEffect)}
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    勾選時，最大值變動會連帶調整目前值（不超過新上限）
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Phase 8.8: 時效性效果 - 持續時間 */}
          <div className="space-y-2">
            <Label>持續時間（分鐘）</Label>
            <Input
              type="number"
              min="0"
              value={
                effect.duration !== undefined && effect.duration > 0
                  ? Math.round(effect.duration / 60)
                  : ''
              }
              onChange={(e) => {
                const minutes = e.target.value ? parseInt(e.target.value) : 0;
                const seconds = minutes > 0 ? minutes * 60 : undefined;
                onChange({
                  ...effect,
                  duration: seconds,
                } as ItemEffect | SkillEffect);
              }}
              placeholder="留空或 0 = 永久效果"
            />
            <p className="text-xs text-muted-foreground">
              設定此數值變化的持續時間。時間到期後，數值會自動恢復。留空或設為 0 表示永久效果。
            </p>
          </div>
        </>
      )}

      {(effect.type === 'item_take' || effect.type === 'item_steal') && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>目標對象</Label>
            <Select
              value={restrictedTargetType}
              onValueChange={(value: 'self' | 'other' | 'any') => {
                const finalValue = isContestType ? 'other' : value;
                onChange({
                  ...effect,
                  targetType: finalValue,
                  requiresTarget: finalValue !== 'self',
                } as ItemEffect | SkillEffect);
              }}
              disabled={isContestType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self" disabled={isContestType}>自己</SelectItem>
                <SelectItem value="other">其他玩家</SelectItem>
                <SelectItem value="any" disabled={isContestType}>任一名玩家（包含自己）</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isContestType 
                ? '對抗檢定類型只能選擇其他玩家作為目標'
                : targetType === 'self' 
                  ? '只能對自己使用'
                  : targetType === 'other' 
                    ? '使用時需選擇其他角色'
                    : '使用時可選擇任意角色（包含自己）'}
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              {effect.type === 'item_steal' ? (
                <>
                  <strong>偷竊道具：</strong>
                  使用時需要選擇目標角色，然後選擇目標角色身上的道具。
                  檢定成功後，該道具會從目標角色身上移除，並轉移到使用此道具的角色身上。
                </>
              ) : (
                <>
                  <strong>移除道具：</strong>
                  使用時需要選擇目標角色，然後選擇目標角色身上的道具。
                  檢定成功後，該道具會從目標角色身上移除。
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {(effect.type === 'task_reveal' || effect.type === 'task_complete') && (
        <div className="space-y-2">
          <Label>目標任務 ID</Label>
          <Input
            value={(effect as SkillEffect).targetTaskId || ''}
            onChange={(e) => onChange({
              ...effect,
              targetTaskId: e.target.value,
            } as SkillEffect)}
            placeholder="任務 ID"
          />
        </div>
      )}

      {effect.type === 'custom' && (
        <div className="space-y-2">
          <Label>效果描述</Label>
          <Textarea
            value={effect.description || ''}
            onChange={(e) => onChange({
              ...effect,
              description: e.target.value,
            } as ItemEffect | SkillEffect)}
            placeholder="描述自訂效果..."
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

