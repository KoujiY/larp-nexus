/**
 * 角色相關事件映射器
 * mapRoleUpdated, mapRoleMessage, mapCharacterAffected
 */

import type { BaseEvent } from '@/types/event';
import type { Notification } from './types';

/**
 * 映射角色更新事件
 */
export function mapRoleUpdated(event: BaseEvent): Notification[] {
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
}

/**
 * 映射角色訊息事件
 */
export function mapRoleMessage(event: BaseEvent): Notification[] {
  const payload = event.payload as { title?: string; message?: string };
  return [
    {
      id: `evt-${event.timestamp}`,
      title: payload.title || '訊息',
      message: payload.message || '收到新訊息',
      type: event.type,
    },
  ];
}

/**
 * 映射角色受影響事件
 * Phase 7.6: 根據隱匿標籤決定是否顯示攻擊方姓名
 */
export function mapCharacterAffected(event: BaseEvent): Notification[] {
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
}
