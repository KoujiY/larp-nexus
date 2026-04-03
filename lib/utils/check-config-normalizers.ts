/**
 * 檢定設定正規化工具
 *
 * 提供 GM 編輯表單（items-edit-form / skills-edit-form）共用的純函數正規化邏輯。
 * 在儲存前呼叫，確保 contestConfig / randomConfig 的存在性與預設值正確，
 * 並清除不對應的設定欄位。
 */

import type { ContestConfig, RandomConfig } from '@/types/character';
import type { CheckType } from './check-config-validators';

/** normalizeCheckConfig 回傳值 */
export interface CheckConfigPatch {
  contestConfig: ContestConfig | undefined;
  randomConfig: RandomConfig | undefined;
}

/** 對抗檢定預設值（適用於 contest 與 random_contest） */
const DEFAULT_CONTEST_CONFIG: ContestConfig = {
  relatedStat: '',
  opponentMaxItems: 0,
  opponentMaxSkills: 0,
  tieResolution: 'attacker_wins',
};

/**
 * 將 checkType 對應的設定欄位正規化
 *
 * - `random`         : 確保 randomConfig 有效值（maxValue/threshold 補預設），清除 contestConfig
 * - `contest`        : 確保 contestConfig 存在（補預設值），清除 randomConfig
 * - `random_contest` : 確保 contestConfig 存在（relatedStat 為空字串），清除 randomConfig
 * - `none` / 其他    : 清除兩者
 *
 * @param checkType     目前選擇的檢定類型
 * @param contestConfig 編輯中的對抗檢定設定
 * @param randomConfig  編輯中的隨機檢定設定
 */
export function normalizeCheckConfig(
  checkType: CheckType | undefined,
  contestConfig: Partial<ContestConfig> | undefined,
  randomConfig: Partial<RandomConfig> | undefined,
): CheckConfigPatch {
  switch (checkType) {
    case 'random': {
      const maxValue =
        randomConfig?.maxValue !== undefined && randomConfig.maxValue > 0
          ? randomConfig.maxValue
          : 100;
      const rawThreshold =
        randomConfig?.threshold !== undefined &&
        randomConfig.threshold !== null &&
        randomConfig.threshold > 0
          ? randomConfig.threshold
          : 50;
      const threshold = Math.min(rawThreshold, maxValue);
      return {
        contestConfig: undefined,
        randomConfig: { maxValue, threshold },
      };
    }

    case 'contest': {
      const existing = contestConfig ?? {};
      return {
        contestConfig: {
          relatedStat: existing.relatedStat ?? DEFAULT_CONTEST_CONFIG.relatedStat,
          opponentMaxItems: existing.opponentMaxItems ?? DEFAULT_CONTEST_CONFIG.opponentMaxItems,
          opponentMaxSkills: existing.opponentMaxSkills ?? DEFAULT_CONTEST_CONFIG.opponentMaxSkills,
          tieResolution: existing.tieResolution ?? DEFAULT_CONTEST_CONFIG.tieResolution,
        },
        randomConfig: undefined,
      };
    }

    case 'random_contest': {
      const existing = contestConfig ?? {};
      return {
        contestConfig: {
          relatedStat: '', // random_contest 不使用 relatedStat
          opponentMaxItems: existing.opponentMaxItems ?? DEFAULT_CONTEST_CONFIG.opponentMaxItems,
          opponentMaxSkills: existing.opponentMaxSkills ?? DEFAULT_CONTEST_CONFIG.opponentMaxSkills,
          tieResolution: existing.tieResolution ?? DEFAULT_CONTEST_CONFIG.tieResolution,
        },
        randomConfig: undefined,
      };
    }

    case 'none':
    default:
      return { contestConfig: undefined, randomConfig: undefined };
  }
}
