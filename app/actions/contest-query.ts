'use server';

import { getContestInfo, isCharacterInContest } from '@/lib/contest-tracker';
import type { ApiResponse } from '@/types/api';

/**
 * 查詢對抗檢定狀態
 * 用於攻擊方重新整理後檢查對抗檢定是否已完成
 */
export async function queryContestStatus(
  contestId: string,
  characterId: string
): Promise<ApiResponse<{
  isActive: boolean;
  contestInfo?: {
    attackerId: string;
    defenderId: string;
    sourceType: 'skill' | 'item';
    sourceId: string;
    timestamp: number;
  };
}>> {
  try {
    // 從 contest-tracker 查詢對抗檢定狀態
    const contestInfo = getContestInfo(contestId);
    
    if (contestInfo) {
      // 對抗檢定仍在進行中
      return {
        success: true,
        data: {
          isActive: true,
          contestInfo: {
            attackerId: contestInfo.attackerId,
            defenderId: contestInfo.defenderId,
            sourceType: contestInfo.sourceType,
            sourceId: contestInfo.sourceId,
            timestamp: contestInfo.timestamp,
          },
        },
      };
    }
    
    // 檢查角色是否在進行其他對抗檢定（可能 contestId 格式不匹配）
    const characterContest = isCharacterInContest(characterId);
    if (characterContest.inContest && characterContest.contestInfo) {
      // 角色正在進行對抗檢定，但 contestId 可能不匹配
      // 返回這個對抗檢定的信息
      return {
        success: true,
        data: {
          isActive: true,
          contestInfo: {
            attackerId: characterContest.contestInfo.attackerId,
            defenderId: characterContest.contestInfo.defenderId,
            sourceType: characterContest.contestInfo.sourceType,
            sourceId: characterContest.contestInfo.sourceId,
            timestamp: characterContest.contestInfo.timestamp,
          },
        },
      };
    }
    
    // 對抗檢定已完成或不存在
    return {
      success: true,
      data: {
        isActive: false,
      },
    };
  } catch (error) {
    console.error('Error querying contest status:', error);
    return {
      success: false,
      error: 'QUERY_FAILED',
      message: '無法查詢對抗檢定狀態，請稍後再試',
    };
  }
}

