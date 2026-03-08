'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GameEditForm } from '@/components/gm/game-edit-form';
import type { GameData } from '@/types/game';

interface GameEditTabsProps {
  game: GameData;
  broadcastPanel: React.ReactNode;
  charactersTab: React.ReactNode;
}

/**
 * 劇本編輯頁面的 Tabs wrapper
 * 管理分頁切換攔截，當 form 有未儲存變更時以 window.confirm 提醒使用者
 */
export function GameEditTabs({ game, broadcastPanel, charactersTab }: GameEditTabsProps) {
  const [activeTab, setActiveTab] = useState('info');
  const [infoDirty, setInfoDirty] = useState(false);

  /** 切換分頁前檢查未儲存變更 */
  const handleTabChange = useCallback((newTab: string) => {
    if (activeTab === 'info' && infoDirty) {
      const confirmed = window.confirm('您有未儲存的變更，確定要離開嗎？');
      if (!confirmed) return;
    }
    setActiveTab(newTab);
  }, [activeTab, infoDirty]);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} activationMode="manual" className="space-y-6">
      <TabsList className="w-auto">
        <TabsTrigger value="info">📋 劇本資訊</TabsTrigger>
        <TabsTrigger value="characters">👥 角色列表</TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="space-y-6">
        <GameEditForm game={game} onDirtyChange={setInfoDirty} />
        {broadcastPanel}
      </TabsContent>

      <TabsContent value="characters" className="space-y-4">
        {charactersTab}
      </TabsContent>
    </Tabs>
  );
}
