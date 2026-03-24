'use client';

/**
 * 技能卡片元件（玩家側）
 *
 * 顯示技能圖示、名稱、描述、標籤（檢定類型、標籤、使用限制、冷卻）。
 * 純展示元件，不持有任何狀態。
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Clock } from 'lucide-react';
import Image from 'next/image';
import type { Skill } from '@/types/character';

export interface SkillCardProps {
  skill: Skill;
  /** 剩餘冷卻秒數；null 表示無冷卻 */
  cooldownRemaining: number | null;
  /** 是否對抗檢定進行中（用於顯示 badge 文字） */
  isPendingContest: boolean;
  /** 是否禁用（canUse=false 或 isPendingContest=true） */
  isDisabled: boolean;
  /** 禁用原因（不可使用時顯示於 badge） */
  reason?: string;
  /** 劇本的隨機對抗檢定上限值 */
  randomContestMaxValue?: number;
  onClick: () => void;
}

export function SkillCard({
  skill,
  cooldownRemaining,
  isPendingContest,
  isDisabled,
  reason,
  randomContestMaxValue = 100,
  onClick,
}: SkillCardProps) {
  return (
    <Card
      className={`transition-colors ${
        isDisabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:bg-accent/50'
      }`}
      onClick={isDisabled ? undefined : onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* 技能圖示 */}
          {skill.iconUrl ? (
            <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border">
              <Image
                src={skill.iconUrl}
                alt={skill.name}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center border border-primary/20">
              <Zap className="h-8 w-8 text-primary" />
            </div>
          )}

          {/* 技能資訊 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{skill.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {skill.description || '尚無描述'}
                </p>
              </div>
              {isDisabled && (
                <Badge variant="secondary" className="shrink-0">
                  {isPendingContest ? '對抗檢定進行中' : reason}
                </Badge>
              )}
            </div>

            {/* 技能標籤 */}
            <div className="flex flex-wrap gap-2 mt-3">
              {skill.checkType !== 'none' && (
                <Badge variant="outline" className="text-xs">
                  {skill.checkType === 'contest'
                    ? '對抗檢定'
                    : skill.checkType === 'random_contest'
                      ? '隨機對抗檢定'
                      : '隨機檢定'}
                  {skill.checkType === 'contest' &&
                    skill.contestConfig?.relatedStat && (
                      <span className="ml-1">
                        (使用 {skill.contestConfig.relatedStat})
                      </span>
                    )}
                  {skill.checkType === 'random_contest' && (
                    <span className="ml-1">
                      (隨機擲骰，D{randomContestMaxValue})
                    </span>
                  )}
                  {skill.checkType === 'random' && skill.randomConfig && (
                    <span className="ml-1">
                      ({skill.randomConfig.threshold} / {skill.randomConfig.maxValue})
                    </span>
                  )}
                </Badge>
              )}
              {/* 標籤 */}
              {skill.tags && skill.tags.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  標籤：
                  {skill.tags
                    .map((tag) =>
                      tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag,
                    )
                    .join('、')}
                </Badge>
              )}
              {skill.usageLimit != null && (
                <Badge variant="outline" className="text-xs">
                  {skill.usageLimit > 0
                    ? `使用次數：${skill.usageCount || 0} / ${skill.usageLimit}`
                    : '使用次數：無限制'}
                </Badge>
              )}
              {skill.cooldown != null && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {cooldownRemaining !== null
                    ? `冷卻 ${cooldownRemaining}s`
                    : skill.cooldown > 0
                      ? `冷卻 ${skill.cooldown}s`
                      : '無冷卻時間'}
                </Badge>
              )}
              {skill.effects && skill.effects.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {skill.effects.length} 個效果
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
