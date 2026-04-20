'use client';

/**
 * 資訊分頁 — 人物關係子分頁
 *
 * 上方顯示性格特徵，下方以 CharacterAvatarList 橫向捲動
 * 切換當前檢視的角色關係詳情卡。
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { PublicInfo } from '@/types/character';
import { CollapsibleSection } from './collapsible-section';

// CharacterAvatarList 內含 embla-carousel（~7 KB gz），此 tab 非預設分頁，
// 改 dynamic 讓 /c/[characterId] 玩家角色卡初始載入不攜帶 carousel。
// 注意：`/g/[gameId]` 的 world-info-view 仍靜態載入（世界觀頁預設就顯示頭像列）。
const CharacterAvatarList = dynamic(
  () => import('./character-avatar-list').then((m) => ({ default: m.CharacterAvatarList })),
  { ssr: false },
);

interface InfoRelationshipsTabProps {
  publicInfo: PublicInfo;
}

export function InfoRelationshipsTab({ publicInfo }: InfoRelationshipsTabProps) {
  const { personality, relationships } = publicInfo;
  const [activeId, setActiveId] = useState<string | undefined>(
    relationships.length > 0 ? '0' : undefined,
  );

  const activeRelation = activeId !== undefined
    ? relationships[parseInt(activeId)]
    : undefined;

  // 將 relationships 映射為 AvatarCharacter 格式
  const avatarCharacters = relationships.map((rel, index) => ({
    id: String(index),
    name: rel.targetName,
  }));

  return (
    <div className="space-y-8">
      {/* 性格特徵 */}
      {personality && (
        <CollapsibleSection title="性格特徵">
          <p className="whitespace-pre-wrap">{personality}</p>
        </CollapsibleSection>
      )}

      {/* 人物關係 */}
      {relationships.length > 0 ? (
        <div className="space-y-4">
          {/* 頭像選擇列 */}
          <CharacterAvatarList
            characters={avatarCharacters}
            activeId={activeId}
            onSelect={setActiveId}
          />

          {/* 詳情卡 */}
          {activeRelation && (
            <div className="bg-surface-base p-6 rounded-xl border border-primary/5 shadow-xl">
              <div className="flex items-start gap-4">
                {/* 首字母頭像佔位 */}
                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border border-primary/15 bg-card flex items-center justify-center">
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
