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

  // 調試：檢查 props
  useEffect(() => {
    if (open) {
      console.log('ContestResponseDialog opened', { contestId, characterId, contestEvent });
    }
  }, [open, contestId, characterId, contestEvent]);

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

  // 取得可用的道具（不在冷卻中，未達使用次數上限）
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

    return true;
  });

  // 取得可用的技能（不在冷卻中，未達使用次數上限）
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
    console.log('handleRespond called', { contestId, characterId, selectedItems, selectedSkills, isResponding });
    
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isResponding) {
      console.log('Already responding, ignoring');
      return; // 防止重複點擊
    }
    
    if (!contestId) {
      console.error('No contestId provided!');
      toast.error('對抗請求 ID 無效');
      return;
    }
    
    console.log('Starting response...');
    setIsResponding(true);
    try {
      console.log('Calling respondToContest...', { contestId, characterId, selectedItems, selectedSkills, targetItemId: contestEvent.targetItemId });
      const result = await respondToContest(
        contestId,
        characterId,
        selectedItems.length > 0 ? selectedItems : undefined,
        selectedSkills.length > 0 ? selectedSkills : undefined,
        contestEvent.targetItemId // Phase 7: 從 contestEvent 中獲取 targetItemId
      );
      
      console.log('respondToContest result:', result);

      if (result.success) {
        // 回應成功，關閉 dialog
        // 通知會通過 character.affected 事件顯示（只有當有實際數值變化時）
        console.log('[contest-response-dialog] 回應成功，結果:', result.data?.contestResult);
        
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
            對抗檢定：有人對你使用了技能或道具
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
                <span className="font-semibold">攻擊方數值：</span>
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
                <span className="font-semibold">你的數值：</span>
                <Badge variant="default" className="text-lg">
                  {defenderValue}
                </Badge>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              有人對你使用了技能或道具，請選擇道具或技能來增強防禦
            </div>
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
                        {item.effect?.type === 'stat_change' && item.effect.value && (
                          <div className="text-sm text-muted-foreground">
                            效果：{item.effect.targetStat} {item.effect.value > 0 ? '+' : ''}{item.effect.value}
                          </div>
                        )}
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

          {availableItems.length === 0 && availableSkills.length === 0 && (
            <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
              沒有可用的道具或技能
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

