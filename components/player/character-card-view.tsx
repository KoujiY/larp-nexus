'use client';

import { useState, useSyncExternalStore, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CharacterData } from '@/types/character';
import { PinUnlock } from './pin-unlock';
import { PublicInfoSection } from './public-info-section';
import { SecretInfoSection } from './secret-info-section';
import { StatsDisplay } from './stats-display';
import { ActiveEffectsPanel } from './active-effects-panel';
import { TaskList } from './task-list';
import { ItemList } from './item-list';
import { SkillList } from './skill-list';
import { WorldInfoLink } from './world-info-link';
import { useItem as consumeItemAction, transferItem as transferItemAction } from '@/app/actions/item-use';
import { checkExpiredEffects } from '@/app/actions/temporary-effects';
import { toast } from 'sonner';
import Image from 'next/image';
import { ContestResponseDialog } from './contest-response-dialog';
import { TargetItemSelectionDialog } from './target-item-selection-dialog';
import { ItemShowcaseDialog } from './item-showcase-dialog';
import type { ShowcasedItemInfo } from './item-showcase-dialog';
import { useNotificationSystem } from '@/hooks/use-notification-system';
import { useContestDialogManagement } from '@/hooks/use-contest-dialog-management';
import { useGameEventHandler } from '@/hooks/use-game-event-handler';
import { CharacterModeBanner } from './character-mode-banner';
import { NotificationButton } from './notification-button';
import { GameEndedDialog } from './game-ended-dialog';
import { FileText, BarChart3, CheckSquare, Package, Zap, Hash, CalendarDays, User } from 'lucide-react';

interface CharacterCardViewProps {
  character: CharacterData;
  isReadOnly?: boolean; // Phase 10.5.4: 預覽模式標記
}

/**
 * Hook 用於安全地讀取 localStorage 解鎖狀態（避免 SSR/CSR hydration 問題）
 * Phase 10: 回傳 { isUnlocked, hasFullAccess }
 */
function useLocalStorageUnlock(characterId: string, hasPinLock: boolean) {
  const unlockedKey = `character-${characterId}-unlocked`;
  const fullAccessKey = `character-${characterId}-fullAccess`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    []
  );

  const getUnlockedSnapshot = useCallback(() => {
    if (!hasPinLock) return true;
    return localStorage.getItem(unlockedKey) === 'true';
  }, [hasPinLock, unlockedKey]);

  const getFullAccessSnapshot = useCallback(() => {
    if (!hasPinLock) return true;
    return localStorage.getItem(fullAccessKey) === 'true';
  }, [hasPinLock, fullAccessKey]);

  // Server 端的快照
  const getServerSnapshot = useCallback(() => !hasPinLock, [hasPinLock]);

  const isUnlocked = useSyncExternalStore(subscribe, getUnlockedSnapshot, getServerSnapshot);
  const hasFullAccess = useSyncExternalStore(subscribe, getFullAccessSnapshot, getServerSnapshot);

  return { isUnlocked, hasFullAccess };
}

