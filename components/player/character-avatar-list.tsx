'use client';

/**
 * 角色頭像橫向捲動列表
 *
 * 基於 shadcn/ui Carousel（embla-carousel）實作。
 * 圓形頭像 + 名稱，支援選取狀態高亮。
 * 用於：世界觀頁面角色列表、人物關係角色選擇。
 *
 * 設計語彙：
 * - 選中：primary 邊框 + 光暈 + 放大 + 金色名稱
 * - 未選中：outline-variant 邊框 + 半透明 + hover 高亮
 * - 左右箭頭常駐，到底端時 disabled
 */

import { useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

export interface AvatarCharacter {
  id: string;
  name: string;
  imageUrl?: string;
}

interface CharacterAvatarListProps {
  characters: AvatarCharacter[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

export function CharacterAvatarList({
  characters,
  activeId,
  onSelect,
}: CharacterAvatarListProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  /** 監聽 embla 的 select 事件更新箭頭狀態 */
  useEffect(() => {
    if (!api) return;

    const updateButtons = () => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };

    updateButtons();
    api.on('select', updateButtons);
    api.on('reInit', updateButtons);

    return () => {
      api.off('select', updateButtons);
      api.off('reInit', updateButtons);
    };
  }, [api]);

  /** 選取角色時自動滾動到該位置 */
  useEffect(() => {
    if (!api || !activeId) return;
    const index = characters.findIndex((c) => c.id === activeId);
    if (index >= 0) {
      api.scrollTo(index);
    }
  }, [api, activeId, characters]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  if (characters.length === 0) return null;

  return (
    <div className="relative">
      {/* 左箭頭（常駐） */}
      <button
        type="button"
        onClick={scrollPrev}
        disabled={!canScrollPrev}
        className="cursor-pointer absolute -left-2.5 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20 w-6 h-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border/20 shadow-sm flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-0 disabled:pointer-events-none"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <Carousel
        opts={{
          align: 'start',
          slidesToScroll: 'auto',
          containScroll: 'trimSnaps',
        }}
        setApi={setApi}
        className="w-full"
      >
        <CarouselContent className="-ml-2">
          {characters.map((char) => {
            const isActive = char.id === activeId;
            return (
              <CarouselItem
                key={char.id}
                className="basis-auto pl-2"
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(char.id)}
                  className={cn(
                    'w-[72px] flex flex-col items-center group focus:outline-none cursor-pointer transition-opacity',
                    !isActive && activeId ? 'opacity-60 hover:opacity-100' : ''
                  )}
                >
                  <div
                    className={cn(
                      'w-16 h-16 rounded-full p-0.5 transition-all',
                      isActive
                        ? 'bg-primary/20 border-2 border-primary shadow-[0_0_15px_rgba(254,197,106,0.3)] group-hover:scale-110'
                        : 'bg-primary/5 border border-primary/15 group-hover:border-primary group-hover:scale-110'
                    )}
                  >
                    {char.imageUrl ? (
                      <Image
                        src={char.imageUrl}
                        alt={char.name}
                        width={64}
                        height={64}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
                        <span className="text-lg font-bold text-primary/60 select-none">
                          {char.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      'block w-full text-[10px] mt-2 text-center wrap-break-word line-clamp-2 uppercase tracking-widest',
                      isActive
                        ? 'text-primary font-bold'
                        : 'text-muted-foreground font-medium'
                    )}
                  >
                    {char.name}
                  </span>
                </button>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {/* 右箭頭（常駐） */}
      <button
        type="button"
        onClick={scrollNext}
        disabled={!canScrollNext}
        className="cursor-pointer absolute -right-2.5 translate-x-1/2 top-1/2 -translate-y-1/2 z-20 w-6 h-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border/20 shadow-sm flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-0 disabled:pointer-events-none"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
