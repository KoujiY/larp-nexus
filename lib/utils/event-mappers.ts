/**
 * 事件映射函數
 * 將 WebSocket 事件轉換為通知格式
 * 
 * 從 character-card-view.tsx 提取
 */

import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent, SkillUsedEvent } from '@/types/event';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
}

/**
 * 追蹤最近轉移/偷竊事件的 Map
 * 這是一個 React ref 物件，包含一個 Map
 */
export interface RecentTransferTracker {
  current: Map<string, { timestamp: number; transferType: string; fromCharacterId?: string; toCharacterId?: string }>;
}

/**
 * 創建事件映射器
 * @param characterId 當前角色 ID
 * @param recentTransferredItemsRef 追蹤最近轉移/偷竊事件的 ref（用於過濾重複通知）
 */
export function createEventMappers(
  characterId: string,
  recentTransferredItemsRef: RecentTransferTracker
) {
  /**
   * 映射道具轉移事件
   */
  const mapItemTransferred = (event: BaseEvent): Notification[] => {
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
    
    // 偷竊時：雙方都不顯示 item.transferred 通知
    if (transferType === 'steal') {
      return [];
    }
    
    // 轉移時：轉入方顯示獲得通知
    if (payload.toCharacterId === characterId && transferType === 'give') {
      const fromName = payload.fromCharacterName || '其他角色';
      return [{
        id: `evt-${event.timestamp}`,
        title: '道具獲得',
        message: `從 ${fromName} 收到 ${name} x${qty}`,
        type: event.type,
      }];
    }
    
    // 轉移時：轉出方顯示轉移通知
    if (payload.fromCharacterId === characterId && transferType === 'give') {
      const toName = payload.toCharacterName || '其他角色';
      return [{
        id: `evt-${event.timestamp}`,
        title: '道具轉移',
        message: `已將 ${name} x${qty} 轉移給 ${toName}`,
        type: event.type,
      }];
    }
    
    return [];
  };

  /**
   * 映射道具更新事件
   */
  const mapInventoryUpdated = (event: BaseEvent): Notification[] => {
    const payload = event.payload as {
      item?: { name?: string; id?: string };
      action?: 'added' | 'updated' | 'deleted';
      characterId?: string;
    };
    
    // 檢查這個道具是否在最近的轉移/偷竊事件中（2秒內）
    const itemId = payload.item?.id;
    const eventCharacterId = payload.characterId || characterId;
    
    if (itemId) {
      const recentTransfer = recentTransferredItemsRef.current.get(itemId);
      if (recentTransfer) {
        // 檢查時間差（允許更大的時間窗口，因為事件可能不同步到達）
        const timeDiff = Math.abs(event.timestamp - recentTransfer.timestamp);
        if (timeDiff < 3000) { // 擴展到 3 秒，確保能捕獲到
          // 轉移時（give）：雙方都不顯示 inventoryUpdated 通知
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
  };

  /**
   * 映射角色更新事件
   */
  const mapRoleUpdated = (event: BaseEvent): Notification[] => {
    const payload = event.payload as {
      updates?: {
        stats?: Array<{ name?: string; value?: number; maxValue?: number; deltaValue?: number; deltaMax?: number }>;
      };
    };
    const stats = payload?.updates?.stats;
    if (stats && stats.length > 0) {
      const notifList: Notification[] = [];
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

  /**
   * 映射角色訊息事件
   */
  const mapRoleMessage = (event: BaseEvent): Notification[] => {
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

  /**
   * 映射角色受影響事件
   */
  const mapCharacterAffected = (event: BaseEvent): Notification[] => {
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
    const notifList: Notification[] = [];
    
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
  };

  /**
   * 映射技能對抗檢定事件
   */
  const mapSkillContest = (event: BaseEvent): Notification[] => {
    const payload = event.payload as SkillContestEvent['payload'];
    
    // 只處理結果事件（attackerValue !== 0），忽略請求事件
    if (payload.attackerValue === 0) {
      return [];
    }
    
    // 檢查是否是攻擊方
    // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
    const characterIdStr = String(characterId);
    const attackerIdStr = String(payload.attackerId);
    const isAttacker = attackerIdStr === characterIdStr;
    
    // 只處理攻擊方的通知
    if (!isAttacker) {
      return [];
    }
    
    // 根據來源類型決定標題和名稱
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
      console.log('[event-mappers] 需要選擇目標道具且無效果，跳過顯示通知，等待選擇目標道具後的完整通知');
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
  };

  /**
   * 映射技能使用事件
   */
  const mapSkillUsed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as SkillUsedEvent['payload'];
    
    // 只處理當前角色的通知
    const characterIdStr = String(characterId);
    const payloadCharacterIdStr = String(payload.characterId);
    if (payloadCharacterIdStr !== characterIdStr) {
      return [];
    }
    
    // 對抗檢定類型的 skill.used 事件不應該顯示通知
    // 因為對抗檢定結果已經通過 skill.contest 事件顯示了通知
    // 避免重複顯示「道具使用成功」的通知
    if (payload.checkType === 'contest') {
      console.log('[event-mappers] 跳過對抗檢定類型的 skill.used 事件通知，避免重複');
      return [];
    }
    
    // 根據來源類型決定標題和名稱（非對抗檢定類型）
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
  };

  /**
   * 將事件映射為通知
   */
  const mapEventToNotifications = (event: BaseEvent): Notification[] => {
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
  };

  return {
    mapRoleUpdated,
    mapInventoryUpdated,
    mapItemTransferred,
    mapSkillContest,
    mapSkillUsed,
    mapCharacterAffected,
    mapRoleMessage,
    mapEventToNotifications,
  };
}

