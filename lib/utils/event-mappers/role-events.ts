/**
 * 角色相關事件映射器
 * mapRoleUpdated, mapRoleMessage, mapCharacterAffected
 */

import type { BaseEvent } from '@/types/event';
import type { Notification } from './types';
import { formatStatDeltaText } from '@/lib/utils/format-stat-delta';

/**
 * 映射角色更新事件
 */
export function mapRoleUpdated(event: BaseEvent): Notification[] {
  const payload = event.payload as {
    _statsSync?: boolean;
    updates?: {
      stats?: Array<{ name?: string; value?: number; maxValue?: number; deltaValue?: number; deltaMax?: number }>;
    };
  };

  // _statsSync: GM Console 即時同步用，不產生玩家端通知
  // 對應的玩家通知由 skill.used / item.used / effect.expired / character.affected 事件處理
  if (payload?._statsSync) return [];

  const stats = payload?.updates?.stats;
  if (!stats || stats.length === 0) return [];

  const notifList: Notification[] = [];
  stats.forEach((s, idx) => {
    const name = s.name ?? '數值';
    const deltaVal = typeof s.deltaValue === 'number' ? s.deltaValue : 0;
    const deltaMax = typeof s.deltaMax === 'number' ? s.deltaMax : 0;
    const maxVal = typeof s.maxValue === 'number' ? s.maxValue : undefined;

    const text = formatStatDeltaText({
      name,
      deltaValue: deltaVal,
      deltaMax: deltaMax || undefined,
      newMax: deltaMax !== 0 ? maxVal : undefined,
    });

    if (text) {
      notifList.push({
        id: `evt-${event.timestamp}-${idx}`,
        title: '數值變更',
        message: text,
        type: event.type,
      });
    } else if (typeof s.value === 'number' && notifList.length === 0) {
      // 無 delta 但有 value 的 fallback
      notifList.push({
        id: `evt-${event.timestamp}-${idx}-fallback`,
        title: '數值變更',
        message: `${name} → ${s.value}`,
        type: event.type,
      });
    }
  });

  return notifList;
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
  if (!stats || stats.length === 0) return [];

  // Phase 7.6: 根據隱匿標籤決定是否顯示攻擊方名稱
  const hasStealthTag = payload.sourceHasStealthTag || false;
  const sourceName = payload.sourceCharacterName || '';
  const prefix = !hasStealthTag && sourceName ? `${sourceName} 對你使用了技能或道具` : '你受到了影響';

  const notifList: Notification[] = [];

  stats.forEach((s, idx) => {
    const name = s.name ?? '數值';
    const deltaVal = typeof s.deltaValue === 'number' ? s.deltaValue : 0;
    const deltaMax = typeof s.deltaMax === 'number' ? s.deltaMax : 0;

    const text = formatStatDeltaText({
      name,
      deltaValue: deltaVal,
      deltaMax: deltaMax || undefined,
      newMax: deltaMax !== 0 ? s.newMax : undefined,
    });

    if (text) {
      notifList.push({
        id: `evt-${event.timestamp}-${idx}`,
        title: '受到影響',
        message: `${prefix}，效果：${text}`,
        type: event.type,
      });
    }
  });

  return notifList;
}
