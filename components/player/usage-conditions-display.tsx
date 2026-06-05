'use client';

/**
 * Feature 3: 玩家端使用條件資訊顯示（技能/物品詳情共用）
 *
 * 以「寫法」直覺傳達消耗 vs 門檻，不使用額外標籤：
 * - 消耗型 stat：`10MP`（值+名稱，RPG 慣例即表示消耗）
 * - 門檻型 stat：`MP ≥ 10`（需達門檻，不消耗）
 * - 消耗型 item：`炸彈 ×1`（消耗數量）
 * - 門檻型 item：`炸彈`（僅需持有，不標數量）
 *
 * 版型對齊「技能效果」「檢定資訊」區塊，置於兩者之間。
 */

import type { UsageCondition } from '@/types/character';

interface UsageConditionsDisplayProps {
  conditions?: UsageCondition[];
}

/** 將單一條件轉為直覺顯示文字 */
function describe(condition: UsageCondition): string {
  if (condition.type === 'stat') {
    return condition.consume
      ? `${condition.value}${condition.statName}`
      : `${condition.statName} ≥ ${condition.value}`;
  }
  return condition.consume ? `${condition.itemName} ×${condition.quantity}` : condition.itemName;
}

export function UsageConditionsDisplay({ conditions }: UsageConditionsDisplayProps) {
  if (!conditions || conditions.length === 0) return null;

  // 多個條件統一在同一張卡片內，以「、」相連（不分多卡）；內文樣式對齊檢定資訊區塊
  return (
    <div className="space-y-3 mb-8">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1 mb-2">
        使用條件
      </h3>
      <div className="p-4 rounded-r-xl bg-surface-base/40 border-l-2 border-primary/60">
        <p className="text-xs text-foreground/90">{conditions.map(describe).join('、')}</p>
      </div>
    </div>
  );
}
