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
    silentSync?: boolean;
    updates?: {
      stats?: Array<{ name?: string; value?: number; maxValue?: number; deltaValue?: number; deltaMax?: number }>;
    };
  };

  // silentSync: 副作用同步事件，不產生玩家端通知
  // 對應的玩家通知由 skill.used / item.used / effect.expired / character.affected 事件處理
  if (payload?.silentSync) return [];

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

    // 通知一律以「變化量（delta）」表達，絕不退回絕對值。
    // role.updated 會帶完整 stats 陣列，只有被變更的 stat 帶 delta；
    // 對未變動或變化量為 0 的 stat（例如目標數值已達上限、delta=0）做絕對值
    // fallback，會誤把無關數值的當前值報成「→ X」（見 #stat-cap bug）。
    // 因此無 delta = 無實質變化 = 不產生通知。
    if (text) {
      notifList.push({
        id: `evt-${event.timestamp}-${idx}`,
        title: '數值變更',
        message: text,
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
  const prefix = !hasStealthTag && sourceName ? `${sourceName} 對你使用了技能或物品` : '你受到了影響';

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
