'use server';

import dbConnect from '@/lib/db/mongodb';
import { PendingEvent } from '@/lib/db/models';
import type { PendingEvent as PendingEventType } from '@/types/event';
import type { ApiResponse } from '@/types/api';

/**
 * Phase 9: 拉取未送達的 pending events
 *
 * 查詢條件：
 * - (targetCharacterId === characterId || targetGameId === gameId)
 * - isDelivered === false
 * - expiresAt > now
 *
 * 使用原子操作標記為已送達，防止重複拉取。
 *
 * @param characterId - 角色 ID
 * @param gameId - 劇本 ID（可選，用於查詢 game-level 事件）
 * @returns API 回應包含事件列表
 */
export async function fetchPendingEvents(
  characterId: string,
  gameId?: string
): Promise<ApiResponse<{ events: PendingEventType[] }>> {
  try {
    await dbConnect();

    const now = new Date();

    // 1. 查詢未送達且未過期的 pending events
    const query = {
      $or: [
        { targetCharacterId: characterId },
        ...(gameId ? [{ targetGameId: gameId }] : []),
      ],
      isDelivered: false,
      expiresAt: { $gt: now },
    };

    const events = await PendingEvent.find(query)
      .sort({ createdAt: 1 }) // 按時間排序，最舊的先處理
      .lean();

    if (events.length === 0) {
      return {
        success: true,
        data: { events: [] },
      };
    }

    // 2. 原子操作：標記為已送達
    const eventIds = events.map((e) => e.id);
    await PendingEvent.updateMany(
      { id: { $in: eventIds } },
      {
        $set: {
          isDelivered: true,
          deliveredAt: now,
        },
      }
    );

    // 3. 轉換為前端可用的格式（清理 MongoDB _id，保留自訂 id）
    const cleanedEvents: PendingEventType[] = events.map((event) => ({
      id: event.id,
      targetCharacterId: event.targetCharacterId,
      targetGameId: event.targetGameId,
      eventType: event.eventType,
      eventPayload: event.eventPayload,
      createdAt: event.createdAt,
      isDelivered: true, // 已標記為已送達
      deliveredAt: now,
      expiresAt: event.expiresAt,
    }));

    return {
      success: true,
      data: { events: cleanedEvents },
    };
  } catch (error) {
    // Best-effort: 拉取失敗不阻塞主流程，只記錄錯誤
    console.error('[pending-events] fetchPendingEvents failed', {
      characterId,
      gameId,
      error,
    });
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法拉取離線事件',
    };
  }
}
