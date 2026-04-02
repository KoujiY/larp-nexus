'use client';

import { useState, useCallback } from 'react';
import { CharacterStatusOverview } from '@/components/gm/character-status-overview';
import { EventLog } from '@/components/gm/event-log';
import { GameBroadcastPanel } from '@/components/gm/game-broadcast-panel';
import type { CharacterData } from '@/types/character';

interface RuntimeConsoleProps {
  gameId: string;
  characters: CharacterData[];
}

/**
 * Runtime 控制台 — 控制台 Tab 的完整內容
 *
 * 佈局：
 * 1. 角色狀態總覽（全寬，水平捲動）
 * 2. 事件紀錄（6/10 欄）+ 快速廣播（4/10 欄）
 *
 * 刷新機制：GM 發送廣播後會觸發 EventLog 刷新
 */
export function RuntimeConsole({ gameId, characters }: RuntimeConsoleProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const characterSummaries = characters.map((c) => ({ id: c.id, name: c.name }));

  const handleBroadcastSent = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 高度由 GameEditTabs 的 flex 佈局約束，此處用 h-full 填滿
  return (
    <div className="flex flex-col gap-8 h-full overflow-hidden">
      {/* 1. 角色狀態總覽 */}
      <section className="shrink-0">
        <CharacterStatusOverview characters={characters} />
      </section>

      {/* 2. 事件紀錄 + 快速廣播 */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 grow min-h-0">
        <div className="lg:col-span-6 min-h-0">
          <EventLog
            gameId={gameId}
            characters={characterSummaries}
            refreshKey={refreshKey}
          />
        </div>
        <div className="lg:col-span-4 overflow-y-auto">
          <GameBroadcastPanel
            gameId={gameId}
            characters={characterSummaries}
            onBroadcastSent={handleBroadcastSent}
          />
        </div>
      </div>
    </div>
  );
}
