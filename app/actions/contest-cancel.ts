'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { removeActiveContest, removeContestsByCharacterId, getContestInfo } from '@/lib/contest-tracker';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import type { ApiResponse } from '@/types/api';
import type { BaseEvent } from '@/types/event';

/**
 * 取消對抗檢定（當目標角色沒有道具可選擇時）
 * 用於清除服務器端的對抗檢定追蹤狀態，並發送通知給攻擊方
 */
export async function cancelContestItemSelection(
  contestId: string,
  characterId: string
): Promise<ApiResponse<{ cancelled: boolean }>> {
  try {
    await dbConnect();

    // 從對抗檢定追蹤系統中獲取信息
    const contestInfo = getContestInfo(contestId);
    if (!contestInfo) {
      // 對抗檢定已經不存在，返回成功（可能是已經被清除）
      return {
        success: true,
        data: {
          cancelled: true,
        },
        message: '對抗檢定已清除',
      };
    }

    // 驗證角色 ID 匹配（確保是攻擊方）
    const attackerIdStr = String(contestInfo.attackerId);
    const characterIdStr = String(characterId);
    
    if (attackerIdStr !== characterIdStr) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '無權取消此對抗檢定',
      };
    }

    // 獲取攻擊方和防守方角色信息，用於發送通知
    const attacker = await Character.findById(attackerIdStr);
    const defender = await Character.findById(contestInfo.defenderId);
    
    if (!attacker) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到攻擊方角色',
      };
    }

    // 根據來源類型獲取技能或道具信息
    let sourceName = '';
    let skillId: string | undefined;
    let itemId: string | undefined;
    
    if (contestInfo.sourceType === 'skill') {
      const skills = attacker.skills || [];
      const skill = skills.find((s: { id: string }) => s.id === contestInfo.sourceId);
      if (skill) {
        sourceName = skill.name;
        skillId = skill.id;
      }
    } else {
      const items = attacker.items || [];
      const item = items.find((i: { id: string }) => i.id === contestInfo.sourceId);
      if (item) {
        sourceName = item.name;
        itemId = item.id;
      }
    }

    // 發送 skill.contest 事件通知攻擊方：技能使用成功但目標沒有道具
    const pusher = getPusherServer();
    if (pusher && isPusherEnabled() && defender) {
      const contestPayload: {
        attackerId: string;
        attackerName: string;
        defenderId: string;
        defenderName: string;
        skillId?: string;
        skillName?: string;
        itemId?: string;
        itemName?: string;
        sourceType?: 'skill' | 'item';
        attackerValue: number;
        defenderValue: number;
        result: 'attacker_wins';
        effectsApplied?: string[];
        needsTargetItemSelection?: boolean;
      } = {
        attackerId: attackerIdStr,
        attackerName: attacker.name,
        defenderId: String(contestInfo.defenderId),
        defenderName: defender.name,
        attackerValue: 1, // 必須不為 0，否則會被 mapSkillContest 忽略
        defenderValue: 0,
        result: 'attacker_wins',
        effectsApplied: ['目標角色沒有道具可互動'], // 顯示提示訊息
        needsTargetItemSelection: false, // 明確標記不需要選擇目標道具
        sourceType: contestInfo.sourceType,
      };

      // 根據來源類型設定對應的 ID 和名稱
      if (contestInfo.sourceType === 'skill' && skillId) {
        contestPayload.skillId = skillId;
        contestPayload.skillName = sourceName;
      } else if (contestInfo.sourceType === 'item' && itemId) {
        contestPayload.itemId = itemId;
        contestPayload.itemName = sourceName;
      }

      const event: BaseEvent = {
        type: 'skill.contest',
        timestamp: Date.now(),
        payload: contestPayload,
      };

      try {
        // 只發送給攻擊方
        const attackerChannelName = `private-character-${attackerIdStr}`;
        await pusher.trigger(attackerChannelName, 'skill.contest', event);
      } catch (error) {
        console.error('[contest-cancel] Failed to emit skill.contest', error);
      }
    }

    // 清除對抗檢定追蹤
    removeActiveContest(contestId);
    // 同時根據攻擊方和防守方的 ID 清除所有相關的對抗檢定（確保清除完整）
    removeContestsByCharacterId(attackerIdStr);
    removeContestsByCharacterId(String(contestInfo.defenderId));

    return {
      success: true,
      data: {
        cancelled: true,
      },
      message: '對抗檢定已取消',
    };
  } catch (error) {
    console.error('Error cancelling contest item selection:', error);
    return {
      success: false,
      error: 'CANCEL_FAILED',
      message: `無法取消對抗檢定：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

