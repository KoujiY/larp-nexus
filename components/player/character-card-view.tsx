'use client';

import { useState, useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
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
import type { SkillContestEvent, SkillUsedEvent } from '@/types/event';
import { useDefenderContestState, useContestState } from '@/hooks/use-contest-state';

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

  // 清理重複的通知（基於 ID）
  useEffect(() => {
    setNotifications((prev) => {
      const seenIds = new Set<string>();
      const deduplicated = prev.filter((n) => {
        if (seenIds.has(n.id)) {
          return false;
        }
        seenIds.add(n.id);
        return true;
      });
      
      // 如果發現重複，返回去重後的列表
      if (deduplicated.length !== prev.length) {
        return deduplicated;
      }
      return prev;
    });
  }, [notifications.length]); // 只在通知數量變化時檢查

  // Phase 7: 對抗檢定相關狀態
  // Phase 8: 使用持久化狀態管理防守方 dialog
  const { defenderState, setDefenderContest, clearDefenderContest } = useDefenderContestState(character.id);
  const [contestDialogOpen, setContestDialogOpen] = useState(defenderState !== null);
  const [currentContestEvent, setCurrentContestEvent] = useState<SkillContestEvent['payload'] | null>(
    defenderState?.contestEvent || null
  );
  const [currentContestId, setCurrentContestId] = useState<string>(defenderState?.contestId || '');

  // Phase 8: 攻擊方對抗檢定狀態管理（用於顯示全局等待 dialog）
  const { pendingContests, removePendingContest } = useContestState(character.id);
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

  // 追蹤最近的轉移/偷竊事件，用於過濾 inventoryUpdated 通知
  // key: itemId, value: { timestamp, transferType, fromCharacterId, toCharacterId }
  const recentTransferredItemsRef = useRef<Map<string, { timestamp: number; transferType: string; fromCharacterId?: string; toCharacterId?: string }>>(new Map());

  // 定義通知映射函數（必須在 mapEventToNotifications 之前定義）
  const mapItemTransferred = useCallback((event: BaseEvent) => {
    const payload = event.payload as {
      toCharacterId?: string;
      fromCharacterId?: string;
      fromCharacterName?: string;
      toCharacterName?: string;
      itemId?: string;
      itemName?: string;
      quantity?: number;
      transferType?: 'give' | 'take' | 'steal';
    };
    const qty = payload.quantity ?? 1;
    const name = payload.itemName ?? '道具';
    const transferType = payload.transferType || 'give';
    
    // 記錄轉移事件，用於過濾 inventoryUpdated 通知
    if (payload.itemId) {
      recentTransferredItemsRef.current.set(payload.itemId, {
        timestamp: event.timestamp,
        transferType,
        fromCharacterId: payload.fromCharacterId,
        toCharacterId: payload.toCharacterId,
      });
      // 清理舊的記錄（2秒後）
      setTimeout(() => {
        recentTransferredItemsRef.current.delete(payload.itemId!);
      }, 2000);
    }
    
    // 偷竊時：
    // - 被偷竊方（fromCharacterId === character.id）：不顯示 item.transferred 通知（會顯示 inventoryUpdated 通知）
    // - 偷竊方（toCharacterId === character.id）：不顯示 item.transferred 通知（會顯示技能/道具使用結果）
    if (transferType === 'steal') {
      // 被偷竊方或偷竊方都不顯示 item.transferred 通知
      return [];
    }
    
    // 轉移時：轉入方顯示獲得通知
    if (payload.toCharacterId === character.id && transferType === 'give') {
      const fromName = payload.fromCharacterName || '其他角色';
      return [{
        id: `evt-${event.timestamp}`,
        title: '道具獲得',
        message: `從 ${fromName} 收到 ${name} x${qty}`,
        type: event.type,
      }];
    }
    
    // 轉移時：轉出方顯示轉移通知
    if (payload.fromCharacterId === character.id && transferType === 'give') {
      const toName = payload.toCharacterName || '其他角色';
      return [{
        id: `evt-${event.timestamp}`,
        title: '道具轉移',
        message: `已將 ${name} x${qty} 轉移給 ${toName}`,
        type: event.type,
      }];
    }
    
    return [];
  }, [character.id]);

  const mapInventoryUpdated = useCallback((event: BaseEvent) => {
    const payload = event.payload as {
      item?: { name?: string; id?: string };
      action?: 'added' | 'updated' | 'deleted';
      characterId?: string;
    };
    
    // 檢查這個道具是否在最近的轉移/偷竊事件中（2秒內）
    const itemId = payload.item?.id;
    const eventCharacterId = payload.characterId || character.id; // inventoryUpdated 事件的 characterId 是收到事件的角色
    
    if (itemId) {
      const recentTransfer = recentTransferredItemsRef.current.get(itemId);
      if (recentTransfer) {
        // 檢查時間差（允許更大的時間窗口，因為事件可能不同步到達）
        const timeDiff = Math.abs(event.timestamp - recentTransfer.timestamp);
        if (timeDiff < 3000) { // 擴展到 3 秒，確保能捕獲到
          // 轉移時（give）：雙方都不顯示 inventoryUpdated 通知
          // 因為：
          // - 轉出方會顯示 item.transferred 的「道具轉移」通知
          // - 接受方只會收到 item.transferred 的「道具獲得」通知（後端已不發送 inventoryUpdated）
          if (recentTransfer.transferType === 'give') {
            return [];
          }
          
          // 偷竊時：
          // - 偷竊者（eventCharacterId === toCharacterId）：不顯示 inventoryUpdated 通知
          // - 被偷竊方（eventCharacterId === fromCharacterId）：顯示 inventoryUpdated 通知
          if (recentTransfer.transferType === 'steal') {
            // 檢查是否是偷竊者（收到道具的角色）
            const isThief = recentTransfer.toCharacterId && 
              (String(eventCharacterId) === String(recentTransfer.toCharacterId) ||
               eventCharacterId === recentTransfer.toCharacterId);
            
            if (isThief) {
              // 偷竊者：不顯示 inventoryUpdated 通知
              return [];
            }
            // 被偷竊方：顯示 inventoryUpdated 通知（繼續執行下面的邏輯）
          }
        }
      }
      
      // 額外檢查：如果 action 是 'added' 且沒有 recentTransfer 記錄，可能是偷竊導致的
      // 但由於後端已經不發送 inventoryUpdated 給偷竊方了，這個檢查主要是為了防禦性編程
      // 如果後端意外發送了，這裡可以作為最後一道防線
      // 注意：這個檢查可能會誤判，所以只在沒有 recentTransfer 記錄時才使用
      // 實際上，如果後端已經不發送了，這個檢查就不會被觸發
    }
    
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
  }, [character.id]);

  const mapRoleUpdated = useCallback((event: BaseEvent) => {
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
  }, []);

  const mapRoleMessage = useCallback((event: BaseEvent) => {
    const payload = event.payload as { title?: string; message?: string };
    return [
      {
        id: `evt-${event.timestamp}`,
        title: payload.title || '訊息',
        message: payload.message || '收到新訊息',
        type: event.type,
      },
    ];
  }, []);

  const mapCharacterAffected = useCallback((event: BaseEvent) => {
    const payload = event.payload as {
      changes?: {
        stats?: Array<{
          name?: string;
          deltaValue?: number;
          deltaMax?: number;
          newValue?: number;
          newMax?: number;
        }>;
      };
    };
    
    const stats = payload.changes?.stats;
    if (!stats || stats.length === 0) {
      return [];
    }
    
    // 防守方受到影響，但不顯示技能名稱或攻擊方名稱（隱私保護）
    const notifList: Array<{ id: string; title: string; message: string; type: string }> = [];
    
    stats.forEach((s, idx) => {
      const name = s.name ?? '數值';
      const deltaVal = typeof s.deltaValue === 'number' ? s.deltaValue : null;
      const deltaMax = typeof s.deltaMax === 'number' ? s.deltaMax : null;
      
      // 如果同時有 deltaValue 和 deltaMax，且兩者都不為 0，合併成一個通知（表示同步調整）
      if (deltaVal !== null && deltaVal !== 0 && deltaMax !== null && deltaMax !== 0) {
        // 只在 newMax 有值時顯示上限資訊
        const maxText = s.newMax !== undefined && s.newMax !== null ? `（上限：${s.newMax}）` : '';
        notifList.push({
          id: `evt-${event.timestamp}-${idx}`,
          title: '受到影響',
          message: `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}，目前值同步調整${maxText}`,
          type: event.type,
        });
      } else {
        // 只有 deltaValue 或只有 deltaMax，分別處理
        if (deltaVal !== null && deltaVal !== 0) {
          notifList.push({
            id: `evt-${event.timestamp}-${idx}-val`,
            title: '受到影響',
            message: `${name} ${deltaVal > 0 ? '+' : ''}${deltaVal}`,
            type: event.type,
          });
        }
        
        if (deltaMax !== null && deltaMax !== 0) {
          // 只在 newMax 有值時顯示上限資訊
          const maxText = s.newMax !== undefined && s.newMax !== null ? `（上限：${s.newMax}）` : '';
          notifList.push({
            id: `evt-${event.timestamp}-${idx}-max`,
            title: '受到影響',
            message: `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}${maxText}`,
            type: event.type,
          });
        }
      }
    });
    
    return notifList;
  }, []);

  const mapSkillContest = useCallback((event: BaseEvent) => {
    const payload = event.payload as SkillContestEvent['payload'];
    
    // 只處理結果事件（attackerValue !== 0），忽略請求事件
    if (payload.attackerValue === 0) {
      return [];
    }
    
    // 檢查是否是攻擊方
    // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
    const characterIdStr = String(character.id);
    const attackerIdStr = String(payload.attackerId);
    const isAttacker = attackerIdStr === characterIdStr;
    
    // 只處理攻擊方的通知
    if (!isAttacker) {
      return [];
    }
    
    // Phase 8: 根據來源類型決定標題和名稱
    // 優先根據實際存在的名稱欄位判斷類型，避免顯示錯誤的類型
    let sourceType: 'skill' | 'item' = payload.sourceType || 'skill';
    let sourceName: string;
    
    // 如果 payload 中有 itemName，優先判斷為道具類型
    if (payload.itemName) {
      sourceType = 'item';
      sourceName = payload.itemName;
    } else if (payload.skillName) {
      sourceType = 'skill';
      sourceName = payload.skillName;
    } else {
      // 如果都沒有，根據 sourceType 判斷，但這不應該發生
      sourceName = sourceType === 'item' ? '未知道具' : '未知技能';
    }
    
    const title = sourceType === 'item' ? '道具使用結果' : '技能使用結果';
    const actionType = sourceType === 'item' ? '道具' : '技能';
    
    // 攻擊方：提示使用成功或失敗
    const isSuccess = payload.result === 'attacker_wins';
    const needsTargetItemSelection = payload.needsTargetItemSelection === true;
    
    // 如果需要選擇目標道具且沒有效果，不顯示通知（效果將在選擇目標道具後發送完整通知）
    if (needsTargetItemSelection && isSuccess && (!payload.effectsApplied || payload.effectsApplied.length === 0)) {
      console.log('[character-card-view] 需要選擇目標道具且無效果，跳過顯示通知，等待選擇目標道具後的完整通知');
      return [];
    }
    
    let message = '';
    
    if (isSuccess) {
      message = `你對 ${payload.defenderName} 使用了 ${sourceName}，${actionType}使用成功`;
      if (payload.effectsApplied && payload.effectsApplied.length > 0) {
        message += `，效果：${payload.effectsApplied.join('、')}`;
      }
    } else {
      // 攻擊方使用失敗
      message = `你對 ${payload.defenderName} 使用了 ${sourceName}，${actionType}使用失敗`;
    }
    
    return [
      {
        id: `evt-${event.timestamp}`,
        title,
        message,
        type: event.type,
      },
    ];
  }, [character.id]);

  const mapSkillUsed = useCallback((event: BaseEvent) => {
    const payload = event.payload as SkillUsedEvent['payload'];
    
    // 只處理當前角色的通知
    const characterIdStr = String(character.id);
    const payloadCharacterIdStr = String(payload.characterId);
    if (payloadCharacterIdStr !== characterIdStr) {
      return [];
    }
    
    // Phase 8: 對抗檢定類型的 skill.used 事件不應該顯示通知
    // 因為對抗檢定結果已經通過 skill.contest 事件顯示了通知
    // 避免重複顯示「道具使用成功」的通知
    if (payload.checkType === 'contest') {
      console.log('[character-card-view] 跳過對抗檢定類型的 skill.used 事件通知，避免重複');
      return [];
    }
    
    // Phase 8: 根據來源類型決定標題和名稱（非對抗檢定類型）
    const title = '技能使用結果';
    const actionType = '技能';
    
    let message = '';
    if (payload.checkPassed) {
      message = `${actionType}使用成功`;
      if (payload.effectsApplied && payload.effectsApplied.length > 0) {
        message += `，效果：${payload.effectsApplied.join('、')}`;
      }
    } else {
      message = `${actionType}使用失敗`;
      if (payload.checkResult !== undefined) {
        message += `（檢定結果：${payload.checkResult}）`;
      }
    }
    
    return [
      {
        id: `evt-${event.timestamp}`,
        title,
        message,
        type: event.type,
      },
    ];
  }, [character.id]);

  const mapEventToNotifications = useCallback((event: BaseEvent) => {
    switch (event.type) {
      case 'role.updated':
        return mapRoleUpdated(event);
      case 'role.inventoryUpdated':
        return mapInventoryUpdated(event);
      case 'item.transferred':
        return mapItemTransferred(event);
      case 'role.message':
        return mapRoleMessage(event);
      case 'skill.contest':
        return mapSkillContest(event);
      case 'skill.used':
        return mapSkillUsed(event);
      case 'character.affected':
        return mapCharacterAffected(event);
      // 其他技能相關：不顯示通知（需求指定）
      default:
        return [];
    }
  }, [mapRoleUpdated, mapInventoryUpdated, mapItemTransferred, mapRoleMessage, mapSkillContest, mapSkillUsed, mapCharacterAffected]);

  // WebSocket 訂閱（角色專屬頻道）
  const handleWebSocketEvent = useCallback((event: BaseEvent) => {
    const now = Date.now();
    const friendlyList = mapEventToNotifications(event);
    
    if (friendlyList.length > 0) {
      setNotifications((prev) => {
        // 為每個通知生成唯一的 ID，避免重複
        // 使用 timestamp + 索引 + 微秒時間戳確保唯一性
        const newNotifications = friendlyList.map((f, idx) => {
          // 如果 ID 已經存在，添加索引和微秒時間戳確保唯一性
          const baseId = f.id || `evt-${event.timestamp}`;
          // 使用 performance.now() 獲取高精度時間戳，確保唯一性
          const uniqueId = `${baseId}-${idx}-${now}-${performance.now()}`;
          return { ...f, id: uniqueId, timestamp: now };
        });
        
        // 過濾掉已經存在的通知（基於 ID，避免完全重複）
        const existingIds = new Set(prev.map(n => n.id));
        const filteredNotifications = newNotifications.filter(n => !existingIds.has(n.id));
        
        // 合併並去重：確保整個列表都沒有重複的 ID
        const combined = [...prev, ...filteredNotifications];
        const seenIds = new Set<string>();
        const deduplicated = combined.filter((n) => {
          if (seenIds.has(n.id)) {
            return false;
          }
          seenIds.add(n.id);
          return true;
        });
        
        return deduplicated.slice(-NOTIF_LIMIT);
      });
      setUnreadCount((n) => n + friendlyList.length);
    }

    switch (event.type) {
      case 'role.updated':
        // 角色更新：僅刷新，不顯示 toast
        router.refresh();
        break;
      case 'role.inventoryUpdated':
        // 道具更新：顯示通知與 toast
        if (friendlyList.length > 0) {
          toast.info(friendlyList[friendlyList.length - 1].message);
        }
        router.refresh();
        break;
      case 'item.transferred':
        // 道具轉移：顯示通知與 toast（優先顯示轉移訊息，而不是 inventoryUpdated）
        if (friendlyList.length > 0) {
          toast.success(friendlyList[friendlyList.length - 1].message);
        }
        router.refresh();
        break;
      case 'role.message': {
        const { title, message } = event.payload as { title?: string; message?: string };
        toast.info(title || '訊息', { description: message });
        break;
      }
      case 'skill.contest': {
        // Phase 7: 對抗檢定事件
        const payload = event.payload as SkillContestEvent['payload'];
        
        console.log('[character-card-view] 收到 skill.contest 事件:', {
          eventType: event.type,
          timestamp: event.timestamp,
          payload: {
            attackerId: payload.attackerId,
            attackerName: payload.attackerName,
            defenderId: payload.defenderId,
            defenderName: payload.defenderName,
            skillId: payload.skillId,
            skillName: payload.skillName,
            itemId: payload.itemId,
            itemName: payload.itemName,
            sourceType: payload.sourceType,
            attackerValue: payload.attackerValue,
            defenderValue: payload.defenderValue,
            result: payload.result,
          },
        });
        
        // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
        const characterIdStr = String(character.id);
        const attackerIdStr = String(payload.attackerId);
        const defenderIdStr = String(payload.defenderId);
        
        console.log('[character-card-view] ID 比較:', {
          characterIdStr,
          attackerIdStr,
          defenderIdStr,
          isDefender: defenderIdStr === characterIdStr,
          isAttacker: attackerIdStr === characterIdStr,
        });
        
        // 檢查是否是針對當前角色的對抗檢定（防守方）
        if (defenderIdStr === characterIdStr) {
          // 防守方處理邏輯
          // 請求事件的 attackerValue 為 0（佔位符），結果事件會包含真實數值（不為 0）
          const isResultEvent = payload.attackerValue !== 0;
          console.log('[character-card-view] 防守方處理:', {
            isResultEvent,
            attackerValue: payload.attackerValue,
          });
          
          if (isResultEvent) {
            console.log('[character-card-view] 防守方收到結果事件:', {
              result: payload.result,
              attackerValue: payload.attackerValue,
              defenderValue: payload.defenderValue,
              effectsApplied: payload.effectsApplied,
            });
            // 這是結果事件，關閉 dialog 並清除持久化狀態
            // 通知會通過 character.affected 事件顯示（只有當有實際數值變化時）
            clearDefenderContest();
            setContestDialogOpen(false);
            router.refresh();
          } else {
            console.log('[character-card-view] 防守方收到請求事件，打開 dialog');
            // 這是請求事件，打開 dialog
            // 創建對抗請求 ID（格式：attackerId::skillId/itemId::timestamp）
            const sourceId = payload.itemId || payload.skillId || '';
            const contestId = `${payload.attackerId}::${sourceId}::${event.timestamp}`;
            console.log('[character-card-view] 創建 contestId:', {
              sourceId,
              contestId,
              attackerId: payload.attackerId,
              timestamp: event.timestamp,
            });
            // Phase 8: 保存到持久化狀態
            setDefenderContest(contestId, payload);
            setCurrentContestEvent(payload);
            setCurrentContestId(contestId);
            setContestDialogOpen(true);
            console.log('[character-card-view] 設置 dialog 狀態:', {
              contestDialogOpen: true,
            });
            // 確保 dialog 打開後再顯示 toast
            // 防守方不應該看到技能或道具名稱（隱私保護）
            setTimeout(() => {
              toast.info(`${payload.attackerName} 對你使用了技能或道具`, {
                description: '請選擇道具/技能回應',
                duration: 5000,
              });
            }, 100);
          }
        } else if (attackerIdStr === characterIdStr) {
          console.log('[character-card-view] 攻擊方處理:', {
            attackerValue: payload.attackerValue,
            isResultEvent: payload.attackerValue !== 0,
            needsTargetItemSelection: payload.needsTargetItemSelection,
            sourceType: payload.sourceType,
          });
          // 攻擊方處理邏輯
          // 攻擊方應該忽略請求事件（attackerValue === 0），只處理結果事件
          if (payload.attackerValue !== 0) {
            console.log('[character-card-view] 攻擊方收到結果事件');
            
            // Phase 8: 當收到對抗檢定結果時，自動切換到對應的分頁並處理結果
            // 這樣無論用戶在哪個分頁，都能正確接收回應並開啟對應的面板
            if (payload.sourceType === 'item' && payload.itemId) {
              // 切換到道具分頁
              setActiveTab('items');
              console.log('[character-card-view] 收到道具對抗檢定結果，切換到道具分頁');
              
              // Phase 8: 在全局監聽器中處理道具類型的對抗檢定結果
              // 這樣即使 item-list.tsx 還沒有渲染，也能正確處理
              const needsTargetItemSelection = payload.needsTargetItemSelection === true;
              const sourceId = payload.itemId;
              
              if (needsTargetItemSelection && payload.result === 'attacker_wins') {
                // 需要選擇目標道具，保持對抗檢定狀態，讓 item-list.tsx 處理
                // 狀態已經在 pendingContests 中，item-list.tsx 會通過 useEffect 檢測並打開 dialog
                console.log('[character-card-view] 道具對抗檢定獲勝，需要選擇目標道具，保持狀態:', sourceId);
                
                // Phase 8: 將狀態保存到 localStorage，確保無論在哪個分頁都能正確處理
                // 使用與 item-list.tsx 相同的 key 格式
                if (typeof window !== 'undefined') {
                  try {
                    const storageKey = `item-needs-target-selection-${character.id}`;
                    const stateToSave = {
                      contestId: pendingContests[sourceId]?.contestId || `${String(character.id)}::${sourceId}::${Date.now()}`,
                      itemId: sourceId,
                      defenderId: String(payload.defenderId),
                      timestamp: Date.now(),
                    };
                    localStorage.setItem(storageKey, JSON.stringify(stateToSave));
                    console.log('[character-card-view] 已保存道具對抗檢定狀態到 localStorage:', stateToSave);
                  } catch (error) {
                    console.error('[character-card-view] 保存道具對抗檢定狀態失敗:', error);
                  }
                }
                
                // 不顯示 toast，讓 item-list.tsx 處理
              } else {
                // 不需要選擇目標道具，清除對抗檢定狀態
                if (sourceId) {
                  removePendingContest(sourceId);
                }
                
                // 顯示結果 toast
                const resultText = payload.result === 'attacker_wins' 
                  ? '攻擊方獲勝' 
                  : payload.result === 'defender_wins' 
                  ? '防守方獲勝' 
                  : '雙方平手';
                toast.success(`對抗檢定結果：${resultText}`, {
                  description: payload.effectsApplied && payload.effectsApplied.length > 0 
                    ? `效果：${payload.effectsApplied.join('、')}` 
                    : undefined,
                });
                router.refresh();
              }
              
              // 道具類型的對抗檢定由 item-list.tsx 進一步處理（打開 dialog 等）
              // 但我們已經在全局層面處理了狀態管理，確保無論在哪個分頁都能正確處理
              return;
            }
            
            // Phase 8: 處理技能類型的對抗檢定
            if (payload.sourceType === 'skill' && payload.skillId) {
              // 切換到技能分頁
              setActiveTab('skills');
              console.log('[character-card-view] 收到技能對抗檢定結果，切換到技能分頁');
              
              // Phase 8: 在全局監聽器中處理技能類型的對抗檢定結果
              // 這樣即使 skill-list.tsx 還沒有渲染，也能正確處理
              const needsTargetItemSelection = payload.needsTargetItemSelection === true;
              const sourceId = payload.skillId;
              
              if (needsTargetItemSelection && payload.result === 'attacker_wins') {
                // 需要選擇目標道具，保持對抗檢定狀態，讓 skill-list.tsx 處理
                // 狀態已經在 pendingContests 中，skill-list.tsx 會通過 useEffect 檢測並打開 dialog
                console.log('[character-card-view] 技能對抗檢定獲勝，需要選擇目標道具，保持狀態:', sourceId);
                
                // Phase 8: 將狀態保存到 localStorage，確保無論在哪個分頁都能正確處理
                // 使用與 skill-list.tsx 相同的 key 格式
                if (typeof window !== 'undefined') {
                  try {
                    const storageKey = `skill-needs-target-selection-${character.id}`;
                    const stateToSave = {
                      contestId: pendingContests[sourceId]?.contestId || `${String(character.id)}::${sourceId}::${Date.now()}`,
                      skillId: sourceId,
                      defenderId: String(payload.defenderId),
                      timestamp: Date.now(),
                    };
                    localStorage.setItem(storageKey, JSON.stringify(stateToSave));
                    console.log('[character-card-view] 已保存技能對抗檢定狀態到 localStorage:', stateToSave);
                  } catch (error) {
                    console.error('[character-card-view] 保存技能對抗檢定狀態失敗:', error);
                  }
                }
                
                // 不顯示 toast，讓 skill-list.tsx 處理
              } else {
                // 不需要選擇目標道具，清除對抗檢定狀態
                if (sourceId) {
                  removePendingContest(sourceId);
                }
                
                // 顯示結果 toast
                const resultText = payload.result === 'attacker_wins' 
                  ? '攻擊方獲勝' 
                  : payload.result === 'defender_wins' 
                  ? '防守方獲勝' 
                  : '雙方平手';
                toast.success(`對抗檢定結果：${resultText}`, {
                  description: payload.effectsApplied && payload.effectsApplied.length > 0 
                    ? `效果：${payload.effectsApplied.join('、')}` 
                    : undefined,
                });
                router.refresh();
              }
            }
          } else {
            console.log('[character-card-view] 攻擊方收到請求事件，關閉 dialog');
            // 確保攻擊方的 dialog 關閉（攻擊方不應該有 dialog）
            setContestDialogOpen(false);
          }
        } else {
          console.log('[character-card-view] 不是當前角色的事件，忽略');
        }
        break;
      }
      case 'character.affected': {
        // Phase 6.5: 跨角色影響事件
        // 防守方受到影響時，不顯示技能名稱或攻擊方名稱（隱私保護）
        const payload = event.payload as { 
          changes?: { 
            stats?: Array<{ 
              name?: string; 
              deltaValue?: number; 
              deltaMax?: number;
              newValue?: number;
              newMax?: number;
            }> 
          } 
        };
        const stats = payload.changes?.stats;
        if (stats && stats.length > 0) {
          console.log('[character-card-view] 收到 character.affected 事件:', {
            stats,
            eventType: event.type,
            timestamp: event.timestamp,
          });
          
          const statMessages = stats.map((s) => {
            const name = s.name || '數值';
            const deltaVal = s.deltaValue;
            const deltaMax = s.deltaMax;
            const newMax = s.newMax;
            
            // 如果同時有 deltaValue 和 deltaMax，且兩者都不為 0，合併成一個訊息（表示同步調整）
            if (deltaVal !== undefined && deltaVal !== 0 && deltaMax !== undefined && deltaMax !== 0) {
              const maxText = newMax !== undefined ? `（上限：${newMax}）` : '';
              return `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}，目前值同步調整${maxText}`;
            }
            
            // 只有 deltaValue 或只有 deltaMax，分別處理
            if (deltaVal !== undefined && deltaVal !== 0) {
              return `${name} ${deltaVal > 0 ? '+' : ''}${deltaVal}`;
            }
            
            if (deltaMax !== undefined && deltaMax !== 0) {
              const maxText = newMax !== undefined ? `（上限：${newMax}）` : '';
              return `${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}${maxText}`;
            }
            
            return null;
          }).filter(Boolean);
          
          if (statMessages.length > 0) {
            console.log('[character-card-view] 顯示 character.affected toast:', statMessages);
            // 不顯示來源資訊，只顯示影響內容
            toast.info('你受到了影響', {
              description: statMessages.join('、'),
            });
          } else {
            console.log('[character-card-view] character.affected 事件沒有有效的數值變化');
          }
        } else {
          console.log('[character-card-view] character.affected 事件沒有 stats 數據');
        }
        router.refresh();
        break;
      }
      default:
        // 其他事件僅記錄於 console，避免干擾玩家
        console.debug('[ws][character]', event);
    }
  }, [character.id, router, mapEventToNotifications, setNotifications, setUnreadCount, setContestDialogOpen, setCurrentContestEvent, setCurrentContestId, clearDefenderContest, setDefenderContest, removePendingContest, pendingContests, NOTIF_LIMIT]);

  useCharacterWebSocket(character.id, handleWebSocketEvent);

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

