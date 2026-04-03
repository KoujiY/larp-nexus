/**
 * 技能使用 Hook
 * 統一管理技能使用的核心邏輯
 *
 * Phase 6: 提取技能/道具使用邏輯
 */

'use client';

import { useState, useCallback } from 'react';
import { notify } from '@/lib/notify';
import { useSkill as executeSkillAction } from '@/app/actions/skill-use';
import { canUseSkill } from '@/lib/utils/skill-validators';
import type { Skill, SkillEffect } from '@/types/character';

export interface UseSkillUsageOptions {
  characterId: string;
  selectedSkill: Skill | null;
  selectedTargetId: string | undefined;
  selectedTargetItemId: string;
  onSuccess?: (result: {
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
      attackerValue?: number;
      needsTargetItemSelection?: boolean;
      targetCharacterId?: string;
    };
    message?: string;
  }) => void;
  onError?: (error: Error) => void;
  onUpdateLocalSkills?: (skillId: string, updates: { lastUsedAt: Date; usageCount: number }) => void;
  onUpdateSelectedSkill?: (updates: { lastUsedAt: Date; usageCount: number }) => void;
  onClearTargetState?: () => void;
  onRouterRefresh?: () => void;
  /** 使用成功時關閉 dialog（使用者可透過通知面板查看結果） */
  onCloseDialog?: () => void;
  /** 非對抗偷竊/移除：使用成功後需要選擇目標道具 */
  onNeedsTargetItemSelection?: (info: {
    sourceId: string;
    effectType: 'item_steal' | 'item_take';
    targetCharacterId: string;
  }) => void;
}

export interface UseSkillUsageReturn {
  isUsing: boolean;
  checkResult: number | undefined;
  handleUseSkill: () => Promise<void>;
  setCheckResult: (result: number | undefined) => void;
}

/**
 * 技能使用 Hook
 */
export function useSkillUsage(options: UseSkillUsageOptions): UseSkillUsageReturn {
  const {
    characterId,
    selectedSkill,
    selectedTargetId,
    selectedTargetItemId,
    onSuccess,
    onError,
    onUpdateLocalSkills,
    onUpdateSelectedSkill,
    onClearTargetState,
    onRouterRefresh,
    onCloseDialog,
    onNeedsTargetItemSelection,
  } = options;

  const [isUsing, setIsUsing] = useState(false);
  const [checkResult, setCheckResult] = useState<number | undefined>(undefined);

  const handleUseSkill = useCallback(async () => {
    if (!selectedSkill) return;

    const { canUse } = canUseSkill(selectedSkill);
    if (!canUse) {
      return;
    }

    // 檢查是否需要選擇目標角色
    const requiresTarget = selectedSkill.checkType === 'contest' || selectedSkill.checkType === 'random_contest' || selectedSkill.effects?.some((effect: SkillEffect) => effect.requiresTarget);
    if (requiresTarget && !selectedTargetId) {
      notify.error('請先選擇目標角色');
      return;
    }

    // 偷竊/移除道具：不再需要前置確認目標和選擇目標道具
    // 對抗檢定：targetItemId 在對抗結束後選擇
    // 非對抗檢定：targetItemId 在使用成功後選擇（server 回傳 needsTargetItemSelection）
    const isContest = selectedSkill.checkType === 'contest' || selectedSkill.checkType === 'random_contest';

    // 如果是隨機檢定，自動骰骰子
    let finalCheckResult: number | undefined = undefined;
    if (selectedSkill.checkType === 'random' && selectedSkill.randomConfig) {
      finalCheckResult = Math.floor(Math.random() * selectedSkill.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
    }

    // 對抗檢定必須有目標角色
    if (isContest) {
      if (!selectedTargetId) {
        notify.error('對抗檢定需要選擇目標角色');
        return;
      }
    }

    setIsUsing(true);
    try {
      // 對抗檢定和偷竊/移除不傳遞 targetItemId（延遲選擇）
      const targetItemIdForUse = isContest ? undefined : selectedTargetItemId || undefined;
      const result = await executeSkillAction(characterId, selectedSkill.id, finalCheckResult, selectedTargetId, targetItemIdForUse);

      // 處理結果
      if (result.success) {
        // 更新本地技能狀態（反映冷卻時間和使用次數）
        if (onUpdateLocalSkills) {
          onUpdateLocalSkills(selectedSkill.id, {
            lastUsedAt: new Date(),
            usageCount: (selectedSkill.usageCount || 0) + 1,
          });
        }

        // 更新選中的技能狀態
        if (onUpdateSelectedSkill) {
          onUpdateSelectedSkill({
            lastUsedAt: new Date(),
            usageCount: (selectedSkill.usageCount || 0) + 1,
          });
        }

        // 非對抗偷竊/移除：使用成功後需要選擇目標道具
        if (result.data?.needsTargetItemSelection && result.data?.targetCharacterId) {
          if (onClearTargetState) {
            onClearTargetState();
          }
          if (onNeedsTargetItemSelection) {
            const effects = selectedSkill.effects || [];
            const effectType = effects.some((e: SkillEffect) => e.type === 'item_steal') ? 'item_steal' : 'item_take';
            onNeedsTargetItemSelection({
              sourceId: selectedSkill.id,
              effectType: effectType as 'item_steal' | 'item_take',
              targetCharacterId: result.data.targetCharacterId,
            });
          }
          if (onSuccess) {
            onSuccess(result);
          }
          // 不關閉 dialog，不刷新頁面，等待目標道具選擇完成
          return;
        }

        // 如果不是對抗檢定，處理成功結果
        if (!result.data?.contestId) {
          // 清除目標選擇狀態並關閉 dialog（結果透過通知面板呈現）
          if (onClearTargetState) {
            onClearTargetState();
          }
          if (onCloseDialog) {
            onCloseDialog();
          }
        }

        // 調用成功回調（組件可以處理對抗檢定等特殊情況）
        if (onSuccess) {
          onSuccess(result);
        }

        // 重新載入頁面資料
        // Phase 8: 對抗檢定時不立即刷新，等待防守方回應後再刷新（避免 dialog 被關閉）
        if (onRouterRefresh && !result.data?.contestId) {
          onRouterRefresh();
        }
      } else {
        console.error('技能使用失敗:', result);
        notify.error(result.message || '技能使用失敗');
        // 使用失敗清除目標選擇狀態
        if (onClearTargetState) {
          onClearTargetState();
        }

        if (onError) {
          onError(new Error(result.message || '技能使用失敗'));
        }
      }
    } catch (error) {
      console.error('技能使用錯誤:', error);
      const errorMessage = error instanceof Error ? error.message : '技能使用失敗，請稍後再試';
      notify.error(errorMessage);
      // 異常也清除目標選擇狀態
      if (onClearTargetState) {
        onClearTargetState();
      }

      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage));
      }
    } finally {
      setIsUsing(false);
    }
  }, [
    selectedSkill,
    selectedTargetId,
    selectedTargetItemId,
    characterId,
    onSuccess,
    onError,
    onUpdateLocalSkills,
    onUpdateSelectedSkill,
    onClearTargetState,
    onRouterRefresh,
    onNeedsTargetItemSelection,
    onCloseDialog,
  ]);

  return {
    isUsing,
    checkResult,
    handleUseSkill,
    setCheckResult,
  };
}
