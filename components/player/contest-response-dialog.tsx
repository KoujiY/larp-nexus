'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Shield, Zap, Package } from 'lucide-react';
import type { SkillContestEvent } from '@/types/event';
import { respondToContest } from '@/app/actions/contest-respond';
import { toast } from 'sonner';
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


  // 當 dialog 打開時重置選擇
  useEffect(() => {
    if (open) {
      setSelectedItems([]);
      setSelectedSkills([]);
    }
  }, [open]);

  if (!contestEvent) return null;

  const { attackerValue, defenderValue } = contestEvent;
  // 防守方不應該知道攻擊方的數值（如果 attackerValue 為 0，表示這是佔位符）
  const showAttackerValue = attackerValue !== 0;
  // 防守方不應該看到技能或道具名稱（隱私保護）
  // Phase 7.6: 根據隱匿標籤決定是否顯示攻擊方名稱
  const attackerDisplayName = contestEvent.sourceHasStealthTag ? '有人' : (contestEvent.attackerName || '有人');

  // Phase 7.6: 取得攻擊方的檢定類型和相關數值
  const attackerCheckType = contestEvent.checkType || 'contest';
  const attackerRelatedStat = contestEvent.relatedStat;
  // Phase 7.6: 取得攻擊方是否有戰鬥標籤（如果攻擊方有戰鬥標籤，防守方也必須有戰鬥標籤）
  const attackerHasCombatTag = contestEvent.attackerHasCombatTag ?? false;

  // Phase 7.6: 取得可用的道具（過濾條件：根據攻擊方是否有戰鬥標籤決定是否需要 combat 標籤、checkType 相同、relatedStat 相同）
  const availableItems = items.filter((item) => {
    // 檢查冷卻時間
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      const cooldownMs = item.cooldown * 1000;
      if (Date.now() - lastUsed < cooldownMs) {
        return false;
      }
    }

    // 檢查使用次數限制
    if (item.usageLimit && item.usageLimit > 0) {
      if ((item.usageCount || 0) >= item.usageLimit) {
        return false;
      }
    }

    // 檢查數量（消耗品）
    if (item.type === 'consumable' && item.quantity <= 0) {
      return false;
    }

    // Phase 7.6: 如果攻擊方有戰鬥標籤，防守方也必須有戰鬥標籤
    if (attackerHasCombatTag && (!item.tags || !item.tags.includes('combat'))) {
      return false;
    }

    // Phase 7.6: checkType 必須與攻擊方相同
    if (item.checkType !== attackerCheckType) {
      return false;
    }

    // Phase 7.6: 如果是 contest 類型，relatedStat 必須與攻擊方相同
    if (attackerCheckType === 'contest' && attackerRelatedStat) {
      if (item.contestConfig?.relatedStat !== attackerRelatedStat) {
        return false;
      }
    }

    return true;
  });

  // Phase 7.6: 取得可用的技能（過濾條件：根據攻擊方是否有戰鬥標籤決定是否需要 combat 標籤、checkType 相同、relatedStat 相同）
  const availableSkills = skills.filter((skill) => {
    // 檢查冷卻時間
    if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
      const lastUsed = new Date(skill.lastUsedAt).getTime();
      const cooldownMs = skill.cooldown * 1000;
      if (Date.now() - lastUsed < cooldownMs) {
        return false;
      }
    }

    // 檢查使用次數限制
    if (skill.usageLimit && skill.usageLimit > 0) {
      if ((skill.usageCount || 0) >= skill.usageLimit) {
        return false;
      }
    }

    // Phase 7.6: 如果攻擊方有戰鬥標籤，防守方也必須有戰鬥標籤
    if (attackerHasCombatTag && (!skill.tags || !skill.tags.includes('combat'))) {
      return false;
    }

    // Phase 7.6: checkType 必須與攻擊方相同
    if (skill.checkType !== attackerCheckType) {
      return false;
    }

    // Phase 7.6: 如果是 contest 類型，relatedStat 必須與攻擊方相同
    if (attackerCheckType === 'contest' && attackerRelatedStat) {
      if (skill.contestConfig?.relatedStat !== attackerRelatedStat) {
        return false;
      }
    }

    return true;
  });

  // 取得最大可使用道具/技能數量（從對抗檢定事件中取得）
  const maxItems = contestEvent.opponentMaxItems ?? 0; // 預設為 0（不允許使用道具）
  const maxSkills = contestEvent.opponentMaxSkills ?? 0; // 預設為 0（不允許使用技能）

  const handleItemToggle = (itemId: string) => {
    setSelectedItems((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      } else if (prev.length < maxItems) {
        return [...prev, itemId];
      } else {
        toast.warning(`最多只能選擇 ${maxItems} 個道具`);
        return prev;
      }
    });
  };

  const handleSkillToggle = (skillId: string) => {
    setSelectedSkills((prev) => {
      if (prev.includes(skillId)) {
        return prev.filter((id) => id !== skillId);
      } else if (prev.length < maxSkills) {
        return [...prev, skillId];
      } else {
        toast.warning(`最多只能選擇 ${maxSkills} 個技能`);
        return prev;
      }
    });
  };

  const handleRespond = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isResponding) {
      return; // 防止重複點擊
    }
    
    if (!contestId) {
      toast.error('對抗請求 ID 無效');
      return;
    }
    
    // Phase 7.6: 優先使用事件中的 contestId（如果有的話），確保與攻擊方生成的一致
    const finalContestId = contestEvent?.contestId || contestId;
    
    setIsResponding(true);
    try {
      const result = await respondToContest(
        finalContestId,
        characterId,
        selectedItems.length > 0 ? selectedItems : undefined,
        selectedSkills.length > 0 ? selectedSkills : undefined,
        contestEvent.targetItemId // Phase 7: 從 contestEvent 中獲取 targetItemId
      );

      if (result.success) {
        // 回應成功，關閉 dialog
        // 通知會通過 character.affected 事件顯示（只有當有實際數值變化時）
        
        // 不顯示檢定結果通知，讓 character.affected 事件來處理實際的數值變化
        onResponded();
        onOpenChange(false);
      } else {
        toast.error(result.message || '回應失敗');
      }
    } catch (error) {
      console.error('回應對抗檢定錯誤:', error);
      toast.error('回應失敗，請稍後再試');
    } finally {
      setIsResponding(false);
    }
  };


  // Phase 8: 防守方的 dialog 在整個對抗檢定期間都無法關閉
  // 只有在結算完成後才能關閉
  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // 防守方的 dialog 在對抗檢定期間完全無法關閉
      // 只有在結算完成後（通過 onResponded 回調）才能關閉
      if (!newOpen) {
        // 嘗試關閉時，如果正在回應中，阻止關閉
        if (isResponding) {
          return; // 阻止關閉
        }
        // 即使不在回應中，也不允許手動關閉（必須通過結算完成）
        return; // 阻止關閉
      }
      // 允許打開
      onOpenChange(newOpen);
    }}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        showCloseButton={false}
        onInteractOutside={(e) => {
          // 防守方的 dialog 在對抗檢定期間完全無法關閉
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // 防守方的 dialog 在對抗檢定期間完全無法關閉
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            對抗檢定：{attackerDisplayName}對你使用了技能或道具
          </DialogTitle>
          <DialogDescription>
            你可以選擇使用道具或技能來增強防禦，或直接使用基礎數值回應
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 對抗數值顯示 */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {contestEvent.checkType === 'random_contest' ? '攻擊方骰子：' : '攻擊方數值：'}
                </span>
                {showAttackerValue ? (
                  <Badge variant="destructive" className="text-lg">
                    {attackerValue}
                  </Badge>
                ) : (
                  <>
                    <Badge variant="outline" className="text-lg">
                      ???
                    </Badge>
                    <span className="text-xs text-muted-foreground">（未知）</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {contestEvent.checkType === 'random_contest' ? '你的骰子：' : '你的數值：'}
                </span>
                <Badge variant="default" className="text-lg">
                  {defenderValue}
                </Badge>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {contestEvent.checkType === 'random_contest' 
                ? `這是隨機對抗檢定，雙方各自骰出 1 到 ${contestEvent.randomContestMaxValue || 100} 的隨機數值進行比較。請選擇道具或技能來增強防禦。`
                : `${attackerDisplayName}對你使用了技能或道具，請選擇道具或技能來增強防禦`}
            </div>
            {/* Phase 7.6: 顯示檢定類型資訊 */}
            {contestEvent.checkType === 'contest' && contestEvent.relatedStat && (
              <div className="text-xs text-muted-foreground mt-2">
                檢定類型：對抗檢定（使用 {contestEvent.relatedStat} 數值）
              </div>
            )}
            {contestEvent.checkType === 'random_contest' && (
              <div className="text-xs text-muted-foreground mt-2">
                檢定類型：隨機對抗檢定（雙方各自骰出 1 到 {contestEvent.randomContestMaxValue || 100} 的隨機數值，D{contestEvent.randomContestMaxValue || 100}）
              </div>
            )}
          </div>

          {/* 道具選擇 */}
          {availableItems.length > 0 && maxItems > 0 && (
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                選擇道具（最多 {maxItems} 個）
              </Label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {availableItems.map((item) => {
                  const isSelected = selectedItems.includes(item.id);
                  const canSelect = isSelected || selectedItems.length < maxItems;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center space-x-2 p-2 rounded border cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border-primary' : canSelect ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => canSelect && handleItemToggle(item.id)}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => canSelect && handleItemToggle(item.id)} />
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        {(() => {
                          const firstEffect = getItemEffects(item)[0];
                          return firstEffect?.type === 'stat_change' && firstEffect.value ? (
                            <div className="text-sm text-muted-foreground">
                              效果：{firstEffect.targetStat} {firstEffect.value > 0 ? '+' : ''}{firstEffect.value}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 技能選擇 */}
          {availableSkills.length > 0 && maxSkills > 0 && (
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4" />
                選擇技能（最多 {maxSkills} 個）
              </Label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {availableSkills.map((skill) => {
                  const isSelected = selectedSkills.includes(skill.id);
                  const canSelect = isSelected || selectedSkills.length < maxSkills;

                  return (
                    <div
                      key={skill.id}
                      className={`flex items-center space-x-2 p-2 rounded border cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border-primary' : canSelect ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => canSelect && handleSkillToggle(skill.id)}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => canSelect && handleSkillToggle(skill.id)} />
                      <div className="flex-1">
                        <div className="font-medium">{skill.name}</div>
                        {skill.effects && skill.effects.length > 0 && (
                          <div className="text-sm text-muted-foreground">
                            效果：{skill.effects.map((e) => {
                              // 格式化效果描述
                              if (e.type === 'stat_change' && e.targetStat && e.value !== undefined) {
                                const target = e.statChangeTarget || 'value';
                                const value = e.value;
                                const targetStat = e.targetStat;
                                if (target === 'maxValue') {
                                  return `${targetStat} 最大值 ${value > 0 ? '+' : ''}${value}${e.syncValue ? '，目前值同步調整' : ''}`;
                                }
                                return `${targetStat} ${value > 0 ? '+' : ''}${value}`;
                              }
                              if (e.type === 'task_reveal' && e.targetTaskId) {
                                return `揭露任務：${e.targetTaskId}`;
                              }
                              if (e.type === 'task_complete' && e.targetTaskId) {
                                return `完成任務：${e.targetTaskId}`;
                              }
                              if (e.type === 'custom' && e.description) {
                                return e.description;
                              }
                              return e.description || '未知效果';
                            }).join('、')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 多選提示訊息 */}
          {(selectedItems.length > 1 || selectedSkills.length > 1) && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                    注意：如果獲勝，只有第一個選擇的技能/道具效果會執行
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    {selectedItems.length > 1 && `已選擇 ${selectedItems.length} 個道具，`}
                    {selectedSkills.length > 1 && `已選擇 ${selectedSkills.length} 個技能，`}
                    只有第一個的效果會生效
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 只有在允許使用道具或技能時，才顯示「沒有符合條件的道具或技能」提示 */}
          {availableItems.length === 0 && availableSkills.length === 0 && (maxItems > 0 || maxSkills > 0) && (
            <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
              <p className="font-semibold mb-2">沒有符合條件的道具或技能</p>
              <p className="text-sm">
                防守方使用的技能/道具必須：
              </p>
              <ul className="text-sm mt-2 space-y-1 text-left list-disc list-inside">
                <li>具有「戰鬥」標籤</li>
                <li>檢定類型與攻擊方相同（{attackerCheckType === 'contest' ? '對抗檢定' : '隨機對抗檢定'}）</li>
                {attackerCheckType === 'contest' && attackerRelatedStat && (
                  <li>使用相同的數值（{attackerRelatedStat}）</li>
                )}
              </ul>
            </div>
          )}
          
          {/* 如果不允許使用道具或技能，顯示提示 */}
          {maxItems === 0 && maxSkills === 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                此技能/道具不允許防守方使用道具或技能回應，只能使用基礎數值進行對抗
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRespond(e);
            }}
            disabled={isResponding}
            className="w-full sm:w-auto"
            type="button"
          >
            {isResponding ? '回應中...' : 
             selectedItems.length > 0 || selectedSkills.length > 0 
               ? '確認回應' 
               : '使用基礎數值回應'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

