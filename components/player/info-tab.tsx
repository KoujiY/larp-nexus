'use client';

/**
 * 資訊分頁 — 次級選單容器
 *
 * 將原本平鋪的公開資訊和額外資訊改為三個子分頁：
 * 角色故事 / 人物關係 / 額外資訊
 *
 * 使用底線式分頁切換（設計稿指定樣式）。
 */

import { useState } from 'react';
import { InfoStoryTab } from './info-story-tab';
import { InfoRelationshipsTab } from './info-relationships-tab';
import { InfoSecretsTab } from './info-secrets-tab';
import type { PublicInfo, SecretInfo } from '@/types/character';

interface InfoTabProps {
  publicInfo?: PublicInfo;
  secretInfo?: SecretInfo;
  characterId: string;
}

const SUB_TABS = [
  { value: 'story', label: '角色故事' },
  { value: 'relations', label: '人物關係' },
  { value: 'secrets', label: '額外資訊' },
] as const;

type SubTabValue = (typeof SUB_TABS)[number]['value'];

export function InfoTab({ publicInfo, secretInfo, characterId }: InfoTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabValue>('story');

  return (
    <div>
      {/* 次級選單 — 底線式 */}
      <div className="border-b border-border/10 mb-6 -mx-6 px-6">
        <div className="flex">
          {SUB_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveSubTab(value)}
              className={`flex-1 py-4 text-sm font-bold tracking-wider transition-all duration-300 border-b-2 ${
                activeSubTab === value
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-primary/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 子分頁內容 */}
      {activeSubTab === 'story' && (
        <InfoStoryTab background={publicInfo?.background ?? []} />
      )}
      {activeSubTab === 'relations' && publicInfo && (
        <InfoRelationshipsTab publicInfo={publicInfo} />
      )}
      {activeSubTab === 'relations' && !publicInfo && (
        <div className="text-center py-12 text-muted-foreground/60">
          <p className="text-sm">尚無公開資訊</p>
        </div>
      )}
      {activeSubTab === 'secrets' && (
        <InfoSecretsTab secretInfo={secretInfo} characterId={characterId} />
      )}
    </div>
  );
}
