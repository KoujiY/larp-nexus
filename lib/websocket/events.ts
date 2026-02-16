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
  await trigger(`private-character-${attackerId}`, 'skill.contest', payload);
  await trigger(`private-character-${defenderId}`, 'skill.contest', payload);
}

export async function emitCharacterAffected(targetCharacterId: string, payload: CharacterAffectedEvent['payload']) {
  await trigger(`private-character-${targetCharacterId}`, 'character.affected', payload);
}

export async function emitItemTransferred(fromCharacterId: string, toCharacterId: string, payload: ItemTransferredEvent['payload']) {
  await trigger(`private-character-${fromCharacterId}`, 'item.transferred', payload);
  await trigger(`private-character-${toCharacterId}`, 'item.transferred', payload);
}

export async function emitGameBroadcast(gameId: string, payload: GameBroadcastEvent['payload']) {
  await trigger(`private-game-${gameId}`, 'game.broadcast', payload);
}

export async function emitTaskUpdated(characterId: string, payload: TaskUpdatedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'role.taskUpdated', payload);
}

export async function emitInventoryUpdated(characterId: string, payload: InventoryUpdatedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'role.inventoryUpdated', payload);
}

// Phase 7.7: 自動揭露條件 + 道具展示事件

export async function emitSecretRevealed(characterId: string, payload: SecretRevealedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'secret.revealed', payload);
}

export async function emitTaskRevealed(characterId: string, payload: TaskRevealedEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'task.revealed', payload);
}

export async function emitItemShowcased(fromCharacterId: string, toCharacterId: string, payload: ItemShowcasedEvent['payload']) {
  await trigger(`private-character-${fromCharacterId}`, 'item.showcased', payload);
  await trigger(`private-character-${toCharacterId}`, 'item.showcased', payload);
}

// Phase 8: 時效性效果過期事件

export async function emitEffectExpired(characterId: string, payload: EffectExpiredEvent['payload']) {
  await trigger(`private-character-${characterId}`, 'effect.expired', payload);
}

