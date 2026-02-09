'use server';

import dbConnect from '@/lib/db/mongodb';
import { Character } from '@/lib/db/models';
import { removeActiveContest, removeContestsByCharacterId } from '@/lib/contest-tracker';
import { validateContestRequest, validateContestSource, validateDefenderItems, validateDefenderSkills, validateDefenderCombatTag, validateDefenderCheckType, validateDefenderRelatedStat } from '@/lib/contest/contest-validator';
import { calculateAttackerValue, calculateDefenderValue, calculateContestResult } from '@/lib/contest/contest-calculator';
import { executeContestEffects } from '@/lib/contest/contest-effect-executor';
import { ContestNotificationManager } from '@/lib/contest/contest-notification-manager';
import type { ApiResponse } from '@/types/api';
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
    const { parseContestId } = await import('@/lib/contest/contest-id');
    const parsed = parseContestId(contestId);
    if (!parsed) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }
    const { attackerId, sourceId } = parsed;

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
    // Phase 7.6: 對於 random_contest 類型，relatedStat 可能不存在
    const relatedStatName = contestConfig.relatedStat;

    // Phase 3.2: 提前獲取技能或道具對象（用於檢查攻擊方標籤和檢定類型）
    type SkillType = NonNullable<CharacterDocument['skills']>[number];
    type ItemType = NonNullable<CharacterDocument['items']>[number];
    let attackerSource: SkillType | ItemType | null = null;

    if (sourceType === 'skill') {
      const attackerSkills = attacker!.skills || [];
      const foundSkill = attackerSkills.find((s: { id: string }) => s.id === sourceId);
      if (foundSkill) {
        attackerSource = foundSkill as SkillType;
      }
    } else {
      const attackerItems = attacker!.items || [];
      const foundItem = attackerItems.find((i: { id: string }) => i.id === sourceId);
      if (foundItem) {
        attackerSource = foundItem as ItemType;
      }
    }

    if (!attackerSource) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到攻擊技能或道具',
      };
    }

    // Phase 7.6: 取得攻擊方的檢定類型
    let attackerCheckType: 'contest' | 'random_contest' = 'contest';
    if (attackerSource.checkType === 'random_contest') {
      attackerCheckType = 'random_contest';
    }

    // Phase 7.6: 驗證防守方標籤（僅當防守方有使用技能/道具時才驗證）
    // 防守方可以不使用技能/道具，直接用基礎數值回應
    // 如果攻擊方有戰鬥標籤，防守方也必須有戰鬥標籤；如果攻擊方沒有戰鬥標籤，防守方也不需要有戰鬥標籤
    const hasDefenderItems = defenderItems && defenderItems.length > 0;
    const hasDefenderSkills = defenderSkills && defenderSkills.length > 0;
    if (hasDefenderItems || hasDefenderSkills) {
      // 檢查攻擊方是否有戰鬥標籤
      const attackerTags = attackerSource.tags || [];
      const attackerHasCombatTag = attackerTags.includes('combat');
      
      const defenderTagValidation = validateDefenderCombatTag(
        defender!, 
        defenderItems || [], 
        defenderSkills || [],
        attackerHasCombatTag
      );
      if (!defenderTagValidation.success) {
        return {
          success: false,
          error: defenderTagValidation.error || 'MISSING_COMBAT_TAG',
          message: defenderTagValidation.message || '防守方使用的技能/道具必須具有「戰鬥」標籤才能回應具備戰鬥標籤的對抗檢定',
        };
      }

      // Phase 7.6: 驗證防守方檢定類型必須與攻擊方相同（僅當防守方有使用技能/道具時才驗證）
      const defenderCheckTypeValidation = validateDefenderCheckType(attackerCheckType, defender!, defenderItems || [], defenderSkills || []);
      if (!defenderCheckTypeValidation.success) {
        return {
          success: false,
          error: defenderCheckTypeValidation.error || 'INVALID_CHECK_TYPE',
          message: defenderCheckTypeValidation.message || '防守方使用的技能/道具檢定類型必須與攻擊方相同',
        };
      }

      // Phase 7.6: 驗證防守方 relatedStat 必須與攻擊方相同（僅適用於 contest 類型，且防守方有使用技能/道具時）
      if (attackerCheckType === 'contest' && relatedStatName) {
        const defenderRelatedStatValidation = validateDefenderRelatedStat(relatedStatName, defender!, defenderItems || [], defenderSkills || []);
        if (!defenderRelatedStatValidation.success) {
          return {
            success: false,
            error: defenderRelatedStatValidation.error || 'INVALID_RELATED_STAT',
            message: defenderRelatedStatValidation.message || '防守方使用的技能/道具數值判定必須與攻擊方相同',
          };
        }
      }
    }

    // Phase 7.6: 根據檢定類型計算對抗結果
    let attackerValue: number;
    let defenderValue: number;
    let result: 'attacker_wins' | 'defender_wins' | 'both_fail';

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

    if (attackerCheckType === 'random_contest') {
      // Phase 7.6: 隨機對抗檢定
      // 取得劇本的 randomContestMaxValue
      const { Game } = await import('@/lib/db/models');
      const game = await Game.findById(attacker!.gameId);
      const maxValue = game?.randomContestMaxValue || 100;

      // 從對抗檢定追蹤系統中獲取攻擊方的隨機數（已在選擇目標後決定）
      const { getContestInfo } = await import('@/lib/contest-tracker');
      const contestInfo = getContestInfo(contestId);
      if (!contestInfo || contestInfo.attackerRandomValue === undefined) {
        return {
          success: false,
          error: 'INVALID_CONTEST',
          message: '找不到對抗檢定資訊或攻擊方隨機數未設定',
        };
      }
      attackerValue = contestInfo.attackerRandomValue;

      // 防守方隨機數在按下確認按鈕時決定
      defenderValue = Math.floor(Math.random() * maxValue) + 1;

      // 計算對抗結果
      result = calculateContestResult(attackerValue, defenderValue, contestConfig.tieResolution);
    } else {
      // 原有對抗檢定邏輯（contest 類型）
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

      // Phase 3.2: 使用計算模組計算攻擊方和防守方數值
      attackerValue = calculateAttackerValue(attackerStat.value);
      defenderValue = calculateDefenderValue(
        defenderStat.value,
        relatedStatName,
        defender!,
        defenderItemsList,
        defenderSkillsList
      );

      // Phase 3.2: 使用計算模組計算對抗結果
      result = calculateContestResult(attackerValue, defenderValue, contestConfig.tieResolution);
    }

    // Phase 3.2: 使用已獲取的攻擊方技能或道具對象（用於效果執行）
    const source = attackerSource;
    let skill: SkillType | null = null;
    let item: ItemType | null = null;

    if (sourceType === 'skill') {
      skill = source as SkillType;
    } else {
      item = source as ItemType;
    }

    // Phase 2: 使用統一的通知管理器
    // 檢查是否需要選擇目標道具（攻擊方獲勝時）
    let needsTargetItemSelection = false;
    if (sourceType === 'skill' && skill) {
      const effects = skill.effects || [];
      const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
        return e.type === 'item_take' || e.type === 'item_steal';
      });
      if (hasItemTakeOrSteal && !targetItemId) {
        needsTargetItemSelection = true;
      }
    } else if (sourceType === 'item' && item) {
      const effects = item.effects || (item.effect ? [item.effect] : []);
      const hasItemTakeOrSteal = effects.some((e: { type?: string }) => {
        return e.type === 'item_take' || e.type === 'item_steal';
      });
      if (hasItemTakeOrSteal && !targetItemId) {
        needsTargetItemSelection = true;
      }
    }

    // 準備防守方來源對象（用於通知管理器）
    let defenderSourceObj: SkillType | ItemType | undefined;
    let defenderSourceType: 'skill' | 'item' | undefined;
    const hasDefenderResponse = (defenderItems && defenderItems.length > 0) || (defenderSkills && defenderSkills.length > 0);
    
    if (hasDefenderResponse) {
      if (defenderSkills && defenderSkills.length > 0) {
        const defenderSkillsData = defender!.skills || [];
        const foundSkill = defenderSkillsData.find((s: { id: string }) => s.id === defenderSkills![0]);
        if (foundSkill) {
          defenderSourceObj = foundSkill as SkillType;
          defenderSourceType = 'skill';
        }
      } else if (defenderItems && defenderItems.length > 0) {
        const defenderItemsData = defender!.items || [];
        const foundItem = defenderItemsData.find((i: { id: string }) => i.id === defenderItems![0]);
        if (foundItem) {
          defenderSourceObj = foundItem as ItemType;
          defenderSourceType = 'item';
        }
      }
    }

    // Phase 9: 檢查防守方獲勝時是否需要選擇目標道具
    let defenderNeedsTargetItemSelection = false;
    if (hasDefenderResponse && defenderSourceObj) {
      const defenderEffects = defenderSourceType === 'skill' 
        ? (defenderSourceObj as SkillType).effects || []
        : (defenderSourceObj as ItemType).effects || ((defenderSourceObj as ItemType).effect ? [(defenderSourceObj as ItemType).effect!] : []);
      const defenderHasItemTakeOrSteal = defenderEffects.some((e: { type?: string }) => {
        return e.type === 'item_take' || e.type === 'item_steal';
      });
      if (defenderHasItemTakeOrSteal && !targetItemId) {
        defenderNeedsTargetItemSelection = true;
      }
    }

    // Phase 2: 發送初始對抗檢定結果通知（不包含效果）
    const needsTargetItemSelectionForNotification = result === 'attacker_wins' 
      ? needsTargetItemSelection 
      : (result === 'defender_wins' ? defenderNeedsTargetItemSelection : false);
    try {
      await ContestNotificationManager.sendContestResultNotifications(
        {
          result,
          attacker: attacker!,
          defender: defender!,
          attackerSource: source,
          attackerSourceType: sourceType,
          defenderSource: defenderSourceObj,
          defenderSourceType,
          effectsApplied: [], // 初始通知不包含效果
          needsTargetItemSelection: needsTargetItemSelectionForNotification,
          contestId,
          attackerValue,
          defenderValue,
          attackerItems: undefined,
          attackerSkills: undefined,
          defenderItems: defenderItemsList.length > 0 ? defenderItemsList.map(item => item.id) : undefined,
          defenderSkills: defenderSkillsList.length > 0 ? defenderSkillsList.map(skill => skill.id) : undefined,
          checkType: attackerCheckType,
          relatedStat: attackerCheckType === 'contest' ? relatedStatName : undefined,
          contestConfig,
        },
        {
          skipInitialResult: false,
          skipDefender: result === 'defender_wins' && !hasDefenderResponse,
        }
      );
    } catch (error) {
      console.error('[contest-respond] Failed to send initial contest notifications', error);
    }

    // Phase 7.6: 現在執行效果（會發送 character.affected 事件，這會在 skill.contest 之後）
    // Phase 9: 如果防守方獲勝且需要選擇目標道具，跳過效果執行（將在選擇道具後執行）
    let effectsApplied: string[] = [];

    if (result === 'attacker_wins') {
      // 攻擊方獲勝：執行攻擊方的效果
      // Phase 9: 如果攻擊方需要選擇目標道具，跳過效果執行（將在選擇道具後執行）
      if (!needsTargetItemSelection) {
        try {
          const effectResult = await executeContestEffects(attacker!, defender!, source, targetItemId, 'attacker_wins');
          effectsApplied = effectResult.effectsApplied;
        } catch (error) {
          console.error('[contest-respond] 執行攻擊方效果時發生錯誤:', error);
          // 繼續執行，不中斷對抗檢定流程
        }
      }
    } else if (result === 'defender_wins') {
      // Phase 7.6: 防守方獲勝：執行防守方的效果
      // Phase 9: 如果防守方需要選擇目標道具，跳過效果執行（將在選擇道具後執行）
      if (!defenderNeedsTargetItemSelection) {
        const defenderSources: Array<{ type: 'skill' | 'item'; id: string }> = [];
        if (defenderSkills && defenderSkills.length > 0) {
          defenderSkills.forEach((skillId) => {
            defenderSources.push({ type: 'skill', id: skillId });
          });
        }
        if (defenderItems && defenderItems.length > 0) {
          defenderItems.forEach((itemId) => {
            defenderSources.push({ type: 'item', id: itemId });
          });
        }

        if (defenderSources.length > 0) {
          try {
            const defenderSource = defenderSources[0];
            let defenderSourceObj: SkillType | ItemType | null = null;
            
            if (defenderSource.type === 'skill') {
              const defenderSkillsData = defender!.skills || [];
              const foundSkill = defenderSkillsData.find((s: { id: string }) => s.id === defenderSource.id);
              if (foundSkill) {
                defenderSourceObj = foundSkill as SkillType;
              }
            } else {
              const defenderItemsData = defender!.items || [];
              const foundItem = defenderItemsData.find((i: { id: string }) => i.id === defenderSource.id);
              if (foundItem) {
                defenderSourceObj = foundItem as ItemType;
              }
            }

            if (defenderSourceObj) {
              const effectResult = await executeContestEffects(attacker!, defender!, defenderSourceObj, undefined, 'defender_wins', defenderSources);
              effectsApplied = effectResult.effectsApplied;
              
              // 注意：不再發送 skill.used 事件，因為應該通過 skill.contest 事件處理
              // 效果執行完成後會重新發送包含 effectsApplied 的 skill.contest 事件
            }
          } catch (error) {
            console.error('[contest-respond] 執行防守方效果時發生錯誤:', error);
          }
        }
      }
    }
    // result === 'both_fail' 時不執行任何效果

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

    // Phase 2: 發送包含效果的完整通知（如果需要）
    // 注意：如果需要選擇目標道具，則不發送最終通知（將在選擇道具後發送）
    // Phase 9: 防守方獲勝時，如果防守方需要選擇目標道具，也不發送最終通知
    const finalNeedsTargetItemSelection = result === 'attacker_wins' 
      ? needsTargetItemSelection 
      : (result === 'defender_wins' ? defenderNeedsTargetItemSelection : false);
    
    if (!finalNeedsTargetItemSelection) {
      try {
        await ContestNotificationManager.sendContestResultNotifications(
          {
            result,
            attacker: attacker!,
            defender: defender!,
            attackerSource: source,
            attackerSourceType: sourceType,
            defenderSource: defenderSourceObj,
            defenderSourceType,
            effectsApplied,
            needsTargetItemSelection: false, // 效果已執行，不需要選擇目標道具
            contestId,
            attackerValue,
            defenderValue,
            attackerItems: undefined,
            attackerSkills: undefined,
            defenderItems: defenderItemsList.length > 0 ? defenderItemsList.map(item => item.id) : undefined,
            defenderSkills: defenderSkillsList.length > 0 ? defenderSkillsList.map(skill => skill.id) : undefined,
            checkType: attackerCheckType,
            relatedStat: attackerCheckType === 'contest' ? relatedStatName : undefined,
            contestConfig,
          },
          {
            skipInitialResult: true, // 跳過初始結果，只發送最終結果
            skipDefender: result === 'defender_wins' && !hasDefenderResponse,
          }
        );
      } catch (error) {
        console.error('[contest-respond] Failed to send final contest notifications', error);
      }
    }

    // Phase 8: 對抗檢定完成後，從追蹤系統中移除
    // 注意：如果需要選擇目標道具（finalNeedsTargetItemSelection），不應該立即清除記錄
    // 記錄將在選擇完目標道具後由 selectTargetItemForContest 清除
    const shouldClearContest = !finalNeedsTargetItemSelection;
    
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
      const { parseContestId } = await import('@/lib/contest/contest-id');
      const parsed = parseContestId(contestId);
      if (parsed) {
        const { attackerId } = parsed;
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


