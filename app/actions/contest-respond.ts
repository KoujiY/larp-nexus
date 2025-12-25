'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import { removeActiveContest, removeContestsByCharacterId } from '@/lib/contest-tracker';
import { validateContestRequest, validateContestSource, validateDefenderItems, validateDefenderSkills } from '@/lib/contest/contest-validator';
import { calculateAttackerValue, calculateDefenderValue, calculateContestResult } from '@/lib/contest/contest-calculator';
import { executeContestEffects } from '@/lib/contest/contest-effect-executor';
import type { ApiResponse } from '@/types/api';
import type { BaseEvent } from '@/types/event';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * Phase 7: 防守方回應對抗檢定
 * 當防守方收到對抗檢定請求時，可以選擇使用道具/技能來增強防禦
 */
export async function respondToContest(
  contestId: string, // 對抗請求 ID（由前端傳入，格式：attackerId::skillId::timestamp）
  defenderId: string,
  defenderItems?: string[], // 防守方使用的道具 ID 陣列
  defenderSkills?: string[], // 防守方使用的技能 ID 陣列
  targetItemId?: string // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果，從 contestEvent 中獲取）
): Promise<ApiResponse<{ contestResult: 'attacker_wins' | 'defender_wins' | 'both_fail'; effectsApplied?: string[] }>> {
  try {
    await dbConnect();

    // Phase 3.2: 解析對抗請求 ID
    const parts = contestId.split('::');
    if (parts.length !== 3) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }
    const [attackerId, sourceId] = parts;

    // 取得攻擊方和防守方角色
    const attacker = await Character.findById(attackerId);
    const defender = await Character.findById(defenderId);

    // Phase 3.2: 使用驗證模組驗證對抗檢定請求
    const validationResult = await validateContestRequest(contestId, attackerId, defenderId, attacker, defender);
    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error || 'VALIDATION_FAILED',
        message: validationResult.message || '驗證失敗',
      };
    }

    // 確保 ID 轉換為字符串，避免類型不匹配問題
    const attackerIdStr = attacker!._id.toString();
    const defenderIdStr = defender!._id.toString();

    // Phase 3.2: 使用驗證模組驗證技能/道具
    const sourceValidation = validateContestSource(attacker!, sourceId);
    if (!sourceValidation.success || !sourceValidation.contestConfig || !sourceValidation.sourceType) {
      return {
        success: false,
        error: sourceValidation.error || 'INVALID_SOURCE',
        message: sourceValidation.message || '無效的技能或道具',
      };
    }

    const { contestConfig, sourceType } = sourceValidation;
    const relatedStatName = contestConfig.relatedStat;

    // 取得攻擊方和防守方的相關數值
    const attackerStats = attacker!.stats || [];
    const attackerStat = attackerStats.find((s: { name: string }) => s.name === relatedStatName);
    if (!attackerStat) {
      return {
        success: false,
        error: 'INVALID_STAT',
        message: `攻擊方沒有 ${relatedStatName} 數值`,
      };
    }

    const defenderStats = defender!.stats || [];
    const defenderStat = defenderStats.find((s: { name: string }) => s.name === relatedStatName);
    if (!defenderStat) {
      return {
        success: false,
        error: 'INVALID_STAT',
        message: `防守方沒有 ${relatedStatName} 數值`,
      };
    }

    // Phase 3.2: 使用驗證模組驗證防守方的道具和技能
    const defenderItemsValidation = validateDefenderItems(defender!, defenderItems || [], contestConfig);
    if (!defenderItemsValidation.success) {
      return {
        success: false,
        error: defenderItemsValidation.error || 'VALIDATION_FAILED',
        message: defenderItemsValidation.message || '防守方道具驗證失敗',
      };
    }

    const defenderSkillsValidation = validateDefenderSkills(defender!, defenderSkills || [], contestConfig);
    if (!defenderSkillsValidation.success) {
      return {
        success: false,
        error: defenderSkillsValidation.error || 'VALIDATION_FAILED',
        message: defenderSkillsValidation.message || '防守方技能驗證失敗',
      };
    }

    const defenderItemsList = defenderItemsValidation.items || [];
    const defenderSkillsList = defenderSkillsValidation.skills || [];

    // Phase 3.2: 使用計算模組計算攻擊方和防守方數值
    const attackerValue = calculateAttackerValue(attackerStat.value, relatedStatName, attacker!);
    const defenderValue = calculateDefenderValue(
      defenderStat.value,
      relatedStatName,
      defender!,
      defenderItemsList,
      defenderSkillsList
    );

    // Phase 3.2: 使用計算模組計算對抗結果
    const result = calculateContestResult(attackerValue, defenderValue, contestConfig.tieResolution);

    // Phase 3.2: 獲取技能或道具對象（用於效果執行）
    type SkillType = NonNullable<CharacterDocument['skills']>[number];
    type ItemType = NonNullable<CharacterDocument['items']>[number];
    let source: SkillType | ItemType | null = null;
    let skill: SkillType | null = null;
    let item: ItemType | null = null;

    if (sourceType === 'skill') {
      const attackerSkills = attacker!.skills || [];
      const foundSkill = attackerSkills.find((s: { id: string }) => s.id === sourceId);
      if (foundSkill) {
        skill = foundSkill as SkillType;
        source = skill;
      }
    } else {
      const attackerItems = attacker!.items || [];
      const foundItem = attackerItems.find((i: { id: string }) => i.id === sourceId);
      if (foundItem) {
        item = foundItem as ItemType;
        source = item;
      }
    }

    if (!source) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到攻擊技能或道具',
      };
    }

    // Phase 3.2: 使用效果執行模組執行效果（只有攻擊方獲勝時才執行）
    let effectsApplied: string[] = [];

    if (result === 'attacker_wins') {
      try {
        const effectResult = await executeContestEffects(attacker!, defender!, source, targetItemId);
        effectsApplied = effectResult.effectsApplied;
      } catch (error) {
        console.error('[contest-respond] 執行效果時發生錯誤:', error);
        // 繼續執行，不中斷對抗檢定流程
      }
    }

    // Phase 3.2: 舊的效果執行代碼已移除，改用 executeContestEffects
    // 以下代碼已移除（約 600+ 行）：
    // - 技能效果執行邏輯
    // - 道具效果執行邏輯
    // - 數值變化處理
    // - 任務揭露/完成處理
    // - 道具移除/偷竊處理
    // - WebSocket 事件發送（已整合到 executeContestEffects 中）

    // Phase 3.2: 更新防守方使用的道具/技能的使用記錄
    const now = new Date();

    // 更新防守方使用的道具/技能的使用記錄
    const defenderUpdates: Record<string, unknown> = {};
    if (defenderItems && defenderItems.length > 0) {
      const defenderItemsData = defender.items || [];
      for (const itemId of defenderItems) {
        const itemIndex = defenderItemsData.findIndex((i: { id: string }) => i.id === itemId);
        if (itemIndex !== -1) {
          defenderUpdates[`items.${itemIndex}.lastUsedAt`] = now;
          if (defenderItemsData[itemIndex].usageLimit && defenderItemsData[itemIndex].usageLimit > 0) {
            const newUsageCount = (defenderItemsData[itemIndex].usageCount || 0) + 1;
            defenderUpdates[`items.${itemIndex}.usageCount`] = newUsageCount;
          }
        }
      }
    }

    if (defenderSkills && defenderSkills.length > 0) {
      const defenderSkillsData = defender.skills || [];
      for (const skillId of defenderSkills) {
        const skillIndex = defenderSkillsData.findIndex((s: { id: string }) => s.id === skillId);
        if (skillIndex !== -1) {
          defenderUpdates[`skills.${skillIndex}.lastUsedAt`] = now;
          if (defenderSkillsData[skillIndex].usageLimit && defenderSkillsData[skillIndex].usageLimit > 0) {
            const newUsageCount = (defenderSkillsData[skillIndex].usageCount || 0) + 1;
            defenderUpdates[`skills.${skillIndex}.usageCount`] = newUsageCount;
          }
        }
      }
    }

    if (Object.keys(defenderUpdates).length > 0) {
      await Character.findByIdAndUpdate(defenderId, {
        $set: defenderUpdates,
      });
    }

    // 注意：攻擊方技能/道具使用記錄已在 skill-use.ts/item-use.ts 中更新，這裡不需要再次更新

    // Phase 8: 發送判定結果的 socket event 給攻擊方
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
      attackerItems?: string[];
      attackerSkills?: string[];
      defenderItems?: string[];
      defenderSkills?: string[];
      result: 'attacker_wins' | 'defender_wins' | 'both_fail';
      effectsApplied?: string[];
      opponentMaxItems?: number;
      opponentMaxSkills?: number;
      needsTargetItemSelection?: boolean;
    } = {
      attackerId: attackerIdStr,
      attackerName: attacker.name,
      defenderId: defenderIdStr,
      defenderName: defender.name,
      attackerValue,
      defenderValue,
      attackerItems: undefined,
      attackerSkills: undefined,
      defenderItems: defenderItemsList.length > 0 ? defenderItemsList.map(item => item.id) : undefined,
      defenderSkills: defenderSkillsList.length > 0 ? defenderSkillsList.map(skill => skill.id) : undefined,
      result,
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      opponentMaxItems: contestConfig.opponentMaxItems,
      opponentMaxSkills: contestConfig.opponentMaxSkills,
      sourceType,
    };

    // Phase 8: 根據來源類型設定對應的 ID 和名稱
    if (sourceType === 'skill' && skill) {
      contestPayload.skillId = skill.id;
      contestPayload.skillName = skill.name;
      // Phase 8: 如果攻擊方獲勝且需要選擇目標道具，標記 needsTargetItemSelection
      if (result === 'attacker_wins') {
        const effects = skill.effects || [];
        const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
          return e.type === 'item_take' || e.type === 'item_steal';
        });
        if (hasItemTakeOrSteal && !targetItemId) {
          contestPayload.needsTargetItemSelection = true;
        }
      }
    } else if (sourceType === 'item' && item) {
      contestPayload.itemId = item.id;
      contestPayload.itemName = item.name;
      // Phase 8: 如果攻擊方獲勝且需要選擇目標道具，標記 needsTargetItemSelection
      if (result === 'attacker_wins') {
        const effects = item.effects || (item.effect ? [item.effect] : []);
        const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
          return e.type === 'item_take' || e.type === 'item_steal';
        });
        if (hasItemTakeOrSteal && !targetItemId) {
          contestPayload.needsTargetItemSelection = true;
        }
      }
    }
    
    // Phase 8: 發送結果事件給攻擊方和防守方
    const pusher = getPusherServer();
    if (pusher && isPusherEnabled()) {
      const event: BaseEvent = {
        type: 'skill.contest',
        timestamp: Date.now(),
        payload: contestPayload,
      };
      try {
        // 如果攻擊方獲勝且需要選擇目標道具，不發送包含效果的 skill.contest 事件給攻擊方
        // 效果將在攻擊方選擇目標道具後，由 contest-select-item.ts 發送完整的通知
        const needsTargetItemSelection = contestPayload.needsTargetItemSelection === true;
        const isAttackerWins = result === 'attacker_wins';
        
        if (!(needsTargetItemSelection && isAttackerWins)) {
          // 發送給攻擊方（不需要選擇目標道具，或攻擊方未獲勝）
        const attackerChannelName = `private-character-${attackerIdStr}`;
        await pusher.trigger(attackerChannelName, 'skill.contest', event);
        } else {
          // 需要選擇目標道具且攻擊方獲勝，發送一個不包含效果的版本給攻擊方
          // 這樣前端可以知道對抗檢定已完成，並觸發道具選擇 dialog
          const attackerEvent: BaseEvent = {
            type: 'skill.contest',
            timestamp: Date.now(),
            payload: {
              ...contestPayload,
              effectsApplied: undefined, // 不包含效果，將在選擇目標道具後發送完整通知
            },
          };
          const attackerChannelName = `private-character-${attackerIdStr}`;
          await pusher.trigger(attackerChannelName, 'skill.contest', attackerEvent);
        }
        
        // 也發送給防守方，讓防守方知道結果並關閉 dialog
        const defenderChannelName = `private-character-${defenderIdStr}`;
        await pusher.trigger(defenderChannelName, 'skill.contest', event);
      } catch (error) {
        console.error('[contest-respond] Failed to emit skill.contest', error);
      }
    } else {
    }

    // Phase 8: 對抗檢定完成後，從追蹤系統中移除
    // 注意：如果需要選擇目標道具（needsTargetItemSelection），不應該立即清除記錄
    // 記錄將在攻擊方選擇完目標道具後由 selectTargetItemForContest 清除
    const shouldClearContest = !contestPayload.needsTargetItemSelection;
    
    if (shouldClearContest) {
      // 不需要選擇目標道具，立即清除對抗檢定記錄
      removeActiveContest(contestId);
      // 同時根據攻擊方和防守方的 ID 清除所有相關的對抗檢定（確保清除完整）
      // 這可以處理 contestId 格式不匹配的情況
      removeContestsByCharacterId(attackerIdStr);
      removeContestsByCharacterId(defenderIdStr);
    }

    const returnData = {
      success: true,
      data: {
        contestResult: result,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      },
      message: result === 'attacker_wins' 
        ? '攻擊方獲勝' 
        : result === 'defender_wins' 
        ? '防守方獲勝' 
        : '雙方平手',
    };
    
    return returnData;
  } catch (error) {
    console.error('Error responding to contest:', error);
    
    // Phase 8: 即使發生錯誤，也要清除對抗狀態，避免狀態一直保留
    try {
      // 嘗試解析 contestId 以獲取角色 ID
      const parts = contestId.split('::');
      if (parts.length === 3) {
        const [attackerId] = parts;
        // 清除對抗狀態
        removeActiveContest(contestId);
        // 嘗試根據攻擊方 ID 清除（防守方 ID 可能無法從 contestId 獲取）
        if (attackerId) {
          removeContestsByCharacterId(String(attackerId));
        }
      }
    } catch (cleanupError) {
      console.error('[contest-respond] 清除對抗狀態時發生錯誤:', cleanupError);
    }
    
    return {
      success: false,
      error: 'RESPOND_FAILED',
      message: `無法回應對抗檢定：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

