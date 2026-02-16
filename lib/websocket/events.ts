import type {
  BaseEvent,
  WebSocketEvent,
  SkillUsedEvent,
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
} from '@/types/event';
import { getPusherServer, isPusherEnabled } from './pusher-server';
// Phase 9: 離線事件佇列寫入
import {
  writePendingEvent,
  writePendingEvents,
  writePendingGameEvent,
} from './pending-events';

type EventName = WebSocketEvent['type'];

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

export async function emitSkillUsed(characterId: string, payload: SkillUsedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'skill.used', payload);
}

export async function emitRoleUpdated(characterId: string, payload: RoleUpdatedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'role.updated', payload);
}

export async function emitSkillCooldown(characterId: string, payload: SkillCooldownEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'skill.cooldown', payload);
}

export async function emitSkillContest(attackerId: string, defenderId: string, payload: SkillContestEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（雙頻道：攻擊方 + 防守方）
  await Promise.all([
    trigger(`private-character-${attackerId}`, 'skill.contest', payload),
    trigger(`private-character-${defenderId}`, 'skill.contest', payload),
    writePendingEvents([
      { targetCharacterId: attackerId, eventType: 'skill.contest', eventPayload: payload as Record<string, unknown> },
      { targetCharacterId: defenderId, eventType: 'skill.contest', eventPayload: payload as Record<string, unknown> },
    ]),
  ]);
}

export async function emitCharacterAffected(targetCharacterId: string, payload: CharacterAffectedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  await Promise.all([
    trigger(`private-character-${targetCharacterId}`, 'character.affected', payload),
    writePendingEvent(targetCharacterId, 'character.affected', payload as Record<string, unknown>),
  ]);
}

export async function emitItemTransferred(fromCharacterId: string, toCharacterId: string, payload: ItemTransferredEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（雙頻道：轉出方 + 接收方）
  await Promise.all([
    trigger(`private-character-${fromCharacterId}`, 'item.transferred', payload),
    trigger(`private-character-${toCharacterId}`, 'item.transferred', payload),
    writePendingEvents([
      { targetCharacterId: fromCharacterId, eventType: 'item.transferred', eventPayload: payload as Record<string, unknown> },
      { targetCharacterId: toCharacterId, eventType: 'item.transferred', eventPayload: payload as Record<string, unknown> },
    ]),
  ]);
}

export async function emitGameBroadcast(gameId: string, payload: GameBroadcastEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（game-level，使用 targetGameId）
  await Promise.all([
    trigger(`private-game-${gameId}`, 'game.broadcast', payload),
    writePendingGameEvent(gameId, 'game.broadcast', payload as Record<string, unknown>),
  ]);
}

export async function emitTaskUpdated(characterId: string, payload: TaskUpdatedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  await Promise.all([
    trigger(`private-character-${characterId}`, 'role.taskUpdated', payload),
    writePendingEvent(characterId, 'role.taskUpdated', payload as Record<string, unknown>),
  ]);
}

export async function emitInventoryUpdated(characterId: string, payload: InventoryUpdatedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  await Promise.all([
    trigger(`private-character-${characterId}`, 'role.inventoryUpdated', payload),
    writePendingEvent(characterId, 'role.inventoryUpdated', payload as Record<string, unknown>),
  ]);
}

// Phase 7.7: 自動揭露條件 + 道具展示事件

export async function emitSecretRevealed(characterId: string, payload: SecretRevealedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  await Promise.all([
    trigger(`private-character-${characterId}`, 'secret.revealed', payload),
    writePendingEvent(characterId, 'secret.revealed', payload as Record<string, unknown>),
  ]);
}

export async function emitTaskRevealed(characterId: string, payload: TaskRevealedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  await Promise.all([
    trigger(`private-character-${characterId}`, 'task.revealed', payload),
    writePendingEvent(characterId, 'task.revealed', payload as Record<string, unknown>),
  ]);
}

export async function emitItemShowcased(fromCharacterId: string, toCharacterId: string, payload: ItemShowcasedEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（雙頻道：展示方 + 被展示方）
  await Promise.all([
    trigger(`private-character-${fromCharacterId}`, 'item.showcased', payload),
    trigger(`private-character-${toCharacterId}`, 'item.showcased', payload),
    writePendingEvents([
      { targetCharacterId: fromCharacterId, eventType: 'item.showcased', eventPayload: payload as Record<string, unknown> },
      { targetCharacterId: toCharacterId, eventType: 'item.showcased', eventPayload: payload as Record<string, unknown> },
    ]),
  ]);
}

// Phase 8: 時效性效果過期事件

export async function emitEffectExpired(characterId: string, payload: EffectExpiredEvent['payload']) {
  // Phase 9: 推送 WebSocket + 寫入 pending events（單頻道）
  await Promise.all([
    trigger(`private-character-${characterId}`, 'effect.expired', payload),
    writePendingEvent(characterId, 'effect.expired', payload as Record<string, unknown>),
  ]);
}

