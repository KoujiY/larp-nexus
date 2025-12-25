'use client';

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
}

export function EffectEditor({
  effect,
  index,
  stats,
  onChange,
  onDelete,
  availableTypes,
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
  const targetType: 'self' | 'other' | 'any' = effect.targetType || 'self';

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
              value={targetType}
              onValueChange={(value: 'self' | 'other' | 'any') => {
                onChange({
                  ...effect,
                  targetType: value,
                  requiresTarget: value !== 'self',
                } as ItemEffect | SkillEffect);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">自己</SelectItem>
                <SelectItem value="other">其他玩家</SelectItem>
                <SelectItem value="any">任一名玩家（包含自己）</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {targetType === 'self' && '只能影響自己'}
              {targetType === 'other' && '使用時需選擇其他角色'}
              {targetType === 'any' && '使用時可選擇任意角色（包含自己）'}
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
        </>
      )}

      {(effect.type === 'item_take' || effect.type === 'item_steal') && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>目標對象</Label>
            <Select
              value={targetType}
              onValueChange={(value: 'self' | 'other' | 'any') => {
                onChange({
                  ...effect,
                  targetType: value,
                  requiresTarget: value !== 'self',
                } as ItemEffect | SkillEffect);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">自己</SelectItem>
                <SelectItem value="other">其他玩家</SelectItem>
                <SelectItem value="any">任一名玩家（包含自己）</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {targetType === 'self' && '只能對自己使用'}
              {targetType === 'other' && '使用時需選擇其他角色'}
              {targetType === 'any' && '使用時可選擇任意角色（包含自己）'}
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

