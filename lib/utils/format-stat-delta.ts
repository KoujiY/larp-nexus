/**
 * 數值變動格式化共���函數
 *
 * 統一 GM Event Log、玩家通知（role.updated / character.affected）
 * 的數值 delta 文字格式。
 *
 * 格式範例：
 * - value only:    「HP +3」
 * - max only:      「HP 最大值 -1（上限：9）」
 * - both:          「HP 最大值 -1（上限：9），目前值 -1」
 */

export interface StatDeltaInput {
  /** 數值名稱 */
  name: string;
  /** 當前值變動量（0 或 undefined 表示未變動） */
  deltaValue?: number;
  /** 最大值變動量（0 或 undefined 表示未變動） */
  deltaMax?: number;
  /** 變動後的新最大值（用於顯示「上限：N」） */
  newMax?: number;
}

/**
 * 格式化數值變動文字
 *
 * @returns 格式化後的文字，若無任何變動回傳 null
 */
export function formatStatDeltaText(input: StatDeltaInput): string | null {
  const { name, deltaValue, deltaMax, newMax } = input;
  const dv = deltaValue ?? 0;
  const dm = deltaMax ?? 0;

  // 同時變更最大值與當前值
  if (dm !== 0 && dv !== 0) {
    const maxText = newMax !== undefined
      ? `${name} 最大值 ${dm > 0 ? '+' : ''}${dm}（上限：${newMax}）`
      : `${name} 最大值 ${dm > 0 ? '+' : ''}${dm}`;
    return `${maxText}，目前值 ${dv > 0 ? '+' : ''}${dv}`;
  }

  // 僅變更最大值
  if (dm !== 0) {
    return newMax !== undefined
      ? `${name} 最大值 ${dm > 0 ? '+' : ''}${dm}（上限：${newMax}）`
      : `${name} 最大值 ${dm > 0 ? '+' : ''}${dm}`;
  }

  // 僅變更當前值
  if (dv !== 0) {
    return `${name} ${dv > 0 ? '+' : ''}${dv}`;
  }

  return null;
}
