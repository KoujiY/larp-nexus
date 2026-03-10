/**
 * 事件映射函數
 * 將 WebSocket 事件轉換為通知格式
 * 
 * 從 character-card-view.tsx 提取
 */

import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent, SkillUsedEvent, ItemUsedEvent, SecretRevealedEvent, TaskRevealedEvent, ItemShowcasedEvent, EffectExpiredEvent } from '@/types/event';

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
   * Phase 7.6: 根據隱匿標籤決定是否顯示攻擊方姓名
   */
  const mapCharacterAffected = (event: BaseEvent): Notification[] => {
    const payload = event.payload as {
      sourceCharacterName?: string;
      sourceHasStealthTag?: boolean;
      targetCharacterId?: string;
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
    
    // Phase 7.6: 根據隱匿標籤決定是否顯示攻擊方名稱
    const hasStealthTag = payload.sourceHasStealthTag || false;
    const sourceName = payload.sourceCharacterName || '';
    const prefix = !hasStealthTag && sourceName ? `${sourceName} 對你使用了技能或道具` : '你受到了影響';
    
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
          message: `${prefix}，效果：${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}，目前值同步調整${maxText}`,
          type: event.type,
        });
      } else {
        // 只有 deltaValue 或只有 deltaMax，分別處理
        if (deltaVal !== null && deltaVal !== 0) {
          notifList.push({
            id: `evt-${event.timestamp}-${idx}-val`,
            title: '受到影響',
            message: `${prefix}，效果：${name} ${deltaVal > 0 ? '+' : ''}${deltaVal}`,
            type: event.type,
          });
        }
        
        if (deltaMax !== null && deltaMax !== 0) {
          // 只在 newMax 有值時顯示上限資訊
          const maxText = s.newMax !== undefined && s.newMax !== null ? `（上限：${s.newMax}）` : '';
          notifList.push({
            id: `evt-${event.timestamp}-${idx}-max`,
            title: '受到影響',
            message: `${prefix}，效果：${name} 最大值 ${deltaMax > 0 ? '+' : ''}${deltaMax}${maxText}`,
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
    
    // 檢查是攻擊方還是防守方
    // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
    const characterIdStr = String(characterId);
    const attackerIdStr = String(payload.attackerId);
    const defenderIdStr = String(payload.defenderId);
    const isAttacker = attackerIdStr === characterIdStr;
    const isDefender = defenderIdStr === characterIdStr;
    
    // 只處理攻擊方或防守方的通知
    if (!isAttacker && !isDefender) {
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
    const isDefenderWins = payload.result === 'defender_wins';
    const needsTargetItemSelection = payload.needsTargetItemSelection === true;
    
    // 如果需要選擇目標道具且沒有效果，不顯示通知（效果將在選擇目標道具後發送完整通知）
    if (needsTargetItemSelection && isSuccess && (!payload.effectsApplied || payload.effectsApplied.length === 0)) {
      return [];
    }
    
    let message = '';
    
    if (isAttacker) {
      // 攻擊方的通知
      if (isSuccess) {
        // 修復：如果攻擊方獲勝但沒有效果資訊，這是初始通知，跳過（稍後會有包含效果的完整通知）
        // 這樣可以避免重複通知，只保留最終的詳細通知
        if (!payload.effectsApplied || payload.effectsApplied.length === 0) {
          return [];
        }
        message = `你對 ${payload.defenderName} 使用了 ${sourceName}，${actionType}使用成功`;
        // 攻擊方獲勝時，應該包含效果資訊（防守方受到的影響）
        message += `，效果：${payload.effectsApplied.join('、')}`;
      } else if (isDefenderWins) {
        // 攻擊方使用失敗（防守方獲勝）
        // 注意：攻擊方還會收到 character.affected 事件通知（受到防守方技能/道具的影響）
        // 這個通知應該在 skill.contest 之後顯示
        message = `你對 ${payload.defenderName} 使用了 ${sourceName}，${actionType}使用失敗`;
      } else {
        // 攻擊方使用失敗（both_fail 情況）
        message = `你對 ${payload.defenderName} 使用了 ${sourceName}，${actionType}使用失敗`;
      }
    } else if (isDefender && isDefenderWins) {
      // 防守方獲勝時的通知
      // 檢查防守方是否真的使用了技能/道具（通過 defenderSkills 和 defenderItems 陣列）
      const hasDefenderSkills = payload.defenderSkills && payload.defenderSkills.length > 0;
      const hasDefenderItems = payload.defenderItems && payload.defenderItems.length > 0;
      const hasDefenderResponse = hasDefenderSkills || hasDefenderItems;
      
      // 修復：如果防守方沒有使用技能/道具，不顯示通知
      // 這很重要，因為當防守方獲勝但沒有回應時（例如攻擊方數值為0），不應該顯示防守方使用了技能/道具的通知
      if (!hasDefenderResponse) {
        return [];
      }
      
      // 修復：如果防守方獲勝但沒有效果資訊，這是初始通知，跳過（稍後會有包含效果的完整通知）
      // 這樣可以避免重複通知，只保留最終的詳細通知
      if (!payload.effectsApplied || payload.effectsApplied.length === 0) {
        return [];
      }
      
      // 防守方有回應，顯示通知
      // 目標角色是攻擊方（attackerName）
      // Phase 7.6: 如果攻擊方有隱匿標籤，隱藏攻擊方名稱
      const targetName = payload.sourceHasStealthTag ? '某人' : payload.attackerName;
      
      // 修復：確保 skillName/itemName 對應防守方的技能/道具，而不是攻擊方的
      // 檢查 sourceType 是否與防守方的回應類型一致
      // 如果 sourceType 是攻擊方的類型（且與防守方的回應類型不一致），則不應該使用 skillName/itemName
      const defenderSourceType = hasDefenderSkills ? 'skill' : 'item';
      const payloadSourceType = payload.sourceType || (payload.skillName ? 'skill' : 'item');
      
      // 修復：額外檢查：如果 payload 中的 skillName/itemName 對應的是攻擊方的技能/道具（通過 sourceType 判斷），
      // 且 sourceType 與防守方的回應類型不一致，則不應該顯示通知
      // 這可以防止前一個對抗的值被錯誤地使用
      if (payloadSourceType !== defenderSourceType && payloadSourceType === (payload.skillName ? 'skill' : 'item')) {
        // sourceType 與防守方的回應類型不一致，且 skillName/itemName 存在，可能是前一個對抗的殘留值
        return [];
      }
      
      // 判斷防守方使用的是技能還是道具（優先使用 payload 中的 skillName/itemName，這些應該已經在效果執行後更新為防守方的）
      // 但需要確保 sourceType 與防守方的回應類型一致
      if (payload.skillName && hasDefenderSkills && (payloadSourceType === 'skill' || defenderSourceType === 'skill')) {
        // 防守方使用了技能，且 payload 中的 sourceType 與防守方的回應類型一致
        message = `你對 ${targetName} 使用了 ${payload.skillName}，技能使用成功`;
        if (payload.effectsApplied && payload.effectsApplied.length > 0) {
          message += `，效果：${payload.effectsApplied.join('、')}`;
        }
      } else if (payload.itemName && hasDefenderItems && (payloadSourceType === 'item' || defenderSourceType === 'item')) {
        // 防守方使用了道具，且 payload 中的 sourceType 與防守方的回應類型一致
        message = `你對 ${targetName} 使用了 ${payload.itemName}，道具使用成功`;
        if (payload.effectsApplied && payload.effectsApplied.length > 0) {
          message += `，效果：${payload.effectsApplied.join('、')}`;
        }
      } else {
        // 如果 sourceType 與防守方的回應類型不一致，或者沒有 skillName/itemName，不顯示通知
        // 這可能是前一個對抗的殘留值，或者是事件發送時機問題
        return [];
      }
    } else if (isDefender && !isDefenderWins) {
      // 防守方失敗時的通知
      // 檢查防守方是否真的使用了技能/道具（通過 defenderSkills 和 defenderItems 陣列）
      const hasDefenderSkills = payload.defenderSkills && payload.defenderSkills.length > 0;
      const hasDefenderItems = payload.defenderItems && payload.defenderItems.length > 0;
      const hasDefenderResponse = hasDefenderSkills || hasDefenderItems;
      
      // 如果防守方沒有使用技能/道具，不顯示通知
      if (!hasDefenderResponse) {
        return [];
      }
      
      // 防守方有回應但失敗，顯示失敗通知
      // 注意：這裡我們無法直接獲取防守方的技能/道具名稱，因為 payload 中沒有
      // 但我們可以通過 skill.used 事件來顯示通知
      // 所以這裡暫時返回空，讓 skill.used 事件來處理
      return [];
    } else {
      // 其他情況，不顯示通知
      return [];
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
    
    // 對抗檢定類型的 skill.used 事件處理：
    // - 如果 checkPassed 為 false 且 effectsApplied 為 undefined，這是攻擊方發送的對抗請求事件，應該跳過（避免重複）
    // - 如果 checkPassed 為 true，這是防守方獲勝時發送的成功通知，但應該通過 skill.contest 事件處理
    //   因為 skill.contest 事件中包含目標角色名稱，可以顯示正確格式的通知
    // - 如果 checkPassed 為 false 且 effectsApplied 不為 undefined（或對抗檢定已完成），這是防守方失敗的通知，需要顯示
    if (payload.checkType === 'contest' || payload.checkType === 'random_contest') {
      // 檢查是否是防守方失敗的情況
      // 如果 checkPassed 為 false，且這是防守方的技能使用事件（對抗檢定已完成），需要顯示失敗通知
      // 區分方法：攻擊方在對抗請求時發送的 skill.used 事件，effectsApplied 為 undefined
      //           防守方失敗時發送的 skill.used 事件，對抗檢定已完成（此時 effectsApplied 可能為空陣列，但對抗檢定已確定結果）
      if (!payload.checkPassed) {
        // 這是失敗通知
        // 如果 effectsApplied 為 undefined，這是攻擊方發送的對抗請求事件，不顯示
        // 如果 effectsApplied 不為 undefined（即使是空陣列），這表示對抗檢定已完成，需要顯示防守方的失敗通知
        if (payload.effectsApplied === undefined) {
          // 攻擊方發送的對抗請求事件，不顯示
          return [];
        }
        
        // 對抗檢定已完成，這是防守方的失敗通知
        // 對齊攻擊方的通知格式：包含目標角色名稱
        const title = '技能使用結果';
        const skillName = payload.skillName || '技能';
        let message: string;
        
        if (payload.targetCharacterName) {
          // 有目標角色名稱：使用與攻擊方一致的格式
          message = `你對 ${payload.targetCharacterName} 使用了 ${skillName}，技能使用失敗`;
        } else {
          // 沒有目標角色名稱：使用簡化格式（向後兼容）
          message = `${skillName}使用失敗`;
        }
        
        return [
          {
            id: `evt-${event.timestamp}`,
            title,
            message,
            type: event.type,
          },
        ];
      }
      // 其他情況（攻擊方失敗、防守方成功等）都通過 skill.contest 事件處理
      return [];
    }
    
    // 根據來源類型決定標題和名稱（非對抗檢定類型）
    const title = '技能使用結果';
    const skillName = payload.skillName || '技能';

    // 組合通知訊息：包含目標、技能名稱、效果
    const messageParts: string[] = [];
    if (payload.targetCharacterName) {
      messageParts.push(`對 ${payload.targetCharacterName} 使用 ${skillName}`);
    } else {
      messageParts.push(`使用 ${skillName}`);
    }
    if (payload.checkPassed) {
      messageParts.push('技能使用成功');
      if (payload.effectsApplied && payload.effectsApplied.length > 0) {
        messageParts.push(`效果：${payload.effectsApplied.join('、')}`);
      }
    } else {
      messageParts.push('技能使用失敗');
      if (payload.checkResult !== undefined) {
        messageParts.push(`檢定結果：${payload.checkResult}`);
      }
    }
    const message = messageParts.join('，');
    
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
   * 映射道具使用事件
   */
  const mapItemUsed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as ItemUsedEvent['payload'];

    // 只處理當前角色的通知
    const characterIdStr = String(characterId);
    const payloadCharacterIdStr = String(payload.characterId);
    if (payloadCharacterIdStr !== characterIdStr) {
      return [];
    }

    const title = '道具使用結果';
    const itemName = payload.itemName || '道具';

    // 組合通知訊息：包含目標、道具名稱、效果
    const messageParts: string[] = [];
    if (payload.targetCharacterName) {
      messageParts.push(`對 ${payload.targetCharacterName} 使用 ${itemName}`);
    } else {
      messageParts.push(`使用 ${itemName}`);
    }
    if (payload.checkPassed) {
      messageParts.push('道具使用成功');
      if (payload.effectsApplied && payload.effectsApplied.length > 0) {
        messageParts.push(`效果：${payload.effectsApplied.join('、')}`);
      }
    } else {
      messageParts.push('道具使用失敗');
      if (payload.checkResult !== undefined) {
        messageParts.push(`檢定結果：${payload.checkResult}`);
      }
    }
    const message = messageParts.join('，');

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
   * Phase 7.7: 映射隱藏資訊揭露事件
   */
  const mapSecretRevealed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as SecretRevealedEvent['payload'];
    return [{
      id: `evt-${event.timestamp}`,
      title: '隱藏資訊揭露',
      message: `已揭露隱藏資訊，${payload.secretTitle}`,
      type: event.type,
    }];
  };

  /**
   * Phase 7.7: 映射隱藏目標揭露事件
   */
  const mapTaskRevealed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as TaskRevealedEvent['payload'];
    return [{
      id: `evt-${event.timestamp}`,
      title: '隱藏目標揭露',
      message: `已揭露隱藏目標，${payload.taskTitle}`,
      type: event.type,
    }];
  };

  /**
   * Phase 7.7: 映射道具展示事件
   * 展示方：「向{玩家名稱}展示了{道具名稱}」
   * 被展示方：「{玩家名稱}向你展示了{道具名稱}」
   */
  const mapItemShowcased = (event: BaseEvent): Notification[] => {
    const payload = event.payload as ItemShowcasedEvent['payload'];
    const itemName = payload.item?.name || '道具';

    if (payload.fromCharacterId === characterId) {
      // 展示方
      return [{
        id: `evt-${event.timestamp}`,
        title: '道具展示',
        message: `向${payload.toCharacterName}展示了${itemName}`,
        type: event.type,
      }];
    }

    if (payload.toCharacterId === characterId) {
      // 被展示方
      return [{
        id: `evt-${event.timestamp}`,
        title: '道具展示',
        message: `${payload.fromCharacterName}向你展示了${itemName}`,
        type: event.type,
      }];
    }

    return [];
  };

  /**
   * Phase 8: 映射效果過期事件
   * 顯示格式：「{技能/道具名稱} 的效果已結束，{數值名稱} 已恢復」
   */
  const mapEffectExpired = (event: BaseEvent): Notification[] => {
    const payload = event.payload as EffectExpiredEvent['payload'];
    const sourceName = payload.sourceName || (payload.sourceType === 'skill' ? '技能' : '道具');
    const targetStat = payload.targetStat || '數值';

    // 建構恢復訊息
    let restoredMessage = '';
    if (payload.statChangeTarget === 'value') {
      restoredMessage = `${targetStat} 已恢復至 ${payload.restoredValue}`;
    } else if (payload.statChangeTarget === 'maxValue' && payload.restoredMax !== undefined) {
      restoredMessage = `${targetStat} 最大值已恢復至 ${payload.restoredMax}`;
    } else {
      restoredMessage = `${targetStat} 已恢復`;
    }

    return [{
      id: `evt-${event.timestamp}`,
      title: '效果結束',
      message: `${sourceName} 的效果已結束，${restoredMessage}`,
      type: event.type,
    }];
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
      case 'item.used':
        return mapItemUsed(event);
      case 'character.affected':
        return mapCharacterAffected(event);
      case 'secret.revealed':
        return mapSecretRevealed(event);
      case 'task.revealed':
        return mapTaskRevealed(event);
      case 'item.showcased':
        return mapItemShowcased(event);
      case 'effect.expired':
        return mapEffectExpired(event);
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
    mapItemUsed,
    mapCharacterAffected,
    mapRoleMessage,
    mapSecretRevealed,
    mapTaskRevealed,
    mapItemShowcased,
    mapEffectExpired,
    mapEventToNotifications,
  };
}

