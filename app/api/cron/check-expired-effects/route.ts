/**
 * Phase 8: Cron Job API - 定時檢查過期的時效性效果
 * 由 Vercel Cron Jobs 每分鐘呼叫一次
 */

import { NextRequest, NextResponse } from 'next/server';
import { processExpiredEffects, cleanupOldExpiredEffects } from '@/lib/effects/check-expired-effects';

/**
 * GET /api/cron/check-expired-effects
 *
 * 定時檢查所有角色的過期效果並恢復數值
 * 認證：驗證 Authorization header 中的 CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // 驗證 Cron Secret（Vercel Cron Jobs 會自動帶入）
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      // 若設定了 CRON_SECRET，則必須驗證
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // 處理所有角色的過期效果
    const result = await processExpiredEffects();

    // 清理超過 24 小時的已過期記錄
    await cleanupOldExpiredEffects();

    return NextResponse.json({
      success: true,
      data: {
        processedCount: result.processedCount,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[cron/check-expired-effects] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
