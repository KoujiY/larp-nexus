'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { GmTabsList, GmTabsTrigger } from '@/components/gm/gm-tabs';
import { GameEditForm } from '@/components/gm/game-edit-form';
import { PresetEventsEditForm } from '@/components/gm/preset-events-edit-form';
import { CharacterImportTab } from '@/components/gm/character-import-tab';
import type { GameData } from '@/types/game';
import type { CharacterData } from '@/types/character';

interface GameEditTabsProps {
  game: GameData;
  characters: CharacterData[];
  charactersTab: React.ReactNode;
  /** Runtime 控制台內容（僅 isActive 時傳入） */
  consoleTab?: React.ReactNode;
  hasAiConfig: boolean;
}

/**
 * 劇本編輯頁面的 Tabs wrapper
 * 管理分頁切換攔截，當 form 有未儲存變更時以 window.confirm 提醒使用者
 *
 * Tab 結構：
 * - Baseline 模式：劇本資訊 / 預設事件 / 角色列表
 * - Runtime 模式：控制台 / 劇本資訊 / 預設事件 / 角色列表
 */
export function GameEditTabs({ game, characters, charactersTab, consoleTab, hasAiConfig }: GameEditTabsProps) {
  const hasConsole = !!consoleTab;
  const [activeTab, setActiveTab] = useState(hasConsole ? 'console' : 'info');
  const [infoDirty, setInfoDirty] = useState(false);
  const [importDirty, setImportDirty] = useState(false);

  const handleTabChange = useCallback((newTab: string) => {
    if (activeTab === 'info' && infoDirty) {
      const confirmed = window.confirm('您有未儲存的變更，確定要離開嗎？');
      if (!confirmed) return;
    }
    setActiveTab(newTab);
  }, [activeTab, infoDirty]);

  // 控制台模式需要限制高度，讓 EventLog 自適應剩餘空間
  // offset ≈ banner(41) + header(~200) + content-padding(48) + margin(~20) = ~310px
  const isConsoleActive = hasConsole && activeTab === 'console';

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      activationMode="manual"
      className={
        isConsoleActive
          ? 'h-[calc(100dvh-310px)] flex flex-col overflow-hidden'
          : 'space-y-6'
      }
    >
      <div className="border-b border-border/10 shrink-0">
        <GmTabsList>
          {hasConsole && (
            <GmTabsTrigger value="console">控制台</GmTabsTrigger>
          )}
          <GmTabsTrigger value="info">劇本資訊</GmTabsTrigger>
          <GmTabsTrigger value="events">預設事件</GmTabsTrigger>
          <GmTabsTrigger value="characters">角色列表</GmTabsTrigger>
          <GmTabsTrigger value="import">
            角色匯入
            {importDirty && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </GmTabsTrigger>
        </GmTabsList>
      </div>

      {hasConsole && (
        <TabsContent
          value="console"
          className={isConsoleActive ? 'flex-1 min-h-0 mt-6' : 'space-y-6'}
        >
          {consoleTab}
        </TabsContent>
      )}

      <TabsContent value="info" className="space-y-6">
        <GameEditForm game={game} onDirtyChange={setInfoDirty} />
      </TabsContent>

      <TabsContent value="events" className="space-y-6">
        <PresetEventsEditForm
          gameId={game.id}
          initialEvents={game.presetEvents || []}
          characters={characters}
          isRuntime={game.isActive}
        />
      </TabsContent>

      <TabsContent value="characters" className="space-y-4">
        {charactersTab}
      </TabsContent>

      <TabsContent
        value="import"
        forceMount
        className={activeTab !== 'import' ? 'hidden' : 'space-y-6'}
      >
        <CharacterImportTab
          gameId={game.id}
          hasAiConfig={hasAiConfig}
          isActive={game.isActive}
          onDirtyChange={setImportDirty}
        />
      </TabsContent>
    </Tabs>
  );
}
