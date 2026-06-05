'use server';

import { validatePlayerAccess } from '@/lib/auth/session';
import { removeActiveContest, removeContestsByCharacterId, getContestInfo, isCharacterInContest } from '@/lib/contest-tracker';
import { emitContestAbort } from '@/lib/contest/contest-event-emitter';
import type { ApiResponse } from '@/types/api';

/**
 * 中斷對抗檢定（攻擊方或防守方皆可觸發）
 *
 * 中斷後不執行任何效果（對抗視為作廢），但攻擊方已消耗的使用次數/數量不退還。
 * 設計為 idempotent：對抗不存在時仍回傳 success。
 */
export async function abortContest(
  contestId: string,
  characterId: string
): Promise<ApiResponse<{ aborted: boolean }>> {
  try {
    if (!(await validatePlayerAccess(characterId))) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權操作此角色',
      };
    }

    let contestInfo = getContestInfo(contestId);
    if (!contestInfo) {
      const characterContestStatus = isCharacterInContest(characterId);
      if (characterContestStatus.inContest && characterContestStatus.contestInfo) {
        contestInfo = characterContestStatus.contestInfo;
      } else {
        return {
          success: true,
          data: { aborted: true },
          message: '對抗檢定已結束',
        };
      }
    }

    const characterIdStr = String(characterId);
    const attackerIdStr = String(contestInfo.attackerId);
    const defenderIdStr = String(contestInfo.defenderId);

    if (attackerIdStr !== characterIdStr && defenderIdStr !== characterIdStr) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權中斷此對抗檢定',
      };
    }

    const isAttacker = attackerIdStr === characterIdStr;
    const targetCharacterId = isAttacker ? defenderIdStr : attackerIdStr;

    const sourcePayload = contestInfo.sourceType === 'skill'
      ? { skillId: contestInfo.sourceId, sourceType: 'skill' as const }
      : { itemId: contestInfo.sourceId, sourceType: 'item' as const };

    try {
      await emitContestAbort(targetCharacterId, {
        attackerId: attackerIdStr,
        attackerName: '',
        defenderId: defenderIdStr,
        defenderName: '',
        contestId: contestInfo.contestId,
        attackerValue: 0,
        defenderValue: 0,
        result: 'both_fail',
        ...sourcePayload,
      });
    } catch (error) {
      console.error('[contest-abort] Failed to emit abort event', error);
    }

    removeActiveContest(contestInfo.contestId);
    removeContestsByCharacterId(attackerIdStr);
    removeContestsByCharacterId(defenderIdStr);

    return {
      success: true,
      data: { aborted: true },
      message: '已中斷對抗檢定',
    };
  } catch (error) {
    console.error('[contest-abort] Unhandled error:', error);
    return {
      success: false,
      error: 'ABORT_FAILED',
      message: '無法中斷對抗檢定，請稍後再試',
    };
  }
}
