'use server';

import dbConnect from '@/lib/db/mongodb';
import { PendingEvent } from '@/lib/db/models';
import type { PendingEvent as PendingEventType } from '@/types/event';
import { withAction } from '@/lib/actions/action-wrapper';
import type { ApiResponse } from '@/types/api';

/** fetchPendingEvents 選項 */
export interface FetchPendingEventsOptions {
  /**
   * 抓取後是否原子標記 isDelivered（破壞性讀取）。預設 true。
   *
   * - true（SSR 路徑）：一抓即標記，防重複拉取。
   * - false（client 重抓）：讀取但不消費，事件留在 DB 待 `acknowledgePendingEvents` 確認。
   *   用於 bfcache / SPA 返回補送——破壞性讀取放 client 端會在投遞失敗（如 dev StrictMode
   *   的 mount→cleanup→mount 把 in-flight fetch 跨過）時消費卻未投遞，導致連刷新都撈不回。
   *   非破壞性讀取讓重抓可重讀、投遞到 UI 後才以 ack 標記，徹底消除遺失。
   */
  markDelivered?: boolean;
}

/**
 * Phase 9: 拉取未送達的 pending events
 *
 * 查詢條件：
 * - (targetCharacterId === characterId || targetGameId === gameId)
 * - isDelivered === false
 * - expiresAt > now
 *
 * @param characterId - 角色 ID
 * @param gameId - 劇本 ID（可選，用於查詢 game-level 事件）
 * @param options - 選項（markDelivered，預設 true）
 * @returns API 回應包含事件列表
 */
export async function fetchPendingEvents(
  characterId: string,
  gameId?: string,
  options?: FetchPendingEventsOptions
): Promise<ApiResponse<{ events: PendingEventType[] }>> {
  return withAction<{ events: PendingEventType[] }>('fetch-pending-events', () => fetchPendingEventsImpl(characterId, gameId, options));
}

async function fetchPendingEventsImpl(
  characterId: string,
  gameId?: string,
  options?: FetchPendingEventsOptions
): Promise<ApiResponse<{ events: PendingEventType[] }>> {
  const markDelivered = options?.markDelivered ?? true;
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

    // 2. 破壞性讀取時才原子標記為已送達（非破壞性留待 ack）
    if (markDelivered) {
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
    }

    // 3. 轉換為前端可用的格式（清理 MongoDB _id，保留自訂 id）
    const cleanedEvents: PendingEventType[] = events.map((event) => ({
      id: event.id,
      targetCharacterId: event.targetCharacterId,
      targetGameId: event.targetGameId,
      eventType: event.eventType,
      eventPayload: event.eventPayload,
      createdAt: new Date(event.createdAt).toISOString(),
      // 如實反映：破壞性讀取已標記，非破壞性維持 DB 原值（false）
      isDelivered: markDelivered ? true : (event.isDelivered ?? false),
      deliveredAt: markDelivered
        ? now.toISOString()
        : (event.deliveredAt ? new Date(event.deliveredAt).toISOString() : undefined),
      expiresAt: new Date(event.expiresAt).toISOString(),
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

/**
 * 確認 pending events 已投遞（非破壞性讀取的第二階段）
 *
 * client 以 markDelivered=false 讀取並**確實投遞到 UI 後**，呼叫此函數標記 delivered，
 * 防止下次重抓 / 重新載入重複顯示。best-effort：失敗不阻塞，事件最多重顯示一次。
 *
 * @param ids - 已投遞的 pending event id 列表
 * @returns 標記筆數
 */
export async function acknowledgePendingEvents(
  ids: string[]
): Promise<ApiResponse<{ acknowledged: number }>> {
  return withAction<{ acknowledged: number }>('acknowledge-pending-events', () => acknowledgePendingEventsImpl(ids));
}

async function acknowledgePendingEventsImpl(
  ids: string[]
): Promise<ApiResponse<{ acknowledged: number }>> {
  if (!ids || ids.length === 0) {
    return { success: true, data: { acknowledged: 0 } };
  }
  try {
    await dbConnect();

    const result = await PendingEvent.updateMany(
      { id: { $in: ids } },
      {
        $set: {
          isDelivered: true,
          deliveredAt: new Date(),
        },
      }
    );

    return {
      success: true,
      data: { acknowledged: result.modifiedCount ?? 0 },
    };
  } catch (error) {
    // Best-effort: 確認失敗不阻塞，事件留在 DB 待下次重抓
    console.error('[pending-events] acknowledgePendingEvents failed', { ids, error });
    return {
      success: false,
      error: 'ACK_FAILED',
      message: '無法確認離線事件送達',
    };
  }
}
