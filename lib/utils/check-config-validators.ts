/**
 * 檢定設定驗證工具
 *
 * 提供 GM 編輯表單（items-edit-form / skills-edit-form）共用的純函數驗證邏輯。
 * 各函數均不含 toast 呼叫——呼叫方依回傳的 errorMessage 決定如何顯示錯誤。
 */

import type { ContestConfig, RandomConfig } from '@/types/character';

/** 檢定類型 */
export type CheckType = 'none' | 'contest' | 'random' | 'random_contest';

/** validateCheckConfig 回傳值 */
export type CheckConfigValidationResult =
  | { valid: true }
  | { valid: false; errorMessage: string };

/**
 * 驗證檢定設定是否完整
 *
 * @param checkType   目前選擇的檢定類型
 * @param contestConfig 對抗檢定設定（checkType 為 'contest' 時必須存在且有 relatedStat）
 * @param randomConfig  隨機檢定設定（checkType 為 'random' 時必須存在且有 threshold / maxValue）
 */
export function validateCheckConfig(
  checkType: CheckType | undefined,
  contestConfig: Partial<ContestConfig> | undefined,
  randomConfig: Partial<RandomConfig> | undefined,
): CheckConfigValidationResult {
  switch (checkType) {
    case 'contest':
      if (!contestConfig?.relatedStat) {
        return { valid: false, errorMessage: '請選擇對抗檢定使用的數值' };
      }
      return { valid: true };

    case 'random_contest':
      // 隨機對抗檢定不需要 relatedStat，contestConfig 由 normalizeCheckConfig 自動補齊
      return { valid: true };

    case 'random': {
      if (!randomConfig) {
        return { valid: false, errorMessage: '請設定隨機檢定配置' };
      }
      const { threshold, maxValue } = randomConfig;
      if (threshold === undefined || threshold === null) {
        return { valid: false, errorMessage: '請設定隨機檢定門檻值' };
      }
      if (maxValue === undefined || maxValue === null) {
        return { valid: false, errorMessage: '請設定隨機檢定上限值' };
      }
      if (threshold > maxValue) {
        return { valid: false, errorMessage: '門檻值不得超過上限值' };
      }
      return { valid: true };
    }

    case 'none':
    default:
      return { valid: true };
  }
}
