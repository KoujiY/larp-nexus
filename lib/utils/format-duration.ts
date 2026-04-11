/**
 * 持續時間格式化共用函數
 *
 * 支援兩種格式：
 * - 'short': 1h30m / 5m / 30s（緊湊顯示，如卡片摘要）
 * - 'long':  1 小時 30 分鐘 / 5 分鐘 / 30 秒（完整顯示，如效果說明）
 */

export function formatDuration(
  seconds: number,
  style: 'short' | 'long' = 'long',
): string {
  if (style === 'short') {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return m > 0 ? `${h}h${m}m` : `${h}h`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}m${s}s` : `${m}m`;
    }
    return `${seconds}s`;
  }

  // style === 'long'
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)} 分鐘`;
  }
  return `${seconds} 秒`;
}
