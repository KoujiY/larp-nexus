'use client';

/**
 * 標籤設定區塊
 *
 * GM 道具編輯（ItemsEditForm）與技能編輯（SkillsEditForm）共用的
 * combat / stealth 標籤核取方塊 UI。
 */

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface TagsSectionProps {
  /** 目前的標籤陣列 */
  tags: string[] | undefined;
  /** 標籤變更時的回呼 */
  onChange: (tags: string[]) => void;
}

export function TagsSection({ tags, onChange }: TagsSectionProps) {
  const currentTags = tags ?? [];

  const toggle = (tag: string, checked: boolean | string) => {
    const next = checked
      ? [...currentTags.filter((t) => t !== tag), tag]
      : currentTags.filter((t) => t !== tag);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>標籤</Label>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="tag-combat"
            checked={currentTags.includes('combat')}
            onCheckedChange={(checked) => toggle('combat', checked)}
          />
          <Label htmlFor="tag-combat" className="text-sm font-normal cursor-pointer">
            戰鬥（可用於對抗檢定回應）
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="tag-stealth"
            checked={currentTags.includes('stealth')}
            onCheckedChange={(checked) => toggle('stealth', checked)}
          />
          <Label htmlFor="tag-stealth" className="text-sm font-normal cursor-pointer">
            隱匿（攻擊方姓名不出現在防守方訊息中）
          </Label>
        </div>
      </div>
    </div>
  );
}
