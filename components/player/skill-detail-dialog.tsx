'use client';

/**
 * 技能詳情 Dialog
 *
 * 顯示技能完整資訊（檢定資訊、標籤、使用限制、效果），
 * 並提供使用按鈕。
 *
 * 所有互動狀態均由父元件（SkillList）管理，透過 props 傳入。
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap } from 'lucide-react';
import type { Skill, SkillEffect } from '@/types/character';
import type { TargetItemInfo } from '@/app/actions/public';
import type { UsePostUseTargetItemSelectionReturn } from '@/hooks/use-post-use-target-item-selection';
import { getCooldownRemaining } from '@/lib/utils/skill-validators';
import { EffectDisplay } from './effect-display';
import { UseResultDisplay } from './use-result-display';
import { CheckInfoDisplay } from './check-info-display';
import { TargetSelectionSection } from './target-selection-section';

export interface SkillDetailDialogProps {
  /** 當前選中的技能；null 表示 Dialog 關閉 */
  selectedSkill: Skill | null;
  /** Dialog 是否被鎖定（對抗檢定進行中或後續道具選擇中） */
  isDialogLocked: boolean;
  onClose: () => void;

  // ── 檢定 / 使用結果 ──
  checkResult: number | undefined;
  randomContestMaxValue: number;
  /** 角色數值（用於 CheckInfoDisplay 中顯示對抗數值） */
  stats?: Array<{ name: string; value: number }>;
  useResult: { success: boolean; message: string } | null;
  isUsing: boolean;

  // ── 目標選擇 ──
  targetCharacters: Array<{ id: string; name: string }>;
  selectedTargetId: string | undefined;
  setSelectedTargetId: (id: string | undefined) => void;
  isLoadingTargets: boolean;
  isTargetConfirmed: boolean;
  setIsTargetConfirmed: (v: boolean) => void;
  targetItems: TargetItemInfo[];
  selectedTargetItemId: string;
  setSelectedTargetItemId: (id: string) => void;
  isLoadingTargetItems: boolean;

  // ── 衍生狀態 ──
  requiresTarget: boolean;
  isContestInProgress: boolean;
  isPostUseSelecting: boolean;

  // ── 事件處理 ──
  handleUseSkill: () => void;
  handleConfirmTarget: () => Promise<void>;
  handleCancelTarget: () => void;

  /** 非對抗偷竊/移除後的目標道具選擇流程 */
  postUseSelection: UsePostUseTargetItemSelectionReturn;

  /** 是否為唯讀模式（隱藏使用按鈕） */
  isReadOnly: boolean;
  /** 確認技能是否可使用 */
  canUseSkill: (skill: Skill) => { canUse: boolean; reason?: string };
}

