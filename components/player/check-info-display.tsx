/**
 * 檢定資訊顯示組件
 * 統一顯示技能/道具的檢定資訊
 * 
 * Phase 7: 拆分 Dialog 組件
 */

'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import type { ContestConfig, RandomConfig } from '@/types/character';

export interface CheckInfoDisplayProps {
  checkType: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: ContestConfig;
  randomConfig?: RandomConfig;
  stats?: Array<{ name: string; value: number }>;
  checkResult?: number;
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
}

/**
 * 檢定資訊顯示組件
 * 根據檢定類型顯示相應的檢定資訊
 */
export function CheckInfoDisplay({
  checkType,
  contestConfig,
  randomConfig,
  stats = [],
  checkResult,
  randomContestMaxValue = 100,
}: CheckInfoDisplayProps) {
  if (checkType === 'none') {
    return null;
  }

  // 對抗檢定
  if (checkType === 'contest' && contestConfig) {
    const stat = stats.find((s) => s.name === contestConfig.relatedStat);
    const maxItems = contestConfig.opponentMaxItems ?? 0;
    const maxSkills = contestConfig.opponentMaxSkills ?? 0;
    const itemsText = maxItems > 0 ? `${maxItems} 個道具` : null;
    const skillsText = maxSkills > 0 ? `${maxSkills} 個技能` : null;
    const parts = [itemsText, skillsText].filter(Boolean);

    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">檢定資訊</h4>
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm">檢定類型：對抗檢定</p>
          <p className="text-sm mt-1">
            使用數值：<strong>{contestConfig.relatedStat}</strong>
            {stat && (
              <span className="ml-2">(當前值: {stat.value})</span>
            )}
          </p>
          {parts.length > 0 && (
            <p className="text-sm mt-1">對方可使用：最多 {parts.join('、')}</p>
          )}
          <p className="text-sm mt-1">
            平手裁決：{
              contestConfig.tieResolution === 'attacker_wins' ? '攻擊方獲勝' :
              contestConfig.tieResolution === 'defender_wins' ? '防守方獲勝' :
              '雙方失敗'
            }
          </p>
          <p className="text-sm mt-2 text-muted-foreground">
            使用技能後，對方會收到通知並可選擇使用道具或技能進行對抗
          </p>
        </div>
      </div>
    );
  }

  // 隨機對抗檢定
  if (checkType === 'random_contest' && contestConfig) {
    const maxItems = contestConfig.opponentMaxItems ?? 0;
    const maxSkills = contestConfig.opponentMaxSkills ?? 0;
    const itemsText = maxItems > 0 ? `${maxItems} 個道具` : null;
    const skillsText = maxSkills > 0 ? `${maxSkills} 個技能` : null;
    const parts = [itemsText, skillsText].filter(Boolean);

    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">檢定資訊</h4>
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm">檢定類型：隨機對抗檢定</p>
          <p className="text-sm mt-1">
            使用數值：<strong>隨機擲骰，D{randomContestMaxValue}</strong>
          </p>
          {parts.length > 0 && (
            <p className="text-sm mt-1">對方可使用：最多 {parts.join('、')}</p>
          )}
          <p className="text-sm mt-1">
            平手裁決：{
              contestConfig.tieResolution === 'attacker_wins' ? '攻擊方獲勝' :
              contestConfig.tieResolution === 'defender_wins' ? '防守方獲勝' :
              '雙方失敗'
            }
          </p>
          <p className="text-sm mt-2 text-muted-foreground">
            使用技能後，對方會收到通知並可選擇使用道具或技能進行對抗
          </p>
        </div>
      </div>
    );
  }

  // 隨機檢定
  if (checkType === 'random' && randomConfig) {
    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">檢定資訊</h4>
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm">檢定類型：隨機檢定</p>
          <p className="text-sm mt-1">隨機範圍：1 - {randomConfig.maxValue}</p>
          <p className="text-sm mt-1">
            檢定門檻：<strong>{randomConfig.threshold}</strong>
            （&ge; {randomConfig.threshold} 即成功）
          </p>
          {checkResult !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <p className="text-sm">骰出結果：<strong>{checkResult}</strong></p>
              {checkResult >= randomConfig.threshold ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm text-success">檢定成功</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">檢定失敗</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

