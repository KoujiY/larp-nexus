/**
 * 對抗檢定事件發送器
 * 統一管理對抗檢定相關事件的發送，確保事件順序和格式一致
 * 
 * Phase 2: 事件發送順序標準化（方案 C - 使用事件子類型）
 */

import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import type { SkillContestEvent } from '@/types/event';
// Phase 9: 離線事件佇列寫入
import { writePendingEvent, writePendingEvents } from '@/lib/websocket/pending-events';

/**
 * Phase 11: 生成統一事件 ID，用於跨通道去重
 */
function generateEventId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `evt-${timestamp}-${random}`;
}

/**
 * 發送對抗檢定請求事件（攻擊方發起對抗）
 * 
 * @param attackerId 攻擊方角色 ID
 * @param defenderId 防守方角色 ID
 * @param payload 事件 payload（不包含 subType，會自動添加）
 */
export async function emitContestRequest(
  attackerId: string,
  defenderId: string,
  payload: Omit<SkillContestEvent['payload'], 'subType'>
): Promise<void> {
  const pusher = getPusherServer();
  if (!pusher || !isPusherEnabled()) return;

  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const event: SkillContestEvent = {
    type: 'skill.contest',
    timestamp: Date.now(),
    payload: {
      ...payload,
      subType: 'request', // Phase 2: 標記為請求事件
      _eventId: eventId,
    },
  };

  try {
    // 只發送給防守方（攻擊方不需要收到請求事件）
    const defenderChannelName = `private-character-${defenderId}`;
    await Promise.all([
      pusher.trigger(defenderChannelName, 'skill.contest', event),
      // Phase 9: 寫入 pending events（僅防守方）
      writePendingEvent(defenderId, 'skill.contest', event.payload as Record<string, unknown>),
    ]);
  } catch (error) {
    console.error('[contest-event-emitter] Failed to emit contest request', error);
    throw error;
  }
}

/**
 * 發送對抗檢定結果事件（防守方回應後）
 * 
 * @param attackerId 攻擊方角色 ID
 * @param defenderId 防守方角色 ID
 * @param payload 事件 payload（不包含 subType，會自動添加）
 * @param options 選項
 * @param options.skipAttacker 是否跳過發送給攻擊方（當需要選擇目標道具時使用）
 * @param options.skipDefender 是否跳過發送給防守方（當防守方獲勝但無回應時使用）
 */
export async function emitContestResult(
  attackerId: string,
  defenderId: string,
  payload: Omit<SkillContestEvent['payload'], 'subType'>,
  options?: { skipAttacker?: boolean; skipDefender?: boolean }
): Promise<void> {
  const pusher = getPusherServer();
  if (!pusher || !isPusherEnabled()) return;

  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const event: SkillContestEvent = {
    type: 'skill.contest',
    timestamp: Date.now(),
    payload: {
      ...payload,
      subType: 'result', // Phase 2: 標記為結果事件
      _eventId: eventId,
    },
  };

  try {
    const pushPromises: Promise<unknown>[] = [];
    const pendingTargets: Array<{ targetCharacterId: string; eventType: string; eventPayload: Record<string, unknown> }> = [];

    // 發送給攻擊方（除非需要選擇目標道具）
    if (!options?.skipAttacker) {
      const attackerChannelName = `private-character-${attackerId}`;
      pushPromises.push(pusher.trigger(attackerChannelName, 'skill.contest', event));
      pendingTargets.push({ targetCharacterId: attackerId, eventType: 'skill.contest', eventPayload: event.payload as Record<string, unknown> });
    }

    // 發送給防守方（除非防守方獲勝但無回應）
    if (!options?.skipDefender) {
      const defenderChannelName = `private-character-${defenderId}`;
      pushPromises.push(pusher.trigger(defenderChannelName, 'skill.contest', event));
      pendingTargets.push({ targetCharacterId: defenderId, eventType: 'skill.contest', eventPayload: event.payload as Record<string, unknown> });
    }

    // Phase 9: 同步寫入 pending events
    if (pendingTargets.length > 0) {
      pushPromises.push(writePendingEvents(pendingTargets));
    }

    await Promise.all(pushPromises);
  } catch (error) {
    console.error('[contest-event-emitter] Failed to emit contest result', error);
    throw error;
  }
}

/**
 * 發送對抗檢定效果事件（攻擊方選擇目標道具後）
 * 
 * @param attackerId 攻擊方角色 ID
 * @param payload 事件 payload（不包含 subType，會自動添加）
 */
export async function emitContestEffect(
  attackerId: string,
  payload: Omit<SkillContestEvent['payload'], 'subType'>
): Promise<void> {
  const pusher = getPusherServer();
  if (!pusher || !isPusherEnabled()) return;

  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const event: SkillContestEvent = {
    type: 'skill.contest',
    timestamp: Date.now(),
    payload: {
      ...payload,
      subType: 'effect', // Phase 2: 標記為效果事件
      _eventId: eventId,
    },
  };

  try {
    // 只發送給攻擊方
    const attackerChannelName = `private-character-${attackerId}`;
    await Promise.all([
      pusher.trigger(attackerChannelName, 'skill.contest', event),
      // Phase 9: 寫入 pending events（僅攻擊方）
      writePendingEvent(attackerId, 'skill.contest', event.payload as Record<string, unknown>),
    ]);
  } catch (error) {
    console.error('[contest-event-emitter] Failed to emit contest effect', error);
    throw error;
  }
}

