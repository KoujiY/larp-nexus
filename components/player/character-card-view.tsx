'use client';

import { useState, useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { CharacterData } from '@/types/character';
import { PinUnlock } from './pin-unlock';
import { InfoTab } from './info-tab';
import { StatsDisplay } from './stats-display';
import { ActiveEffectsPanel } from './active-effects-panel';
import { EquipmentEffectsPanel } from './equipment-effects-panel';
import { TaskList } from './task-list';
import { ItemList } from './item-list';
import { SkillList } from './skill-list';
import { WorldInfoLink } from './world-info-link';
import { useItem as consumeItemAction, transferItem as transferItemAction } from '@/app/actions/item-use';
import { checkExpiredEffects } from '@/app/actions/temporary-effects';
import { notify } from '@/lib/notify';
import Image from 'next/image';
import { ContestResponseDialog } from './contest-response-dialog';
import { ContestWaitingDialog } from './contest-waiting-dialog';
import { TargetItemSelectionDialog } from './target-item-selection-dialog';
import { ItemShowcaseDialog } from './item-showcase-dialog';
import type { ShowcasedItemInfo } from './item-showcase-dialog';
import { useNotificationSystem } from '@/hooks/use-notification-system';
import { useContestDialogManagement } from '@/hooks/use-contest-dialog-management';
import { useGameEventHandler } from '@/hooks/use-game-event-handler';
import { CharacterModeBanner } from './character-mode-banner';
import { NotificationButton } from './notification-button';
import { GameEndedDialog } from './game-ended-dialog';
import { ThemeToggleButton } from './theme-toggle-button';
import { BookOpen, BarChart3, CheckSquare, Package, Wand2, User, ShieldCheck } from 'lucide-react';

interface CharacterCardViewProps {
  character: CharacterData;
}

/** 分頁配置（供 sticky nav 和 mobile bottom nav 共用） */
const TAB_CONFIG = [
  { value: 'items', icon: Package, label: '物品' },
  { value: 'skills', icon: Wand2, label: '技能' },
  { value: 'info', icon: BookOpen, label: '資訊' },
  { value: 'stats', icon: BarChart3, label: '數值' },
  { value: 'tasks', icon: CheckSquare, label: '任務' },
] as const;

/**
 * Hook 用於安全地讀取 localStorage 解鎖狀態（避免 SSR/CSR hydration 問題）
 * 所有角色（含無 PIN）統一走 localStorage 解鎖流程，確保入口一致
 */
function useLocalStorageUnlock(characterId: string) {
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
    return localStorage.getItem(unlockedKey) === 'true';
  }, [unlockedKey]);

  const getFullAccessSnapshot = useCallback(() => {
    return localStorage.getItem(fullAccessKey) === 'true';
  }, [fullAccessKey]);

  // Server 端一律回傳 false（未解鎖），由 useSyncExternalStore 處理 hydration 差異
  const getServerSnapshot = useCallback(() => false, []);

  const isUnlocked = useSyncExternalStore(subscribe, getUnlockedSnapshot, getServerSnapshot);
  const hasFullAccess = useSyncExternalStore(subscribe, getFullAccessSnapshot, getServerSnapshot);

  return { isUnlocked, hasFullAccess };
}

