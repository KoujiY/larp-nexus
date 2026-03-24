'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import type { Stat } from '@/types/character';

interface StatsDisplayProps {
  stats?: Stat[];
}

export function StatsDisplay({ stats }: StatsDisplayProps) {
  // 如果沒有數值，不顯示
  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">角色數值</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>
    </div>
  );
}

interface StatCardProps {
  stat: Stat;
}

function StatCard({ stat }: StatCardProps) {
  const hasMaxValue = stat.maxValue !== undefined && stat.maxValue !== null;
  const percentage = hasMaxValue
    ? Math.min(100, Math.max(0, (stat.value / stat.maxValue!) * 100))
    : null;

  // 根據百分比決定顏色
  const getProgressColor = (percent: number) => {
    if (percent <= 25) return 'bg-destructive';
    if (percent <= 50) return 'bg-warning';
    if (percent <= 75) return 'bg-info';
    return 'bg-success';
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <span>{stat.name}</span>
          <span className="text-lg font-bold tabular-nums">
            {stat.value}
            {hasMaxValue && (
              <span className="text-muted-foreground font-normal">
                {' '}/ {stat.maxValue}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      {hasMaxValue && percentage !== null && (
        <CardContent className="pb-4 px-4 pt-0">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full transition-all duration-500 ${getProgressColor(percentage)}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// 簡化版顯示（用於緊湊佈局）
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

