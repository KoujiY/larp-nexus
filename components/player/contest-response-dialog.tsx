'use client';

/**
 * 防守方對抗檢定回應 Dialog
 *
 * 居中固定 Dialog（非 Bottom Sheet），不可關閉。
 * 防守方在此查看攻擊方數值、選擇道具或技能回應。
 *
 * 視覺語言對齊 Ethereal Manuscript 風格。
 * 設計決策：道具與技能為互斥選擇（只能選其中一類回應）。
 */

import { useState, useEffect } from 'react';
import { Shield, ChevronUp, Info, Lock, SearchX, Package, Sparkles } from 'lucide-react';
import type { SkillContestEvent } from '@/types/event';
import { respondToContest } from '@/app/actions/contest-respond';
import { notify } from '@/lib/notify';
import type { Item, Skill } from '@/types/character';
import { getItemEffects } from '@/lib/item/get-item-effects';

interface ContestResponseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contestEvent: SkillContestEvent['payload'] | null;
  characterId: string;
  items?: Item[];
  skills?: Skill[];
  contestId: string;
  onResponded: () => void;
}

export function ContestResponseDialog({
  open,
  onOpenChange,
  contestEvent,
  characterId,
  items = [],
  skills = [],
  contestId,
  onResponded,
}: ContestResponseDialogProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // 當 dialog 打開時重置選擇
  useEffect(() => {
    if (open) {
      setSelectedItems([]);
      setSelectedSkills([]);
      setExpandedCards(new Set());
    }
  }, [open]);

  // 鎖定背景滾動
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || !contestEvent) return null;

  const { attackerValue, defenderValue } = contestEvent;
  const showAttackerValue = attackerValue !== 0;
  const attackerDisplayName = contestEvent.sourceHasStealthTag
    ? '有人'
    : (contestEvent.attackerName || '有人');

  const attackerCheckType = contestEvent.checkType || 'contest';
  const attackerRelatedStat = contestEvent.relatedStat;
  const attackerHasCombatTag = contestEvent.attackerHasCombatTag ?? false;

  // ── 過濾可用道具 ─────────────────────────────────────────────
  const availableItems = items.filter((item) => {
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      if (Date.now() - lastUsed < item.cooldown * 1000) return false;
    }
    if (item.usageLimit && item.usageLimit > 0 && (item.usageCount || 0) >= item.usageLimit) return false;
    if (item.type === 'consumable' && item.quantity <= 0) return false;
    if (attackerHasCombatTag && (!item.tags || !item.tags.includes('combat'))) return false;
    if (item.checkType !== attackerCheckType) return false;
    if (attackerCheckType === 'contest' && attackerRelatedStat) {
      if (item.contestConfig?.relatedStat !== attackerRelatedStat) return false;
    }
    return true;
  });

  // ── 過濾可用技能 ─────────────────────────────────────────────
  const availableSkills = skills.filter((skill) => {
    if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
      const lastUsed = new Date(skill.lastUsedAt).getTime();
      if (Date.now() - lastUsed < skill.cooldown * 1000) return false;
    }
    if (skill.usageLimit && skill.usageLimit > 0 && (skill.usageCount || 0) >= skill.usageLimit) return false;
    if (attackerHasCombatTag && (!skill.tags || !skill.tags.includes('combat'))) return false;
    if (skill.checkType !== attackerCheckType) return false;
    if (attackerCheckType === 'contest' && attackerRelatedStat) {
      if (skill.contestConfig?.relatedStat !== attackerRelatedStat) return false;
    }
    return true;
  });

  const maxItems = contestEvent.opponentMaxItems ?? 0;
  const maxSkills = contestEvent.opponentMaxSkills ?? 0;

  // ── 互斥選擇：選了道具就清空技能，反之亦然 ─────────────────
  const handleItemToggle = (itemId: string) => {
    setSelectedItems((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      }
      if (prev.length < maxItems) {
        // 選擇道具時清空技能
        setSelectedSkills([]);
        return [...prev, itemId];
      }
      notify.warning(`最多只能選擇 ${maxItems} 個道具`);
      return prev;
    });
  };

  const handleSkillToggle = (skillId: string) => {
    setSelectedSkills((prev) => {
      if (prev.includes(skillId)) {
        return prev.filter((id) => id !== skillId);
      }
      if (prev.length < maxSkills) {
        // 選擇技能時清空道具
        setSelectedItems([]);
        return [...prev, skillId];
      }
      notify.warning(`最多只能選擇 ${maxSkills} 個技能`);
      return prev;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRespond = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isResponding) return;
    if (!contestId) {
      notify.error('對抗請求 ID 無效');
      return;
    }

    const finalContestId = contestEvent?.contestId || contestId;

    setIsResponding(true);
    try {
      const result = await respondToContest(
        finalContestId,
        characterId,
        selectedItems.length > 0 ? selectedItems : undefined,
        selectedSkills.length > 0 ? selectedSkills : undefined,
        contestEvent.targetItemId,
      );

      if (result.success) {
        onResponded();
        onOpenChange(false);
      } else {
        notify.error(result.message || '回應失敗');
      }
    } catch (error) {
      console.error('回應對抗檢定錯誤:', error);
      notify.error('回應失敗，請稍後再試');
    } finally {
      setIsResponding(false);
    }
  };

  // ── 按鈕文案 ─────────────────────────────────────────────────
  const hasSelection = selectedItems.length > 0 || selectedSkills.length > 0;
  const buttonLabel = isResponding
    ? '回應中...'
    : hasSelection
      ? '確認回應'
      : '使用基礎數值回應';

  // ── 檢定類型文案 ─────────────────────────────────────────────
  const checkTypeLabel = (() => {
    if (attackerCheckType === 'random_contest') {
      return `隨機對抗 D${contestEvent.randomContestMaxValue || 100}`;
    }
    if (attackerCheckType === 'contest' && attackerRelatedStat) {
      return `${attackerRelatedStat} 對抗`;
    }
    return '對抗檢定';
  })();

  const itemsAllowed = maxItems > 0;
  const skillsAllowed = maxSkills > 0;
  const showItemSection = itemsAllowed && availableItems.length > 0;
  const showSkillSection = skillsAllowed && availableSkills.length > 0;
  const noResourcesAvailable = !showItemSection && !showSkillSection;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Dialog 容器 */}
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden bg-background/94 backdrop-blur-[28px]"
        style={{ boxShadow: '0 0 30px rgba(254,197,106,0.12)' }}
        role="dialog"
        aria-modal="true"
        aria-label="對抗檢定"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="px-6 pt-6 pb-4 flex flex-col gap-1 shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              對抗檢定
            </h1>
          </div>
          <p className="text-primary/60 text-sm font-medium">
            {attackerDisplayName} 對你使用了技能或道具
          </p>
        </header>

        {/* ── 可滾動主內容 ────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-6 pb-28 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="space-y-8">
            {/* ── 數值對比 Grid ────────────────────────────────── */}
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {/* 攻擊方數值 */}
                <div className="rounded-xl p-4 flex flex-col items-center justify-center bg-card/20 border border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    攻擊方
                  </span>
                  <span className={`text-4xl font-extrabold tracking-tighter ${showAttackerValue ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                    {showAttackerValue ? attackerValue : '???'}
                  </span>
                </div>
                {/* 防守方數值（自己：高亮） */}
                <div
                  className="rounded-xl p-4 flex flex-col items-center justify-center bg-card/30 border border-primary/20"
                  style={{ boxShadow: '0 0 25px rgba(254,197,106,0.15)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                    {attackerCheckType === 'random_contest' ? '骰子上限' : '你的數值'}
                  </span>
                  <span className="text-4xl font-extrabold tracking-tighter text-primary">
                    {attackerCheckType === 'random_contest'
                      ? `D${contestEvent.randomContestMaxValue || 100}`
                      : defenderValue}
                  </span>
                </div>
              </div>
              {/* 檢定類型 chip */}
              <div className="text-center">
                <span className="inline-block text-xs font-semibold text-primary/50 py-1 px-3 bg-white/5 rounded-full">
                  檢定類型：{checkTypeLabel}
                </span>
              </div>
            </section>

            {/* ── 道具選擇區 ──────────────────────────────────── */}
            {showItemSection && (
              <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    選擇道具
                    <span className="text-xs font-normal text-muted-foreground">
                      (選擇 1 個)
                    </span>
                  </h2>
                </div>
                <div className="space-y-3">
                  {availableItems.map((item) => {
                    const isSelected = selectedItems.includes(item.id);
                    const isExpanded = expandedCards.has(`item-${item.id}`);
                    const isDisabledBySkill = selectedSkills.length > 0;
                    const isDisabledBySameType = !isSelected && selectedItems.length > 0;
                    const isDisabled = isDisabledBySkill || isDisabledBySameType;
                    const effects = getItemEffects(item);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl p-4 transition-all overflow-hidden ${
                          isSelected
                            ? 'bg-gradient-to-tr from-primary/15 to-primary/5 border border-primary/40'
                            : isDisabled
                              ? 'bg-card/10 border border-border/5 opacity-40'
                              : 'bg-card/20 border border-border/10 hover:bg-card/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={`flex items-center gap-4 flex-1 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            onClick={() => !isDisabled && handleItemToggle(item.id)}
                          >
                            {/* Checkbox */}
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-muted-foreground/20'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <span className="text-foreground font-bold text-sm">
                              {item.name}
                            </span>
                          </div>
                          {/* 展開/收起按鈕 */}
                          {effects.length > 0 && (
                            <button
                              type="button"
                              className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
                                isExpanded
                                  ? 'text-primary'
                                  : 'text-muted-foreground hover:text-primary'
                              }`}
                              onClick={() => toggleExpanded(`item-${item.id}`)}
                            >
                              <span>{isExpanded ? '收起' : '詳情'}</span>
                              {isExpanded
                                ? <ChevronUp className="w-3 h-3" />
                                : <Info className="w-3 h-3" />
                              }
                            </button>
                          )}
                        </div>
                        {/* 效果展開面板 */}
                        {isExpanded && effects.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-primary/10 space-y-2">
                            {effects.map((eff, i) => {
                              const desc = formatEffectDescription(eff);
                              if (!desc) return null;
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs text-primary/90">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                                  {desc}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── 技能選擇區 ──────────────────────────────────── */}
            {showSkillSection && (
              <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                    選擇技能
                    <span className="text-xs font-normal text-muted-foreground">
                      (選擇 1 個)
                    </span>
                  </h2>
                </div>
                <div className="space-y-3">
                  {availableSkills.map((skill) => {
                    const isSelected = selectedSkills.includes(skill.id);
                    const isExpanded = expandedCards.has(`skill-${skill.id}`);
                    const isDisabledByItem = selectedItems.length > 0;
                    const isDisabledBySameType = !isSelected && selectedSkills.length > 0;
                    const isDisabled = isDisabledByItem || isDisabledBySameType;

                    return (
                      <div
                        key={skill.id}
                        className={`rounded-xl p-4 transition-all overflow-hidden ${
                          isSelected
                            ? 'bg-gradient-to-tr from-primary/15 to-primary/5 border border-primary/40'
                            : isDisabled
                              ? 'bg-card/10 border border-border/5 opacity-40'
                              : 'bg-card/20 border border-border/10 hover:bg-card/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={`flex items-center gap-4 flex-1 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            onClick={() => !isDisabled && handleSkillToggle(skill.id)}
                          >
                            {/* Checkbox */}
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-muted-foreground/20'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <span className="text-foreground font-bold text-sm">
                              {skill.name}
                            </span>
                          </div>
                          {/* 展開/收起按鈕 */}
                          {skill.effects && skill.effects.length > 0 && (
                            <button
                              type="button"
                              className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
                                isExpanded
                                  ? 'text-primary'
                                  : 'text-muted-foreground hover:text-primary'
                              }`}
                              onClick={() => toggleExpanded(`skill-${skill.id}`)}
                            >
                              <span>{isExpanded ? '收起' : '詳情'}</span>
                              {isExpanded
                                ? <ChevronUp className="w-3 h-3" />
                                : <Info className="w-3 h-3" />
                              }
                            </button>
                          )}
                        </div>
                        {/* 效果展開面板 */}
                        {isExpanded && skill.effects && skill.effects.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-primary/10 space-y-2">
                            {skill.effects.map((eff, i) => {
                              const desc = formatSkillEffectDescription(eff);
                              if (!desc) return null;
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs text-primary/90">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                                  {desc}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── 互斥提示 ────────────────────────────────────── */}
            {showItemSection && showSkillSection && (
              <div className="text-center">
                <span className="inline-block text-[11px] font-medium text-muted-foreground/70 py-1.5 px-4 bg-muted/20 rounded-full">
                  道具與技能只能擇一使用
                </span>
              </div>
            )}

            {/* ── 無可用項目 ────────────────────────────────── */}
            {noResourcesAvailable && (itemsAllowed || skillsAllowed) && (
              <div className="rounded-xl bg-card/20 border border-white/5 p-6">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-card/30 border border-white/5 flex items-center justify-center">
                    <SearchX className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    沒有符合條件的道具或技能
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-[280px] text-center">
                    當前對抗要求的標籤或者檢定類型不符
                  </p>
                </div>
              </div>
            )}

            {/* ── 不允許使用道具或技能（限制模式） ──────────────── */}
            {!itemsAllowed && !skillsAllowed && (
              <div className="rounded-xl bg-card/20 border border-white/5 p-6">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-card/30 border border-white/5 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    只能使用基礎數值對抗
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-[280px] text-center">
                    此項攻擊不允許防守方使用道具或技能進行回應
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Footer（固定底部） ───────────────────────────────── */}
        <footer className="absolute bottom-0 left-0 right-0 p-6 bg-background/90 backdrop-blur-[20px] border-t border-border/10 shrink-0 z-10">
          <button
            type="button"
            className={`w-full h-14 rounded-xl font-extrabold text-base tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              isResponding
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-linear-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20'
            }`}
            disabled={isResponding}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRespond(e);
            }}
          >
            {buttonLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── 效果描述格式化 ────────────────────────────────────────────────

function formatEffectDescription(eff: ReturnType<typeof getItemEffects>[number]): string | null {
  if (eff.type === 'stat_change' && eff.targetStat && eff.value !== undefined) {
    const target = eff.statChangeTarget || 'value';
    if (target === 'maxValue') {
      return `${eff.targetStat} 最大值 ${eff.value > 0 ? '+' : ''}${eff.value}${eff.syncValue ? '，目前值同步調整' : ''}`;
    }
    return `${eff.targetStat} ${eff.value > 0 ? '+' : ''}${eff.value}`;
  }
  if (eff.type === 'item_steal') return '偷竊目標角色的道具';
  if (eff.type === 'item_take') return '移除目標角色的道具';
  if (eff.type === 'custom' && eff.description) return eff.description;
  return eff.description || null;
}

function formatSkillEffectDescription(eff: { type: string; targetStat?: string; value?: number; statChangeTarget?: string; syncValue?: boolean; description?: string; targetTaskId?: string }): string | null {
  if (eff.type === 'stat_change' && eff.targetStat && eff.value !== undefined) {
    const target = eff.statChangeTarget || 'value';
    if (target === 'maxValue') {
      return `${eff.targetStat} 最大值 ${eff.value > 0 ? '+' : ''}${eff.value}${eff.syncValue ? '，目前值同步調整' : ''}`;
    }
    return `${eff.targetStat} ${eff.value > 0 ? '+' : ''}${eff.value}`;
  }
  if (eff.type === 'task_reveal' && eff.targetTaskId) return `揭露任務：${eff.targetTaskId}`;
  if (eff.type === 'task_complete' && eff.targetTaskId) return `完成任務：${eff.targetTaskId}`;
  if (eff.type === 'item_steal') return '偷竊目標角色的道具';
  if (eff.type === 'item_take') return '移除目標角色的道具';
  if (eff.type === 'item_give') return '給予目標角色道具';
  if (eff.type === 'custom' && eff.description) return eff.description;
  return eff.description || null;
}
