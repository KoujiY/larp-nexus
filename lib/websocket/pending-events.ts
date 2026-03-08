/**
 * Phase 9: 離線事件佇列寫入輔助函式
 *
 * 提供將 WebSocket 事件寫入 pending_events 集合的函式，
 * 確保玩家離線時的事件能在重新上線後接收到。
 */

import { PendingEvent } from '@/lib/db/models';
import type { BaseEvent } from '@/types/event';

/**
 * 生成 Pending Event 的唯一識別碼
 *
 * @returns 格式: `pevt-{timestamp}-{random}`
 */
function generatePendingEventId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `pevt-${timestamp}-${random}`;
}

/**
 * 寫入單一角色的 pending event
 *
 * @param targetCharacterId - 目標角色 ID
 * @param eventType - WebSocket 事件類型
 * @param eventPayload - 事件 payload
 * @param options - 可選參數
 * @param options.targetGameId - 目標劇本 ID（用於 game-level 事件）
 */
export async function writePendingEvent(
  targetCharacterId: string,
  eventType: BaseEvent['type'],
  eventPayload: Record<string, unknown>,
  options?: { targetGameId?: string }
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 小時後過期

    await PendingEvent.create({
      id: generatePendingEventId(),
      targetCharacterId,
      targetGameId: options?.targetGameId,
      eventType,
      eventPayload,
      createdAt: now,
      isDelivered: false,
      expiresAt,
    });
  } catch (error) {
    // Best-effort: 寫入失敗不阻塞主流程，只記錄錯誤
    console.error('[pending-events] writePendingEvent failed', {
      targetCharacterId,
      eventType,
      error,
    });
  }
}

/**
 * 批次寫入多個角色的 pending events
 *
 * @param targets - 目標列表
 */
export async function writePendingEvents(
  targets: Array<{
    targetCharacterId?: string;
    targetGameId?: string;
    eventType: BaseEvent['type'];
    eventPayload: Record<string, unknown>;
  }>
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const events = targets.map((target) => ({
      id: generatePendingEventId(),
      targetCharacterId: target.targetCharacterId,
      targetGameId: target.targetGameId,
      eventType: target.eventType,
      eventPayload: target.eventPayload,
      createdAt: now,
      isDelivered: false,
      expiresAt,
    }));

    await PendingEvent.insertMany(events);
  } catch (error) {
    // Best-effort: 寫入失敗不阻塞主流程，只記錄錯誤
    console.error('[pending-events] writePendingEvents failed', {
      targetsCount: targets.length,
      error,
    });
  }
}

/**
 * 寫入 game-level pending event（如 game.broadcast）
 *
 * 使用 targetGameId 欄位，拉取時會查詢該劇本下的所有角色。
 *
 * @param gameId - 劇本 ID
 * @param eventType - WebSocket 事件類型
 * @param eventPayload - 事件 payload
 */
export async function writePendingGameEvent(
  gameId: string,
  eventType: BaseEvent['type'],
  eventPayload: Record<string, unknown>
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await PendingEvent.create({
      id: generatePendingEventId(),
      targetGameId: gameId,
      eventType,
      eventPayload,
      createdAt: now,
      isDelivered: false,
      expiresAt,
    });
  } catch (error) {
    // Best-effort: 寫入失敗不阻塞主流程，只記錄錯誤
    console.error('[pending-events] writePendingGameEvent failed', {
      gameId,
      eventType,
      error,
    });
  }
}
