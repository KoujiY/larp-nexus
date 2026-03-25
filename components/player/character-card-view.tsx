'use client';

import { useState, useSyncExternalStore, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import { usePlayerTheme } from './player-theme-context';
import { BookOpen, BarChart3, CheckSquare, Package, Wand2, User, Feather, ShieldCheck, Sun, Moon } from 'lucide-react';

interface CharacterCardViewProps {
  character: CharacterData;
  isReadOnly?: boolean; // Phase 10.5.4: 預覽模式標記
}

/** 分頁配置（供 sticky nav 和 mobile bottom nav 共用） */
const TAB_CONFIG = [
  { value: 'items', icon: Package, label: '道具' },
  { value: 'skills', icon: Wand2, label: '技能' },
  { value: 'info', icon: BookOpen, label: '資訊' },
  { value: 'stats', icon: BarChart3, label: '數值' },
  { value: 'tasks', icon: CheckSquare, label: '任務' },
] as const;

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
  const { isDark, toggleTheme } = usePlayerTheme();

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

  // 如果需要 PIN 且未解鎖，顯示解鎖畫面（主題切換保持固定右上角）
  if (character.hasPinLock && !isUnlocked) {
    return (
      <>
        <button
          onClick={toggleTheme}
          aria-label={isDark ? '切換至淺色模式' : '切換至深色模式'}
          className="fixed top-4 right-4 z-50 w-9 h-9 rounded-full bg-card/80 backdrop-blur-sm border border-primary/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all duration-200"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <PinUnlock
          characterId={character.id}
          characterName={character.name}
          onUnlocked={handleUnlocked}
        />
      </>
    );
  }

  // 是否顯示頂部模式橫幅（影響 sticky 元素的 top offset）
  const showBanner = isReadOnly || character.hasPinLock;
  // Fixed banner 高度 ≈ 40px (py-2 + text)
  const bannerH = showBanner ? 40 : 0;
  // Sticky header 高度 ≈ 64px (py-3 + h-10)
  const headerH = 64;

  // 已解鎖或無 PIN，顯示角色卡
  return (
    <div
      className="max-w-[896px] mx-auto min-h-screen relative pb-32"
      style={{ paddingTop: bannerH }}
    >
      {/* ── 1. Fixed 模式橫幅 ──────────────────────────────────── */}
      <CharacterModeBanner
        isReadOnly={isReadOnly}
        hasPinLock={character.hasPinLock}
        gameCode={character.gameCode}
        onRelock={handleRelock}
      />

      {/* ── 2. Sticky 頂部 Header ──────────────────────────────── */}
      <header
        className="sticky z-50 px-6 py-3 bg-background/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.08)] flex justify-between items-center"
        style={{ top: bannerH }}
      >
        {/* Left: 角色縮圖 + 名稱 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-border/15 shrink-0 bg-surface-raised">
            {character.imageUrl ? (
              <Image
                src={character.imageUrl}
                alt={character.name}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <span className="font-bold tracking-tight uppercase text-sm text-primary truncate">
            {character.name}
          </span>
        </div>

        {/* Right: 通知按鈕 + 主題切換按鈕 */}
        <div className="flex items-center gap-1 shrink-0">
          <NotificationButton
            isOpen={isNotifOpen}
            onOpenChange={setIsNotifOpen}
            unreadCount={unreadCount}
            notifications={notifications}
            onMarkAsRead={markAsRead}
          />
          <button
            onClick={toggleTheme}
            aria-label={isDark ? '切換至淺色模式' : '切換至深色模式'}
            className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors active:scale-95 duration-200"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* ── 3. Hero 區塊（名字 overlay 統一在 section 內，有無圖片皆適用） ── */}
      <section
        className="relative w-full h-[400px] overflow-hidden"
        style={{ marginTop: -headerH }}
      >
        {/* 背景：有圖片 → 角色圖，無圖片 → 純色佔位 */}
        {character.imageUrl ? (
          <Image
            src={character.imageUrl}
            alt={character.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-surface-base flex items-center justify-center">
            <span className="text-[120px] font-bold text-muted-foreground/10 select-none leading-none">
              {character.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* 漸層 scrim：統一遮罩，讓文字在兩種背景下都易讀 */}
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/40 to-background/85 z-10 pointer-events-none" />

        {/* 角色名稱、個性、描述 overlay（壓在圖片上，顏色為主題金色） */}
        <div className="absolute bottom-12 left-0 w-full px-8 z-20">
          <div className="space-y-1">
            <h1 className="text-5xl font-extrabold tracking-tight text-primary [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">
              {character.name}
            </h1>
            {character.publicInfo?.personality && (
              <p className="text-primary/80 font-medium tracking-wide flex items-center gap-2 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                <Feather className="h-4 w-4 text-primary/70 shrink-0" />
                {character.publicInfo.personality}
              </p>
            )}
          </div>
          {character.description && (
            <div className="mt-6 max-w-lg">
              <p className="text-muted-foreground/90 text-sm leading-relaxed font-light italic">
                {character.description}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Tabs（sticky 頂部 nav + 內容） ──────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* Sticky 分頁導覽列（桌面版，在 hero 下方停駐） */}
        <nav
          className="sticky z-40 px-6 py-4 bg-background"
          style={{ top: bannerH + headerH }}
        >
          <div className="bg-card/90 backdrop-blur-md rounded-lg p-1.5 flex gap-1 shadow-2xl border border-border/10">
            {TAB_CONFIG.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`flex-1 flex flex-col items-center justify-center py-3 rounded-md transition-all duration-200 ${
                  activeTab === value
                    ? 'bg-gradient-to-br from-primary/20 to-transparent text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] uppercase tracking-tighter mt-1 font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* 分頁內容 */}
        <div className="px-6 pb-6">
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

      {/* ── 5. 世界觀連結 ─────────────────────────────────────── */}
      <WorldInfoLink gameId={character.gameId} />

      {/* ── 6. 頁腳 ──────────────────────────────────────────── */}
      <footer className="mt-12 px-6 pb-20 border-t border-border/10 pt-8 text-center space-y-2">
        <p className="text-primary/60 text-xs font-bold tracking-[0.2em] uppercase">
          Private Encryption Active
        </p>
        <p className="text-muted-foreground/40 text-[10px] font-mono">
          ID: {character.id.substring(0, 8)}... • {new Date(character.createdAt).toLocaleDateString('zh-TW')} • RUNTIME PROTOCOL 4.2.0
        </p>
        <div className="pt-4 flex items-center justify-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary/40" />
          <p className="text-muted-foreground/60 text-[11px]">這是您的專屬角色卡，請妥善保管此頁面連結</p>
        </div>
      </footer>

      {/* ── 7. 手機底部導覽列（固定，md 以上隱藏） ──────────────── */}
      <div className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[896px] z-50 rounded-t-lg bg-background/90 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.4)] border-t border-border/15 flex justify-around items-center px-4 pb-safe-area-inset-bottom pb-4 pt-2">
        {TAB_CONFIG.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={`flex flex-col items-center justify-center transition-all duration-200 ${
              activeTab === value
                ? 'text-primary bg-gradient-to-br from-primary/20 to-transparent rounded-lg px-3 py-1 scale-110'
                : 'text-muted-foreground opacity-70 hover:text-primary hover:opacity-100'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-tighter font-semibold mt-0.5">{label}</span>
          </button>
        ))}
      </div>

      {/* ── 8. Dialogs ────────────────────────────────────────── */}

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
