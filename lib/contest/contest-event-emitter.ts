/**
 * 對抗檢定事件發送器
 * 統一管理對抗檢定相關事件的發送，確保事件順序和格式一致
 * 
 * Phase 2: 事件發送順序標準化（方案 C - 使用事件子類型）
 */

import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import type { SkillContestEvent } from '@/types/event';

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

  const event: SkillContestEvent = {
    type: 'skill.contest',
    timestamp: Date.now(),
    payload: {
      ...payload,
      subType: 'request', // Phase 2: 標記為請求事件
    },
  };

  try {
    // 只發送給防守方（攻擊方不需要收到請求事件）
    const defenderChannelName = `private-character-${defenderId}`;
    await pusher.trigger(defenderChannelName, 'skill.contest', event);
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

  const event: SkillContestEvent = {
    type: 'skill.contest',
    timestamp: Date.now(),
    payload: {
      ...payload,
      subType: 'result', // Phase 2: 標記為結果事件
    },
  };

  try {
    // 發送給攻擊方（除非需要選擇目標道具）
    if (!options?.skipAttacker) {
      const attackerChannelName = `private-character-${attackerId}`;
      await pusher.trigger(attackerChannelName, 'skill.contest', event);
    }

    // 發送給防守方（除非防守方獲勝但無回應）
    if (!options?.skipDefender) {
      const defenderChannelName = `private-character-${defenderId}`;
      await pusher.trigger(defenderChannelName, 'skill.contest', event);
    }
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

  const event: SkillContestEvent = {
    type: 'skill.contest',
    timestamp: Date.now(),
    payload: {
      ...payload,
      subType: 'effect', // Phase 2: 標記為效果事件
    },
  };

  try {
    // 只發送給攻擊方
    const attackerChannelName = `private-character-${attackerId}`;
    await pusher.trigger(attackerChannelName, 'skill.contest', event);
  } catch (error) {
    console.error('[contest-event-emitter] Failed to emit contest effect', error);
    throw error;
  }
}

