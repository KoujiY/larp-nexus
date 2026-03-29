'use client';

/**
 * 技能卡片元件（玩家側）
 *
 * 展示技能圖示、名稱、描述、標籤與狀態覆蓋（冷卻/耗盡）。
 * 設計對齊 Stitch Elegant Fantasy Journey 風格：漸層深色卡片、琥珀名稱、
 * 視覺遮罩表達狀態。純展示元件，不持有任何狀態。
 */

import { Zap, Clock } from 'lucide-react';
import Image from 'next/image';
import type { Skill } from '@/types/character';

/** 將秒數轉為可讀格式，e.g. 3661 → "1h 1m 1s" */
function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export interface SkillCardProps {
  skill: Skill;
  /** 剩餘冷卻秒數；null 表示無冷卻 */
  cooldownRemaining: number | null;
  /** 是否對抗檢定進行中 */
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
  onClick,
}: SkillCardProps) {
  const isOnCooldown = cooldownRemaining !== null && cooldownRemaining > 0;
  const isExhausted =
    skill.usageLimit != null &&
    skill.usageLimit > 0 &&
    (skill.usageCount ?? 0) >= skill.usageLimit;

  // 使用次數進度條百分比
  const usageProgress =
    skill.usageLimit != null && skill.usageLimit > 0
      ? ((skill.usageLimit - (skill.usageCount ?? 0)) / skill.usageLimit) * 100
      : null;

  // 使用次數文字
  const usageText =
    skill.usageLimit != null && skill.usageLimit > 0
      ? `${skill.usageLimit - (skill.usageCount ?? 0)}/${skill.usageLimit}`
      : null;

  return (
    <div
      className={`relative rounded-xl overflow-hidden transition-all bg-linear-to-br from-card to-surface-base ${
        isDisabled || isExhausted
          ? 'cursor-not-allowed'
          : 'cursor-pointer hover:shadow-[0_0_20px_rgba(254,197,106,0.08)] active:scale-[0.98]'
      }${isExhausted ? ' opacity-40' : ''}`}
      onClick={isDisabled && !isExhausted ? undefined : isExhausted ? undefined : onClick}
    >
      <div className={`p-4 flex items-start gap-4${isOnCooldown ? ' opacity-60 grayscale-[0.5]' : ''}`}>
        {/* 技能圖示 */}
        <div className="w-14 h-14 rounded-lg bg-popover flex items-center justify-center relative overflow-hidden shrink-0 border border-border/10">
          {skill.iconUrl ? (
            <>
              <Image
                src={skill.iconUrl}
                alt={skill.name}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-primary/10 mix-blend-overlay" />
            </>
          ) : (
            <Zap className="h-7 w-7 text-primary/40" />
          )}
        </div>

        {/* 技能資訊 */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <h3 className="text-base font-bold text-primary tracking-wide truncate">
              {skill.name}
            </h3>
            {usageText && (
              <span className={`text-[10px] font-bold uppercase tracking-tighter shrink-0 ml-2 ${
                isExhausted ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {isExhausted ? `0/${skill.usageLimit}` : usageText}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed truncate mb-3">
            {skill.description || '尚無描述'}
          </p>

          {/* 標籤列 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 語義標籤（tags） */}
            {skill.tags?.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-popover text-[10px] font-bold text-primary uppercase tracking-wider"
              >
                {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
              </span>
            ))}
            {/* 效果數量 */}
            {skill.effects && skill.effects.length > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-popover text-[10px] font-bold text-primary uppercase tracking-wider">
                {skill.effects.length} 個效果
              </span>
            )}
            {/* 耗盡標籤 */}
            {isExhausted && (
              <span className="text-[10px] font-black bg-destructive/20 text-destructive px-2 py-0.5 rounded uppercase tracking-widest ml-auto">
                次數已耗盡
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 使用次數進度條 */}
      {usageProgress !== null && (
        <div className="absolute bottom-0 left-0 h-1 bg-primary/20 w-full">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${usageProgress}%` }}
          />
        </div>
      )}

      {/* 冷卻遮罩 */}
      {isOnCooldown && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] flex items-center justify-center z-10">
          <div className="flex items-center gap-2 text-primary animate-pulse">
            <Clock className="h-6 w-6" />
            <span className="text-lg font-extrabold tracking-widest uppercase">
              冷卻 {formatCooldown(cooldownRemaining)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
