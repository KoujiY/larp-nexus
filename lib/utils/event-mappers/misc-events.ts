/**
 * 雜項事件映射器
 * mapSecretRevealed, mapTaskRevealed, mapItemShowcased, mapEffectExpired
 *
 * 注意：此處通知文字中的「物品」為大類名稱（與技能並列的上位概念），
 * 並非 item.type='tool' 的子類別「道具」。
 */

import type { BaseEvent } from '@/types/event';
import type { SecretRevealedEvent, TaskRevealedEvent, ItemShowcasedEvent, EffectExpiredEvent } from '@/types/event';
import type { Notification } from './types';

export function createMiscEventMappers(characterId: string) {
  /**
   * Phase 7.7: 映射隱藏資訊揭露事件
   */
  const mapSecretRevealed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as SecretRevealedEvent['payload'];
    return [{
      id: `evt-${event.timestamp}`,
      title: '隱藏資訊揭露',
      message: `已揭露隱藏資訊：${payload.secretTitle}`,
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
      message: `已揭露隱藏目標：${payload.taskTitle}`,
      type: event.type,
    }];
  };

  /**
   * Phase 7.7: 映射物品展示事件
   * 展示方：「向{玩家名稱}展示了{物品名稱}」
   * 被展示方：「{玩家名稱}向你展示了{物品名稱}」
   */
  const mapItemShowcased = (event: BaseEvent): Notification[] => {
    const payload = event.payload as ItemShowcasedEvent['payload'];
    const itemName = payload.item?.name || '物品';

    if (payload.fromCharacterId === characterId) {
      // 展示方
      return [{
        id: `evt-${event.timestamp}`,
        title: '物品展示',
        message: `向${payload.toCharacterName}展示了${itemName}`,
        type: event.type,
      }];
    }

    if (payload.toCharacterId === characterId) {
      // 被展示方
      return [{
        id: `evt-${event.timestamp}`,
        title: '物品展示',
        message: `${payload.fromCharacterName}向你展示了${itemName}`,
        type: event.type,
      }];
    }

    return [];
  };

  /**
   * Phase 8: 映射效果過期事件
   * 顯示格式：「{技能/物品名稱} 的效果已結束，{數值名稱} 已恢復」
   */
  const mapEffectExpired = (event: BaseEvent): Notification[] => {
    const payload = event.payload as EffectExpiredEvent['payload'];
    // preset_event 來源且 showName 關閉時（sourceName 為 sentinel '預設事件'），顯示為「未知來源」
    const isHiddenPresetEvent = payload.sourceType === 'preset_event' && (!payload.sourceName || payload.sourceName === '預設事件');
    const sourceName = isHiddenPresetEvent
      ? '未知來源'
      : payload.sourceName || (payload.sourceType === 'skill' ? '技能' : '物品');
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

  return { mapSecretRevealed, mapTaskRevealed, mapItemShowcased, mapEffectExpired };
}
