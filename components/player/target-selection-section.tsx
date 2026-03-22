/**
 * 目標選擇區塊組件
 * 統一處理技能/道具的目標選擇 UI
 *
 * Phase 7: 拆分 Dialog 組件
 *
 * 注意：偷竊/移除道具的目標道具選擇已改為延遲模式：
 * - 對抗檢定：由 TargetItemSelectionSection 在對抗結束後處理
 * - 非對抗檢定：由 usePostUseTargetItemSelection 在使用成功後處理
 * 此組件目前不再渲染任何 UI，保留以維持向後相容性。
 */

'use client';

import type { SkillEffect, ItemEffect } from '@/types/character';

export interface TargetSelectionSectionProps {
  requiresTarget: boolean;
  checkType: 'none' | 'contest' | 'random' | 'random_contest';
  effect: SkillEffect | ItemEffect | null;
  selectedTargetId: string | undefined;
  setSelectedTargetId: (id: string | undefined) => void;
  targetOptions: Array<{ id: string; name: string }>;
  isLoadingTargets: boolean;
  isTargetConfirmed: boolean;
  setIsTargetConfirmed: (confirmed: boolean) => void;
  targetItems: Array<{ id: string; name: string; quantity: number }>;
  selectedTargetItemId: string;
  setSelectedTargetItemId: (id: string) => void;
  isLoadingTargetItems: boolean;
  onConfirmTarget: () => Promise<void>;
  onCancelTarget: () => void;
  onTargetChange?: (targetId: string | undefined) => void;
  disabled?: boolean;
}

/**
 * 目標選擇區塊組件（已簡化）
 * 偷竊/移除道具的目標道具選擇已改為使用後延遲選擇模式
 */
export function TargetSelectionSection(_props: TargetSelectionSectionProps) {
  return null;
}
