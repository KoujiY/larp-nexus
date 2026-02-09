/**
 * 目標選擇區塊組件
 * 統一處理技能/道具的目標選擇 UI
 * 
 * Phase 7: 拆分 Dialog 組件
 */

'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
 * 目標選擇區塊組件
 * 處理目標角色選擇、確認和目標道具選擇
 */
export function TargetSelectionSection({
  requiresTarget,
  checkType,
  effect,
  selectedTargetId,
  targetOptions,
  isTargetConfirmed,
  targetItems,
  selectedTargetItemId,
  setSelectedTargetItemId,
  isLoadingTargetItems,
  onConfirmTarget,
  onCancelTarget,
  disabled = false,
}: TargetSelectionSectionProps) {
  // 如果不需要目標，不顯示任何內容
  if (!requiresTarget || !effect) {
    return null;
  }

  const needsTargetItem = effect.type === 'item_take' || effect.type === 'item_steal';
  const isContest = checkType === 'contest' || checkType === 'random_contest';

  // 對抗檢定時，不顯示目標道具選擇 UI（將在判定結束後選擇）
  if (needsTargetItem && !isContest) {
    return (
      <div className="mt-3 space-y-3">
        {/* 目標角色確認 */}
        {selectedTargetId && !isTargetConfirmed && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">
              已選擇目標角色：{targetOptions.find(t => t.id === selectedTargetId)?.name || '未知'}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onConfirmTarget}
                disabled={isLoadingTargetItems || disabled}
                className="flex-1"
              >
                {isLoadingTargetItems ? '載入中...' : '確認目標'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancelTarget}
                disabled={isLoadingTargetItems || disabled}
              >
                取消
              </Button>
            </div>
          </div>
        )}
        
        {/* 目標道具選擇 */}
        {isTargetConfirmed && targetItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              選擇目標道具：
            </p>
            <Select 
              value={selectedTargetItemId} 
              onValueChange={setSelectedTargetItemId}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`選擇要${effect.type === 'item_steal' ? '偷竊' : '移除'}的道具...`} />
              </SelectTrigger>
              <SelectContent>
                {targetItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {/* 目標角色沒有道具 */}
        {isTargetConfirmed && targetItems.length === 0 && (
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm text-yellow-800">
              目標角色沒有道具
            </p>
          </div>
        )}
      </div>
    );
  }

  // 如果不需要目標道具，返回 null（EffectDisplay 會在外部處理）
  return null;
}

