'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { GmTabsList, GmTabsTrigger } from '@/components/gm/gm-tabs';
import { GameEditForm } from '@/components/gm/game-edit-form';
import type { GameData } from '@/types/game';

interface GameEditTabsProps {
  game: GameData;
  charactersTab: React.ReactNode;
  /** Runtime 控制台內容（僅 isActive 時傳入） */
  consoleTab?: React.ReactNode;
}

/**
 * 劇本編輯頁面的 Tabs wrapper
 * 管理分頁切換攔截，當 form 有未儲存變更時以 window.confirm 提醒使用者
 *
 * Tab 結構：
 * - Baseline 模式：劇本資訊 / 角色列表
 * - Runtime 模式：控制台 / 劇本資訊 / 角色列表
 */
export function GameEditTabs({ game, charactersTab, consoleTab }: GameEditTabsProps) {
  const hasConsole = !!consoleTab;
  const [activeTab, setActiveTab] = useState(hasConsole ? 'console' : 'info');
  const [infoDirty, setInfoDirty] = useState(false);

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
          <GmTabsTrigger value="characters">角色列表</GmTabsTrigger>
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

      <TabsContent value="characters" className="space-y-4">
        {charactersTab}
      </TabsContent>
    </Tabs>
  );
}
