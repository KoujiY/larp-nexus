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
 */

import { useRef, useEffect } from 'react';
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

  if (characters.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-4 overflow-x-auto py-2 -my-2 px-2 -mx-2 pb-3 snap-x [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/60"
    >
      {characters.map((char) => {
        const isActive = char.id === activeId;
        return (
          <button
            key={char.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSelect?.(char.id)}
            className={`flex-shrink-0 group snap-center focus:outline-none transition-opacity ${
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
  );
}
