'use client';

import { useState, useCallback, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, BarChart3, CheckSquare, Package, Zap } from 'lucide-react';
import { CharacterEditForm } from '@/components/gm/character-edit-form';
import { StatsEditForm } from '@/components/gm/stats-edit-form';
import { TemporaryEffectsCard } from '@/components/gm/temporary-effects-card';
import { TasksEditForm } from '@/components/gm/tasks-edit-form';
import { ItemsEditForm } from '@/components/gm/items-edit-form';
import { SkillsEditForm } from '@/components/gm/skills-edit-form';
import type { CharacterData } from '@/types/character';

interface CharacterEditTabsProps {
  character: CharacterData;
  gameId: string;
  randomContestMaxValue?: number;
}

/**
 * 角色編輯頁面的 Tabs wrapper
 * 管理 5 個分頁的切換攔截，當任一 form 有未儲存變更時以 window.confirm 提醒使用者
 */
export function CharacterEditTabs({ character, gameId, randomContestMaxValue }: CharacterEditTabsProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({});

  /** 為每個 tab 建立穩定的 onDirtyChange callback，避免不必要的 re-render */
  const dirtyCallbacks = useMemo(() => {
    const create = (key: string) => (dirty: boolean) => {
      setDirtyTabs((prev) => ({ ...prev, [key]: dirty }));
    };
    return {
      basic: create('basic'),
      stats: create('stats'),
      tasks: create('tasks'),
      items: create('items'),
      skills: create('skills'),
    };
  }, []);

  /** 切換分頁前檢查目前分頁是否有未儲存變更 */
  const handleTabChange = useCallback((newTab: string) => {
    if (dirtyTabs[activeTab]) {
      const confirmed = window.confirm('您有未儲存的變更，確定要離開嗎？');
      if (!confirmed) return;
    }
    setActiveTab(newTab);
  }, [activeTab, dirtyTabs]);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} activationMode="manual" className="space-y-6">
      <TabsList className="w-auto">
        <TabsTrigger value="basic" className="flex items-center gap-1.5"><FileText className="h-4 w-4" />基本資訊</TabsTrigger>
        <TabsTrigger value="stats" className="flex items-center gap-1.5"><BarChart3 className="h-4 w-4" />角色數值</TabsTrigger>
        <TabsTrigger value="tasks" className="flex items-center gap-1.5"><CheckSquare className="h-4 w-4" />任務管理</TabsTrigger>
        <TabsTrigger value="items" className="flex items-center gap-1.5"><Package className="h-4 w-4" />道具管理</TabsTrigger>
        <TabsTrigger value="skills" className="flex items-center gap-1.5"><Zap className="h-4 w-4" />技能管理</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-6">
        <CharacterEditForm
          character={character}
          gameId={gameId}
          onDirtyChange={dirtyCallbacks.basic}
        />
      </TabsContent>

      <TabsContent value="stats" className="space-y-6">
        <StatsEditForm
          characterId={character.id}
          initialStats={character.stats || []}
          onDirtyChange={dirtyCallbacks.stats}
        />
        <TemporaryEffectsCard characterId={character.id} />
      </TabsContent>

      <TabsContent value="tasks">
        <TasksEditForm
          characterId={character.id}
          gameId={gameId}
          initialTasks={character.tasks || []}
          secrets={(character.secretInfo?.secrets || []).map((s) => ({
            id: s.id,
            title: s.title,
          }))}
          onDirtyChange={dirtyCallbacks.tasks}
        />
      </TabsContent>

      <TabsContent value="items">
        <ItemsEditForm
          characterId={character.id}
          initialItems={character.items || []}
          stats={character.stats || []}
          randomContestMaxValue={randomContestMaxValue}
          onDirtyChange={dirtyCallbacks.items}
        />
      </TabsContent>

      <TabsContent value="skills">
        <SkillsEditForm
          characterId={character.id}
          initialSkills={character.skills || []}
          stats={character.stats || []}
          randomContestMaxValue={randomContestMaxValue}
          onDirtyChange={dirtyCallbacks.skills}
        />
      </TabsContent>
    </Tabs>
  );
}
