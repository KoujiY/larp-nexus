/**
 * 檢定資訊顯示組件
 * 統一顯示技能/道具的檢定資訊，樣式對齊特殊效果區塊（左側邊線卡片）
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
  randomContestMaxValue?: number;
}

/** 單列靠左文字，label：value 格式 */
function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="text-xs text-foreground/90">
      <span className="text-muted-foreground">{label}：</span>
      {value}
    </p>
  );
}

/** 對方回應描述：以布林方式顯示是否允許使用道具/技能 */
function opponentResponseText(maxItems: number, maxSkills: number): string {
  if (maxItems === 0 && maxSkills === 0) return '不允許';
  const parts: string[] = [];
  if (maxItems > 0) parts.push('允許使用物品');
  if (maxSkills > 0) parts.push('允許使用技能');
  return parts.join('、');
}

export function CheckInfoDisplay({
  checkType,
  contestConfig,
  randomConfig,
  stats = [],
  checkResult,
  randomContestMaxValue = 100,
}: CheckInfoDisplayProps) {
  if (checkType === 'none') return null;

  const sectionLabel = (
    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1 mb-2">
      檢定資訊
    </h3>
  );

  const tieLabel =
    contestConfig?.tieResolution === 'attacker_wins'
      ? '攻擊方獲勝'
      : contestConfig?.tieResolution === 'defender_wins'
        ? '防守方獲勝'
        : '雙方失敗';

  // 對抗檢定
  if (checkType === 'contest' && contestConfig) {
    const stat = stats.find((s) => s.name === contestConfig.relatedStat);
    const maxItems = contestConfig.opponentMaxItems ?? 0;
    const maxSkills = contestConfig.opponentMaxSkills ?? 0;

    return (
      <div className="space-y-3">
        {sectionLabel}
        <div className="p-4 rounded-r-xl bg-surface-base/40 border-l-2 border-primary/60 space-y-1.5">
          <InfoLine label="類型" value="對抗檢定" />
          <InfoLine
            label="使用數值"
            value={
              <>
                {contestConfig.relatedStat}
                {stat && (
                  <span className="text-muted-foreground ml-1">（當前 {stat.value}）</span>
                )}
              </>
            }
          />
          <InfoLine
            label="使用技能或物品回應"
            value={opponentResponseText(maxItems, maxSkills)}
          />
          <InfoLine label="平手裁決" value={tieLabel} />
        </div>
      </div>
    );
  }

  // 隨機對抗檢定
  if (checkType === 'random_contest' && contestConfig) {
    const maxItems = contestConfig.opponentMaxItems ?? 0;
    const maxSkills = contestConfig.opponentMaxSkills ?? 0;

    return (
      <div className="space-y-3">
        {sectionLabel}
        <div className="p-4 rounded-r-xl bg-surface-base/40 border-l-2 border-primary/60 space-y-1.5">
          <InfoLine label="類型" value="隨機對抗檢定" />
          <InfoLine label="使用數值" value={`隨機擲骰 D${randomContestMaxValue}`} />
          <InfoLine
            label="使用技能或物品回應"
            value={opponentResponseText(maxItems, maxSkills)}
          />
          <InfoLine label="平手裁決" value={tieLabel} />
        </div>
      </div>
    );
  }

  // 隨機檢定
  if (checkType === 'random' && randomConfig) {
    const passed = checkResult !== undefined && checkResult >= randomConfig.threshold;
    const failed = checkResult !== undefined && checkResult < randomConfig.threshold;

    return (
      <div className="space-y-3">
        {sectionLabel}
        <div className="p-4 rounded-r-xl bg-surface-base/40 border-l-2 border-primary/60 space-y-1.5">
          <InfoLine label="類型" value="隨機檢定" />
          <InfoLine label="隨機範圍" value={`1 – ${randomConfig.maxValue}`} />
          <InfoLine label="成功門檻" value={`≥ ${randomConfig.threshold}`} />
          {checkResult !== undefined && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/20 mt-1">
              <span className="text-muted-foreground text-xs">骰出結果：</span>
              <span className="text-sm font-black text-primary">{checkResult}</span>
              {passed && (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-[10px] font-bold text-success uppercase">成功</span>
                </>
              )}
              {failed && (
                <>
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-[10px] font-bold text-destructive uppercase">失敗</span>
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
