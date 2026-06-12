import type {
  BaseEvent,
  WebSocketEvent,
  SkillUsedEvent,
  ItemUsedEvent,
  RoleUpdatedEvent,
  SkillCooldownEvent,
  SkillContestEvent,
  CharacterAffectedEvent,
  ItemTransferredEvent,
  GameBroadcastEvent,
  TaskUpdatedEvent,
  InventoryUpdatedEvent,
  SecretRevealedEvent,
  TaskRevealedEvent,
  ItemShowcasedEvent,
  EffectExpiredEvent,
  EquipmentToggledEvent,
  GameStartedEvent,
  GameEndedEvent,
  NotificationsClearedEvent,
  SkillRevealedEvent,
  SkillHiddenEvent,
  ItemRevealedEvent,
  ItemHiddenEvent,
} from '@/types/event';
import { getPusherServer, isPusherEnabled } from './pusher-server';
// 效能埋點（PERF_INCIDENT_2026-06 Step 2.1）：累加 Pusher trigger 耗時與次數
import { timePusher } from '@/lib/perf/perf-context';
// Phase 11: 統一事件 ID（跨通道去重）
import { generateEventId } from './event-id';
// Phase 9: 離線事件佇列寫入
import {
  writePendingEvent,
  writePendingEvents,
  writePendingGameEvent,
} from './pending-events';

type EventName = WebSocketEvent['type'];

/**
 * payload 過大警告門檻：Pusher 單訊息上限 10KB，超過會 413 且在
 * fire-and-forget 路徑被吞掉——逼近上限時先在 server log 留下可觀測證據
 */
const PAYLOAD_WARN_BYTES = 8 * 1024;

async function trigger(channel: string, eventName: EventName, payload: BaseEvent['payload']) {
  const pusher = getPusherServer();
  if (!pusher || !isPusherEnabled()) return;

  const event: BaseEvent = {
    type: eventName,
    timestamp: Date.now(),
    payload,
  };

  const payloadBytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
  if (payloadBytes > PAYLOAD_WARN_BYTES) {
    console.warn(
      `[pusher] payload 逼近 10KB 上限（${payloadBytes} bytes）：channel=${channel} event=${eventName}——請檢查該事件是否攜帶了無上界的陣列`
    );
  }

  try {
    // 失敗也計次（timePusher 的 finally）：對延遲分析而言，重點是「花了多少時間在等 Pusher」
    await timePusher(pusher.trigger(channel, eventName, event));
  } catch (error) {
    console.error('[pusher] trigger error', { channel, eventName, error });
  }
}

/**
 * 單頻道 + 離線補送：注入 _eventId 後同時推送角色頻道與寫入 pending event
 *（Phase 9 雙通道 + Phase 11 跨通道去重的共用樣板）
 */
async function emitWithPending<T extends object>(
  characterId: string,
  eventName: EventName,
  payload: T,
) {
  const payloadWithId = { ...payload, _eventId: generateEventId() };
  await Promise.all([
    trigger(`private-character-${characterId}`, eventName, payloadWithId),
    writePendingEvent(characterId, eventName, payloadWithId as Record<string, unknown>),
  ]);
}

/**
 * 雙頻道 + 離線補送：同一 _eventId 推送兩個角色頻道，
 * pending events 合併為單次批次寫入
 */
async function emitToPairWithPending<T extends object>(
  firstCharacterId: string,
  secondCharacterId: string,
  eventName: EventName,
  payload: T,
) {
  const payloadWithId = { ...payload, _eventId: generateEventId() };
  const eventPayload = payloadWithId as Record<string, unknown>;
  await Promise.all([
    trigger(`private-character-${firstCharacterId}`, eventName, payloadWithId),
    trigger(`private-character-${secondCharacterId}`, eventName, payloadWithId),
    writePendingEvents([
      { targetCharacterId: firstCharacterId, eventType: eventName, eventPayload },
      { targetCharacterId: secondCharacterId, eventType: eventName, eventPayload },
    ]),
  ]);
}

