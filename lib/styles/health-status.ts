/**
 * 角色健康狀態視覺工具
 *
 * 依照 HP 百分比決定進度條顏色與狀態標籤文字。
 * 共用於 StatsDisplay（玩家側）和 CharacterStatusOverview（GM 側）。
 */

type HealthLevel = 'critical' | 'weakened' | 'warning' | 'healthy' | 'vital';

interface HealthStatus {
  level: HealthLevel;
  label: string;
  barColor: string;
  textColor: string;
}

/**
 * 根據 HP 百分比取得健康狀態
 * @param percent - HP 百分比 (0-100)
 */
export function getHealthStatus(percent: number): HealthStatus {
  if (percent <= 25) {
    return { level: 'critical', label: 'CRITICAL', barColor: 'bg-destructive', textColor: 'text-destructive' };
  }
  if (percent <= 45) {
    return { level: 'weakened', label: 'WEAKENED', barColor: 'bg-warning', textColor: 'text-warning' };
  }
  if (percent <= 65) {
    return { level: 'warning', label: 'WARNING', barColor: 'bg-warning', textColor: 'text-warning' };
  }
  if (percent <= 85) {
    return { level: 'healthy', label: 'HEALTHY', barColor: 'bg-success', textColor: 'text-success' };
  }
  return { level: 'vital', label: 'VITAL', barColor: 'bg-success', textColor: 'text-success' };
}

/**
 * 根據百分比取得進度條顏色（向後相容）
 * 用於 StatsDisplay 的直接顏色查詢
 */
export function getProgressColor(percent: number): string {
  return getHealthStatus(percent).barColor;
}
