/**
 * 對抗檢定通知管理器
 * 統一管理所有通知發送邏輯，確保事件發送順序一致
 * 
 * Phase 2: 統一事件發送順序
 * 
 * 根據 CONTEST_SYSTEM_REFACTORING_V2.md 的需求：
 * 1. 先發送 skill.contest（subType: 'result'）
 * 2. 如果需要選擇目標道具，等待選擇完成（由調用方處理）
 * 3. 執行效果後，根據結果發送對應的通知
 */

import { emitContestResult, emitContestEffect } from '@/lib/contest/contest-event-emitter';
import { emitSkillUsed } from '@/lib/websocket/events';
import type { CharacterDocument } from '@/lib/db/models';
import type { SkillContestEvent } from '@/types/event';

/**
 * 技能類型
 */
type SkillType = NonNullable<CharacterDocument['skills']>[number];

/**
 * 道具類型
 */
type ItemType = NonNullable<CharacterDocument['items']>[number];

/**
 * 對抗檢定結果通知參數
 */
export interface ContestNotificationParams {
  /** 對抗檢定結果 */
  result: 'attacker_wins' | 'defender_wins' | 'both_fail';
  /** 攻擊方角色 */
  attacker: CharacterDocument;
  /** 防守方角色 */
  defender: CharacterDocument;
  /** 攻擊方使用的技能或道具 */
  attackerSource: SkillType | ItemType;
  /** 攻擊方來源類型 */
  attackerSourceType: 'skill' | 'item';
  /** 防守方使用的技能或道具（可選） */
  defenderSource?: SkillType | ItemType;
  /** 防守方來源類型（可選） */
  defenderSourceType?: 'skill' | 'item';
  /** 已應用的效果列表 */
  effectsApplied?: string[];
  /** 是否需要選擇目標道具 */
  needsTargetItemSelection?: boolean;
  /** 對抗檢定 ID */
  contestId: string;
  /** 攻擊方數值 */
  attackerValue: number;
  /** 防守方數值 */
  defenderValue: number;
  /** 攻擊方使用的道具 ID 陣列 */
  attackerItems?: string[];
  /** 攻擊方使用的技能 ID 陣列 */
  attackerSkills?: string[];
  /** 防守方使用的道具 ID 陣列 */
  defenderItems?: string[];
  /** 防守方使用的技能 ID 陣列 */
  defenderSkills?: string[];
  /** 檢定類型 */
  checkType?: 'contest' | 'random_contest';
  /** 數值判定名稱（contest 類型時使用） */
  relatedStat?: string;
  /** 對抗檢定配置 */
  contestConfig?: {
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  };
}

/**
 * 對抗檢定通知管理器
 */