export function SkillDetailDialog({
  selectedSkill,
  isDialogLocked,
  onClose,
  checkResult,
  randomContestMaxValue,
  stats = [],
  useResult,
  isUsing,
  targetCharacters,
  selectedTargetId,
  setSelectedTargetId,
  isLoadingTargets,
  isTargetConfirmed,
  setIsTargetConfirmed,
  targetItems,
  selectedTargetItemId,
  setSelectedTargetItemId,
  isLoadingTargetItems,
  requiresTarget,
  isContestInProgress,
  isPostUseSelecting,
  handleUseSkill,
  handleConfirmTarget,
  handleCancelTarget,
  postUseSelection,
  isReadOnly,
  canUseSkill,
}: SkillDetailDialogProps) {
  return (
    <Dialog
      open={!!selectedSkill}
      onOpenChange={(open) => {
        if (!open && !isDialogLocked) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-lg"
        showCloseButton={!isDialogLocked}
        onInteractOutside={(e) => {
          if (isDialogLocked) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isDialogLocked) e.preventDefault();
        }}
      >
        {selectedSkill && (
          <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {selectedSkill.name}
            </DialogTitle>
            <DialogDescription>
              {selectedSkill.description || '尚無描述'}
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const selectedCooldownRemaining = getCooldownRemaining(selectedSkill);
            return (
              <div className="space-y-4">
                {/* 檢定資訊 */}
                <CheckInfoDisplay
                  checkType={selectedSkill.checkType}
                  contestConfig={selectedSkill.contestConfig}
                  randomConfig={selectedSkill.randomConfig}
                  stats={stats}
                  checkResult={checkResult}
                  randomContestMaxValue={randomContestMaxValue}
                />

                {/* 標籤顯示 */}
                {selectedSkill.tags && selectedSkill.tags.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">標籤</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedSkill.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag === 'combat'
                            ? '戰鬥'
                            : tag === 'stealth'
                              ? '隱匿'
                              : tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 使用限制 */}
                {(selectedSkill.usageLimit != null ||
                  selectedSkill.cooldown != null) && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">使用限制</h4>
                    <div className="space-y-1 text-sm">
                      {selectedSkill.usageLimit != null && (
                        <p>
                          {selectedSkill.usageLimit > 0
                            ? `使用次數：${selectedSkill.usageCount || 0} / ${selectedSkill.usageLimit}`
                            : '使用次數：無限制'}
                        </p>
                      )}
                      {selectedSkill.cooldown != null && (
                        <p>
                          {selectedSkill.cooldown > 0
                            ? `冷卻時間：${selectedSkill.cooldown} 秒${selectedCooldownRemaining !== null ? ` (剩餘 ${selectedCooldownRemaining}s)` : ''}`
                            : '冷卻時間：無冷卻時間'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 效果列表 */}
                {selectedSkill.effects && selectedSkill.effects.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">技能效果</h4>
                    <div className="space-y-2">
                      {selectedSkill.effects.map((effect: SkillEffect, index: number) => (
                        <div key={index}>
                          <EffectDisplay
                            effect={effect}
                            targetOptions={
                              effect.requiresTarget ? targetCharacters : []
                            }
                            selectedTargetId={selectedTargetId}
                            onTargetChange={(targetId) => {
                              setIsTargetConfirmed(false);
                              setSelectedTargetItemId('');
                              setSelectedTargetId(targetId);
                            }}
                            disabled={isTargetConfirmed || isContestInProgress}
                          />

                          {/* 目標確認與目標道具選擇 */}
                          {effect.requiresTarget && (
                            <TargetSelectionSection
                              requiresTarget={true}
                              checkType={selectedSkill.checkType}
                              effect={effect}
                              selectedTargetId={selectedTargetId}
                              setSelectedTargetId={setSelectedTargetId}
                              targetOptions={targetCharacters}
                              isLoadingTargets={isLoadingTargets}
                              isTargetConfirmed={isTargetConfirmed}
                              setIsTargetConfirmed={setIsTargetConfirmed}
                              targetItems={targetItems}
                              selectedTargetItemId={selectedTargetItemId}
                              setSelectedTargetItemId={setSelectedTargetItemId}
                              isLoadingTargetItems={isLoadingTargetItems}
                              onConfirmTarget={handleConfirmTarget}
                              onCancelTarget={handleCancelTarget}
                              disabled={isTargetConfirmed || isContestInProgress}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 使用結果訊息 */}
                <UseResultDisplay result={useResult} />

                {/* 非對抗偷竊/移除：使用成功後的目標道具選擇 UI */}
                {postUseSelection.selectionState?.sourceId ===
                  selectedSkill?.id && (
                  <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                    <h4 className="font-semibold text-sm">
                      選擇要
                      {postUseSelection.selectionState.effectType === 'item_steal'
                        ? '偷竊'
                        : '移除'}
                      的道具
                    </h4>
                    <div className="space-y-2">
                      {postUseSelection.isLoadingTargetItems ? (
                        <p className="text-sm text-muted-foreground">
                          載入目標道具中...
                        </p>
                      ) : postUseSelection.targetItems.length > 0 ? (
                        <>
                          <Select
                            value={postUseSelection.selectedTargetItemId}
                            onValueChange={
                              postUseSelection.setSelectedTargetItemId
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={`選擇要${postUseSelection.selectionState.effectType === 'item_steal' ? '偷竊' : '移除'}的道具...`}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {postUseSelection.targetItems.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={postUseSelection.confirmSelection}
                            disabled={
                              !postUseSelection.selectedTargetItemId ||
                              postUseSelection.isSubmitting
                            }
                            className="w-full"
                          >
                            {postUseSelection.isSubmitting
                              ? '處理中...'
                              : '確認選擇'}
                          </Button>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            目標角色沒有道具
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={postUseSelection.confirmSelection}
                            disabled={postUseSelection.isSubmitting}
                            className="w-full"
                          >
                            {postUseSelection.isSubmitting ? '處理中...' : '確認'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!isDialogLocked) {
                  onClose();
                }
              }}
              disabled={isDialogLocked}
            >
              關閉
            </Button>
            {/* 唯讀模式下隱藏使用技能按鈕 */}
            {!isReadOnly && (
              <Button
                onClick={handleUseSkill}
                disabled={
                  !selectedSkill ||
                  isUsing ||
                  isDialogLocked ||
                  (requiresTarget && !selectedTargetId) ||
                  !canUseSkill(selectedSkill).canUse
                }
              >
                {isUsing
                  ? '使用中...'
                  : isContestInProgress
                    ? '等待對抗檢定結果...'
                    : isPostUseSelecting
                      ? '請選擇目標道具...'
                      : requiresTarget && !selectedTargetId
                        ? '請選擇目標角色'
                        : (() => {
                            const { canUse, reason } = canUseSkill(selectedSkill);
                            if (!canUse && reason) return `使用技能 (${reason})`;
                            return '使用技能';
                          })()}
              </Button>
            )}
          </DialogFooter>
          </>
        )}
        </DialogContent>
      </Dialog>
  );
}
