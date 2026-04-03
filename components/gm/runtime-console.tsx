'use client';

import { useState, useCallback, useMemo } from 'react';
import { CharacterStatusOverview } from '@/components/gm/character-status-overview';
import { EventLog } from '@/components/gm/event-log';
import { GameBroadcastPanel } from '@/components/gm/game-broadcast-panel';
import { RuntimeConsoleWsListener } from '@/components/gm/runtime-console-ws-listener';
import type { CharacterData, Stat } from '@/types/character';

interface RuntimeConsoleProps {
  gameId: string;
  characters: CharacterData[];
}

/**
 * Runtime 控制台 — 控制台 Tab 的完整內容
 *
 * 佈局：
 * 1. 角色狀態總覽（全寬，水平捲動）— WebSocket 即時更新 stats
 * 2. 事件紀錄（6/10 欄）+ 快速廣播（4/10 欄）— 手動刷新 / 廣播後同步
 *
 * 即時更新策略：
 * - CharacterStatusOverview：WebSocket event payload 直接更新 client state（零 DB 查詢）
 * - EventLog：手動「重新讀取」+ GM 發送廣播後自動同步
 */
export function RuntimeConsole({ gameId, characters }: RuntimeConsoleProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Local character stats state — 從 Server props 初始化，WebSocket 事件增量更新
  const [statsOverrides, setStatsOverrides] = useState<Map<string, Stat[]>>(
    () => new Map(),
  );

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);

  // 合併 Server props + WebSocket 覆蓋的 characters
  const liveCharacters = useMemo(() => {
    if (statsOverrides.size === 0) return characters;
    return characters.map((c) => {
      const override = statsOverrides.get(c.id);
      if (!override) return c;
      return { ...c, stats: override };
    });
  }, [characters, statsOverrides]);

  const characterSummaries = useMemo(
    () => liveCharacters.map((c) => ({ id: c.id, name: c.name })),
    [liveCharacters],
  );

  // 當前 stats 快照（供 WebSocket listener 做增量更新的基準）
  const currentStatsMap = useMemo(() => {
    const map = new Map<string, Stat[]>();
    for (const c of liveCharacters) {
      map.set(c.id, c.stats ?? []);
    }
    return map;
  }, [liveCharacters]);

  const handleStatUpdate = useCallback((characterId: string, stats: Stat[]) => {
    setStatsOverrides((prev) => {
      const next = new Map(prev);
      next.set(characterId, stats);
      return next;
    });
  }, []);

  const handleBroadcastSent = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 高度由 GameEditTabs 的 flex 佈局約束，此處用 h-full 填滿
  return (
    <div className="flex flex-col gap-8 h-full overflow-hidden">
      {/* WebSocket 監聽：stat 變動時更新 client state */}
      <RuntimeConsoleWsListener
        characterIds={characterIds}
        currentStatsMap={currentStatsMap}
        onStatUpdate={handleStatUpdate}
      />

      {/* 1. 角色狀態總覽 */}
      <section className="shrink-0">
        <CharacterStatusOverview characters={liveCharacters} />
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
