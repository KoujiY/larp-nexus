'use client';

/**
 * 道具卡片元件（玩家側）
 *
 * 展示道具圖片、名稱、類型標籤與狀態覆蓋（冷卻/耗盡）。
 * 設計對齊 Stitch Ethereal Artifact 風格：深色卡片、琥珀名稱、無邊框分隔線。
 * 純展示元件，不持有任何狀態。
 */

import { Clock, Lock } from 'lucide-react';
import Image from 'next/image';
import type { Item } from '@/types/character';

export interface ItemCardProps {
  item: Item;
  /** 剩餘冷卻秒數；null 表示無冷卻 */
  cooldownRemaining: number | null;
  onClick: () => void;
  disabled?: boolean;
  /** 保留以維持呼叫端相容（不在卡片上顯示） */
  randomContestMaxValue?: number;
}

const TYPE_LABELS: Record<string, string> = {
  consumable: '消耗品',
  equipment: '裝備',
};

export function ItemCard({
  item,
  cooldownRemaining,
  onClick,
  disabled = false,
}: ItemCardProps) {
  const isOnCooldown = cooldownRemaining !== null && cooldownRemaining > 0;
  const isExhausted =
    item.usageLimit != null &&
    item.usageLimit > 0 &&
    (item.usageCount ?? 0) >= item.usageLimit;
  const isUnavailable = isOnCooldown || isExhausted;

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-card border border-border/30 flex flex-col transition-all ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : isExhausted
            ? 'opacity-60 cursor-pointer'
            : 'cursor-pointer hover:bg-popover active:scale-[0.98]'
      }`}
      onClick={disabled ? undefined : onClick}
    >
      {/* 圖片區域 */}
      <div className="relative aspect-square w-full bg-surface-base overflow-hidden">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className={`object-cover transition-all${
              isOnCooldown ? ' grayscale opacity-40' : ''
            }${isExhausted ? ' grayscale brightness-50' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-bold text-muted-foreground/20 select-none leading-none">
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* 冷卻遮罩 */}
        {isOnCooldown && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex flex-col items-center justify-center">
            <Clock className="h-5 w-5 text-primary animate-pulse mb-1" />
            <span className="text-lg font-bold text-primary font-mono leading-none">
              {cooldownRemaining}s
            </span>
          </div>
        )}

        {/* 耗盡遮罩 */}
        {isExhausted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(254,197,106,0.5) 0.5px, transparent 0.5px)',
                backgroundSize: '4px 4px',
              }}
            />
            <Lock className="h-6 w-6 text-foreground/40 relative z-10" />
          </div>
        )}
      </div>

      {/* 文字區域 */}
      <div className="p-3 flex flex-col flex-1">
        <h3
          className={`font-bold text-xs truncate mb-1 ${
            isUnavailable ? 'text-primary/60' : 'text-primary'
          }`}
        >
          {item.name}
        </h3>
        <div className="flex flex-wrap gap-1 mt-auto">
          {isExhausted ? (
            <span className="text-[9px] bg-border/30 text-muted-foreground px-1.5 py-0.5 rounded font-bold uppercase">
              已耗盡
            </span>
          ) : (
            <>
              <span
                className={`text-[9px] bg-primary/10 px-1.5 py-0.5 rounded font-bold uppercase ${
                  isOnCooldown ? 'text-primary/60' : 'text-primary'
                }`}
              >
                {TYPE_LABELS[item.type] ?? item.type}
              </span>
              {item.tags?.map((tag, i) => (
                <span
                  key={i}
                  className="text-[9px] bg-muted/30 text-muted-foreground px-1.5 py-0.5 rounded font-bold uppercase"
                >
                  {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
                </span>
              ))}
              {item.effects && item.effects.length > 0 && (
                <span
                  className={`text-[9px] bg-primary/10 px-1.5 py-0.5 rounded font-bold uppercase ${
                    isOnCooldown ? 'text-primary/60' : 'text-primary'
                  }`}
                >
                  {item.effects.length} 個效果
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
