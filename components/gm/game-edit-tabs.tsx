'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { GmTabsList, GmTabsTrigger } from '@/components/gm/gm-tabs';
import { GameEditForm } from '@/components/gm/game-edit-form';
import type { GameData } from '@/types/game';

interface GameEditTabsProps {
  game: GameData;
  charactersTab: React.ReactNode;
}

/**
 * 劇本編輯頁面的 Tabs wrapper
 * 管理分頁切換攔截，當 form 有未儲存變更時以 window.confirm 提醒使用者
 */
export function GameEditTabs({ game, charactersTab }: GameEditTabsProps) {
  const [activeTab, setActiveTab] = useState('info');
  const [infoDirty, setInfoDirty] = useState(false);

  const handleTabChange = useCallback((newTab: string) => {
    if (activeTab === 'info' && infoDirty) {
      const confirmed = window.confirm('您有未儲存的變更，確定要離開嗎？');
      if (!confirmed) return;
    }
    setActiveTab(newTab);
  }, [activeTab, infoDirty]);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} activationMode="manual" className="space-y-6">
      <div className="border-b border-border/10">
        <GmTabsList>
          <GmTabsTrigger value="info">劇本資訊</GmTabsTrigger>
          <GmTabsTrigger value="characters">角色列表</GmTabsTrigger>
        </GmTabsList>
      </div>

      <TabsContent value="info" className="space-y-6">
        <GameEditForm game={game} onDirtyChange={setInfoDirty} />
      </TabsContent>

      <TabsContent value="characters" className="space-y-4">
        {charactersTab}
      </TabsContent>
    </Tabs>
  );
}
