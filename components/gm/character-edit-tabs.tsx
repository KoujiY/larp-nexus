'use client';

import { useState } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { GmTabsList, GmTabsTrigger } from '@/components/gm/gm-tabs';
import { BasicSettingsTab } from '@/components/gm/basic-settings-tab';
import { BackgroundStoryTab } from '@/components/gm/background-story-tab';
import { SecretsTab } from '@/components/gm/secrets-tab';
import { StatsEditForm } from '@/components/gm/stats-edit-form';
import { TemporaryEffectsCard } from '@/components/gm/temporary-effects-card';
import { TasksEditForm } from '@/components/gm/tasks-edit-form';
import { ItemsEditForm } from '@/components/gm/items-edit-form';
import { SkillsEditForm } from '@/components/gm/skills-edit-form';
import { StickySaveBar } from '@/components/gm/sticky-save-bar';
import { useCharacterEditState } from '@/hooks/use-character-edit-state';
import { cn } from '@/lib/utils';
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

/** 同劇本角色摘要（用於人物關係頭像列表） */
export type GameCharacterSummary = {
  id: string;
  name: string;
  imageUrl?: string;
};

interface CharacterEditTabsProps {
  character: CharacterData;
  gameId: string;
  randomContestMaxValue?: number;
  /** 同劇本所有角色摘要（排除自身），用於 Tab 2 人物關係 */
  gameCharacters?: GameCharacterSummary[];
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
  gameCharacters = [],
}: CharacterEditTabsProps) {
  const [activeTab, setActiveTab] = useState<CharacterTabKey>('basic');

  /** 這些 tab 需要填滿視窗高度、禁止外層滾動，內部獨立捲動 */
  const isFullHeightTab = activeTab === 'background' || activeTab === 'secrets';

  const {
    dirtyState,
    hasDirty,
    dirtyTabCount,
    dirtyTabKeys,
    isSaving,
    registerDirty,
    registerSaveHandler,
    registerDiscardHandler,
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
        className={
          isFullHeightTab
            ? 'h-[calc(100dvh-240px)] flex flex-col overflow-hidden pb-2'
            : 'space-y-6'
        }
      >
        {/* Tab 導航列：分兩組，中間以豎線分隔 */}
        <div className={`flex items-center gap-0 border-b border-border/20 ${isFullHeightTab ? 'shrink-0' : ''}`}>
          {/* 敘事類 */}
          <GmTabsList className="pr-6 gap-6">
            {narrativeTabs.map((tab) => {
              const isDirty = dirtyState[tab.key].isDirty;
              return (
                <GmTabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="px-0"
                >
                  {tab.label}
                  {isDirty && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary/80" />
                  )}
                </GmTabsTrigger>
              );
            })}
          </GmTabsList>

          {/* 分隔豎線 */}
          <div className="mb-4 h-6 w-px bg-border/30" />

          {/* 機制類 */}
          <GmTabsList className="pl-6 gap-6">
            {mechanicTabs.map((tab) => {
              const isDirty = dirtyState[tab.key].isDirty;
              return (
                <GmTabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="px-0"
                >
                  {tab.label}
                  {isDirty && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary/80" />
                  )}
                </GmTabsTrigger>
              );
            })}
          </GmTabsList>
        </div>

        {/* === Tab 內容 === */}

        <TabsContent value="basic" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <BasicSettingsTab
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
            onRegisterSave={(h) => registerSaveHandler('basic', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('basic', h)}
          />
        </TabsContent>

        <TabsContent value="background" forceMount className={cn('data-[state=inactive]:hidden', isFullHeightTab ? 'flex-1 min-h-0 mt-6' : 'space-y-6')}>
          <BackgroundStoryTab
            character={character}
            gameCharacters={gameCharacters}
            onDirtyChange={(dirty) =>
              registerDirty('background', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
            onRegisterSave={(h) => registerSaveHandler('background', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('background', h)}
          />
        </TabsContent>

        <TabsContent value="secrets" forceMount className={cn('data-[state=inactive]:hidden', isFullHeightTab ? 'flex-1 min-h-0 mt-6' : 'space-y-6')}>
          <SecretsTab
            character={character}
            gameId={gameId}
            onDirtyChange={(dirty) =>
              registerDirty('secrets', {
                isDirty: dirty,
                added: 0,
                modified: dirty ? 1 : 0,
                deleted: 0,
              })
            }
            onRegisterSave={(h) => registerSaveHandler('secrets', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('secrets', h)}
          />
        </TabsContent>

        <TabsContent value="stats" forceMount className="space-y-6 data-[state=inactive]:hidden">
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
            onRegisterSave={(h) => registerSaveHandler('stats', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('stats', h)}
          />
          <TemporaryEffectsCard characterId={character.id} />
        </TabsContent>

        <TabsContent value="tasks" forceMount className="data-[state=inactive]:hidden">
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
            onRegisterSave={(h) => registerSaveHandler('tasks', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('tasks', h)}
          />
        </TabsContent>

        <TabsContent value="items" forceMount className="data-[state=inactive]:hidden">
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
            onRegisterSave={(h) => registerSaveHandler('items', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('items', h)}
          />
        </TabsContent>

        <TabsContent value="skills" forceMount className="data-[state=inactive]:hidden">
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
            onRegisterSave={(h) => registerSaveHandler('skills', h)}
            onRegisterDiscard={(h) => registerDiscardHandler('skills', h)}
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
