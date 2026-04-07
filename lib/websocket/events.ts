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
} from '@/types/event';
import { getPusherServer, isPusherEnabled } from './pusher-server';
// Phase 9: 離線事件佇列寫入
import {
  writePendingEvent,
  writePendingEvents,
  writePendingGameEvent,
} from './pending-events';
type EventName = WebSocketEvent['type'];

/**
 * 生成統一的事件 ID，用於跨通道去重（WebSocket + Pending Events）
 *
 * 同一個邏輯事件會同時透過 WebSocket 即時推送和寫入 Pending Events DB。
 * 客戶端需要透過 _eventId 識別重複事件並跳過。
 *
 * @returns 格式: `evt-{timestamp}-{random}`
 */
function generateEventId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `evt-${timestamp}-${random}`;
}

async function trigger(channel: string, eventName: EventName, payload: BaseEvent['payload']) {
  const pusher = getPusherServer();
  if (!pusher || !isPusherEnabled()) return;

  const event: BaseEvent = {
    type: eventName,
    timestamp: Date.now(),
    payload,
  };

  try {
    await pusher.trigger(channel, eventName, event);
  } catch (error) {
    console.error('[pusher] trigger error', { channel, eventName, error });
  }
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
  // Phase 9: 推送 WebSocket + 寫入 pending events（離線時可補送數值變更通知）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'role.updated', payloadWithId),
    writePendingEvent(characterId, 'role.updated', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「技能冷卻更新」事件到角色頻道 */
export async function emitSkillCooldown(characterId: string, payload: SkillCooldownEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'skill.cooldown', payload);
}

/** 推送「技能對抗」事件到攻防雙方頻道，同時寫入 pending events */
export async function emitSkillContest(attackerId: string, defenderId: string, payload: SkillContestEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（雙頻道：攻擊方 + 防守方）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${attackerId}`, 'skill.contest', payloadWithId),
    trigger(`private-character-${defenderId}`, 'skill.contest', payloadWithId),
    writePendingEvents([
      { targetCharacterId: attackerId, eventType: 'skill.contest', eventPayload: payloadWithId as Record<string, unknown> },
      { targetCharacterId: defenderId, eventType: 'skill.contest', eventPayload: payloadWithId as Record<string, unknown> },
    ]),
  ]);
}

/** 推送「角色受影響」事件（效果命中、數值變更等），同時寫入 pending events */
export async function emitCharacterAffected(targetCharacterId: string, payload: CharacterAffectedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${targetCharacterId}`, 'character.affected', payloadWithId),
    writePendingEvent(targetCharacterId, 'character.affected', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「道具轉移」事件到轉出方與接收方雙頻道，同時寫入 pending events */
export async function emitItemTransferred(fromCharacterId: string, toCharacterId: string, payload: ItemTransferredEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（雙頻道：轉出方 + 接收方）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${fromCharacterId}`, 'item.transferred', payloadWithId),
    trigger(`private-character-${toCharacterId}`, 'item.transferred', payloadWithId),
    writePendingEvents([
      { targetCharacterId: fromCharacterId, eventType: 'item.transferred', eventPayload: payloadWithId as Record<string, unknown> },
      { targetCharacterId: toCharacterId, eventType: 'item.transferred', eventPayload: payloadWithId as Record<string, unknown> },
    ]),
  ]);
}

/** 推送「GM 廣播」事件到遊戲頻道（全體玩家可見），同時寫入 game-level pending event */
export async function emitGameBroadcast(gameId: string, payload: GameBroadcastEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（game-level，使用 targetGameId）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-game-${gameId}`, 'game.broadcast', payloadWithId),
    writePendingGameEvent(gameId, 'game.broadcast', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「任務狀態更新」事件到角色頻道，同時寫入 pending events */
export async function emitTaskUpdated(characterId: string, payload: TaskUpdatedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'role.taskUpdated', payloadWithId),
    writePendingEvent(characterId, 'role.taskUpdated', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「道具欄變更」事件到角色頻道（道具新增/移除/數量變動），同時寫入 pending events */
export async function emitInventoryUpdated(characterId: string, payload: InventoryUpdatedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'role.inventoryUpdated', payloadWithId),
    writePendingEvent(characterId, 'role.inventoryUpdated', payloadWithId as Record<string, unknown>),
  ]);
}

// Phase 7.7: 自動揭露條件 + 道具展示事件

/** 推送「秘密揭露」事件到角色頻道，同時寫入 pending events */
export async function emitSecretRevealed(characterId: string, payload: SecretRevealedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'secret.revealed', payloadWithId),
    writePendingEvent(characterId, 'secret.revealed', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「隱藏任務揭露」事件到角色頻道，同時寫入 pending events */
export async function emitTaskRevealed(characterId: string, payload: TaskRevealedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'task.revealed', payloadWithId),
    writePendingEvent(characterId, 'task.revealed', payloadWithId as Record<string, unknown>),
  ]);
}

