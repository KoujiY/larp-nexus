/**
 * 數值變動格式化共用函數
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

export interface NotifyDeltaInput {
  /** 變更目標：當前值或最大值 */
  statChangeTarget: 'value' | 'maxValue';
  /** 最大值變更時是否同步調整當前值 */
  syncValue: boolean;
  /** 設定的變化量（GM/效果指定的 ±N） */
  configuredDelta: number;
  /** 實際套用後的 value 變化量（clamp 後可能為 0） */
  actualDeltaValue: number;
  /** 實際套用後的 maxValue 變化量 */
  actualDeltaMax: number;
}

export interface NotifyDelta {
  deltaValue: number;
  deltaMax: number;
}

/**
 * 解析「通知用變化量」
 *
 * 規則：實際有變動時採用實際 delta；若實際 delta 為 0 但設定值非 0（例如數值已達
 * 上限、+N 被 clamp 成 0），改採「設定的變化量」，讓玩家仍收到 ±N 提示
 * （直接給變化量，不額外告知已達上限）。
 *
 * 此函數僅決定通知顯示用的 delta，不影響資料庫中的真實數值。
 */
export function resolveNotifyDelta(input: NotifyDeltaInput): NotifyDelta {
  const { statChangeTarget, syncValue, configuredDelta, actualDeltaValue, actualDeltaMax } = input;

  // 將「設定變化量」拆解到 value / maxValue 兩軸（與 computeStatChange 的目標語意一致）
  const configuredDeltaValue = statChangeTarget === 'maxValue' ? (syncValue ? configuredDelta : 0) : configuredDelta;
  const configuredDeltaMax = statChangeTarget === 'maxValue' ? configuredDelta : 0;

  return {
    deltaValue: actualDeltaValue !== 0 ? actualDeltaValue : configuredDeltaValue,
    deltaMax: actualDeltaMax !== 0 ? actualDeltaMax : configuredDeltaMax,
  };
}
