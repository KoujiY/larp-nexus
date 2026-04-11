'use client';

/**
 * 裝備效果面板
 *
 * 顯示所有已裝備道具的數值加成。
 * 一個 boost = 一張卡片（與時效性效果一致），同一裝備有多個 boost 時拆成多張。
 *
 * 兩種版型：
 * - GM 版（variant='gm'）：對齊 `temporary-effects-card.tsx` 的卡片排版
 *   - 上方左：來源類型標籤 + 裝備名稱
 *   - 上方右：目標數值名稱 + 變化量 badge（盾牌 icon）
 *   - 底部：「常駐效果」標註
 *
 * - 玩家版（variant='player'）：對齊 `active-effects-panel.tsx` 的緊湊行排版
 *   - 左：裝備名稱 + 「效果: 數值名稱 變化量」
 *   - 右：「常駐」標籤（取代倒數計時的位置）
 */

import { Shield } from 'lucide-react';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { GM_SECTION_TITLE_CLASS } from '@/lib/styles/gm-form';
import type { Item, StatBoost } from '@/types/character';

interface EquipmentEffectsPanelProps {
  items?: Item[];
  /** GM 端顯示空狀態卡片，玩家端預設隱藏 */
  showEmptyState?: boolean;
  /** 版型：'gm' = 全卡片（含區段標題與空狀態），'player' = 緊湊行 */
  variant?: 'gm' | 'player';
}

/** 單張卡要展示的最小資訊：一個 boost + 來源 item */
interface BoostEntry {
  itemId: string;
  itemName: string;
  boost: StatBoost;
}

/**
 * 把已裝備道具的所有 boost 攤平成 BoostEntry 陣列。
 * 同一裝備有 N 個 boost → 產出 N 個 entry，每個獨立顯示為一張卡。
 */
function flattenEquippedBoosts(items?: Item[]): BoostEntry[] {
  if (!items) return [];
  const entries: BoostEntry[] = [];
  for (const item of items) {
    if (item.type !== 'equipment' || !item.equipped || !item.statBoosts) continue;
    for (const boost of item.statBoosts) {
      entries.push({ itemId: item.id, itemName: item.name, boost });
    }
  }
  return entries;
}

/** 變化量描述：用於右上 badge，例：「+5」「最大值 -1」 */
function getBoostChangeText(boost: StatBoost): string {
  const sign = boost.value >= 0 ? '+' : '';
  const isMax = boost.target === 'maxValue' || boost.target === 'both';
  if (isMax) return `最大值 ${sign}${boost.value}`;
  return `${sign}${boost.value}`;
}

/** 玩家版的合併描述：「HP 最大值 +5」 */
function getBoostFullText(boost: StatBoost): string {
  const sign = boost.value >= 0 ? '+' : '';
  const isMax = boost.target === 'maxValue' || boost.target === 'both';
  if (isMax) return `${boost.statName} 最大值 ${sign}${boost.value}`;
  return `${boost.statName} ${sign}${boost.value}`;
}

export function EquipmentEffectsPanel({
  items,
  showEmptyState,
  variant = 'gm',
}: EquipmentEffectsPanelProps) {
  const entries = flattenEquippedBoosts(items);

  // ─── 玩家版：緊湊行 ────────────────────────────────────────
  if (variant === 'player') {
    if (entries.length === 0) return null;

    return (
      <div className="space-y-6">
        {/* 區段標題：與 active-effects-panel 對齊 */}
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-primary rounded-full" />
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            裝備效果
          </h3>
        </div>

        <div className="space-y-4">
          {entries.map((entry, i) => (
            <div
              key={`${entry.itemId}-${i}`}
              className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/10"
            >
              {/* 左側：裝備名稱 + 效果敘述 */}
              <div className="min-w-0 flex-1">
                <h5 className="font-bold text-foreground truncate">
                  {entry.itemName}
                </h5>
                <p className="text-sm text-muted-foreground">
                  效果:{' '}
                  <span className="font-mono font-bold text-primary">
                    {getBoostFullText(entry.boost)}
                  </span>
                </p>
              </div>

              {/* 右側：常駐標記（取代倒數計時的位置） */}
              <div className="text-right shrink-0 ml-4">
                <p className="text-[10px] font-bold text-muted-foreground/50 tracking-widest uppercase mb-1">
                  類型
                </p>
                <span className="font-bold text-muted-foreground inline-flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  常駐
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── GM 版：全卡片 ────────────────────────────────────────
  if (entries.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className="space-y-6">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          裝備效果
        </h2>
        <GmEmptyState
          icon={<Shield className="h-10 w-10" />}
          title="目前沒有裝備效果"
          description="當角色裝備帶有數值加成的物品時，效果會顯示在這裡。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className={GM_SECTION_TITLE_CLASS}>
        <span className="w-1 h-5 bg-primary rounded-full" />
        裝備效果
      </h2>

      <div className="grid grid-cols-1 gap-6">
        {entries.map((entry, i) => (
          <div
            key={`${entry.itemId}-${i}`}
            className="relative overflow-hidden bg-card p-6 rounded-2xl shadow-sm border border-border/10 hover:shadow-md transition-shadow"
          >
            {/* 上方：來源 + 效果值 */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">
                  裝備
                </p>
                <h3 className="text-xl font-extrabold text-foreground">
                  {entry.itemName}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">
                  {entry.boost.statName}
                </p>
                <span className="flex items-center justify-end gap-1 text-primary text-sm font-bold">
                  <Shield className="h-4 w-4" />
                  {getBoostChangeText(entry.boost)}
                </span>
              </div>
            </div>

            {/* 底部：常駐標註（取代時效性效果的進度條 / 施放者區） */}
            <div className="text-[11px] text-muted-foreground">
              常駐效果
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
