/**
 * 技能使用 Hook
 * 統一管理技能使用的核心邏輯
 * 
 * Phase 6: 提取技能/道具使用邏輯
 */

'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useSkill as executeSkillAction } from '@/app/actions/skill-use';
import { canUseSkill } from '@/lib/utils/skill-validators';
import type { Skill, SkillEffect } from '@/types/character';

export interface UseSkillUsageOptions {
  characterId: string;
  selectedSkill: Skill | null;
  selectedTargetId: string | undefined;
  selectedTargetItemId: string;
  isTargetConfirmed: boolean;
  onSuccess?: (result: {
    success: boolean;
    data?: {
      contestId?: string;
      checkPassed?: boolean;
      checkResult?: number;
    };
    message?: string;
  }) => void;
  onError?: (error: Error) => void;
  onUpdateLocalSkills?: (skillId: string, updates: { lastUsedAt: Date; usageCount: number }) => void;
  onUpdateSelectedSkill?: (updates: { lastUsedAt: Date; usageCount: number }) => void;
  onClearTargetState?: () => void;
  onRouterRefresh?: () => void;
}

export interface UseSkillUsageReturn {
  isUsing: boolean;
  checkResult: number | undefined;
  useResult: { success: boolean; message: string } | null;
  handleUseSkill: () => Promise<void>;
  setUseResult: (result: { success: boolean; message: string } | null) => void;
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
    isTargetConfirmed,
    onSuccess,
    onError,
    onUpdateLocalSkills,
    onUpdateSelectedSkill,
    onClearTargetState,
    onRouterRefresh,
  } = options;

  const [isUsing, setIsUsing] = useState(false);
  const [checkResult, setCheckResult] = useState<number | undefined>(undefined);
  const [useResult, setUseResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleUseSkill = useCallback(async () => {
    if (!selectedSkill) return;
    
    const { canUse } = canUseSkill(selectedSkill);
    if (!canUse) {
      return;
    }

    // 檢查是否需要選擇目標角色
    const requiresTarget = selectedSkill.checkType === 'contest' || selectedSkill.checkType === 'random_contest' || selectedSkill.effects?.some((effect: SkillEffect) => effect.requiresTarget);
    if (requiresTarget && !selectedTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }

    // 檢查是否需要確認目標角色和選擇目標道具
    // 注意：對抗檢定時，不需要在初始使用時選擇目標道具
    const effect = selectedSkill.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
    const isContest = selectedSkill.checkType === 'contest' || selectedSkill.checkType === 'random_contest';

    // 非對抗檢定時，才需要確認目標角色和選擇目標道具
    if (effect && !isContest) {
      if (selectedTargetId && !isTargetConfirmed) {
        toast.error('請先確認目標角色');
        return;
      }

      if (!selectedTargetItemId) {
        toast.error('請選擇目標道具');
        return;
      }
    }

    // 如果是隨機檢定，自動骰骰子
    let finalCheckResult: number | undefined = undefined;
    if (selectedSkill.checkType === 'random' && selectedSkill.randomConfig) {
      // 自動生成 1 到 maxValue 之間的隨機數
      finalCheckResult = Math.floor(Math.random() * selectedSkill.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
      toast.info(`骰出結果：${finalCheckResult}`);
    }

    // 對抗檢定必須有目標角色
    if (selectedSkill.checkType === 'contest' || selectedSkill.checkType === 'random_contest') {
      if (!selectedTargetId) {
        toast.error('對抗檢定需要選擇目標角色');
        return;
      }
    }

    setIsUsing(true);
    try {
      const result = await executeSkillAction(characterId, selectedSkill.id, finalCheckResult, selectedTargetId, selectedTargetItemId || undefined);
      
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
        
        // 如果不是對抗檢定，處理成功結果
        if (!result.data?.contestId) {
          if (result.data?.checkPassed === false) {
            setUseResult({ success: false, message: '檢定失敗，技能未生效' });
            toast.warning('檢定失敗，技能未生效');
          } else {
            setUseResult({ success: true, message: result.message || '技能使用成功' });
            toast.success(result.message || '技能使用成功');
            // 技能使用成功後，清除目標選擇狀態
            if (onClearTargetState) {
              onClearTargetState();
            }
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
        setUseResult({ success: false, message: result.message || '技能使用失敗' });
        toast.error(result.message || '技能使用失敗');
        
        if (onError) {
          onError(new Error(result.message || '技能使用失敗'));
        }
      }
    } catch (error) {
      console.error('技能使用錯誤:', error);
      const errorMessage = error instanceof Error ? error.message : '技能使用失敗，請稍後再試';
      setUseResult({ success: false, message: errorMessage });
      toast.error(errorMessage);
      
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
    isTargetConfirmed,
    characterId,
    onSuccess,
    onError,
    onUpdateLocalSkills,
    onUpdateSelectedSkill,
    onClearTargetState,
    onRouterRefresh,
  ]);

  return {
    isUsing,
    checkResult,
    useResult,
    handleUseSkill,
    setUseResult,
    setCheckResult,
  };
}

