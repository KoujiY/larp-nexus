'use client';

/**
 * 角色頭像橫向捲動列表
 *
 * 圓形頭像 + 名稱，支援選取狀態高亮。
 * 用於：世界觀頁面角色列表、人物關係角色選擇。
 *
 * 設計語彙：
 * - 選中：primary 邊框 + 光暈 + 放大 + 金色名稱
 * - 未選中：outline-variant 邊框 + 半透明 + hover 高亮
 * - 溢位時顯示左右箭頭按鈕，點擊跳至下一批
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  /** 檢測滾動狀態，更新箭頭顯示 */
  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // 初始化 + resize 監聽
  useEffect(() => {
    updateScrollState();
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, characters.length]);

  // 選取時自動滾動到可見範圍
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeId]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.7;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  if (characters.length === 0) return null;

  return (
    <div className="relative">
      {/* 左箭頭 */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="cursor-pointer absolute -left-2.5 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 w-6 h-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border/20 shadow-sm flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      {/* 滾動容器 */}
      <div
        ref={containerRef}
        className="flex items-center gap-4 overflow-x-auto py-2 -my-2 px-2 -mx-2 pb-3 snap-x [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/60"
      >
        {characters.map((char) => {
          const isActive = char.id === activeId;
          return (
            <button
              type="button"
              key={char.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelect?.(char.id)}
              className={`shrink-0 group snap-center focus:outline-none cursor-pointer transition-opacity ${
                !isActive && activeId ? 'opacity-60 hover:opacity-100' : ''
              }`}
            >
              <div
                className={`w-16 h-16 rounded-full p-0.5 transition-all ${
                  isActive
                    ? 'bg-primary/20 border-2 border-primary shadow-[0_0_15px_rgba(254,197,106,0.3)] group-hover:scale-110'
                    : 'bg-primary/5 border border-primary/15 group-hover:border-primary group-hover:scale-110'
                }`}
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
                className={`block text-[10px] mt-2 text-center uppercase tracking-widest ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground font-medium'
                }`}
              >
                {char.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* 右箭頭 */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="cursor-pointer absolute -right-2.5 translate-x-1/2 top-1/2 -translate-y-1/2 z-10 w-6 h-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border/20 shadow-sm flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