/** 推送「道具展示」事件到展示方與被展示方雙頻道，同時寫入 pending events */
export async function emitItemShowcased(fromCharacterId: string, toCharacterId: string, payload: ItemShowcasedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（雙頻道：展示方 + 被展示方）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${fromCharacterId}`, 'item.showcased', payloadWithId),
    trigger(`private-character-${toCharacterId}`, 'item.showcased', payloadWithId),
    writePendingEvents([
      { targetCharacterId: fromCharacterId, eventType: 'item.showcased', eventPayload: payloadWithId as Record<string, unknown> },
      { targetCharacterId: toCharacterId, eventType: 'item.showcased', eventPayload: payloadWithId as Record<string, unknown> },
    ]),
  ]);
}

// Phase 8: 時效性效果過期事件

/** 推送「時效性效果過期」事件到角色頻道，同時寫入 pending events */
export async function emitEffectExpired(characterId: string, payload: EffectExpiredEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-character-${characterId}`, 'effect.expired', payloadWithId),
    writePendingEvent(characterId, 'effect.expired', payloadWithId as Record<string, unknown>),
  ]);
}

// Phase 10.7: 遊戲狀態事件

/** 推送「裝備切換」事件到角色頻道 */
export async function emitEquipmentToggled(characterId: string, payload: EquipmentToggledEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'equipment.toggled', payload);
}

/**
 * 推送「遊戲開始」事件到所有角色
 *
 * 當 GM 按下「開始遊戲」按鈕時調用，
 * 通知所有玩家遊戲已開始，觸發頁面重新載入。
 */
export async function emitGameStarted(gameId: string, payload: GameStartedEvent['payload']) {
  // Phase 10.7: 推送到 game 頻道（玩家端透過 useGameWebSocket 監聽 private-game-${gameId}）
  // 注意：不使用 pushEventToGame（它發送到 character 頻道），因為 game 事件需要發送到 game 頻道
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-game-${gameId}`, 'game.started', payloadWithId),
    writePendingGameEvent(gameId, 'game.started', payloadWithId as Record<string, unknown>),
  ]);
}

/**
 * 推送「遊戲結束」事件到所有角色
 *
 * 當 GM 按下「結束遊戲」按鈕時調用，
 * 通知所有玩家遊戲已結束，觸發頁面重新載入。
 */
export async function emitGameEnded(gameId: string, payload: GameEndedEvent['payload']) {
  // Phase 10.7: 推送到 game 頻道（玩家端透過 useGameWebSocket 監聽 private-game-${gameId}）
  // 注意：不使用 pushEventToGame（它發送到 character 頻道），因為 game 事件需要發送到 game 頻道
  // Phase 11: 注入 _eventId 用於跨通道去重
  const eventId = generateEventId();
  const payloadWithId = { ...payload, _eventId: eventId };
  await Promise.all([
    trigger(`private-game-${gameId}`, 'game.ended', payloadWithId),
    writePendingGameEvent(gameId, 'game.ended', payloadWithId as Record<string, unknown>),
  ]);
}

