'use client';

import { useState, useSyncExternalStore, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CharacterData } from '@/types/character';
import type { BaseEvent } from '@/types/event';
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
import { useCharacterWebSocket, useGameWebSocket } from '@/hooks/use-websocket';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ContestResponseDialog } from './contest-response-dialog';
import { TargetItemSelectionDialog } from './target-item-selection-dialog';
import { ItemShowcaseDialog } from './item-showcase-dialog';
import type { ShowcasedItemInfo } from './item-showcase-dialog';
import type { SkillContestEvent, ItemShowcasedEvent } from '@/types/event';
import { useDefenderContestState, useContestState } from '@/hooks/use-contest-state';
import { useNotificationSystem } from '@/hooks/use-notification-system';
import { useCharacterWebSocketHandler } from '@/hooks/use-character-websocket-handler';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import { usePendingEvents } from '@/hooks/use-pending-events'; // Phase 9: 離線事件處理

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

  // Phase 3: 使用統一的 Dialog 狀態管理
  const { dialogState, setAttackerWaitingDialog: setAttackerWaitingDialogState, setDefenderResponseDialog, setTargetItemSelectionDialog, clearDialogState } = useContestDialogState(character.id);
  
  // Phase 9: 防守方目標道具選擇 dialog 狀態
  const [defenderTargetItemSelectionDialog, setDefenderTargetItemSelectionDialog] = useState<{
    open: boolean;
    contestId: string;
    attackerId: string;
    sourceType: 'skill' | 'item';
    sourceId: string;
  } | null>(null);

  // Phase 7: 對抗檢定相關狀態
  // Phase 8: 使用持久化狀態管理防守方 dialog
  const { defenderState, setDefenderContest, clearDefenderContest } = useDefenderContestState(character.id);
  const [contestDialogOpen, setContestDialogOpen] = useState(defenderState !== null);
  const [currentContestEvent, setCurrentContestEvent] = useState<SkillContestEvent['payload'] | null>(
    defenderState?.contestEvent || null
  );
  const [currentContestId, setCurrentContestId] = useState<string>(defenderState?.contestId || '');

  // Phase 8: 攻擊方對抗檢定狀態管理
  const { pendingContests } = useContestState(character.id);

  // Phase 3: 從統一 Dialog 狀態恢復防守方 dialog
  useEffect(() => {
    if (dialogState?.type === 'defender_response') {
      // 從 dialogState 恢復防守方 dialog
      if (defenderState && defenderState.contestId === dialogState.contestId) {
        setContestDialogOpen(true);
        setCurrentContestEvent(defenderState.contestEvent);
        setCurrentContestId(defenderState.contestId);
      }
    } else if (defenderState) {
      // 兼容舊的邏輯：如果沒有 dialogState 但有 defenderState，也恢復
      setContestDialogOpen(true);
      setCurrentContestEvent(defenderState.contestEvent);
      setCurrentContestId(defenderState.contestId);
      // 同時設置統一的 Dialog 狀態
      const sourceId = defenderState.contestEvent.itemId || defenderState.contestEvent.skillId || '';
      const sourceType = defenderState.contestEvent.sourceType || (defenderState.contestEvent.itemId ? 'item' : 'skill');
      setDefenderResponseDialog(defenderState.contestId, sourceType, sourceId);
    }
  }, [dialogState, defenderState, setDefenderResponseDialog]);

  // Phase 3: 從統一 Dialog 狀態恢復攻擊方等待 dialog 和選擇目標道具 dialog
  useEffect(() => {
    if (!dialogState) return;

    switch (dialogState.type) {
      case 'attacker_waiting':
        // 恢復攻擊方等待 Dialog（根據 sourceType 切換到對應分頁）
        // 注意：不再有全局等待 dialog，只顯示技能或道具 dialog
        if (dialogState.sourceType === 'skill') {
          // 切換到技能分頁，讓 skill-list.tsx 處理
          setActiveTab('skills');
        } else {
          // 切換到道具分頁，讓 item-list.tsx 處理
          setActiveTab('items');
        }
        break;
      case 'target_item_selection':
        // 恢復選擇目標道具 Dialog
        if (dialogState.sourceType === 'skill') {
          setActiveTab('skills');
          // 讓 skill-list.tsx 處理
        } else {
          setActiveTab('items');
          // 讓 item-list.tsx 處理
        }
        break;
    }
  }, [dialogState]);

  // Phase 8: 從持久化狀態恢復攻擊方等待 dialog
  // 注意：攻擊方等待時應顯示原本的技能或道具 dialog，而非全局等待 dialog
  // skill-list.tsx 和 item-list.tsx 會根據 pendingContests 自動恢復 dialog 狀態
  useEffect(() => {
    if (Object.keys(pendingContests).length > 0) {
      // 找到第一個有 dialogOpen 的 pending contest，設置 Dialog 狀態以確保重新整理後能正確恢復
      for (const [sourceId, contest] of Object.entries(pendingContests)) {
        if (contest.dialogOpen) {
          // 設置統一的 Dialog 狀態，確保重新整理後能正確恢復技能或道具 dialog
          setAttackerWaitingDialogState(contest.contestId, contest.sourceType, sourceId);
          break;
        }
      }
    }
  }, [pendingContests, setAttackerWaitingDialogState]);

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

  // Phase 3.1: 使用 WebSocket 事件處理 Hook
  const { handleWebSocketEvent } = useCharacterWebSocketHandler({
    characterId: character.id,
    addNotification, // ✅ 傳入通知系統的 addNotification 函數
    onTabChange: setActiveTab,
    // Phase 10: 對抗結算後主動清除 dialogState，避免重新開啟技能/道具時殘留等待狀態
    onClearDialogState: clearDialogState,
    onContestRequest: async (payload) => {
      // 防守方收到對抗檢定請求時，設置 dialog 狀態
      const sourceId = payload.itemId || payload.skillId || '';
      // Phase 1: 優先使用事件中的 contestId，如果沒有則生成新的
      const { generateContestId } = await import('@/lib/contest/contest-id');
      const contestId = payload.contestId || generateContestId(payload.attackerId, sourceId);
      setDefenderContest(contestId, payload);
      setCurrentContestEvent(payload);
      setCurrentContestId(contestId);
      setContestDialogOpen(true);
      // Phase 3: 同時設置統一的 Dialog 狀態
      const sourceType = payload.sourceType || (payload.itemId ? 'item' : 'skill');
      setDefenderResponseDialog(contestId, sourceType, sourceId);
    },
    // Phase 7.7: 被展示方收到道具展示事件
    onItemShowcased: (payload: ItemShowcasedEvent['payload']) => {
      setShowcaseFromName(payload.fromCharacterName);
      setShowcaseItemInfo(payload.item);
      setShowcaseDialogOpen(true);
    },
    onContestResult: (payload) => {// 對抗檢定結果處理（防守方和攻擊方都會收到）
      // 防守方：處理結果
      if (String(payload.defenderId) === String(character.id)) {
        // Phase 9: 如果防守方獲勝且需要選擇目標道具，開啟選擇道具 dialog
        if (payload.result === 'defender_wins' && payload.needsTargetItemSelection) {
          const sourceId = payload.itemId || payload.skillId || '';
          const sourceType = payload.sourceType || (payload.itemId ? 'item' : 'skill');
          if (sourceId && payload.attackerId && payload.contestId) {
            // 關閉原本的 dialog
            clearDefenderContest();
            setContestDialogOpen(false);
            clearDialogState();
            // 開啟選擇道具 dialog
            setDefenderTargetItemSelectionDialog({
              open: true,
              contestId: payload.contestId,
              attackerId: String(payload.attackerId),
              sourceType,
              sourceId,
            });
            return;
          }
        }
        // 不需要選擇目標道具，關閉 dialog
        clearDefenderContest();
        setContestDialogOpen(false);
        // Phase 3: 清除統一的 Dialog 狀態
        clearDialogState();
      }
      // 攻擊方：關閉等待 dialog（除非需要選擇目標道具）
      if (String(payload.attackerId) === String(character.id)) {
        const sourceId = payload.itemId || payload.skillId || '';
        // Phase 3: 如果需要選擇目標道具，設置選擇目標道具 Dialog 狀態
        if (payload.needsTargetItemSelection && sourceId && payload.defenderId) {
          const sourceType = payload.sourceType || (payload.itemId ? 'item' : 'skill');
          setTargetItemSelectionDialog(payload.contestId || '', sourceType, sourceId, payload.defenderId);
        } else {
          // 不需要選擇目標道具，清除統一的 Dialog 狀態
          if (dialogState?.type === 'attacker_waiting' && dialogState.sourceId === sourceId) {
            clearDialogState();
          }
        }
      }
    },
  });

  // Phase 3.1: 移除所有事件映射函數（已移至 lib/utils/event-mappers.ts）
  // 以下代碼已移除：
  // - mapItemTransferred
  // - mapInventoryUpdated
  // - mapRoleUpdated
  // - mapRoleMessage
  // - mapCharacterAffected
  // - mapSkillContest
  // - mapSkillUsed
  // - mapEventToNotifications

  // Phase 3.1: 使用 WebSocket 事件處理 Hook（已整合通知系統和事件映射）
  useCharacterWebSocket(character.id, handleWebSocketEvent);

  /**
   * Phase 9: 離線事件的統一處理器
   * 同時處理角色頻道事件和遊戲頻道事件（如 game.broadcast）
   * 對於 role.updated，額外顯示 toast（離線期間的數值變更需要明確通知）
   */
  const handlePendingEvent = useCallback((event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      // game.broadcast 在即時模式下由 useGameWebSocket 處理，pending events 需要手動處理
      const { title, message } = event.payload as { title?: string; message?: string };
      toast.info(title || '系統廣播', { description: message });
      addNotification([
        {
          id: `evt-${event.timestamp}`,
          title: title || '系統廣播',
          message: message || '收到廣播',
          type: event.type,
        },
      ]);
    } else if (event.type === 'role.updated') {
      // role.updated 在即時模式下僅 router.refresh() 不顯示 toast
      // 離線補送時需要明確通知用戶數值變更
      handleWebSocketEvent(event);
      const payload = event.payload as {
        updates?: {
          stats?: Array<{ name?: string; deltaValue?: number; deltaMax?: number }>;
        };
      };
      const stats = payload?.updates?.stats;
      if (stats && stats.length > 0) {
        const changes = stats
          .map((s) => {
            const name = s.name ?? '數值';
            if (s.deltaValue && s.deltaValue !== 0) {
              return `${name} ${s.deltaValue > 0 ? '+' : ''}${s.deltaValue}`;
            }
            if (s.deltaMax && s.deltaMax !== 0) {
              return `${name} 最大值 ${s.deltaMax > 0 ? '+' : ''}${s.deltaMax}`;
            }
            return null;
          })
          .filter(Boolean);
        if (changes.length > 0) {
          toast.info('離線期間數值變更', { description: changes.join('、') });
        }
      }
    } else {
      // 其他事件委託給角色事件處理器
      handleWebSocketEvent(event);
    }
  }, [handleWebSocketEvent, addNotification]);

  // Phase 9: 處理離線事件佇列（使用統一處理器）
  usePendingEvents({
    pendingEvents: character.pendingEvents,
    handleWebSocketEvent: handlePendingEvent,
    delayBetweenEvents: 500, // 每個事件間隔 500ms
  });

  // WebSocket 訂閱（劇本廣播）
  // Phase 3.1: 使用通知系統處理遊戲廣播
  useGameWebSocket(character.gameId, (event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      const { title, message } = event.payload as { title?: string; message?: string };
      toast.info(title || '系統廣播', { description: message });
      addNotification([
        {
          id: `evt-${event.timestamp}`,
          title: title || '系統廣播',
          message: message || '收到廣播',
          type: event.type,
        },
      ]);
    } else if (event.type === 'game.started') {
      // Phase 10: 遊戲開始時靜默刷新（更新 isGameActive 和 baselineData）
      // 此時玩家必定在唯讀模式，不需要通知
      router.refresh();
    } else if (event.type === 'game.reset' || event.type === 'game.ended') {
      const titles: Record<string, string> = {
        'game.reset': '遊戲重置',
        'game.ended': '遊戲結束',
      };
      toast.info(titles[event.type] || '遊戲狀態變更');
      addNotification([
        {
          id: `evt-${event.timestamp}`,
          title: titles[event.type] || '遊戲狀態',
          message: event.type === 'game.ended' ? '感謝您的參與！' : '請刷新以取得最新狀態',
          type: event.type,
        },
      ]);
      // Phase 10: 遊戲結束時顯示 Dialog，讓玩家確認後回到解鎖前畫面
      if (event.type === 'game.ended') {
        setGameEndedDialogOpen(true);
      } else {
        router.refresh();
      }
    }
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
      {isReadOnly ? (
        <div className="mb-6 p-4 rounded-lg border border-amber-500 bg-amber-50 text-amber-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium mb-1">👁 預覽模式{character.baselineData ? '（Baseline）' : ''}</p>
              <p className="text-sm text-amber-800">
                {character.baselineData
                  ? '您正在查看角色的原始設定（Baseline）。遊戲進行中的修改不會顯示在此預覽中。'
                  : '您正在以預覽模式查看此角色。所有互動功能（使用道具、技能、對抗檢定）均已禁用。'}
              </p>
            </div>
            {character.hasPinLock && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-amber-500 text-amber-900 hover:bg-amber-100"
                onClick={handleRelock}
              >
                🔑 重新解鎖
              </Button>
            )}
          </div>
        </div>
      ) : character.hasPinLock && (
        <div className="mb-6 p-4 rounded-lg border border-emerald-500 bg-emerald-50 text-emerald-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium mb-1">🎮 遊戲進行中</p>
              <p className="text-sm text-emerald-800">
                {character.gameCode
                  ? <>遊戲代碼：<span className="font-mono font-bold tracking-widest">{character.gameCode}</span></>
                  : '所有互動功能已啟用。'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-emerald-500 text-emerald-900 hover:bg-emerald-100"
              onClick={handleRelock}
            >
              🔑 重新解鎖
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
          🎭 LARP Nexus
        </h1>
        <p className="text-purple-200 text-sm">角色卡系統</p>
      </div>

      {/* 主要角色卡 */}
      <Card className="mb-6 overflow-hidden">
        {/* 角色圖片 */}
        {character.imageUrl && (
          <div className="relative h-64 md:h-96 w-full bg-linear-to-br from-purple-200 to-purple-300">
            <Image
              src={character.imageUrl}
              alt={character.name}
              fill
              className="object-cover"
              priority
            />
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
            <Dialog open={isNotifOpen} onOpenChange={(open) => {
              setIsNotifOpen(open);
              if (open) markAsRead();
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  通知
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>通知紀錄</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {notifications.length === 0 && (
                    <p className="text-sm text-muted-foreground">目前沒有通知</p>
                  )}
                  {notifications.slice().reverse().map((n, idx) => (
                    <div key={`${n.id}-${idx}`} className="p-3 rounded-lg border bg-muted/40">
                      <div className="text-sm font-semibold">{n.title}</div>
                      <div className="text-sm text-muted-foreground">{n.message}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(n.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {/* 角色描述 */}
          {character.description && (
            <div className="space-y-2 mb-6">
              <h3 className="text-xl font-semibold flex items-center">
                <span className="mr-2">📝</span>
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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="info">📋 資訊</TabsTrigger>
              <TabsTrigger value="stats">📊 數值</TabsTrigger>
              <TabsTrigger value="tasks">✅ 任務</TabsTrigger>
              <TabsTrigger value="items">🎒 道具</TabsTrigger>
              <TabsTrigger value="skills">⚡ 技能</TabsTrigger>
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
                    <div className="text-4xl mb-4">📊</div>
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
              <span className="mr-2">🆔</span>
              <span>角色 ID: {character.id.substring(0, 8)}...</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">📅</span>
              <span>
                建立於 {new Date(character.createdAt).toLocaleDateString('zh-TW')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 返回提示 */}
      <div className="mt-8 text-center">
        <p className="text-purple-200 text-sm">
          🎮 這是您的專屬角色卡，請妥善保管此頁面連結
        </p>
      </div>

      {/* Phase 7: 對抗檢定回應 Dialog（防守方） */}
      <ContestResponseDialog
        open={contestDialogOpen}
        onOpenChange={setContestDialogOpen}
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
      <Dialog open={gameEndedDialogOpen} onOpenChange={() => { /* 不允許點擊外部關閉 */ }}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>遊戲已結束</DialogTitle>
            <DialogDescription>
              GM 已結束本場遊戲。感謝您的參與！
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => {
                setGameEndedDialogOpen(false);
                handleRelock();
              }}
            >
              確認
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

