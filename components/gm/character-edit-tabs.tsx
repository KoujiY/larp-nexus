'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { GmTabsList, GmTabsTrigger } from '@/components/gm/gm-tabs';
import { BasicSettingsTab } from '@/components/gm/basic-settings-tab';
import { BackgroundStoryTab } from '@/components/gm/background-story-tab';
import { SecretsTab } from '@/components/gm/secrets-tab';
import { StatsEditForm } from '@/components/gm/stats-edit-form';
import { TemporaryEffectsCard } from '@/components/gm/temporary-effects-card';
import { EquipmentEffectsPanel } from '@/components/player/equipment-effects-panel';
import { TasksEditForm } from '@/components/gm/tasks-edit-form';
import { ItemsEditForm } from '@/components/gm/items-edit-form';
import { SkillsEditForm } from '@/components/gm/skills-edit-form';
import { StickySaveBar } from '@/components/gm/sticky-save-bar';
import { useCharacterEditState } from '@/hooks/use-character-edit-state';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import { cn } from '@/lib/utils';
import type { CharacterData } from '@/types/character';
import type { CharacterTabKey } from '@/types/gm-edit';
import type { BaseEvent } from '@/types/event';

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
  { key: 'items', label: '物品', group: 'mechanic' },
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
  /** 遊戲是否進行中（Runtime 模式） */
  gameIsActive?: boolean;
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
  gameIsActive = false,
  randomContestMaxValue,
  gameCharacters = [],
}: CharacterEditTabsProps) {
  const [activeTab, setActiveTab] = useState<CharacterTabKey>('basic');
  const router = useRouter();

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

  // 監聽數值相關 WebSocket 事件，當 stats tab 未編輯時自動刷新
  // 僅接收影響數值的事件，與控制台頁面策略對齊（避免道具轉移等非數值事件造成多餘 re-render）
  // skill.used / item.used 不含 stats 資料，數值更新由伴隨的 role.updated 處理
  // equipment.toggled：玩家端裝備/卸除後，stats 分頁的有效數值與 EquipmentEffectsPanel 需同步
  const STAT_REFRESH_EVENTS = ['effect.expired', 'role.updated', 'character.affected', 'equipment.toggled'];
  useCharacterWebSocket(character.id, (event: BaseEvent) => {
    if (STAT_REFRESH_EVENTS.includes(event.type)) {
      // stats / items 表單非 dirty 時靜默刷新；dirty 時不覆蓋 GM 正在編輯的值
      // equipment.toggled 會同時影響 stats 顯示與 items.equipped 欄位，
      // 故兩個 tab 都需檢查 dirty 狀態，避免 router.refresh 蓋掉正在編輯的內容
      if (!dirtyState.stats.isDirty && !dirtyState.items.isDirty) {
        router.refresh();
      }
    }
  });

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
            items={character.items}
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
          {/* 時效性效果 + 裝備效果：桌面並排、手機堆疊 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <TemporaryEffectsCard characterId={character.id} />
            <EquipmentEffectsPanel items={character.items} showEmptyState />
          </div>
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
            gameIsActive={gameIsActive}
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
            gameIsActive={gameIsActive}
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