/**
 * 遊戲頻道 + 離線補送：注入 _eventId 後推送遊戲頻道（全體玩家）
 * 與寫入 game-level pending event（targetGameId）
 */
async function emitGameWithPending<T extends object>(
  gameId: string,
  eventName: EventName,
  payload: T,
) {
  const payloadWithId = { ...payload, _eventId: generateEventId() };
  await Promise.all([
    trigger(`private-game-${gameId}`, eventName, payloadWithId),
    writePendingGameEvent(gameId, eventName, payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「技能使用」事件到角色頻道 */
export async function emitSkillUsed(characterId: string, payload: SkillUsedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'skill.used', payload);
}

/** 推送「道具使用」事件到角色頻道 */
export async function emitItemUsed(characterId: string, payload: ItemUsedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'item.used', payload);
}

/** 推送「角色資料更新」事件，同時寫入 pending events 供離線補送 */
export async function emitRoleUpdated(characterId: string, payload: RoleUpdatedEvent['payload']) {
  await emitWithPending(characterId, 'role.updated', payload);
}

/**
 * 批次推送「角色資料更新」事件到多個角色頻道，pending events 合併為單次寫入
 *
 * PERF_INCIDENT_2026-06 批 2：供「同一動作需通知多個獨立角色」的呼叫端使用
 * （如物品轉移的轉出方 + 接收方）。每個目標注入獨立 _eventId，
 * Pusher trigger 平行發送、pending events 一次 insertMany。
 */
export async function emitRoleUpdatedBatch(
  targets: Array<{ characterId: string; payload: RoleUpdatedEvent['payload'] }>
) {
  if (targets.length === 0) return;
  const entries = targets.map((target) => ({
    characterId: target.characterId,
    payloadWithId: { ...target.payload, _eventId: generateEventId() },
  }));
  await Promise.all([
    ...entries.map(({ characterId, payloadWithId }) =>
      trigger(`private-character-${characterId}`, 'role.updated', payloadWithId)
    ),
    writePendingEvents(
      entries.map(({ characterId, payloadWithId }) => ({
        targetCharacterId: characterId,
        eventType: 'role.updated' as const,
        eventPayload: payloadWithId as Record<string, unknown>,
      }))
    ),
  ]);
}

/** 推送「技能冷卻更新」事件到角色頻道 */
export async function emitSkillCooldown(characterId: string, payload: SkillCooldownEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'skill.cooldown', payload);
}

/** 推送「技能對抗」事件到攻防雙方頻道，同時寫入 pending events */
export async function emitSkillContest(attackerId: string, defenderId: string, payload: SkillContestEvent['payload']) {
  await emitToPairWithPending(attackerId, defenderId, 'skill.contest', payload);
}

/** 推送「角色受影響」事件（效果命中、數值變更等），同時寫入 pending events */
export async function emitCharacterAffected(targetCharacterId: string, payload: CharacterAffectedEvent['payload']) {
  await emitWithPending(targetCharacterId, 'character.affected', payload);
}

/** 推送「道具轉移」事件到轉出方與接收方雙頻道，同時寫入 pending events */
export async function emitItemTransferred(fromCharacterId: string, toCharacterId: string, payload: ItemTransferredEvent['payload']) {
  await emitToPairWithPending(fromCharacterId, toCharacterId, 'item.transferred', payload);
}

/** 推送「GM 廣播」事件到遊戲頻道（全體玩家可見），同時寫入 game-level pending event */
export async function emitGameBroadcast(gameId: string, payload: GameBroadcastEvent['payload']) {
  await emitGameWithPending(gameId, 'game.broadcast', payload);
}

/**
 * 推送「一鍵清除通知」事件到遊戲頻道（全體玩家清空前端通知面板）
 *
 * 純前端清除訊號：僅即時推送，刻意不寫入 pending events —— 離線玩家無需
 * 補清（其本地通知本就受 TTL 約束），且 pending 補送語意是「補加通知」，
 * 與「清除」相反。不刪除任何 DB 資料。
 */
export async function emitNotificationsCleared(
  gameId: string,
  payload: NotificationsClearedEvent['payload'],
) {
  await trigger(`private-game-${gameId}`, 'notifications.cleared', payload);
}

/** 推送「任務狀態更新」事件到角色頻道，同時寫入 pending events */
export async function emitTaskUpdated(characterId: string, payload: TaskUpdatedEvent['payload']) {
  await emitWithPending(characterId, 'role.taskUpdated', payload);
}

/** 推送「道具欄變更」事件到角色頻道（道具新增/移除/數量變動），同時寫入 pending events */
export async function emitInventoryUpdated(characterId: string, payload: InventoryUpdatedEvent['payload']) {
  await emitWithPending(characterId, 'role.inventoryUpdated', payload);
}

// Phase 7.7: 自動揭露條件 + 道具展示事件

/** 推送「秘密揭露」事件到角色頻道，同時寫入 pending events */
export async function emitSecretRevealed(characterId: string, payload: SecretRevealedEvent['payload']) {
  await emitWithPending(characterId, 'secret.revealed', payload);
}

/** 推送「隱藏任務揭露」事件到角色頻道，同時寫入 pending events */
export async function emitTaskRevealed(characterId: string, payload: TaskRevealedEvent['payload']) {
  await emitWithPending(characterId, 'task.revealed', payload);
}

/** 推送「技能揭露」事件到角色頻道，同時寫入 pending events */
export async function emitSkillRevealed(characterId: string, payload: SkillRevealedEvent['payload']) {
  await emitWithPending(characterId, 'skill.revealed', payload);
}

/** 推送「技能隱藏」事件到角色頻道，同時寫入 pending events */
export async function emitSkillHidden(characterId: string, payload: SkillHiddenEvent['payload']) {
  await emitWithPending(characterId, 'skill.hidden', payload);
}

/** 推送「物品揭露」事件到角色頻道，同時寫入 pending events */
export async function emitItemRevealed(characterId: string, payload: ItemRevealedEvent['payload']) {
  await emitWithPending(characterId, 'item.revealed', payload);
}

/** 推送「物品隱藏」事件到角色頻道，同時寫入 pending events */
export async function emitItemHidden(characterId: string, payload: ItemHiddenEvent['payload']) {
  await emitWithPending(characterId, 'item.hidden', payload);
}

/** 推送「道具展示」事件到展示方與被展示方雙頻道，同時寫入 pending events */
export async function emitItemShowcased(fromCharacterId: string, toCharacterId: string, payload: ItemShowcasedEvent['payload']) {
  await emitToPairWithPending(fromCharacterId, toCharacterId, 'item.showcased', payload);
}

// Phase 8: 時效性效果過期事件

/** 推送「時效性效果過期」事件到角色頻道，同時寫入 pending events */
export async function emitEffectExpired(characterId: string, payload: EffectExpiredEvent['payload']) {
  await emitWithPending(characterId, 'effect.expired', payload);
}

// Phase 10.7: 遊戲狀態事件

/** 推送「裝備切換」事件到角色頻道 */
export async function emitEquipmentToggled(characterId: string, payload: EquipmentToggledEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'equipment.toggled', payload);
}

/**
 * 推送「遊戲開始」事件到遊戲頻道
 *
 * GM 按下「開始遊戲」時調用，通知所有玩家觸發頁面重新載入。
 * 玩家端透過 useGameWebSocket 監聽 private-game-${gameId}。
 */
export async function emitGameStarted(gameId: string, payload: GameStartedEvent['payload']) {
  await emitGameWithPending(gameId, 'game.started', payload);
}

/**
 * 推送「遊戲結束」事件到遊戲頻道
 *
 * GM 按下「結束遊戲」時調用，通知所有玩家觸發頁面重新載入。
 * 玩家端透過 useGameWebSocket 監聽 private-game-${gameId}。
 */
export async function emitGameEnded(gameId: string, payload: GameEndedEvent['payload']) {
  await emitGameWithPending(gameId, 'game.ended', payload);
}