export class ContestNotificationManager {
  /**
   * 發送對抗檢定結果通知
   * 
   * 統一管理通知發送順序：
   * 1. 先發送 skill.contest（subType: 'result'）
   * 2. 如果需要選擇目標道具，等待選擇完成（由調用方處理）
   * 3. 執行效果後，根據結果發送對應的通知
   * 
   * @param params 通知參數
   * @param options 選項
   * @param options.skipInitialResult 是否跳過初始結果發送（當需要選擇目標道具時使用）
   * @param options.skipDefender 是否跳過發送給防守方（當防守方獲勝但無回應時使用）
   */
  static async sendContestResultNotifications(
    params: ContestNotificationParams,
    options?: {
      skipInitialResult?: boolean;
      skipDefender?: boolean;
    }
  ): Promise<void> {
    const {
      result,
      attacker,
      defender,
      attackerSource,
      attackerSourceType,
      defenderSource,
      defenderSourceType,
      effectsApplied = [],
      needsTargetItemSelection = false,
      contestId,
      attackerValue,
      defenderValue,
      attackerItems,
      attackerSkills,
      defenderItems,
      defenderSkills,
      checkType,
      relatedStat,
      contestConfig,
    } = params;

    const attackerIdStr = attacker._id.toString();
    const defenderIdStr = defender._id.toString();
    const hasDefenderResponse = (defenderItems && defenderItems.length > 0) || (defenderSkills && defenderSkills.length > 0);

    // 構建 contestPayload
    const contestPayload: Omit<SkillContestEvent['payload'], 'subType'> = {
      attackerId: attackerIdStr,
      attackerName: attacker.name,
      defenderId: defenderIdStr,
      defenderName: defender.name,
      attackerValue,
      defenderValue,
      attackerItems,
      attackerSkills,
      defenderItems: defenderItems && defenderItems.length > 0 ? defenderItems : undefined,
      defenderSkills: defenderSkills && defenderSkills.length > 0 ? defenderSkills : undefined,
      result,
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      opponentMaxItems: contestConfig?.opponentMaxItems,
      opponentMaxSkills: contestConfig?.opponentMaxSkills,
      sourceType: attackerSourceType,
      checkType,
      relatedStat: checkType === 'contest' ? relatedStat : undefined,
      contestId,
      needsTargetItemSelection,
    };

    // 設置攻擊方的技能/道具 ID 和名稱
    if (attackerSourceType === 'skill') {
      contestPayload.skillId = attackerSource.id;
      contestPayload.skillName = attackerSource.name;
    } else {
      contestPayload.itemId = attackerSource.id;
      contestPayload.itemName = attackerSource.name;
    }

    // Phase 7.6: 設置攻擊方標籤（戰鬥標籤、隱匿標籤）
    const attackerTags = attackerSource.tags || [];
    contestPayload.attackerHasCombatTag = attackerTags.includes('combat');
    contestPayload.sourceHasStealthTag = attackerTags.includes('stealth');

    // 步驟 1: 發送 skill.contest（subType: 'result'）
    // 注意：攻擊方獲勝且需要選擇目標道具時，仍然要發送通知給攻擊方，讓前端能夠開啟選擇道具 dialog
    // 防守方獲勝但無回應時，不發送事件給防守方
    if (!options?.skipInitialResult) {
      const isAttackerWins = result === 'attacker_wins';
      const isDefenderWins = result === 'defender_wins';
      const skipDefender = isDefenderWins && !hasDefenderResponse;

      // Phase 4: 修復邏輯錯誤
      // 發送給攻擊方
      // 攻擊方獲勝時：無論是否需要選擇目標道具，都發送給攻擊方（讓前端能夠開啟選擇道具 dialog）
      // 防守方獲勝時：如果防守方需要選擇目標道具，不發送給攻擊方（避免提前顯示失敗通知）
      if (isAttackerWins) {
        // 攻擊方獲勝：發送無效果的結果給攻擊方（包含 needsTargetItemSelection 標記）
        await emitContestResult(
          attackerIdStr,
          defenderIdStr,
          { ...contestPayload, effectsApplied: undefined },
          { skipAttacker: false, skipDefender: true }
        );
      } else if (isDefenderWins) {
        // 防守方獲勝：如果防守方需要選擇目標道具，不發送給攻擊方（避免提前顯示失敗通知）
        // 攻擊方的失敗通知將在防守方選擇道具後通過 sendContestEffectNotification 發送
        if (!needsTargetItemSelection) {
          // 防守方不需要選擇目標道具：發送無效果的結果給攻擊方
          // 修復：確保防守方沒有回應時，清除 defenderSkills 和 defenderItems，避免前一個對抗的值被繼承
          const attackerPayload = { ...contestPayload, effectsApplied: undefined };
          if (!hasDefenderResponse) {
            // 防守方沒有回應時，明確清除防守方的技能/道具相關欄位
            attackerPayload.defenderSkills = undefined;
            attackerPayload.defenderItems = undefined;
          }
          await emitContestResult(
            attackerIdStr,
            defenderIdStr,
            attackerPayload,
            { skipAttacker: false, skipDefender: true }
          );
        }
        // 如果防守方需要選擇目標道具，不發送給攻擊方（將在選擇道具後發送）
      }

      // 發送給防守方（除非防守方獲勝但無回應）
      // 攻擊方獲勝時：發送給防守方
      // 防守方獲勝時：如果有回應，發送給防守方
      if (!skipDefender) {
        if (isAttackerWins) {
          // 攻擊方獲勝：發送無效果的結果給防守方
          await emitContestResult(
            attackerIdStr,
            defenderIdStr,
            { ...contestPayload, effectsApplied: undefined },
            { skipAttacker: true, skipDefender: false }
          );
        } else if (isDefenderWins && hasDefenderResponse) {
          // 防守方獲勝且有回應：發送無效果的結果給防守方
          // 如果防守方需要選擇目標道具，需要設置防守方的技能/道具 ID
          const defenderPayload = { ...contestPayload, effectsApplied: undefined };
          if (needsTargetItemSelection && defenderSource && defenderSourceType) {
            // 設置防守方使用的技能/道具 ID 和名稱
            if (defenderSourceType === 'skill') {
              defenderPayload.skillId = defenderSource.id;
              defenderPayload.skillName = defenderSource.name;
              // 清除攻擊方的道具 ID（如果有的話）
              defenderPayload.itemId = undefined;
              defenderPayload.itemName = undefined;
            } else {
              defenderPayload.itemId = defenderSource.id;
              defenderPayload.itemName = defenderSource.name;
              // 清除攻擊方的技能 ID（如果有的話）
              defenderPayload.skillId = undefined;
              defenderPayload.skillName = undefined;
            }
            // 更新 sourceType 為防守方的來源類型
            defenderPayload.sourceType = defenderSourceType;
            // 確保 needsTargetItemSelection 設置為 true（防守方需要選擇目標道具）
            defenderPayload.needsTargetItemSelection = true;
          } else {
            // 即使不需要選擇目標道具，也應該設置防守方的技能/道具 ID（如果有的話）
            // 這樣前端可以正確顯示防守方使用的技能/道具
            if (defenderSource && defenderSourceType) {
              if (defenderSourceType === 'skill') {
                defenderPayload.skillId = defenderSource.id;
                defenderPayload.skillName = defenderSource.name;
                defenderPayload.itemId = undefined;
                defenderPayload.itemName = undefined;
              } else {
                defenderPayload.itemId = defenderSource.id;
                defenderPayload.itemName = defenderSource.name;
                defenderPayload.skillId = undefined;
                defenderPayload.skillName = undefined;
              }
              defenderPayload.sourceType = defenderSourceType;
            }
          }
          await emitContestResult(
            attackerIdStr,
            defenderIdStr,
            defenderPayload,
            { skipAttacker: true, skipDefender: false }
          );
        }
      }
    }

    // 步驟 2: 如果需要選擇目標道具，等待選擇完成（由調用方處理）
    // 這裡不處理，由調用方在選擇完成後調用 sendContestEffectNotification

    // 步驟 3: 執行效果後，根據結果發送對應的通知
    // 注意：character.affected 事件已經在 executeContestEffects 中發送
    // 這裡主要處理 skill.used 事件和包含效果的 skill.contest 事件
    // 
    // 邏輯說明：
    // - 如果 skipInitialResult 為 false：這是初始通知階段，只發送初始的 skill.contest（無效果），不發送 skill.used
    // - 如果 skipInitialResult 為 true：這是最終通知階段，發送最終的 skill.contest（包含效果）和 skill.used

    const isAttackerWins = result === 'attacker_wins';
    const isDefenderWins = result === 'defender_wins';
    const isSendingFinal = options?.skipInitialResult === true;

    // 只在最終通知階段發送包含效果的通知和 skill.used 事件
    if (isSendingFinal) {
      if (isAttackerWins) {
        // 攻擊方獲勝
        // 發送包含效果的完整事件給攻擊方（如果不需要選擇目標道具）
        if (!needsTargetItemSelection) {
          // 修復：確保防守方沒有回應時，清除 defenderSkills 和 defenderItems
          // 重要：即使 hasDefenderResponse 為 true，也要確保 defenderSkills 和 defenderItems 與當前對抗一致
          // 因為 contestPayload 可能包含前一個對抗的殘留值
          const finalPayload = { ...contestPayload, effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined };
          // 根據實際的 defenderSkills 和 defenderItems 參數來設置，而不是依賴 contestPayload 中的值
          finalPayload.defenderSkills = defenderSkills && defenderSkills.length > 0 ? defenderSkills : undefined;
          finalPayload.defenderItems = defenderItems && defenderItems.length > 0 ? defenderItems : undefined;
          await emitContestResult(
            attackerIdStr,
            defenderIdStr,
            finalPayload,
            { skipAttacker: false, skipDefender: true }
          );
        }

        // 發送 skill.used（成功）給攻擊方
        await emitSkillUsed(attackerIdStr, {
          characterId: attackerIdStr,
          skillId: attackerSource.id,
          skillName: attackerSource.name,
          checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
          checkPassed: true,
          effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        });
      } else if (isDefenderWins) {
        // 防守方獲勝
        // 發送包含效果的完整事件給防守方（如果有回應）
        if (hasDefenderResponse) {
          // 設置防守方使用的技能/道具名稱
          const updatedPayload = { ...contestPayload };
          if (defenderSource && defenderSourceType === 'skill') {
            updatedPayload.skillName = defenderSource.name;
            updatedPayload.skillId = defenderSource.id;
            updatedPayload.itemName = undefined;
            updatedPayload.itemId = undefined;
          } else if (defenderSource && defenderSourceType === 'item') {
            updatedPayload.itemName = defenderSource.name;
            updatedPayload.itemId = defenderSource.id;
            updatedPayload.skillName = undefined;
            updatedPayload.skillId = undefined;
          }

          await emitContestResult(
            attackerIdStr,
            defenderIdStr,
            { ...updatedPayload, effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined },
            { skipAttacker: true, skipDefender: false }
          );
        }

        // 發送 skill.used（失敗）給攻擊方
        // 注意：如果防守方需要選擇目標道具，不應該在這裡發送（將在選擇道具後發送）
        if (!needsTargetItemSelection) {
          await emitSkillUsed(attackerIdStr, {
            characterId: attackerIdStr,
            skillId: attackerSource.id,
            skillName: attackerSource.name,
            checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
            checkPassed: false,
          });
        }

        // 發送 skill.used（成功）給防守方（如果有回應）
        if (defenderSource && hasDefenderResponse) {
          await emitSkillUsed(defenderIdStr, {
            characterId: defenderIdStr,
            skillId: defenderSource.id,
            skillName: defenderSource.name,
            checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
            checkPassed: true,
            effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
          });
        }
      }
      // result === 'both_fail' 時不發送 skill.used 事件
    }
  }

