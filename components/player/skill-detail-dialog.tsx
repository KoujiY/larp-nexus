'use client';

/**
 * 技能詳情 Bottom Sheet
 *
 * 從底部滑出的彈出式卡片，展示技能完整資訊（檢定資訊、標籤、使用限制、效果），
 * 並提供使用按鈕。
 *
 * 所有互動狀態均由父元件（SkillList）管理，透過 props 傳入。
 */

import { Zap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import type { Skill, SkillEffect } from '@/types/character';
import type { TargetItemInfo } from '@/app/actions/public';
import { getCooldownRemaining } from '@/lib/utils/skill-validators';
import { EffectDisplay } from './effect-display';

import { CheckInfoDisplay } from './check-info-display';
import { BottomSheet } from './bottom-sheet';

export interface SkillDetailDialogProps {
  /** 當前選中的技能；null 表示 Bottom Sheet 關閉 */
  selectedSkill: Skill | null;
  /** Sheet 是否被鎖定（對抗檢定進行中或後續道具選擇中） */
  isDialogLocked: boolean;
  onClose: () => void;

  // ── 檢定 / 使用結果 ──
  checkResult: number | undefined;
  randomContestMaxValue: number;
  /** 角色數值（用於 CheckInfoDisplay 中顯示對抗數值） */
  stats?: Array<{ name: string; value: number }>;
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

  // ── 事件處理 ──
  handleUseSkill: () => void;
  handleConfirmTarget: () => Promise<void>;
  handleCancelTarget: () => void;

  /** 是否為唯讀模式 */
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
  handleUseSkill,
  handleConfirmTarget,
  handleCancelTarget,
  isReadOnly,
  canUseSkill,
}: SkillDetailDialogProps) {
  if (!selectedSkill) return null;

  const cooldownRemaining = getCooldownRemaining(selectedSkill);
  const { canUse, reason: cantUseReason } = canUseSkill(selectedSkill);
  const hasTargets = targetCharacters.length > 0 || isLoadingTargets;

  // 使用按鈕標籤
  const useButtonLabel = isUsing
    ? '使用中...'
    : isContestInProgress
      ? '等待對抗結果...'
      : requiresTarget && !selectedTargetId
        ? '請選擇目標角色'
        : !canUse && cantUseReason
          ? `使用技能 (${cantUseReason})`
          : '使用技能';

  const noTargetSelected = hasTargets && !selectedTargetId;

  const isUseDisabled =
    !canUse ||
    isUsing ||
    noTargetSelected ||
    (requiresTarget && !selectedTargetId) ||
    isDialogLocked;

  // ── Footer：目標下拉 + 使用按鈕 ──
  const footer = (
    <div className="flex flex-col gap-3 max-w-md mx-auto">
      {/* 目標角色下拉選單 */}
      {hasTargets && (
        <div className="relative">
          <label className="absolute -top-2 left-3 px-1 bg-popover text-[9px] font-bold text-primary uppercase tracking-tighter rounded z-10 border border-primary/20">
            目標選擇
          </label>
          <Select
            value={selectedTargetId ?? '__none__'}
            onValueChange={(val) =>
              setSelectedTargetId(val === '__none__' ? undefined : val)
            }
            disabled={
              isReadOnly ||
              isLoadingTargets ||
              isTargetConfirmed ||
              isContestInProgress ||
              isDialogLocked
            }
          >
            <SelectTrigger className="w-full bg-popover border border-primary/20 text-xs rounded-xl h-auto py-3 px-4 focus-visible:border-primary/50 focus-visible:ring-0 focus-visible:ring-offset-0 [&>span]:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-70 bg-popover border-primary/20 rounded-xl">
              <SelectItem
                value="__none__"
                className="text-xs text-muted-foreground italic focus:bg-primary/10 focus:text-muted-foreground"
              >
                {isLoadingTargets ? '載入中...' : '— 請選擇目標角色 —'}
              </SelectItem>
              {targetCharacters.map((t) => (
                <SelectItem
                  key={t.id}
                  value={t.id}
                  className="text-xs focus:bg-primary/10 focus:text-primary"
                >
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 使用技能按鈕 */}
      <button
        className="w-full py-4 rounded-xl bg-linear-to-br from-primary to-primary/80 text-primary-foreground font-black text-sm tracking-widest uppercase shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleUseSkill}
        disabled={isReadOnly || isUseDisabled}
      >
        <Zap className="h-5 w-5" />
        {isReadOnly ? '預覽模式' : useButtonLabel}
      </button>
    </div>
  );

  return (
    <BottomSheet
      open={!!selectedSkill}
      onClose={onClose}
      locked={isDialogLocked}
      ariaLabel={selectedSkill.name}
      footer={footer}
      contentClassName="px-6 pt-2 pb-6"
    >
      {/* 技能圖示（圓形） */}
      <div className="relative w-24 h-24 mx-auto mb-4">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
        <div
          className="relative z-10 w-full h-full rounded-full overflow-hidden border border-primary/30 bg-background"
          style={{ boxShadow: '0 0 40px -10px rgba(254,197,106,0.35)' }}
        >
          {selectedSkill.imageUrl ? (
            <Image
              src={selectedSkill.imageUrl}
              alt={selectedSkill.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Zap className="h-10 w-10 text-primary/40" />
            </div>
          )}
        </div>
      </div>

      {/* 名稱 + 描述 + 標籤 */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-primary mb-2">
          {selectedSkill.name}
        </h2>
        {selectedSkill.description && (
          <p className="text-muted-foreground text-xs leading-relaxed mb-4 px-4 max-w-md mx-auto">
            {selectedSkill.description}
          </p>
        )}
        {selectedSkill.tags && selectedSkill.tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {selectedSkill.tags.map((tag, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-card text-muted-foreground text-[10px] font-bold uppercase tracking-widest rounded-full border border-primary/20"
              >
                {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 效果列表 */}
      {selectedSkill.effects && selectedSkill.effects.length > 0 && (
        <div className="space-y-3 mb-8">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1 mb-2">
            技能效果
          </h3>
          {selectedSkill.effects.map((effect: SkillEffect, index: number) => (
            <div
              key={index}
              className="p-4 rounded-r-xl bg-surface-base/40 border-l-2 border-primary/60"
            >
              <EffectDisplay
                effect={effect}
                targetOptions={[]}
                selectedTargetId={undefined}
                onTargetChange={() => {}}
                className="bg-transparent p-0"
                disabled={true}
              />
            </div>
          ))}
        </div>
      )}

      {/* 檢定資訊 */}
      {selectedSkill.checkType !== 'none' && (
        <div className="mb-8">
          <CheckInfoDisplay
            checkType={selectedSkill.checkType}
            contestConfig={selectedSkill.contestConfig}
            randomConfig={selectedSkill.randomConfig}
            stats={stats}
            checkResult={checkResult}
            randomContestMaxValue={randomContestMaxValue}
          />
        </div>
      )}

      {/* 使用限制（剩餘次數 / 冷卻時間） */}
      {(selectedSkill.usageLimit != null || selectedSkill.cooldown != null) && (
        <div className="grid grid-cols-2 gap-3 mb-8">
          {selectedSkill.usageLimit != null && (
            <div className="p-3 rounded-2xl bg-card/30 border border-border/10 flex flex-col items-center">
              <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                剩餘 / 總次數
              </span>
              <span className="text-xs font-bold text-foreground">
                {selectedSkill.usageLimit > 0
                  ? `${selectedSkill.usageLimit - (selectedSkill.usageCount || 0)} / ${selectedSkill.usageLimit}`
                  : '無限制'}
              </span>
            </div>
          )}
          {selectedSkill.cooldown != null && (
            <div className="p-3 rounded-2xl bg-card/30 border border-border/10 flex flex-col items-center">
              <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                冷卻時間
              </span>
              <span className="text-xs font-bold text-foreground">
                {selectedSkill.cooldown > 0
                  ? `${selectedSkill.cooldown}s${cooldownRemaining !== null ? ` (剩餘 ${cooldownRemaining}s)` : ''}`
                  : '無'}
              </span>
            </div>
          )}
        </div>
      )}

    </BottomSheet>
  );
}
