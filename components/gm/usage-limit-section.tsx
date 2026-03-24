'use client';

/**
 * 使用限制設定區塊
 *
 * GM 道具編輯（ItemsEditForm）與技能編輯（SkillsEditForm）共用的
 * 使用次數上限 + 冷卻時間 UI。
 */

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface UsageLimitSectionProps {
  /** 使用次數上限（0 = 無限制） */
  usageLimit: number | undefined;
  /** 冷卻時間（秒，0 = 無冷卻） */
  cooldown: number | undefined;
  /** 道具類型（用於提示文字，僅道具表單需要） */
  itemType?: 'consumable' | 'equipment' | 'treasure' | string;
  onChange: (patch: { usageLimit?: number; cooldown?: number }) => void;
}

export function UsageLimitSection({ usageLimit, cooldown, itemType, onChange }: UsageLimitSectionProps) {
  const isConsumable = itemType === 'consumable';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="usage-limit">使用次數限制</Label>
        <Input
          id="usage-limit"
          type="number"
          min={0}
          value={usageLimit ?? (isConsumable ? 1 : 0)}
          onChange={(e) => onChange({ usageLimit: Math.max(0, parseInt(e.target.value) || 0) })}
          placeholder={isConsumable ? '消耗品至少 1 次' : '0 = 無限制'}
        />
        <p className="text-xs text-muted-foreground">
          {isConsumable
            ? '消耗品建議至少 1 次'
            : '設為 0 表示無限制'}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cooldown">冷卻時間（秒）</Label>
        <Input
          id="cooldown"
          type="number"
          min={0}
          value={cooldown ?? 0}
          onChange={(e) => onChange({ cooldown: parseInt(e.target.value) || 0 })}
          placeholder="0 = 無冷卻"
        />
        <p className="text-xs text-muted-foreground">
          設為 0 表示無冷卻時間
        </p>
      </div>
    </div>
  );
}
