'use client';

/**
 * 數值顯示元件（玩家側）
 *
 * 顯示角色所有數值，有 maxValue 時附帶進度條與色彩語義。
 * 設計對齊 Stitch Ethereal Manuscript 風格：
 * 琥珀豎線區段標題、ghost border 卡片、大型等寬數值。
 */

import type { Stat, Item } from '@/types/character';
import { computeEffectiveStats, type EffectiveStat } from '@/lib/utils/compute-effective-stats';
import { getProgressColor } from '@/lib/styles/health-status';

interface StatsDisplayProps {
  stats?: Stat[];
  /** 角色道具（用於計算裝備加成） */
  items?: Item[];
}

export function StatsDisplay({ stats, items }: StatsDisplayProps) {
  if (!stats || stats.length === 0) {
    return null;
  }

  const effectiveStats = items ? computeEffectiveStats(stats, items) : null;

  return (
    <div className="space-y-6">
      {/* 區段標題 */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-primary rounded-full" />
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          角色數值
        </h3>
      </div>

      {/* 數值卡片 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {effectiveStats
          ? effectiveStats.map((stat) => (
              <StatCard key={stat.id} stat={stat} effectiveStat={stat} />
            ))
          : stats.map((stat) => (
              <StatCard key={stat.id} stat={stat} />
            ))
        }
      </div>
    </div>
  );
}

function StatCard({ stat, effectiveStat }: { stat: Stat; effectiveStat?: EffectiveStat }) {
  const displayValue = effectiveStat?.value ?? stat.value;
  const displayMaxValue = effectiveStat?.maxValue ?? stat.maxValue;

  const hasMaxValue = displayMaxValue !== undefined && displayMaxValue !== null;
  const percentage = hasMaxValue
    ? Math.min(100, Math.max(0, (displayValue / displayMaxValue!) * 100))
    : null;

  return (
    <div className="bg-card p-5 rounded-xl border border-border/10 hover:border-primary/30 transition-all duration-300 flex flex-col justify-center">
      {/* 數值名稱 */}
      <p className="text-xs font-extrabold text-muted-foreground tracking-widest uppercase mb-4">
        {stat.name}
      </p>

      {/* 數值文字 */}
      <div className="flex items-baseline gap-1 mb-3">
        <span
          className={`font-mono font-bold tracking-tighter tabular-nums ${
            hasMaxValue
              ? 'text-3xl text-foreground'
              : 'text-5xl text-primary'
          }`}
        >
          {displayValue}
        </span>
        {hasMaxValue && (
          <span className="text-muted-foreground/50 font-mono text-xl tabular-nums">
            / {displayMaxValue}
          </span>
        )}
      </div>

      {/* 進度條（僅有 maxValue 時） */}
      {hasMaxValue && percentage !== null && (
        <div className="w-full h-2 bg-popover rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getProgressColor(percentage)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}


/** 簡化版顯示（用於緊湊佈局） */
export function StatsCompact({ stats }: StatsDisplayProps) {
  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/10 text-sm"
        >
          <span className="font-medium text-primary">{stat.name}</span>
          <span className="ml-2 font-bold tabular-nums">
            {stat.value}
            {stat.maxValue !== undefined && stat.maxValue !== null && (
              <span className="text-muted-foreground font-normal">
                /{stat.maxValue}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
