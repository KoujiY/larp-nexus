'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
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

    if (type === 'broadcast') {
      await pusher.trigger(`private-game-${gameId}`, 'game.broadcast', {
        type: 'game.broadcast',
        timestamp: Date.now(),
        payload: {
          gameId,
          title,
          message,
          priority: 'normal',
          data,
        },
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

