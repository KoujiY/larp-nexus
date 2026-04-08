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
import { useCharacterWebSocket, useRoleUpdated } from '@/hooks/use-websocket';
import { cn } from '@/lib/utils';
import type { CharacterData } from '@/types/character';
import type { CharacterTabKey } from '@/types/gm-edit';
import { toast } from 'sonner';
import type { BaseEvent, ItemTransferredEvent, SkillContestEvent } from '@/types/event';

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
    discardOne,
  } = useCharacterEditState();

  // 監聽數值相關 WebSocket 事件，當 stats / items tab 未編輯時自動刷新
  //
  // 此處刻意把 role.updated 拆出走 useRoleUpdated（顯式 includeSilentSync），
  // 因為 silentSync 事件正是裝備切換 / 效果套用 / 效果過期的副作用同步來源，
  // 而本元件就是用 props 通道（router.refresh）統一處理這類更新的單一入口。
  //
  // 其他事件（effect.expired / character.affected / equipment.toggled）走原本
  // 的 useCharacterWebSocket，行為不變。
  const refreshIfNotDirty = () => {
    // stats / items 表單非 dirty 時靜默刷新；dirty 時不覆蓋 GM 正在編輯的值
    if (!dirtyState.stats.isDirty && !dirtyState.items.isDirty) {
      router.refresh();
    }
  };

  useRoleUpdated(
    character.id,
    () => {
      refreshIfNotDirty();
    },
    { includeSilentSync: true },
  );

  // 統一處理所有需要刷新角色編輯頁的 WebSocket 事件。
  // 全部走 refreshIfNotDirty，避免外部事件覆蓋 GM 正在編輯的內容
  // （否則 router.refresh → 新 initialItems → render-time setState 會 wipe 編輯）。
  //
  // 注意：item.transferred 與 skill.contest 來自其他角色的動作，但因 server 端
  // 也對本角色頻道發送，故都會在這裡命中。
  const REFRESH_EVENTS = [
    'effect.expired',
    'character.affected',
    'equipment.toggled',
    'role.inventoryUpdated',
    'skill.used',
  ];
  useCharacterWebSocket(character.id, (event: BaseEvent) => {
    if (REFRESH_EVENTS.includes(event.type)) {
      refreshIfNotDirty();
      return;
    }

    if (event.type === 'item.transferred') {
      const payload = (event as ItemTransferredEvent).payload;
      const involved =
        payload.fromCharacterId === character.id || payload.toCharacterId === character.id;
      if (!involved) return;

      // 玩家動作優先：若 GM 此時正在編輯物品 Tab，主動 discard 並 toast 告知，
      // 因為 Runtime 期間 GM 儲存物品 = 整個 items 陣列覆寫，會把已轉走的物品
      // 又寫回原角色（=兩端重複）。安全做法是讓玩家動作 trump GM 暫存。
      if (dirtyState.items.isDirty) {
        discardOne('items');
        toast.warning('未儲存的物品變更已取消', {
          description: '玩家剛剛轉移了物品，您未儲存的物品編輯已被自動捨棄以避免資料衝突。',
        });
      }

      // 不論是否 dirty，都要刷新（discardOne 後 items tab 已 clean，
      // refreshIfNotDirty 會帶入最新 items 陣列）
      refreshIfNotDirty();

      toast.info('物品已轉移', {
        description:
          payload.fromCharacterId === character.id
            ? `已將 ${payload.quantity} 個「${payload.itemName}」轉移給 ${payload.toCharacterName}`
            : `從 ${payload.fromCharacterName} 收到 ${payload.quantity} 個「${payload.itemName}」`,
      });
      return;
    }

    if (event.type === 'skill.contest') {
      const payload = (event as SkillContestEvent).payload;
      if ((payload.attackerId === character.id || payload.defenderId === character.id) && payload.result) {
        // 等待對抗結果完整寫入後再刷新
        setTimeout(() => { refreshIfNotDirty(); }, 500);
      }
      return;
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
