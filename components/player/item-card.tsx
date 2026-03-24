'use client';

/**
 * 道具卡片元件（玩家側）
 *
 * 展示道具縮圖、名稱、數量、冷卻狀態、效果標示、
 * 檢定類型標籤與使用限制等資訊。
 * 純展示元件，不持有任何狀態。
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, Package, Sparkles } from 'lucide-react';
import Image from 'next/image';
import type { Item } from '@/types/character';
import { hasItemEffects } from '@/lib/item/get-item-effects';

export interface ItemCardProps {
  item: Item;
  /** 剩餘冷卻秒數；null 表示無冷卻 */
  cooldownRemaining: number | null;
  onClick: () => void;
  disabled?: boolean;
  /** 劇本的隨機對抗檢定上限值（顯示於 random_contest 說明） */
  randomContestMaxValue?: number;
}

export function ItemCard({
  item,
  cooldownRemaining,
  onClick,
  disabled = false,
  randomContestMaxValue = 100,
}: ItemCardProps) {
  const isOnCooldown = cooldownRemaining !== null && cooldownRemaining > 0;

  return (
    <Card
      className={`overflow-hidden transition-all ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-lg'
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="aspect-square relative overflow-hidden bg-muted">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {item.type === 'consumable' ? (
              <Zap className="h-12 w-12 text-muted-foreground" />
            ) : (
              <Package className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}

        {/* 數量標籤 */}
        {item.quantity > 1 && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
            x{item.quantity}
          </div>
        )}

        {/* 冷卻中標籤 */}
        {isOnCooldown && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-white text-center">
              <Clock className="h-6 w-6 mx-auto mb-1" />
              <span className="text-sm font-mono">{cooldownRemaining}s</span>
            </div>
          </div>
        )}

        {/* 有效果標籤 */}
        {hasItemEffects(item) && !isOnCooldown && (
          <div className="absolute top-2 left-2">
            <Sparkles className="h-4 w-4 text-primary drop-shadow-lg" />
          </div>
        )}

        {/* 檢定類型標籤 */}
        {item.checkType && item.checkType !== 'none' && !isOnCooldown && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="text-xs">
              {item.checkType === 'contest'
                ? '對抗'
                : item.checkType === 'random_contest'
                  ? '隨機對抗'
                  : '隨機'}
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <h4 className="font-semibold text-sm line-clamp-1">{item.name}</h4>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
            {item.description}
          </p>
        )}
        {/* 標籤顯示 */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
              </Badge>
            ))}
          </div>
        )}
        {/* 檢定資訊（簡要顯示） */}
        {item.checkType === 'contest' && item.contestConfig && (
          <p className="text-xs text-muted-foreground mt-1">
            使用 {item.contestConfig.relatedStat} 對抗
          </p>
        )}
        {item.checkType === 'random_contest' && (
          <p className="text-xs text-muted-foreground mt-1">
            隨機擲骰，D{randomContestMaxValue} 對抗
          </p>
        )}
        {item.checkType === 'random' && item.randomConfig && (
          <p className="text-xs text-muted-foreground mt-1">
            {item.randomConfig.threshold} / {item.randomConfig.maxValue}
          </p>
        )}
        {/* 使用限制顯示 */}
        {(item.usageLimit != null || item.cooldown != null) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.usageLimit != null && (
              <Badge variant="outline" className="text-xs">
                {item.usageLimit > 0
                  ? `使用次數：${(item.usageLimit || 0) - (item.usageCount || 0)} / ${item.usageLimit}`
                  : '使用次數：無限制'}
              </Badge>
            )}
            {item.cooldown != null && cooldownRemaining === null && (
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {item.cooldown > 0 ? `${item.cooldown}s` : '無冷卻時間'}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
