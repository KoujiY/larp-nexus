'use client';

import { useState, useSyncExternalStore, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CharacterData, Skill, Item } from '@/types/character';
import type { BaseEvent } from '@/types/event';
import { PinUnlock } from './pin-unlock';
import { PublicInfoSection } from './public-info-section';
import { SecretInfoSection } from './secret-info-section';
import { StatsDisplay } from './stats-display';
import { TaskList } from './task-list';
import { ItemList } from './item-list';
import { SkillList } from './skill-list';
import { WorldInfoLink } from './world-info-link';
import { useItem as consumeItemAction, transferItem as transferItemAction } from '@/app/actions/item-use';
import { toast } from 'sonner';
import Image from 'next/image';
import { useCharacterWebSocket, useGameWebSocket } from '@/hooks/use-websocket';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ContestResponseDialog } from './contest-response-dialog';
import { AttackerContestWaitingDialog } from './attacker-contest-waiting-dialog';
import type { SkillContestEvent } from '@/types/event';
import { useDefenderContestState, useContestState } from '@/hooks/use-contest-state';
import { useNotificationSystem } from '@/hooks/use-notification-system';
import { useCharacterWebSocketHandler } from '@/hooks/use-character-websocket-handler';

interface CharacterCardViewProps {
  character: CharacterData;
}