export function CharacterCardView({ character, isReadOnly: isReadOnlyProp = false }: CharacterCardViewProps) {
  const router = useRouter();

  // 使用 useSyncExternalStore 安全地從 localStorage 讀取解鎖狀態
  const { isUnlocked: isStorageUnlocked, hasFullAccess: storageFullAccess } = useLocalStorageUnlock(character.id, character.hasPinLock);
  const [isManuallyUnlocked, setIsManuallyUnlocked] = useState(false);
  // Phase 10: 唯讀狀態完全由 localStorage 的 fullAccess 決定
  // PIN-only 解鎖不會設 fullAccess → storageFullAccess=false → 唯讀
  // Game Code + PIN 解鎖設 fullAccess=true → storageFullAccess=true → 完整互動
  // 這樣即使頁面重新載入，唯讀狀態也不會遺失
  const isReadOnly = isReadOnlyProp || !storageFullAccess;

  // Phase 10: 唯讀模式使用 Baseline 資料（顯示未被 Runtime 修改的原始值）
  // full-access 模式使用 Runtime 資料（遊戲進行中的即時值）
  const bl = isReadOnly ? character.baselineData : undefined;
  const displayStats = bl?.stats ?? character.stats;
  const displayItems = bl?.items ?? character.items;
  const displaySkills = bl?.skills ?? character.skills;
  const displayTasks = bl?.tasks ?? character.tasks;
  const displaySecretInfo = bl?.secretInfo ?? character.secretInfo;

  // Phase 8: 分頁狀態管理（用於自動切換到對應分頁）
  const [activeTab, setActiveTab] = useState<string>('items');
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Phase 10: 遊戲結束 Dialog 狀態（即時收到 game.ended 時顯示）
  const [gameEndedDialogOpen, setGameEndedDialogOpen] = useState(false);

  // Phase 7.7: 道具展示 Dialog 狀態（被展示方）
  const [showcaseDialogOpen, setShowcaseDialogOpen] = useState(false);
  const [showcaseFromName, setShowcaseFromName] = useState('');
  const [showcaseItemInfo, setShowcaseItemInfo] = useState<ShowcasedItemInfo | null>(null);

  // Phase 3.1: 使用通知系統 Hook
  const { notifications, unreadCount, markAsRead, addNotification } = useNotificationSystem(character.id);

  // 對抗 Dialog 狀態管理（含頁面重整後恢復邏輯）
  const contestDialog = useContestDialogManagement({ characterId: character.id, onTabChange: setActiveTab });
  const {
    clearDialogState,
    defenderTargetDialog: defenderTargetItemSelectionDialog,
    setDefenderTargetDialog: setDefenderTargetItemSelectionDialog,
    clearDefenderContest,
    contestDialogOpen,
    currentContestEvent,
    currentContestId,
  } = contestDialog;

  // 最終解鎖狀態：localStorage 或手動解鎖
  const isUnlocked = isStorageUnlocked || isManuallyUnlocked;

  /**
   * Phase 10: 解鎖回調，根據解鎖方式設定互動模式
   * @param readOnly - true: 僅 PIN 預覽（唯讀），false: Game Code + PIN（完整互動）
   */
  const handleUnlocked = (readOnly: boolean) => {
    setIsManuallyUnlocked(true);
    // 儲存解鎖狀態到 localStorage（含模式）
    localStorage.setItem(`character-${character.id}-unlocked`, 'true');
    if (!readOnly) {
      localStorage.setItem(`character-${character.id}-fullAccess`, 'true');
    }
  };

  /**
   * Phase 10: 重新鎖定角色卡，清除 localStorage 解鎖狀態並回到 PinUnlock 畫面
   * 用途：玩家在唯讀預覽模式下想切換到完整互動模式，或想重新鎖定角色卡
   */
  const handleRelock = useCallback(() => {
    localStorage.removeItem(`character-${character.id}-unlocked`);
    localStorage.removeItem(`character-${character.id}-fullAccess`);
    setIsManuallyUnlocked(false);
    // 觸發 storage event，讓 useSyncExternalStore 重新讀取
    window.dispatchEvent(new Event('storage'));
  }, [character.id]);

  // Phase 10: 重新整理後若遊戲已結束，自動清除 fullAccess 回到解鎖前畫面
  // 這處理玩家在遊戲結束後重新整理的情況（即時路徑由 Dialog 處理）
  useEffect(() => {
    if (character.isGameActive === false && storageFullAccess) {
      handleRelock();
    }
  }, [character.isGameActive, storageFullAccess, handleRelock]);

  /**
   * Phase 8: 效果倒數歸零時，主動觸發伺服器端過期檢查並刷新頁面
   */
  const handleEffectExpired = useCallback(async () => {
    await checkExpiredEffects(character.id);
    router.refresh();
  }, [character.id, router]);

  // 道具使用 callback
  // Phase 8: 添加檢定結果參數，返回結果以便處理對抗檢定
  const handleUseItem = useCallback(async (itemId: string, targetCharacterId?: string, checkResult?: number, targetItemId?: string) => {
    const result = await consumeItemAction(character.id, itemId, targetCharacterId, checkResult, targetItemId);
    // 返回結果給 item-list.tsx 處理，讓它可以決定是否關閉 dialog
    return {
      success: result.success,
      data: result.data,
      message: result.message,
    };
  }, [character.id]);

  // 道具轉移 callback
  const handleTransferItem = useCallback(async (itemId: string, targetCharacterId: string) => {
    const result = await transferItemAction(character.id, itemId, targetCharacterId, 1);
    if (result.success) {
      toast.success(result.message || '道具轉移成功');
      router.refresh();
    } else {
      toast.error(result.message || '道具轉移失敗');
    }
  }, [character.id, router]);

  // WebSocket 事件處理（角色頻道、離線補送、遊戲廣播）
  useGameEventHandler({
    character,
    addNotification,
    onTabChange: setActiveTab,
    contestDialog,
    onItemShowcased: (fromName, item) => {
      setShowcaseFromName(fromName);
      setShowcaseItemInfo(item);
      setShowcaseDialogOpen(true);
    },
    onGameEnded: () => setGameEndedDialogOpen(true),
  });

  // 如果需要 PIN 且未解鎖，顯示解鎖畫面
  if (character.hasPinLock && !isUnlocked) {
    return (
      <PinUnlock
        characterId={character.id}
        characterName={character.name}
        onUnlocked={handleUnlocked}
      />
    );
  }

  // 已解鎖或無 PIN，顯示角色卡
  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-8 min-h-screen">
      {/* Phase 11.5: 模式提示 Banner（預覽模式 / Runtime 模式） */}
      <CharacterModeBanner
        isReadOnly={isReadOnly}
        hasPinLock={character.hasPinLock}
        hasBaselineData={!!character.baselineData}
        gameCode={character.gameCode}
        onRelock={handleRelock}
      />

      {/* 主要角色卡 */}
      <Card className="mb-6 overflow-hidden">
        {/* 角色圖片 */}
        {character.imageUrl ? (
          <div className="relative h-64 md:h-96 w-full bg-muted">
            <Image
              src={character.imageUrl}
              alt={character.name}
              fill
              className="object-cover"
              priority
            />
          </div>
        ) : (
          <div className="h-40 md:h-56 w-full bg-muted flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
              <User className="h-16 w-16" />
              <span className="text-4xl font-bold tracking-wider">
                {character.name.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        )}

        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-3xl md:text-4xl mb-2">
                {character.name}
              </CardTitle>
              {character.publicInfo?.personality && (
                <p className="text-muted-foreground mb-2">
                  {character.publicInfo.personality}
                </p>
              )}
            </div>
            {/* 通知紀錄入口 */}
            <NotificationButton
              isOpen={isNotifOpen}
              onOpenChange={setIsNotifOpen}
              unreadCount={unreadCount}
              notifications={notifications}
              onMarkAsRead={markAsRead}
            />
          </div>
        </CardHeader>

        <CardContent>
          {/* 角色描述 */}
          {character.description && (
            <div className="space-y-2 mb-6">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                角色描述
              </h3>
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {character.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab 切換：資訊、數值、任務、道具 */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-12 sm:h-10">
              <TabsTrigger value="items" className="flex items-center gap-1 min-h-[44px] sm:min-h-0"><Package className="h-4 w-4" /><span className="hidden sm:inline">道具</span></TabsTrigger>
              <TabsTrigger value="skills" className="flex items-center gap-1 min-h-[44px] sm:min-h-0"><Zap className="h-4 w-4" /><span className="hidden sm:inline">技能</span></TabsTrigger>
              <TabsTrigger value="info" className="flex items-center gap-1 min-h-[44px] sm:min-h-0"><FileText className="h-4 w-4" /><span className="hidden sm:inline">資訊</span></TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-1 min-h-[44px] sm:min-h-0"><BarChart3 className="h-4 w-4" /><span className="hidden sm:inline">數值</span></TabsTrigger>
              <TabsTrigger value="tasks" className="flex items-center gap-1 min-h-[44px] sm:min-h-0"><CheckSquare className="h-4 w-4" /><span className="hidden sm:inline">任務</span></TabsTrigger>
            </TabsList>

            <div className="p-6">
              <TabsContent value="info" className="mt-0 space-y-6">
                <PublicInfoSection publicInfo={character.publicInfo} />
                <SecretInfoSection
                  secretInfo={displaySecretInfo}
                  characterId={character.id}
                />
              </TabsContent>

              <TabsContent value="stats" className="mt-0">
                <StatsDisplay stats={displayStats} />
                {(!displayStats || displayStats.length === 0) && (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mx-auto mb-4 opacity-40" />
                    <p>尚無角色數值</p>
                  </div>
                )}

                {/* Phase 8.7: 活躍效果面板 */}
                <ActiveEffectsPanel
                  effects={character.temporaryEffects}
                  onEffectExpired={handleEffectExpired}
                />
              </TabsContent>

              <TabsContent value="tasks" className="mt-0">
                <TaskList tasks={displayTasks} characterId={character.id} />
              </TabsContent>

              <TabsContent value="items" className="mt-0">
                <ItemList
                  items={displayItems}
                  characterId={character.id}
                  gameId={character.gameId}
                  characterName={character.name}
                  randomContestMaxValue={character.randomContestMaxValue}
                  onUseItem={handleUseItem}
                  onTransferItem={handleTransferItem}
                  isReadOnly={isReadOnly} // Phase 10.5.4: 預覽模式禁用互動
                />
              </TabsContent>

              <TabsContent value="skills" className="mt-0">
                <SkillList
                  skills={displaySkills}
                  characterId={character.id}
                  gameId={character.gameId}
                  characterName={character.name}
                  stats={displayStats}
                  randomContestMaxValue={character.randomContestMaxValue}
                  isReadOnly={isReadOnly} // Phase 10.5.4: 預覽模式禁用互動
                />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* 世界觀連結 */}
      <WorldInfoLink gameId={character.gameId} />

      {/* 系統資訊 */}
      <Card className="mt-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div className="flex items-center">
              <Hash className="h-4 w-4 mr-2 opacity-60" />
              <span>角色 ID: {character.id.substring(0, 8)}...</span>
            </div>
            <div className="flex items-center">
              <CalendarDays className="h-4 w-4 mr-2 opacity-60" />
              <span>
                建立於 {new Date(character.createdAt).toLocaleDateString('zh-TW')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 返回提示 */}
      <div className="mt-8 text-center">
        <p className="text-muted-foreground text-sm">
          這是您的專屬角色卡，請妥善保管此頁面連結
        </p>
      </div>

      {/* Phase 7: 對抗檢定回應 Dialog（防守方） */}
      <ContestResponseDialog
        open={contestDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            clearDefenderContest();
            clearDialogState();
          }
        }}
        contestEvent={currentContestEvent}
        characterId={character.id}
        items={character.items}
        skills={character.skills}
        contestId={currentContestId}
        onResponded={() => {
          // Phase 8: 防守方回應後清除持久化狀態
          clearDefenderContest();
          // Phase 3: 清除統一的 Dialog 狀態
          clearDialogState();
          router.refresh();
        }}
      />

      {/* Phase 9: 防守方目標道具選擇 Dialog */}
      {defenderTargetItemSelectionDialog && (
        <TargetItemSelectionDialog
          open={defenderTargetItemSelectionDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setDefenderTargetItemSelectionDialog(null);
            }
          }}
          contestId={defenderTargetItemSelectionDialog.contestId}
          characterId={character.id}
          defenderId={defenderTargetItemSelectionDialog.attackerId}
          sourceType={defenderTargetItemSelectionDialog.sourceType}
          sourceId={defenderTargetItemSelectionDialog.sourceId}
          onSelectionComplete={() => {
            setDefenderTargetItemSelectionDialog(null);
            router.refresh();
          }}
        />
      )}

      {/* Phase 10: 遊戲結束 Dialog */}
      <GameEndedDialog
        open={gameEndedDialogOpen}
        onConfirm={() => {
          setGameEndedDialogOpen(false);
          handleRelock();
        }}
      />

      {/* Phase 7.7: 道具展示 Dialog（被展示方） */}
      <ItemShowcaseDialog
        open={showcaseDialogOpen}
        onClose={() => {
          setShowcaseDialogOpen(false);
          setShowcaseItemInfo(null);
          setShowcaseFromName('');
        }}
        fromCharacterName={showcaseFromName}
        item={showcaseItemInfo}
      />

    </div>
  );
}

