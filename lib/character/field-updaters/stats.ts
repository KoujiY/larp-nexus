/**
 * 角色數值（Stats）欄位更新器
 */

/**
 * 更新角色 Stats
 *
 * @param stats Stats 陣列
 * @returns 更新後的 Stats 資料
 */
export function updateCharacterStats(stats: Array<{
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}>): Array<{
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}> {
  return stats.map((stat) => ({
    id: stat.id,
    name: stat.name,
    value: stat.value,
    maxValue: stat.maxValue,
  }));
}