// Hook 用於安全地讀取 localStorage（避免 SSR/CSR hydration 問題）
function useLocalStorageUnlock(characterId: string, hasPinLock: boolean) {
  const storageKey = `character-${characterId}-unlocked`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    []
  );

  const getSnapshot = useCallback(() => {
    if (!hasPinLock) return true;
    return localStorage.getItem(storageKey) === 'true';
  }, [hasPinLock, storageKey]);

  // Server 端的快照：有 PIN 鎖時為 false
  const getServerSnapshot = useCallback(() => {
    return !hasPinLock;
  }, [hasPinLock]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function CharacterCardView({ character }: CharacterCardViewProps) {
  const router = useRouter();
  
  // 使用 useSyncExternalStore 安全地從 localStorage 讀取解鎖狀態
  const isStorageUnlocked = useLocalStorageUnlock(character.id, character.hasPinLock);
  const [isManuallyUnlocked, setIsManuallyUnlocked] = useState(false);
  // Phase 8: 分頁狀態管理（用於自動切換到對應分頁）
  const [activeTab, setActiveTab] = useState<string>('info');
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Phase 3.1: 使用通知系統 Hook
  const { notifications, unreadCount, markAsRead, addNotification } = useNotificationSystem(character.id);

  // Phase 7: 對抗檢定相關狀態
  // Phase 8: 使用持久化狀態管理防守方 dialog
  const { defenderState, setDefenderContest, clearDefenderContest } = useDefenderContestState(character.id);
  const [contestDialogOpen, setContestDialogOpen] = useState(defenderState !== null);
  const [currentContestEvent, setCurrentContestEvent] = useState<SkillContestEvent['payload'] | null>(
    defenderState?.contestEvent || null
  );
  const [currentContestId, setCurrentContestId] = useState<string>(defenderState?.contestId || '');

  // Phase 8: 攻擊方對抗檢定狀態管理（用於顯示全局等待 dialog）
  const { pendingContests } = useContestState(character.id);
  const [attackerWaitingDialog, setAttackerWaitingDialog] = useState<{
    sourceType: 'skill' | 'item';
    sourceId: string;
    contestId: string;
  } | null>(null);

  // Phase 8: 從持久化狀態恢復防守方 dialog
  useEffect(() => {
    if (defenderState) {
      setContestDialogOpen(true);
      setCurrentContestEvent(defenderState.contestEvent);
      setCurrentContestId(defenderState.contestId);
    }
  }, [defenderState]);

  // Phase 8: 從持久化狀態恢復攻擊方等待 dialog
  // 注意：對於道具類型的對抗檢定，不顯示全局等待 modal，而是顯示道具 dialog（由 item-list.tsx 處理）
  // 對於技能類型的對抗檢定，也不顯示全局等待 modal，而是顯示技能 dialog（由 skill-list.tsx 處理）
  // 但是，如果 item-list 或 skill-list 已經關閉了 dialog（設置 dialogOpen 為 false），則顯示全局等待 modal
  // 例外：偷竊（item_steal）和移除道具（item_take）這兩種場景不應該顯示全局等待 modal
  // 使用 useEffect 並添加微任務延遲，確保在 skill-list 的 useLayoutEffect 更新狀態後執行
  useEffect(() => {
    // 使用微任務延遲，確保 skill-list 的 useLayoutEffect 已經執行並更新了狀態
    Promise.resolve().then(() => {
      if (Object.keys(pendingContests).length > 0) {
        // 找到第一個有 dialogOpen 的 pending contest
        // 注意：如果 item-list.tsx 或 skill-list.tsx 已經處理了（設置 dialogOpen 為 false），這裡就不會顯示全局等待 modal
        let foundDialog = false;
        for (const [sourceId, contest] of Object.entries(pendingContests)) {
          if (contest.dialogOpen) {
            // 檢查是否有 item_steal 或 item_take 效果（例外場景）
            let hasStealOrTake = false;
            
            if (contest.sourceType === 'skill') {
              const skill = character.skills?.find((s) => s.id === sourceId);
              if (skill?.effects) {
                hasStealOrTake = skill.effects.some(
                  (effect) => effect.type === 'item_steal' || effect.type === 'item_take'
                );
              }
            } else if (contest.sourceType === 'item') {
              const item = character.items?.find((i) => i.id === sourceId);
              if (item) {
                const effects = item.effects || (item.effect ? [item.effect] : []);
                hasStealOrTake = effects.some(
                  (effect) => effect.type === 'item_steal' || effect.type === 'item_take'
                );
              }
            }
            
            // 如果有偷竊或移除道具效果，跳過顯示全局等待 modal（例外場景）
            if (hasStealOrTake) {
              console.log('[character-card-view] 跳過顯示全局等待 modal（偷竊/移除道具場景）:', {
                sourceId,
                sourceType: contest.sourceType,
              });
              continue;
            }
            
            // 顯示全局等待 modal
            setAttackerWaitingDialog({
              sourceType: contest.sourceType,
              sourceId,
              contestId: contest.contestId,
            });
            foundDialog = true;
            break;
          }
        }
        // 如果沒有找到 dialogOpen 為 true 的 contest，關閉等待 dialog
        if (!foundDialog) {
          setAttackerWaitingDialog(null);
        }
      } else {
        setAttackerWaitingDialog(null);
      }
    });
  }, [pendingContests, character.skills, character.items]);

  // 最終解鎖狀態：localStorage 或手動解鎖
  const isUnlocked = isStorageUnlocked || isManuallyUnlocked;

  const handleUnlocked = () => {
    setIsManuallyUnlocked(true);
    // 儲存解鎖狀態到 localStorage
    localStorage.setItem(`character-${character.id}-unlocked`, 'true');
  };

  // 道具使用 callback
  // Phase 8: 添加檢定結果參數，返回結果以便處理對抗檢定
  const handleUseItem = useCallback(async (itemId: string, targetCharacterId?: string, checkResult?: number, targetItemId?: string) => {
    console.log('[character-card-view] handleUseItem 調用:', { itemId, targetCharacterId, checkResult, targetItemId });
    const result = await consumeItemAction(character.id, itemId, targetCharacterId, checkResult, targetItemId);
    console.log('[character-card-view] handleUseItem 返回結果:', {
      success: result.success,
      data: result.data,
      message: result.message,
      hasContestId: !!result.data?.contestId,
      checkPassed: result.data?.checkPassed,
    });
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
    onContestRequest: (payload) => {
      // 防守方收到對抗檢定請求時，設置 dialog 狀態
      const sourceId = payload.itemId || payload.skillId || '';
      const contestId = `${payload.attackerId}::${sourceId}::${Date.now()}`;
      setDefenderContest(contestId, payload);
      setCurrentContestEvent(payload);
      setCurrentContestId(contestId);
      setContestDialogOpen(true);
    },
    onContestResult: (payload) => {
      // 對抗檢定結果處理（防守方和攻擊方都會收到）
      // 防守方：關閉 dialog
      if (String(payload.defenderId) === String(character.id)) {
        clearDefenderContest();
        setContestDialogOpen(false);
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
    } else if (event.type === 'game.started' || event.type === 'game.reset' || event.type === 'game.ended') {
      const titles: Record<string, string> = {
        'game.started': '遊戲開始',
        'game.reset': '遊戲重置',
        'game.ended': '遊戲結束',
      };
      toast.info(titles[event.type] || '遊戲狀態變更');
      addNotification([
        {
          id: `evt-${event.timestamp}`,
          title: titles[event.type] || '遊戲狀態',
          message: '請刷新以取得最新狀態',
          type: event.type,
        },
      ]);
      router.refresh();
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
              {character.hasPinLock && (
                <Badge variant="secondary" className="mb-2">
                  🔓 已解鎖
                </Badge>
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
                  secretInfo={character.secretInfo}
                  characterId={character.id}
                />
              </TabsContent>

              <TabsContent value="stats" className="mt-0">
                <StatsDisplay stats={character.stats} />
                {(!character.stats || character.stats.length === 0) && (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-4xl mb-4">📊</div>
                    <p>尚無角色數值</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-0">
                <TaskList tasks={character.tasks} />
              </TabsContent>

              <TabsContent value="items" className="mt-0">
                <ItemList 
                  items={character.items} 
                  characterId={character.id}
                  gameId={character.gameId}
                  characterName={character.name}
                  onUseItem={handleUseItem}
                  onTransferItem={handleTransferItem}
                />
              </TabsContent>

              <TabsContent value="skills" className="mt-0">
                <SkillList 
                  skills={character.skills}
                  characterId={character.id}
                  gameId={character.gameId}
                  characterName={character.name}
                  stats={character.stats}
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
          router.refresh();
        }}
      />

      {/* Phase 8: 攻擊方等待對抗檢定結果 Dialog（全局） */}
      {/* 注意：偷竊（item_steal）和移除道具（item_take）這兩種場景不應該顯示此 dialog */}
      {attackerWaitingDialog && (() => {
        const source = attackerWaitingDialog.sourceType === 'skill'
          ? character.skills?.find((s) => s.id === attackerWaitingDialog.sourceId)
          : character.items?.find((i) => i.id === attackerWaitingDialog.sourceId);
        
        // 再次檢查是否有偷竊或移除道具效果（防禦性檢查）
        let hasStealOrTake = false;
        if (source) {
          if (attackerWaitingDialog.sourceType === 'skill') {
            const skill = source as Skill;
            if (skill.effects) {
              hasStealOrTake = skill.effects.some(
                (effect: { type?: string }) => effect.type === 'item_steal' || effect.type === 'item_take'
              );
            }
          } else {
            const item = source as Item;
            const effects = item.effects || (item.effect ? [item.effect] : []);
            hasStealOrTake = effects.some(
              (effect: { type?: string }) => effect.type === 'item_steal' || effect.type === 'item_take'
            );
          }
        }
        
        // 如果有偷竊或移除道具效果，不顯示全局等待 dialog
        if (hasStealOrTake) {
          return null;
        }
        
        return (
          <AttackerContestWaitingDialog
            open={!!attackerWaitingDialog}
            sourceType={attackerWaitingDialog.sourceType}
            source={source || null}
            contestId={attackerWaitingDialog.contestId}
          />
        );
      })()}
    </div>
  );
}

