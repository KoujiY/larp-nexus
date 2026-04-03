/**
 * field-updaters 內部共用 helpers
 * 供 skills.ts 和 items.ts 使用
 */

/**
 * 正規化單一效果物件，供 Skills / Items 共用
 * @param effect 原始效果資料（以 Record 接收，避免重複定義型別）
 * @param withTaskId 是否包含 targetTaskId（技能效果專用）
 */
export function normalizeEffectData(
  effect: Record<string, unknown>,
  withTaskId = false
): Record<string, unknown> {
  const type = effect.type as string;
  const defaultTargetType =
    (type === 'item_take' || type === 'item_steal') ? 'other' : 'self';
  const normalizedTargetType =
    (effect.targetType as string | undefined) ?? defaultTargetType;
  const effectData: Record<string, unknown> = {
    type,
    targetType: normalizedTargetType,
    requiresTarget: effect.requiresTarget != null
      ? Boolean(effect.requiresTarget)
      : normalizedTargetType !== 'self',
  };
  if (effect.targetStat != null) effectData.targetStat = String(effect.targetStat);
  if (effect.value != null) effectData.value = Number(effect.value);
  if (effect.statChangeTarget != null) effectData.statChangeTarget = String(effect.statChangeTarget);
  if (effect.syncValue != null) effectData.syncValue = Boolean(effect.syncValue);
  if (effect.targetItemId != null) effectData.targetItemId = String(effect.targetItemId);
  if (withTaskId && effect.targetTaskId != null) effectData.targetTaskId = String(effect.targetTaskId);
  if (effect.duration != null) effectData.duration = Number(effect.duration);
  if (effect.description != null) effectData.description = String(effect.description);
  return effectData;
}

/** normalizeCheckConfig が返す設定パッチ型 */
type CheckConfigPatch = {
  contestConfig?: unknown;
  randomConfig?: { maxValue: number; threshold: number };
};

/**
 * 正規化檢定設定，回傳應合併至道具/技能資料的設定欄位
 * 供 Skills / Items 共用（HIGH-4：contestConfig 缺失升級為 error）
 *
 * @returns 應合併至資料物件的設定欄位（spread 使用）
 */
export function normalizeCheckConfig(
  name: string,
  checkType: string | undefined,
  contestConfig: unknown,
  randomConfig: { maxValue?: number; threshold?: number } | undefined,
): CheckConfigPatch {
  if (checkType === 'contest' || checkType === 'random_contest') {
    if (contestConfig) {
      return { contestConfig };
    }
    console.error(`[field-updaters] ${name} 設定為對抗檢定但沒有 contestConfig`);
    return {};
  }

  if (checkType === 'random') {
    const maxValue = randomConfig?.maxValue;
    const threshold = randomConfig?.threshold;
    if (!maxValue || threshold == null) {
      console.warn(`[field-updaters] ${name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`);
      return {
        randomConfig: {
          maxValue: maxValue && maxValue > 0 ? maxValue : 100,
          threshold: threshold != null && threshold > 0 ? threshold : 50,
        },
      };
    }
    return { randomConfig: { maxValue, threshold: Math.min(threshold, maxValue) } };
  }

  return {};
}
