/**
 * Phase 9: Pending Events 定期清理函式
 *
 * 用於 Cron Job 定期清理過期或已送達的 pending events，
 * 避免 pending_events 集合無限增長。
 */

import dbConnect from '@/lib/db/mongodb';
import { PendingEvent } from '@/lib/db/models';

/**
 * 清理過期的 pending events
 *
 * 清理策略：
 * 1. 刪除 `expiresAt < now` 的所有記錄（無論是否已送達）
 * 2. 刪除 `isDelivered === true && deliveredAt < now - 1h` 的記錄（加速清理已送達事件）
 *
 * @returns 清理結果統計
 */
export async function cleanupPendingEvents(): Promise<{
  deletedExpired: number;
  deletedDelivered: number;
  totalDeleted: number;
}> {
  try {
    await dbConnect();

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 小時前

    // 1. 刪除已過期的 pending events（expiresAt < now）
    const expiredResult = await PendingEvent.deleteMany({
      expiresAt: { $lt: now },
    });

    const deletedExpired = expiredResult.deletedCount || 0;

    // 2. 刪除已送達且送達時間超過 1 小時的 pending events（加速清理）
    const deliveredResult = await PendingEvent.deleteMany({
      isDelivered: true,
      deliveredAt: { $lt: oneHourAgo },
    });

    const deletedDelivered = deliveredResult.deletedCount || 0;

    const totalDeleted = deletedExpired + deletedDelivered;

    console.info('[clean-pending-events] Cleanup completed', {
      deletedExpired,
      deletedDelivered,
      totalDeleted,
      timestamp: now.toISOString(),
    });

    return {
      deletedExpired,
      deletedDelivered,
      totalDeleted,
    };
  } catch (error) {
    console.error('[clean-pending-events] Cleanup failed', { error });
    // Best-effort: 清理失敗不拋出異常，只記錄錯誤
    return {
      deletedExpired: 0,
      deletedDelivered: 0,
      totalDeleted: 0,
    };
  }
}
