'use client';

/**
 * 資訊分頁 — 人物關係子分頁
 *
 * 上方顯示性格特徵，下方以水平可捲動的 chip 按鈕列
 * 切換當前檢視的角色關係詳情卡。
 */

import { useState, useRef, useEffect } from 'react';
import type { PublicInfo } from '@/types/character';

interface InfoRelationshipsTabProps {
  publicInfo: PublicInfo;
}

export function InfoRelationshipsTab({ publicInfo }: InfoRelationshipsTabProps) {
  const { personality, relationships } = publicInfo;
  const [activeIndex, setActiveIndex] = useState(0);
  const chipContainerRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  // 切換時自動捲動到可見範圍
  useEffect(() => {
    if (activeChipRef.current && chipContainerRef.current) {
      activeChipRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeIndex]);

  const activeRelation = relationships[activeIndex];

  return (
    <div className="space-y-8">
      {/* 性格特徵 */}
      {personality && (
        <div className="py-2">
          <h4 className="text-primary font-bold text-sm uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full" />
            性格特徵
          </h4>
          <p className="text-muted-foreground leading-relaxed text-base font-light">
            {personality}
          </p>
        </div>
      )}

      {/* 人物關係 */}
      {relationships.length > 0 ? (
        <div className="space-y-4">
          {/* Chip 選擇列 */}
          <div
            ref={chipContainerRef}
            className="flex overflow-x-auto pb-3 gap-2 no-scrollbar [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]"
          >
            {relationships.map((rel, index) => (
              <button
                key={index}
                ref={index === activeIndex ? activeChipRef : undefined}
                onClick={() => setActiveIndex(index)}
                className={`shrink-0 px-5 py-2 rounded-lg font-medium transition-all text-sm ${
                  index === activeIndex
                    ? 'bg-popover text-primary border border-primary/20 font-bold'
                    : 'bg-card text-muted-foreground hover:bg-surface-raised'
                }`}
              >
                {rel.targetName}
              </button>
            ))}
          </div>

          {/* 詳情卡 */}
          {activeRelation && (
            <div className="bg-surface-base p-6 rounded-xl border border-border/10 shadow-xl">
              <div className="flex items-start gap-4">
                {/* 首字母頭像佔位 */}
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-border/20 bg-card flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary/60 select-none">
                    {activeRelation.targetName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <h5 className="text-lg font-bold text-foreground mb-2">
                    {activeRelation.targetName}
                  </h5>
                  <p className="text-muted-foreground leading-relaxed text-sm font-light whitespace-pre-wrap">
                    {activeRelation.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        !personality && (
          <div className="text-center py-12 text-muted-foreground/60">
            <p className="text-sm">尚無人物關係資料</p>
          </div>
        )
      )}
    </div>
  );
}