  /**
   * 發送對抗檢定效果通知（選擇目標道具後）
   * 
   * 當攻擊方選擇完目標道具後，發送包含效果的完整事件
   * 
   * @param params 通知參數
   */
  static async sendContestEffectNotification(
    params: ContestNotificationParams
  ): Promise<void> {
    const {
      result,
      attacker,
      defender,
      attackerSource,
      attackerSourceType,
      defenderSource,
      defenderSourceType,
      effectsApplied = [],
      contestId,
      attackerValue,
      defenderValue,
      attackerItems,
      attackerSkills,
      defenderItems,
      defenderSkills,
      checkType,
      relatedStat,
      contestConfig,
    } = params;

    const attackerIdStr = attacker._id.toString();
    const defenderIdStr = defender._id.toString();
    const hasDefenderResponse = (defenderItems && defenderItems.length > 0) || (defenderSkills && defenderSkills.length > 0);
    const isDefenderWins = result === 'defender_wins';

    // 構建 contestPayload
    const contestPayload: Omit<SkillContestEvent['payload'], 'subType'> = {
      attackerId: attackerIdStr,
      attackerName: attacker.name,
      defenderId: defenderIdStr,
      defenderName: defender.name,
      attackerValue,
      defenderValue,
      attackerItems,
      attackerSkills,
      // 修復：確保防守方沒有回應時，清除 defenderSkills 和 defenderItems
      defenderItems: hasDefenderResponse && defenderItems && defenderItems.length > 0 ? defenderItems : undefined,
      defenderSkills: hasDefenderResponse && defenderSkills && defenderSkills.length > 0 ? defenderSkills : undefined,
      result, // 使用傳入的結果（可能是 attacker_wins 或 defender_wins）
      effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      opponentMaxItems: contestConfig?.opponentMaxItems,
      opponentMaxSkills: contestConfig?.opponentMaxSkills,
      sourceType: isDefenderWins && defenderSourceType ? defenderSourceType : attackerSourceType,
      checkType,
      relatedStat: checkType === 'contest' ? relatedStat : undefined,
      contestId,
      needsTargetItemSelection: false, // 已經選擇完成
    };

    // Phase 9: 根據結果設置對應的技能/道具 ID
    if (isDefenderWins && defenderSource && defenderSourceType) {
      // 防守方獲勝：設置防守方的技能/道具 ID
      if (defenderSourceType === 'skill') {
        contestPayload.skillId = defenderSource.id;
        contestPayload.skillName = defenderSource.name;
        contestPayload.itemId = undefined;
        contestPayload.itemName = undefined;
      } else {
        contestPayload.itemId = defenderSource.id;
        contestPayload.itemName = defenderSource.name;
        contestPayload.skillId = undefined;
        contestPayload.skillName = undefined;
      }
    } else {
      // 攻擊方獲勝：設置攻擊方的技能/道具 ID
      if (attackerSourceType === 'skill') {
        contestPayload.skillId = attackerSource.id;
        contestPayload.skillName = attackerSource.name;
      } else {
        contestPayload.itemId = attackerSource.id;
        contestPayload.itemName = attackerSource.name;
      }
    }

    // Phase 7.6: 設置攻擊方標籤（戰鬥標籤、隱匿標籤）
    const attackerTags = attackerSource.tags || [];
    contestPayload.attackerHasCombatTag = attackerTags.includes('combat');
    contestPayload.sourceHasStealthTag = attackerTags.includes('stealth');

    if (isDefenderWins && hasDefenderResponse && defenderSource) {
      // 防守方獲勝：發送包含效果的完整事件給防守方和攻擊方
      // Phase 9: 防守方選擇道具後，需要同時通知攻擊方和防守方
      await emitContestEffect(defenderIdStr, contestPayload);
      
      // 同時發送給攻擊方，讓攻擊方知道對抗檢定已完成並關閉等待面板
      // 注意：發送給攻擊方的 payload 需要包含攻擊方的技能/道具 ID，以便攻擊方能正確清除 pendingContest
      const attackerPayload = { ...contestPayload };
      // 恢復攻擊方的技能/道具 ID（攻擊方的 pendingContest 是基於攻擊方的技能/道具 ID 存儲的）
      if (attackerSourceType === 'skill') {
        attackerPayload.skillId = attackerSource.id;
        attackerPayload.skillName = attackerSource.name;
        attackerPayload.itemId = undefined;
        attackerPayload.itemName = undefined;
      } else {
        attackerPayload.itemId = attackerSource.id;
        attackerPayload.itemName = attackerSource.name;
        attackerPayload.skillId = undefined;
        attackerPayload.skillName = undefined;
      }
      // 恢復攻擊方的 sourceType
      attackerPayload.sourceType = attackerSourceType;
      await emitContestEffect(attackerIdStr, attackerPayload);

      // 發送 skill.used（成功）給防守方
      if (defenderSourceType === 'skill') {
        await emitSkillUsed(defenderIdStr, {
          characterId: defenderIdStr,
          skillId: defenderSource.id,
          skillName: defenderSource.name,
          checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
          checkPassed: true,
          effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
        });
      }

      // 發送 skill.used（失敗）給攻擊方
      await emitSkillUsed(attackerIdStr, {
        characterId: attackerIdStr,
        skillId: attackerSource.id,
        skillName: attackerSource.name,
        checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
        checkPassed: false,
      });
    } else {
      // 攻擊方獲勝：發送包含效果的完整事件給攻擊方
      // 修復：確保防守方沒有回應時，清除 defenderSkills 和 defenderItems
      const attackerWinsPayload = { ...contestPayload };
      if (!hasDefenderResponse) {
        attackerWinsPayload.defenderSkills = undefined;
        attackerWinsPayload.defenderItems = undefined;
      }
      await emitContestEffect(attackerIdStr, attackerWinsPayload);

      // 發送 skill.used（成功）給攻擊方
      await emitSkillUsed(attackerIdStr, {
        characterId: attackerIdStr,
        skillId: attackerSource.id,
        skillName: attackerSource.name,
        checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
        checkPassed: true,
        effectsApplied: effectsApplied.length > 0 ? effectsApplied : undefined,
      });
      
      // 問題1修復：發送 skill.used（失敗）給防守方（如果防守方有使用技能/道具回應）
      if (hasDefenderResponse && defenderSource && defenderSourceType) {
        if (defenderSourceType === 'skill') {
          await emitSkillUsed(defenderIdStr, {
            characterId: defenderIdStr,
            skillId: defenderSource.id,
            skillName: defenderSource.name,
            checkType: checkType === 'random_contest' ? 'random_contest' : 'contest',
            checkPassed: false,
            effectsApplied: [], // 設置為空陣列，表示對抗檢定已完成但防守方失敗（無效果）
            targetCharacterId: attackerIdStr, // 目標角色是攻擊方
            targetCharacterName: attacker.name, // 目標角色名稱
          });
        }
      }
    }
  }
}

