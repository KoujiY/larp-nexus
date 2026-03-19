'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/db/mongodb';
import { getContestInfo, removeActiveContest, removeContestsByCharacterId } from '@/lib/contest-tracker';
import { ContestNotificationManager } from '@/lib/contest/contest-notification-manager';
import { getCharacterData } from '@/lib/game/get-character-data'; // Phase 10.4: 統一讀取
import type { ApiResponse } from '@/types/api';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * Phase 8: 選擇目標道具後執行效果
 * 用於對抗檢定獲勝後，需要選擇目標道具的情況
 * Phase 9: 支援攻擊方和防守方選擇目標道具
 */
export async function selectTargetItemForContest(
  contestId: string,
  characterId: string, // Phase 9: 選擇者的角色 ID（攻擊方或防守方）
  targetItemId: string,
  targetCharacterId?: string, // Phase 9: 目標角色 ID（如果服務器端記錄丟失，可以使用此參數）
  defenderSourceId?: string, // Phase 9: 防守方使用的技能/道具 ID（當防守方選擇道具時需要）
  defenderSourceType?: 'skill' | 'item' // Phase 9: 防守方使用的技能/道具類型（當防守方選擇道具時需要）
): Promise<ApiResponse<{ success: boolean; effectApplied?: string }>> {
  try {
    await dbConnect();

    // 解析對抗請求 ID（格式：attackerId::itemId::timestamp）
    const { parseContestId } = await import('@/lib/contest/contest-id');
    const parsed = parseContestId(contestId);
    if (!parsed) {
      return {
        success: false,
        error: 'INVALID_CONTEST_ID',
        message: '無效的對抗請求 ID',
      };
    }
    const { attackerId: parsedAttackerId, sourceId } = parsed;

    // Phase 9: 判斷選擇者是攻擊方還是防守方
    const characterIdStr = String(characterId);
    const parsedAttackerIdStr = String(parsedAttackerId);
    const isDefenderSelecting = characterIdStr !== parsedAttackerIdStr;

    // 從對抗檢定追蹤系統中獲取防守方 ID
    const contestInfo = getContestInfo(contestId);
    let resolvedDefenderId: string;
    let attackerSourceType: 'skill' | 'item'; // 攻擊方的技能/道具類型
    
    if (!contestInfo) {
      // 如果找不到記錄（可能是服務器重啟或記錄過期），嘗試從參數或 contestId 解析信息
      if (targetCharacterId) {
        // 如果提供了 targetCharacterId 參數，使用它作為防守方 ID
        resolvedDefenderId = targetCharacterId;

        // Phase 10.4: 使用統一的讀取函數確定攻擊方的 sourceType
        const attacker = await getCharacterData(parsedAttackerIdStr);
        
        // 先嘗試找道具
        const attackerItems = attacker.items || [];
        const itemIndex = attackerItems.findIndex((i: { id: string }) => i.id === sourceId);
        
        if (itemIndex !== -1) {
          attackerSourceType = 'item';
        } else {
          // 嘗試找技能
          const attackerSkills = attacker.skills || [];
          const skillIndex = attackerSkills.findIndex((s: { id: string }) => s.id === sourceId);
          
          if (skillIndex !== -1) {
            attackerSourceType = 'skill';
          } else {
            return {
              success: false,
              error: 'NOT_FOUND',
              message: '找不到對應的技能或道具',
            };
          }
        }
      } else {
        // 如果沒有提供 targetCharacterId 且找不到記錄，返回錯誤
        return {
          success: false,
          error: 'CONTEST_NOT_FOUND',
          message: '找不到對抗檢定記錄，可能已過期。請重新發起對抗檢定。',
        };
      }
    } else {
      resolvedDefenderId = contestInfo.defenderId;
      attackerSourceType = contestInfo.sourceType; // 這是攻擊方的技能/道具類型
    }

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    const attacker = await getCharacterData(parsedAttackerIdStr);
    const defender = await getCharacterData(resolvedDefenderId);

    // 驗證在同一劇本內
    if (attacker.gameId.toString() !== defender.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '角色不在同一劇本內',
      };
    }

    // Phase 9: 根據是否是防守方選擇，從對應的角色身上找到技能或道具
    type SkillType = NonNullable<CharacterDocument['skills']>[number];
    type ItemType = NonNullable<CharacterDocument['items']>[number];
    let source: SkillType | ItemType | null = null;
    let actualSourceType: 'skill' | 'item'; // 實際使用的技能/道具類型（用於效果執行）
    
    // Phase 9: 如果防守方選擇道具，使用傳入的防守方技能/道具信息
    if (isDefenderSelecting && defenderSourceId && defenderSourceType) {
      const sourceCharacter = defender; // 防守方選擇時，從防守方身上查找
      if (defenderSourceType === 'item') {
        // 找到道具
        const sourceItems = sourceCharacter.items || [];
        const itemIndex = sourceItems.findIndex((i: { id: string }) => i.id === defenderSourceId);
        if (itemIndex === -1) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: '找不到防守方道具',
          };
        }
        source = sourceItems[itemIndex] as ItemType;
        actualSourceType = 'item'; // 防守方的類型
      } else if (defenderSourceType === 'skill') {
        // 找到技能
        const sourceSkills = sourceCharacter.skills || [];
        const skillIndex = sourceSkills.findIndex((s: { id: string }) => s.id === defenderSourceId);
        if (skillIndex === -1) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: '找不到防守方技能',
          };
        }
        source = sourceSkills[skillIndex] as SkillType;
        actualSourceType = 'skill'; // 防守方的類型
      } else {
        return {
          success: false,
          error: 'INVALID_SOURCE_TYPE',
          message: '無效的防守方來源類型',
        };
      }
    } else {
      // 攻擊方選擇道具時，使用從 contestId 解析出的攻擊方技能/道具信息
      const sourceCharacter = attacker; // 攻擊方選擇時，從攻擊方身上查找
      if (attackerSourceType === 'item') {
        // 找到道具
        const sourceItems = sourceCharacter.items || [];
        const itemIndex = sourceItems.findIndex((i: { id: string }) => i.id === sourceId);
        if (itemIndex === -1) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: '找不到道具',
          };
        }
        source = sourceItems[itemIndex] as ItemType;
        actualSourceType = 'item'; // 攻擊方的類型
      } else if (attackerSourceType === 'skill') {
        // 找到技能
        const sourceSkills = sourceCharacter.skills || [];
        const skillIndex = sourceSkills.findIndex((s: { id: string }) => s.id === sourceId);
        if (skillIndex === -1) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: '找不到技能',
          };
        }
        source = sourceSkills[skillIndex] as SkillType;
        actualSourceType = 'skill'; // 攻擊方的類型
      } else {
        return {
          success: false,
          error: 'INVALID_SOURCE_TYPE',
          message: '無效的來源類型',
        };
      }
    }

    if (!source) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到技能或道具',
      };
    }

    // Phase 9: 決定對抗檢定結果（根據選擇者）
    // 攻擊方選擇目標道具 = 攻擊方獲勝
    // 防守方選擇目標道具 = 防守方獲勝
    const contestResult: 'attacker_wins' | 'defender_wins' = isDefenderSelecting ? 'defender_wins' : 'attacker_wins';

    // Phase 9: 準備防守方來源（如果防守方獲勝）
    let defenderSources: Array<{ type: 'skill' | 'item'; id: string }> | undefined;
    if (isDefenderSelecting && source) {
      // 使用實際找到的防守方技能/道具信息
      defenderSources = [{ type: actualSourceType, id: source.id }];
    }

    // Step 9: 使用統一的效果執行器執行所有效果（不再拆分 — stat_change 等效果已在 contest-respond 跳過）
    const { executeContestEffects } = await import('@/lib/contest/contest-effect-executor');
    let effectsApplied: string[] = [];
    let updatedAttacker: CharacterDocument;
    let updatedDefender: CharacterDocument;
    try {
      const effectResult = await executeContestEffects(
        attacker!,
        defender!,
        source,
        targetItemId,
        contestResult,
        defenderSources
      );
      effectsApplied = effectResult.effectsApplied;
      updatedAttacker = effectResult.updatedAttacker;
      updatedDefender = effectResult.updatedDefender;
    } catch (error) {
      console.error('[contest-select-item] 執行效果時發生錯誤:', error);
      return {
        success: false,
        error: 'EFFECT_EXECUTION_FAILED',
        message: `執行效果失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
      };
    }

    // Phase 8: 重新驗證路徑，確保頁面資料更新（在所有效果執行完成後）
    revalidatePath(`/c/${parsedAttackerIdStr}`);
    revalidatePath(`/c/${resolvedDefenderId}`);

    // Phase 2: 使用統一的通知管理器發送對抗檢定效果事件（選擇目標道具後）
    try {
      // 使用更新後的角色資料獲取技能或道具對象（用於通知）
      let attackerSource: SkillType | ItemType | null = null;
      if (attackerSourceType === 'skill') {
        const attackerSkills = updatedAttacker.skills || [];
        const skillIndex = attackerSkills.findIndex((s: { id: string }) => s.id === sourceId);
        if (skillIndex !== -1) {
          attackerSource = attackerSkills[skillIndex] as SkillType;
        }
      } else {
        const attackerItems = updatedAttacker.items || [];
        const itemIndex = attackerItems.findIndex((i: { id: string }) => i.id === sourceId);
        if (itemIndex !== -1) {
          attackerSource = attackerItems[itemIndex] as ItemType;
        }
      }
      
      // Phase 9: 如果防守方獲勝，從更新後的角色資料獲取防守方使用的技能或道具對象
      let defenderSource: SkillType | ItemType | undefined;
      let defenderSourceTypeForNotification: 'skill' | 'item' | undefined;
      if (isDefenderSelecting && source) {
        // 從更新後的防守方角色資料中查找技能/道具
        if (actualSourceType === 'skill') {
          const defenderSkills = updatedDefender.skills || [];
          const skillIndex = defenderSkills.findIndex((s: { id: string }) => s.id === source.id);
          if (skillIndex !== -1) {
            defenderSource = defenderSkills[skillIndex] as SkillType;
          } else {
            // 如果找不到，使用傳入的 source（可能是因為資料庫更新延遲）
            defenderSource = source;
          }
        } else {
          const defenderItems = updatedDefender.items || [];
          const itemIndex = defenderItems.findIndex((i: { id: string }) => i.id === source.id);
          if (itemIndex !== -1) {
            defenderSource = defenderItems[itemIndex] as ItemType;
          } else {
            // 如果找不到，使用傳入的 source（可能是因為資料庫更新延遲）
            defenderSource = source;
          }
        }
        defenderSourceTypeForNotification = actualSourceType;
      }
      
      if (attackerSource) {
        // Phase 9: 如果攻擊方獲勝，需要查找防守方使用的技能/道具（用於發送防守方失敗通知）
        let defenderSourceForNotification: SkillType | ItemType | undefined = defenderSource;
        let defenderSourceTypeForEffectNotification: 'skill' | 'item' | undefined = defenderSourceTypeForNotification;
        let defenderSkillsForNotification: string[] | undefined;
        let defenderItemsForNotification: string[] | undefined;
        
        if (!isDefenderSelecting && contestResult === 'attacker_wins') {
          // 攻擊方獲勝：需要查找防守方使用的技能/道具
          // 修復：僅當防守方確實回應時才查找，避免使用前一個對抗的值
          // 檢查防守方的技能/道具是否在當前對抗的時間範圍內使用
          const contestStartTime = contestInfo?.timestamp;
          
          // 修復：如果 contestInfo 不存在或 timestamp 為 0/undefined，不應該查找防守方的回應
          // 因為我們無法確定時間範圍，可能會錯誤地包含前一個對抗的值
          if (contestStartTime && contestStartTime > 0) {
            const currentTime = Date.now();
            
            const defenderSkillsData = updatedDefender.skills || [];
            const defenderItemsData = updatedDefender.items || [];
            
            // 查找在當前對抗時間範圍內使用的技能（按 lastUsedAt 排序）
            // 重要：僅包含在對抗開始後、選擇目標道具前使用的技能
            const recentlyUsedSkills = defenderSkillsData
              .filter((s: { lastUsedAt?: Date }) => {
                if (!s.lastUsedAt) return false;
                const usedTime = new Date(s.lastUsedAt).getTime();
                // 僅包含在對抗開始後使用的技能
                return usedTime >= contestStartTime && usedTime <= currentTime;
              })
              .sort((a: { lastUsedAt?: Date }, b: { lastUsedAt?: Date }) => {
                const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
                const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
                return bTime - aTime;
              });
            
            // 查找在當前對抗時間範圍內使用的道具（按 lastUsedAt 排序）
            const recentlyUsedItems = defenderItemsData
              .filter((i: { lastUsedAt?: Date }) => {
                if (!i.lastUsedAt) return false;
                const usedTime = new Date(i.lastUsedAt).getTime();
                // 僅包含在對抗開始後使用的道具
                return usedTime >= contestStartTime && usedTime <= currentTime;
              })
              .sort((a: { lastUsedAt?: Date }, b: { lastUsedAt?: Date }) => {
                const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
                const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
                return bTime - aTime;
              });
            
            // 優先使用技能（如果有的話）
            if (recentlyUsedSkills.length > 0) {
              const mostRecentSkill = recentlyUsedSkills[0] as SkillType;
              defenderSourceForNotification = mostRecentSkill;
              defenderSourceTypeForEffectNotification = 'skill';
              defenderSkillsForNotification = [mostRecentSkill.id];
              defenderItemsForNotification = undefined;
            } else if (recentlyUsedItems.length > 0) {
              const mostRecentItem = recentlyUsedItems[0] as ItemType;
              defenderSourceForNotification = mostRecentItem;
              defenderSourceTypeForEffectNotification = 'item';
              defenderItemsForNotification = [mostRecentItem.id];
              defenderSkillsForNotification = undefined;
            }
            // 如果沒有找到在當前對抗時間範圍內使用的技能/道具，則 defenderSkillsForNotification 和 defenderItemsForNotification 保持為 undefined
          }
          // contestInfo 不存在或 timestamp 無效時，不查找防守方的回應，defenderSkillsForNotification 和 defenderItemsForNotification 保持為 undefined
        } else if (isDefenderSelecting && contestResult === 'defender_wins') {
          // 防守方獲勝：使用傳入的防守方技能/道具信息
          defenderSkillsForNotification = defenderSourceTypeForNotification === 'skill' && defenderSource ? [defenderSource.id] : undefined;
          defenderItemsForNotification = defenderSourceTypeForNotification === 'item' && defenderSource ? [defenderSource.id] : undefined;
        }
        
        // 使用統一的通知管理器發送效果通知
        // 使用更新後的角色資料發送通知
        await ContestNotificationManager.sendContestEffectNotification({
          result: contestResult,
          attacker: updatedAttacker, // 使用更新後的角色資料
          defender: updatedDefender, // 使用更新後的角色資料
          attackerSource,
          attackerSourceType: attackerSourceType, // 使用攻擊方的類型
          defenderSource: defenderSourceForNotification,
          defenderSourceType: defenderSourceTypeForEffectNotification,
          effectsApplied,
          needsTargetItemSelection: false, // 已經選擇完成
          contestId,
          attackerValue: 1, // 必須不為 0，否則會被前端忽略（這是效果通知，對抗檢定已完成）
          defenderValue: 0,
          checkType: contestInfo?.checkType,
          contestConfig: undefined, // 對抗檢定已完成，不需要配置
          // Phase 9: 傳入防守方使用的技能/道具 ID
          // 修復：確保防守方沒有回應時，傳入 undefined 而不是前一個對抗的值
          defenderSkills: defenderSkillsForNotification,
          defenderItems: defenderItemsForNotification,
        });
      }
    } catch (error) {
      console.error('[contest-select-item] Failed to send contest effect notification', error);
    }

    // Phase 8: 清除對抗檢定追蹤
    // 先清除特定 contestId 的對抗檢定
    removeActiveContest(contestId);
    // 同時根據攻擊方和防守方的 ID 清除所有相關的對抗檢定（確保清除完整）
    // 這可以處理 contestId 格式不匹配的情況
    removeContestsByCharacterId(parsedAttackerIdStr);
    removeContestsByCharacterId(resolvedDefenderId);

    const finalEffectMessage = effectsApplied.length > 0 ? effectsApplied.join('、') : '效果已應用';


    return {
      success: true,
      data: {
        success: true,
        effectApplied: finalEffectMessage,
      },
      message: `目標道具選擇成功：${finalEffectMessage}`,
    };
  } catch (error) {
    console.error('Error selecting target item for contest:', error);
    return {
      success: false,
      error: 'SELECT_FAILED',
      message: `無法選擇目標道具：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
