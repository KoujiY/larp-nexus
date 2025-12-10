'use client';

import { useState, useSyncExternalStore, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CharacterData } from '@/types/character';
import type { BaseEvent } from '@/types/event';
import { PinUnlock } from './pin-unlock';
import { PublicInfoSection } from './public-info-section';
import { SecretInfoSection } from './secret-info-section';
import { StatsDisplay } from './stats-display';
import { TaskList } from './task-list';
import { ItemList } from './item-list';
import { SkillList } from './skill-list';
import { WorldInfoLink } from './world-info-link';
import { useItem as consumeItemAction, transferItem as transferItemAction } from '@/app/actions/characters';
import { toast } from 'sonner';
import Image from 'next/image';
import { useCharacterWebSocket, useGameWebSocket } from '@/hooks/use-websocket';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    timestamp: number;
    type: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const NOTIF_TTL = 24 * 60 * 60 * 1000; // 1 天
  const NOTIF_LIMIT = 50;
  const notifStorageKey = `character-${character.id}-notifs`;

  // 最終解鎖狀態：localStorage 或手動解鎖
  const isUnlocked = isStorageUnlocked || isManuallyUnlocked;

  const handleUnlocked = () => {
    setIsManuallyUnlocked(true);
    // 儲存解鎖狀態到 localStorage
    localStorage.setItem(`character-${character.id}-unlocked`, 'true');
  };

  // 載入歷史通知（保留 1 天內）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(notifStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as typeof notifications;
      const now = Date.now();
      const filtered = parsed.filter((n) => now - n.timestamp < NOTIF_TTL);
      setNotifications(filtered.slice(-NOTIF_LIMIT));
    } catch {
      // ignore parse error
    }
  }, [NOTIF_TTL, notifStorageKey]);

  // 存儲通知
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const filtered = notifications.filter((n) => now - n.timestamp < NOTIF_TTL).slice(-NOTIF_LIMIT);
    localStorage.setItem(notifStorageKey, JSON.stringify(filtered));
  }, [notifications, notifStorageKey, NOTIF_TTL]);

  // 道具使用 callback
  const handleUseItem = useCallback(async (itemId: string, targetCharacterId?: string) => {
    const result = await consumeItemAction(character.id, itemId, targetCharacterId);
    if (result.success) {
      toast.success(result.message || '道具使用成功');
      router.refresh(); // 重新載入頁面資料
    } else {
      toast.error(result.message || '道具使用失敗');
    }
  }, [character.id, router]);

  // 道具轉移 callback
  const handleTransferItem = useCallback(async (itemId: string, targetCharacterId: string) => {
    const result = await transferItemAction(character.id, targetCharacterId, itemId);
    if (result.success) {
      toast.success(result.message || '道具轉移成功');
      router.refresh();
    } else {
      toast.error(result.message || '道具轉移失敗');
    }
  }, [character.id, router]);

  // WebSocket 訂閱（角色專屬頻道）
  useCharacterWebSocket(character.id, (event: BaseEvent) => {
    const now = Date.now();
    const friendlyList = mapEventToNotifications(event);
    if (friendlyList.length > 0) {
      setNotifications((prev) => {
        const next = [...prev, ...friendlyList.map((f) => ({ ...f, timestamp: now }))];
        return next.slice(-NOTIF_LIMIT);
      });
      setUnreadCount((n) => n + friendlyList.length);
    }

    switch (event.type) {
      case 'role.updated':
        // 角色更新：僅刷新，不顯示 toast
        router.refresh();
        break;
      case 'role.inventoryUpdated':
      case 'item.transferred':
        // 道具相關：顯示通知與 toast
        if (friendlyList.length > 0) {
          toast.info(friendlyList[friendlyList.length - 1].message);
        }
        router.refresh();
        break;
      case 'role.message': {
        const { title, message } = event.payload as { title?: string; message?: string };
        toast.info(title || '訊息', { description: message });
        break;
      }
      default:
        // 其他事件僅記錄於 console，避免干擾玩家
        console.debug('[ws][character]', event);
    }
  });

  // WebSocket 訂閱（劇本廣播）
  useGameWebSocket(character.gameId, (event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      const { title, message } = event.payload as { title?: string; message?: string };
      toast.info(title || '系統廣播', { description: message });
      setNotifications((prev) => {
        const next = [
          ...prev,
          {
            id: `evt-${event.timestamp}`,
            title: title || '系統廣播',
            message: message || '收到廣播',
            timestamp: event.timestamp,
            type: event.type,
          },
        ];
        return next.slice(-NOTIF_LIMIT);
      });
      setUnreadCount((n) => n + 1);
    } else if (event.type === 'game.started' || event.type === 'game.reset' || event.type === 'game.ended') {
      const titles: Record<string, string> = {
        'game.started': '遊戲開始',
        'game.reset': '遊戲重置',
        'game.ended': '遊戲結束',
      };
      toast.info(titles[event.type] || '遊戲狀態變更');
      setNotifications((prev) => {
        const next = [
          ...prev,
          {
            id: `evt-${event.timestamp}`,
            title: titles[event.type] || '遊戲狀態',
            message: '請刷新以取得最新狀態',
            timestamp: event.timestamp,
            type: event.type,
          },
        ];
        return next.slice(-NOTIF_LIMIT);
      });
      setUnreadCount((n) => n + 1);
      router.refresh();
    }
  });

  const mapEventToNotifications = (event: BaseEvent) => {
    switch (event.type) {
      case 'role.updated':
        return mapRoleUpdated(event);
      case 'role.inventoryUpdated':
        return mapInventoryUpdated(event);
      case 'item.transferred':
        return mapItemTransferred(event);
      case 'role.message':
        return mapRoleMessage(event);
      // 技能相關：不顯示通知（需求指定）
      default:
        return [];
    }
  };

  const mapItemTransferred = (event: BaseEvent) => {
    const payload = event.payload as {
      toCharacterId?: string;
      fromCharacterId?: string;
      itemName?: string;
      quantity?: number;
    };
    // 只在收到道具時提醒，轉出則略過
    if (payload.toCharacterId !== character.id) return [];
    const qty = payload.quantity ?? 1;
    const name = payload.itemName ?? '道具';
    return [{
      id: `evt-${event.timestamp}`,
      title: '道具獲得',
      message: `收到 ${name} x${qty}`,
      type: event.type,
    }];
  };

  const mapInventoryUpdated = (event: BaseEvent) => {
    const payload = event.payload as {
      item?: { name?: string };
      action?: 'added' | 'updated' | 'deleted';
    };
    const name = payload.item?.name || '道具';
    const actionText =
      payload.action === 'added' ? '新增'
      : payload.action === 'deleted' ? '移除'
      : '更新';
    return [{
      id: `evt-${event.timestamp}`,
      title: '道具更新',
      message: `${name} 已${actionText}`,
      type: event.type,
    }];
  };

  const mapRoleUpdated = (event: BaseEvent) => {
    const payload = event.payload as {
      updates?: {
        stats?: Array<{ name?: string; value?: number; maxValue?: number; deltaValue?: number; deltaMax?: number }>;
      };
    };
    const stats = payload?.updates?.stats;
    if (stats && stats.length > 0) {
      const notifList: Array<{ id: string; title: string; message: string; type: string }> = [];
      stats.forEach((s, idx) => {
        const name = s.name ?? '數值';
        const deltaVal = typeof s.deltaValue === 'number' ? s.deltaValue : null;
        const deltaMax = typeof s.deltaMax === 'number' ? s.deltaMax : null;
        const value = typeof s.value === 'number' ? s.value : null;
        const maxVal = typeof s.maxValue === 'number' ? s.maxValue : null;

        // 若同時變更最大值與當前值，合併為單則通知
        if (deltaVal !== null && deltaVal !== 0 && deltaMax !== null && deltaMax !== 0) {
          const maxText = maxVal !== null ? `（上限：${maxVal}）` : '';
          notifList.push({
            id: `evt-${event.timestamp}-${idx}-combined`,
            title: '數值變更',
            message: `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}${maxText}，目前值 ${deltaVal > 0 ? '+' : ''}${deltaVal}`,
            type: event.type,
          });
        } else {
          // value 變化（非 0）
          if (deltaVal !== null && deltaVal !== 0) {
            notifList.push({
              id: `evt-${event.timestamp}-${idx}-val`,
              title: '數值變更',
              message: `${name} ${deltaVal > 0 ? '+' : ''}${deltaVal}`,
              type: event.type,
            });
          }

          // 最大值變化（非 0）
          if (deltaMax !== null && deltaMax !== 0) {
            const maxText = maxVal !== null ? `（上限：${maxVal}）` : '';
            notifList.push({
              id: `evt-${event.timestamp}-${idx}-max`,
              title: '數值變更',
              message: `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}${maxText}`,
              type: event.type,
            });
          }
        }

        // 若上述皆無，但有 value，可給一個 fallback 訊息
        if (
          (!deltaVal || deltaVal === 0) &&
          (!deltaMax || deltaMax === 0) &&
          value !== null &&
          notifList.length === 0
        ) {
          notifList.push({
            id: `evt-${event.timestamp}-${idx}-fallback`,
            title: '數值變更',
            message: `${name} → ${value}`,
            type: event.type,
          });
        }
      });

      if (notifList.length > 0) return notifList;
    }
    // 沒有 stats 變化時，不顯示通知（可能是技能/任務更新）
    return [];
  };

  const mapRoleMessage = (event: BaseEvent) => {
    const payload = event.payload as { title?: string; message?: string };
    return [
      {
        id: `evt-${event.timestamp}`,
        title: payload.title || '訊息',
        message: payload.message || '收到新訊息',
        type: event.type,
      },
    ];
  };

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
              if (open) setUnreadCount(0);
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
                  {notifications.slice().reverse().map((n) => (
                    <div key={n.id} className="p-3 rounded-lg border bg-muted/40">
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
          <Tabs defaultValue="info" className="w-full">
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
    </div>
  );
}

