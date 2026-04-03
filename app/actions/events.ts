'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import { emitGameBroadcast } from '@/lib/websocket/events';
import { writeLog } from '@/lib/logs/write-log';
import dbConnect from '@/lib/db/mongodb';
import type { ApiResponse } from '@/types/api';

type PushEventInput = {
  type: 'broadcast' | 'character';
  gameId: string;
  targetCharacterId?: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

/**
 * GM 推送事件：對全劇本或單一角色的即時通知
 */
export async function pushEvent(input: PushEventInput): Promise<ApiResponse<{ pushed: boolean }>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    if (!isPusherEnabled()) {
      return { success: false, error: 'PUSHER_DISABLED', message: 'Pusher 未設定' };
    }

    const pusher = getPusherServer();
    if (!pusher) {
      return { success: false, error: 'PUSHER_UNAVAILABLE', message: 'Pusher 無法使用' };
    }

    const { type, gameId, targetCharacterId, title, message, data } = input;

    await dbConnect();

    if (type === 'broadcast') {
      // Phase 9: 使用 emitGameBroadcast 確保同時寫入 pending events
      await emitGameBroadcast(gameId, {
        gameId,
        title,
        message,
        priority: 'normal',
        data,
      });

      // 寫入 Log（game-level，單筆）
      await writeLog({
        gameId,
        actorType: 'gm',
        actorId: gmUserId,
        action: 'broadcast',
        details: { title, message },
      });
    } else if (type === 'character' && targetCharacterId) {
      await pusher.trigger(`private-character-${targetCharacterId}`, 'role.message', {
        type: 'role.message',
        timestamp: Date.now(),
        payload: {
          characterId: targetCharacterId,
          from: 'GM',
          title,
          message,
          data,
          style: 'info',
        },
      });

      // 寫入 Log（角色層級，單筆）
      await writeLog({
        gameId,
        characterId: targetCharacterId,
        actorType: 'gm',
        actorId: gmUserId,
        action: 'character_message',
        details: { title, message },
      });
    } else {
      return { success: false, error: 'INVALID_TARGET', message: '目標參數錯誤' };
    }

    // 可選：刷新 GM 端頁面
    revalidatePath(`/games/${gameId}`);

    return { success: true, data: { pushed: true }, message: '事件已推送' };
  } catch (error) {
    console.error('pushEvent error', error);
    return { success: false, error: 'PUSH_FAILED', message: '事件推送失敗' };
  }
}

