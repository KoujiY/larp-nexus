'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CharacterEditForm } from '@/components/gm/character-edit-form';
import { StatsEditForm } from '@/components/gm/stats-edit-form';
import { TemporaryEffectsCard } from '@/components/gm/temporary-effects-card';
import { TasksEditForm } from '@/components/gm/tasks-edit-form';
import { ItemsEditForm } from '@/components/gm/items-edit-form';
import { SkillsEditForm } from '@/components/gm/skills-edit-form';
import { StickySaveBar } from '@/components/gm/sticky-save-bar';
import { useCharacterEditState } from '@/hooks/use-character-edit-state';
import type { CharacterData } from '@/types/character';
import type { CharacterTabKey } from '@/types/gm-edit';

/** Tab 設定：key → label + group */
const TAB_CONFIG: {
  key: CharacterTabKey;
  label: string;
  group: 'narrative' | 'mechanic';
}[] = [
  { key: 'basic', label: '基本設定', group: 'narrative' },
  { key: 'background', label: '背景故事', group: 'narrative' },
  { key: 'secrets', label: '隱藏資訊', group: 'narrative' },
  { key: 'stats', label: '數值', group: 'mechanic' },
  { key: 'tasks', label: '任務', group: 'mechanic' },
  { key: 'items', label: '道具', group: 'mechanic' },
  { key: 'skills', label: '技能', group: 'mechanic' },
];

interface CharacterEditTabsProps {
  character: CharacterData;
  gameId: string;
  randomContestMaxValue?: number;
}

/**
 * 角色編輯頁的 Tabs wrapper（v2）
 *
 * 變更自 v1：
 * - 5 Tab → 7 Tab（新增「背景故事」「隱藏資訊」）
 * - Tab 分兩組：敘事類 | 機制類，中間以豎線分隔
 * - 移除 `window.confirm()` 攔截，切 Tab 不再跳警告
 * - dirty state 跨 Tab 保留，由 Sticky Save Bar 統一管理
 * - 各 Tab 名稱後有 dirty indicator（琥珀金圓點）
 */
export function CharacterEditTabs({
  character,
  gameId,
  randomContestMaxValue,
}: CharacterEditTabsProps) {
  const [activeTab, setActiveTab] = useState<CharacterTabKey>('basic');

  const {
    dirtyState,
    hasDirty,
    dirtyTabCount,
    dirtyTabKeys,
    isSaving,
    registerDirty,
    saveAll,
    discardAll,
  } = useCharacterEditState();

  const narrativeTabs = TAB_CONFIG.filter((t) => t.group === 'narrative');
  const mechanicTabs = TAB_CONFIG.filter((t) => t.group === 'mechanic');

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as CharacterTabKey)}
        className="space-y-6"
      >
        {/* Tab 導航列：分兩組，中間以豎線分隔 */}
        <div className="flex items-center gap-0 border-b border-border/20">
          {/* 敘事類 */}
          <TabsList className="h-auto gap-6 rounded-none border-b-0 bg-transparent p-0 pr-6">
            {narrativeTabs.map((tab) => {
              const isDirty = dirtyState[tab.key].isDirty;
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-medium text-muted-foreground shadow-none outline-none ring-0 transition-all focus-visible:ring-0 focus-visible:outline-none data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {tab.label}
                  {isDirty && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary/80" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* 分隔豎線 */}
          <div className="mb-4 h-6 w-px bg-border/30" />

          {/* 機制類 */}
          <TabsList className="h-auto gap-6 rounded-none border-b-0 bg-transparent p-0 pl-6">
            {mechanicTabs.map((tab) => {
              const isDirty = dirtyState[tab.key].isDirty;
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-medium text-muted-foreground shadow-none outline-none ring-0 transition-all focus-visible:ring-0 focus-visible:outline-none data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {tab.label}
                  {isDirty && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary/80" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* === Tab 內容 === */}

        <TabsContent value="basic" className="space-y-6">
          <CharacterEditForm
            character={character}
            gameId={gameId}
            onDirtyChange={(dirty) =>
              registerDirty('basic', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
          />
        </TabsContent>

        {/* 背景故事 Tab — P5-2 時替換為 BackgroundStoryTab */}
        <TabsContent value="background" className="space-y-6">
          <div className="flex items-center justify-center rounded-xl bg-muted/30 py-16">
            <p className="text-sm text-muted-foreground">
              背景故事 Tab（待 P5-2 實作）
            </p>
          </div>
        </TabsContent>

        {/* 隱藏資訊 Tab — P5-3 時替換為 SecretsTab */}
        <TabsContent value="secrets" className="space-y-6">
          <div className="flex items-center justify-center rounded-xl bg-muted/30 py-16">
            <p className="text-sm text-muted-foreground">
              隱藏資訊 Tab（待 P5-3 實作）
            </p>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-6">
          <StatsEditForm
            characterId={character.id}
            initialStats={character.stats || []}
            onDirtyChange={(dirty) =>
              registerDirty('stats', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
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
            onDirtyChange={(dirty) =>
              registerDirty('tasks', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
          />
        </TabsContent>

        <TabsContent value="items">
          <ItemsEditForm
            characterId={character.id}
            initialItems={character.items || []}
            stats={character.stats || []}
            randomContestMaxValue={randomContestMaxValue}
            onDirtyChange={(dirty) =>
              registerDirty('items', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
          />
        </TabsContent>

        <TabsContent value="skills">
          <SkillsEditForm
            characterId={character.id}
            initialSkills={character.skills || []}
            stats={character.stats || []}
            randomContestMaxValue={randomContestMaxValue}
            onDirtyChange={(dirty) =>
              registerDirty('skills', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
          />
        </TabsContent>
      </Tabs>

      {/* Sticky Save Bar */}
      <StickySaveBar
        dirtyState={dirtyState}
        hasDirty={hasDirty}
        dirtyTabKeys={dirtyTabKeys}
        dirtyTabCount={dirtyTabCount}
        isSaving={isSaving}
        onSaveAll={saveAll}
        onDiscardAll={discardAll}
      />
    </>
  );
}