export function CharacterCardView({ character }: CharacterCardViewProps) {
  const router = useRouter();
  // 使用 useSyncExternalStore 安全地從 localStorage 讀取解鎖狀態
  const { isUnlocked: isStorageUnlocked, hasFullAccess: storageFullAccess } = useLocalStorageUnlock(character.id);
  const [isManuallyUnlocked, setIsManuallyUnlocked] = useState(false);
  // Phase 10: 唯讀狀態完全由 localStorage 的 fullAccess 決定
  // PIN-only 解鎖不會設 fullAccess → storageFullAccess=false → 唯讀
  // Game Code + PIN 解鎖設 fullAccess=true → storageFullAccess=true → 完整互動
  // 這樣即使頁面重新載入，唯讀狀態也不會遺失
  const isReadOnly = !storageFullAccess;

  // Phase 10: 唯讀模式使用 Baseline 資料（顯示未被 Runtime 修改的原始值）
  // full-access 模式使用 Runtime 資料（遊戲進行中的即時值）
  const bl = isReadOnly ? character.baselineData : undefined;
  const displayStats = bl?.stats ?? character.stats;
  const displayItems = bl?.items ?? character.items;
  const displaySkills = bl?.skills ?? character.skills;
  const displayTasks = bl?.tasks ?? character.tasks;
  const displaySecretInfo = bl?.secretInfo ?? character.secretInfo;

  // Phase 8: 分頁狀態管理（用於自動切換到對應分頁）
  const [activeTab, setActiveTab] = useState<string>('info');
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
  const contestDialog = useContestDialogManagement({ characterId: character.id });
  const {
    clearDialogState,
    defenderTargetDialog: defenderTargetItemSelectionDialog,
    setDefenderTargetDialog: setDefenderTargetItemSelectionDialog,
    clearDefenderContest,
    contestDialogOpen,
    currentContestEvent,
    currentContestId,
    attackerWaitingOpen,
    attackerWaitingDisplayData,
    attackerTargetItemOpen,
    attackerTargetItemData,
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

  /**
   * 全域過期計時器：無論玩家在哪個分頁，都能在效果到期時觸發伺服器端檢查。
   * ActiveEffectsPanel 只在 stats 分頁掛載，因此需要此獨立的計時器作為保底。
   *
   * 處理兩種情境：
   * 1. 已過期但未處理（expiresAt 在過去、isExpired 仍為 false）→ 立即呼叫
   * 2. 即將過期（expiresAt 在未來）→ setTimeout 延遲呼叫
   */
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCheckingRef = useRef(false);
  useEffect(() => {
    const unprocessed = (character.temporaryEffects ?? []).filter(
      (e) => !e.isExpired
    );
    if (unprocessed.length === 0) return;

    const now = Date.now();

    // 區分已過期（需立即處理）和未過期（需排程）
    const alreadyExpired = unprocessed.some(
      (e) => new Date(e.expiresAt).getTime() <= now
    );
    const futureEffects = unprocessed.filter(
      (e) => new Date(e.expiresAt).getTime() > now
    );

    /** 執行伺服器端過期檢查並刷新 */
    const doCheck = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;
      try {
        await checkExpiredEffects(character.id);
        router.refresh();
      } finally {
        isCheckingRef.current = false;
      }
    };

    // 情境 1：有已過期但未處理的效果 → 立即處理
    if (alreadyExpired) {
      doCheck();
    }

    // 情境 2：排程最近即將到期的效果
    if (futureEffects.length > 0) {
      const soonestMs = Math.min(
        ...futureEffects.map((e) => new Date(e.expiresAt).getTime() - now)
      );
      // 加 1 秒緩衝，確保伺服器端判定 expiresAt <= now 時已過期
      const delayMs = soonestMs + 1000;

      expiryTimerRef.current = setTimeout(doCheck, delayMs);
    }

    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [character.temporaryEffects, character.id, router]);

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
      router.refresh();
    } else {
      notify.error(result.message || '物品轉移失敗');
    }
  }, [character.id, router]);

  // WebSocket 事件處理（角色頻道、離線補送、遊戲廣播）
  useGameEventHandler({
    character,
    addNotification,
    contestDialog,
    onItemShowcased: (fromName, item) => {
      setShowcaseFromName(fromName);
      setShowcaseItemInfo(item);
      setShowcaseDialogOpen(true);
    },
    onGameEnded: () => setGameEndedDialogOpen(true),
  });

  // 未解鎖時顯示入口畫面（所有角色統一流程）
  if (!isUnlocked) {
    return (
      <>
        <ThemeToggleButton variant="fixed" />
        <PinUnlock
          characterId={character.id}
          characterName={character.name}
          hasPinLock={character.hasPinLock}
          onUnlocked={handleUnlocked}
        />
      </>
    );
  }

  // 頂部模式橫幅（所有角色解鎖後都會顯示 preview 或 runtime 橫幅）
  const showBanner = true;
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
          <ThemeToggleButton />
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
        <div className="absolute inset-0 bg-linear-to-b from-transparent from-15% via-background/40 via-55% to-background/90 z-10 pointer-events-none" />

        {/* 角色名稱 + 標語 overlay（壓在圖片上，顏色為主題金色） */}
        <div className="absolute bottom-12 left-0 w-full px-8 z-20">
          <h1 className="text-5xl font-extrabold tracking-tight text-primary [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">
            {character.name}
          </h1>
          {character.slogan && (
            <div className="mt-6 max-w-lg">
              <p className="text-muted-foreground/90 text-sm leading-relaxed font-light italic">
                {character.slogan}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Tabs（sticky 頂部 nav + 內容） ──────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* Sticky 分頁導覽列（桌面版，手機版由底部 nav 取代） */}
        <nav
          className="hidden md:block sticky z-40 px-6 py-4 bg-background"
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
        <div className="px-6 pb-6 pt-4">
          <TabsContent value="info" className="mt-0">
            <InfoTab
              publicInfo={character.publicInfo}
              secretInfo={displaySecretInfo}
              characterId={character.id}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsDisplay stats={displayStats} items={displayItems} />
            {(!displayStats || displayStats.length === 0) && (
              <div className="text-center py-12 text-muted-foreground/60">
                <p className="text-sm">尚無角色數值</p>
              </div>
            )}

            {/* 時效性效果 + 裝備效果：桌面並排、手機堆疊 */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <ActiveEffectsPanel
                effects={character.temporaryEffects}
                characterId={character.id}
                onEffectExpired={handleEffectExpired}
              />
              <EquipmentEffectsPanel items={displayItems} variant="player" />
            </div>
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
      <footer className="mt-12 px-6 pb-4 border-t border-border/10 pt-8 text-center space-y-2">
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

      {/* 攻擊方等待 Dialog */}
      <ContestWaitingDialog
        open={attackerWaitingOpen}
        displayData={attackerWaitingDisplayData}
      />

      {/* 攻擊方目標道具選擇 Dialog（分歧 2：攻擊方獲勝 + 偷竊/移除） */}
      {attackerTargetItemData && (
        <TargetItemSelectionDialog
          mode="contest"
          open={!!attackerTargetItemOpen}
          onOpenChange={(open) => {
            if (!open) {
              clearDialogState();
            }
          }}
          contestId={attackerTargetItemData.contestId}
          characterId={character.id}
          defenderId={attackerTargetItemData.targetCharacterId}
          sourceType={attackerTargetItemData.sourceType}
          sourceId={attackerTargetItemData.sourceId}
          onSelectionComplete={() => {
            clearDialogState();
            router.refresh();
          }}
        />
      )}

      {/* 防守方目標道具選擇 Dialog（分歧 5：防守方獲勝 + 偷竊/移除） */}
      {defenderTargetItemSelectionDialog && (
        <TargetItemSelectionDialog
          mode="contest"
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
