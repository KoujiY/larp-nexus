'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Zap, Clock, CheckCircle2, XCircle } from 'lucide-react';
import Image from 'next/image';
import type { Skill, SkillEffect } from '@/types/character';
import { useSkill as executeSkillAction } from '@/app/actions/skill-use';
import { toast } from 'sonner';
import { useTargetOptions } from '@/hooks/use-target-options';
import { EffectDisplay } from './effect-display';

interface SkillListProps {
  skills?: Skill[];
  characterId: string;
  gameId: string; // Phase 6.5: 需要 gameId 來獲取同劇本角色列表
  characterName: string; // Phase 6.5: 需要角色名稱來顯示在選項中
  stats?: Array<{ name: string; value: number }>; // 用於顯示檢定相關數值
}

export function SkillList({ skills, characterId, gameId, characterName, stats = [] }: SkillListProps) {
  const router = useRouter();
  const [localSkills, setLocalSkills] = useState<Skill[]>(skills || []);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isUsing, setIsUsing] = useState(false);
  const [checkResult, setCheckResult] = useState<number | undefined>(undefined);
  const [useResult, setUseResult] = useState<{ success: boolean; message: string } | null>(null);
  const [, setTick] = useState(0);
  const [lastToastId, setLastToastId] = useState<string | number | undefined>(undefined);
  
  // Phase 6.5: 目標選擇相關邏輯
  const requiresTarget = Boolean(selectedSkill?.effects?.some((effect: SkillEffect) => effect.requiresTarget));
  const targetType = selectedSkill?.effects?.find((e: SkillEffect) => e.requiresTarget)?.targetType;

  const {
    targetOptions: targetCharacters,
    selectedTargetId,
    setSelectedTargetId,
  } = useTargetOptions({
    gameId,
    characterId,
    characterName,
    requiresTarget,
    targetType,
    enabled: !!selectedSkill,
  });

  // 當 skills prop 更新時，同步更新本地狀態
  useEffect(() => {
    if (skills) {
      setLocalSkills(skills);
      // 如果當前選中的技能有更新，也要更新
      if (selectedSkill) {
        const updatedSkill = skills.find((s) => s.id === selectedSkill.id);
        if (updatedSkill) {
          setSelectedSkill(updatedSkill);
        }
      }
    }
  }, [skills, selectedSkill]);

  // 檢查是否有任何技能在冷卻中
  const hasAnyCooldown = skills?.some((skill) => {
    if (!skill.cooldown || skill.cooldown <= 0 || !skill.lastUsedAt) return false;
    const lastUsed = new Date(skill.lastUsedAt).getTime();
    const cooldownMs = skill.cooldown * 1000;
    return Date.now() - lastUsed < cooldownMs;
  });

  // 每秒更新一次（僅當有技能在冷卻中時）
  useEffect(() => {
    if (!hasAnyCooldown) return;
    
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasAnyCooldown]);

  if (!skills || skills.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-4">
            <Zap className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">尚無技能</h3>
              <p className="text-sm text-muted-foreground mt-2">
                你還沒有獲得任何技能
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 檢查技能是否可使用
  const canUseSkill = (skill: Skill): { canUse: boolean; reason?: string } => {
    // 使用次數檢查
    if (skill.usageLimit && skill.usageLimit > 0) {
      if ((skill.usageCount || 0) >= skill.usageLimit) {
        return { canUse: false, reason: '已達使用次數上限' };
      }
    }

    // 冷卻時間檢查
    if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
      const lastUsed = new Date(skill.lastUsedAt).getTime();
      const now = Date.now();
      const cooldownMs = skill.cooldown * 1000;
      if (now - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
        return { canUse: false, reason: `冷卻中 (${remainingSeconds}s)` };
      }
    }

    return { canUse: true };
  };

  // 計算冷卻剩餘時間
  const getCooldownRemaining = (skill: Skill): number | null => {
    if (!skill.cooldown || skill.cooldown <= 0 || !skill.lastUsedAt) return null;
    
    const lastUsed = new Date(skill.lastUsedAt).getTime();
    const now = Date.now();
    const cooldownMs = skill.cooldown * 1000;
    const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
    
    return remaining > 0 ? remaining : null;
  };

  const dismissLastToast = () => {
    if (lastToastId !== undefined) {
      toast.dismiss(lastToastId);
      setLastToastId(undefined);
    }
  };

  // 使用技能
  const handleUseSkill = async () => {
    if (!selectedSkill) return;
    
    const { canUse } = canUseSkill(selectedSkill);
    if (!canUse) {
      return;
    }

    // Phase 6.5: 檢查是否需要選擇目標角色
    const requiresTarget = selectedSkill.effects?.some((effect: SkillEffect) => effect.requiresTarget);
    if (requiresTarget && !selectedTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }

    // 如果是隨機檢定，自動骰骰子
    let finalCheckResult: number | undefined = undefined;
    if (selectedSkill.checkType === 'random' && selectedSkill.randomConfig) {
      // 自動生成 1 到 maxValue 之間的隨機數
      finalCheckResult = Math.floor(Math.random() * selectedSkill.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
      toast.info(`骰出結果：${finalCheckResult}`);
    }

    // 如果是對抗檢定，需要指定目標角色（暫時先跳過，後續實作）
    if (selectedSkill.checkType === 'contest') {
      toast.info('對抗檢定功能開發中，請稍後再試');
      return;
    }

    setIsUsing(true);
    try {
      const result = await executeSkillAction(characterId, selectedSkill.id, finalCheckResult, selectedTargetId);
      
      // 顯示結果訊息（不關閉 dialog）
      if (result.success) {
        // 更新本地技能狀態（反映冷卻時間和使用次數）
        setLocalSkills(prevSkills => prevSkills.map(skill => {
          if (skill.id === selectedSkill.id) {
            return {
              ...skill,
              lastUsedAt: new Date(),
              usageCount: (skill.usageCount || 0) + 1,
            };
          }
          return skill;
        }));
        
        // 更新選中的技能狀態
        if (selectedSkill) {
          setSelectedSkill({
            ...selectedSkill,
            lastUsedAt: new Date(),
            usageCount: (selectedSkill.usageCount || 0) + 1,
          });
        }
        
        if (result.data?.checkPassed === false) {
          setUseResult({ success: false, message: '檢定失敗，技能未生效' });
          setLastToastId(toast.warning('檢定失敗，技能未生效'));
        } else {
          setUseResult({ success: true, message: result.message || '技能使用成功' });
          setLastToastId(toast.success(result.message || '技能使用成功'));
        }
        // 重新載入頁面資料（不重新整理整個頁面）
        router.refresh();
      } else {
        console.error('技能使用失敗:', result);
        setUseResult({ success: false, message: result.message || '技能使用失敗' });
        setLastToastId(toast.error(result.message || '技能使用失敗'));
      }
    } catch (error) {
      console.error('技能使用錯誤:', error);
      setUseResult({ success: false, message: '技能使用失敗，請稍後再試' });
      setLastToastId(toast.error('技能使用失敗，請稍後再試'));
    } finally {
      setIsUsing(false);
    }
  };

  const handleCloseDialog = () => {
    dismissLastToast();
    setSelectedSkill(null);
    setCheckResult(undefined);
    setUseResult(null);
    setSelectedTargetId(undefined);
  };

  return (
    <div className="space-y-4">
      {localSkills.map((skill) => {
        const { canUse, reason } = canUseSkill(skill);
        const cooldownRemaining = getCooldownRemaining(skill);

        return (
          <Card
            key={skill.id}
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => {
              setSelectedSkill(skill);
              setCheckResult(undefined);
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {/* 技能圖示 */}
                {skill.iconUrl ? (
                  <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border">
                    <Image
                      src={skill.iconUrl}
                      alt={skill.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-lg bg-linear-to-br from-yellow-400 to-orange-500 flex items-center justify-center border">
                    <Zap className="h-8 w-8 text-white" />
                  </div>
                )}

                {/* 技能資訊 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{skill.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {skill.description || '尚無描述'}
                      </p>
                    </div>
                    {!canUse && (
                      <Badge variant="secondary" className="shrink-0">
                        {reason}
                      </Badge>
                    )}
                  </div>

                  {/* 技能標籤 */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {skill.checkType !== 'none' && (
                      <Badge variant="outline" className="text-xs">
                        {skill.checkType === 'contest' ? '對抗檢定' : '隨機檢定'}
                        {skill.checkType === 'contest' && skill.contestConfig?.relatedStat && (
                          <span className="ml-1">
                            (使用 {skill.contestConfig.relatedStat})
                          </span>
                        )}
                        {skill.checkType === 'random' && skill.randomConfig && (
                          <span className="ml-1">
                            ({skill.randomConfig.threshold} / {skill.randomConfig.maxValue})
                          </span>
                        )}
                      </Badge>
                    )}
                    {skill.usageLimit && skill.usageLimit > 0 && (
                      <Badge variant="outline" className="text-xs">
                        使用次數：{skill.usageCount || 0} / {skill.usageLimit}
                      </Badge>
                    )}
                    {cooldownRemaining !== null && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        冷卻 {cooldownRemaining}s
                      </Badge>
                    )}
                    {skill.effects && skill.effects.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {skill.effects.length} 個效果
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* 技能詳情 Dialog */}
      {selectedSkill && (
        <Dialog open={!!selectedSkill} onOpenChange={(open) => {
          if (!open) handleCloseDialog();
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                {selectedSkill.name}
              </DialogTitle>
              <DialogDescription>{selectedSkill.description || '尚無描述'}</DialogDescription>
            </DialogHeader>

            {(() => {
              const selectedCooldownRemaining = getCooldownRemaining(selectedSkill);
              
              return (
            <div className="space-y-4">
              
              {/* 檢定資訊 */}
              {selectedSkill.checkType !== 'none' && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">檢定資訊</h4>
                  {selectedSkill.checkType === 'contest' && selectedSkill.contestConfig && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        檢定類型：對抗檢定
                      </p>
                      <p className="text-sm mt-1">
                        使用數值：<strong>{selectedSkill.contestConfig.relatedStat}</strong>
                        {(() => {
                          const stat = stats.find((s) => s.name === selectedSkill.contestConfig?.relatedStat);
                          return stat && (
                            <span className="ml-2">
                              (當前值: {stat.value})
                            </span>
                          );
                        })()}
                      </p>
                      {(selectedSkill.contestConfig.opponentMaxItems || selectedSkill.contestConfig.opponentMaxSkills) && (
                        <p className="text-sm mt-1">
                          對方可使用：最多 {selectedSkill.contestConfig.opponentMaxItems || 0} 個道具、
                          {selectedSkill.contestConfig.opponentMaxSkills || 0} 個技能
                        </p>
                      )}
                      <p className="text-sm mt-1">
                        平手裁決：{
                          selectedSkill.contestConfig.tieResolution === 'attacker_wins' ? '攻擊方獲勝' :
                          selectedSkill.contestConfig.tieResolution === 'defender_wins' ? '防守方獲勝' :
                          '雙方失敗'
                        }
                      </p>
                      <p className="text-sm mt-2 text-muted-foreground">
                        使用技能後，對方會收到通知並可選擇使用道具或技能進行對抗
                      </p>
                    </div>
                  )}
                  {selectedSkill.checkType === 'random' && selectedSkill.randomConfig && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        檢定類型：隨機檢定
                      </p>
                      <p className="text-sm mt-1">
                        隨機範圍：1 - {selectedSkill.randomConfig.maxValue}
                      </p>
                      <p className="text-sm mt-1">
                        檢定門檻：<strong>{selectedSkill.randomConfig.threshold}</strong>
                        （&ge; {selectedSkill.randomConfig.threshold} 即成功）
                      </p>
                      {checkResult !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <p className="text-sm">骰出結果：<strong>{checkResult}</strong></p>
                          {checkResult >= selectedSkill.randomConfig.threshold ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-green-600">檢定成功</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="text-sm text-red-600">檢定失敗</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 使用限制 */}
              {(selectedSkill.usageLimit || selectedSkill.cooldown) && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">使用限制</h4>
                  <div className="space-y-1 text-sm">
                    {selectedSkill.usageLimit && selectedSkill.usageLimit > 0 && (
                      <p>
                        使用次數：{selectedSkill.usageCount || 0} / {selectedSkill.usageLimit}
                      </p>
                    )}
                    {selectedSkill.cooldown && selectedSkill.cooldown > 0 && (
                      <p>
                        冷卻時間：{selectedSkill.cooldown} 秒
                        {selectedCooldownRemaining !== null && (
                          <span className="ml-2 text-muted-foreground">
                            (剩餘 {selectedCooldownRemaining}s)
                          </span>
                        )}
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
                    {selectedSkill.effects.map((effect, index) => (
                      <EffectDisplay
                        key={index}
                        effect={effect}
                        targetOptions={effect.requiresTarget ? targetCharacters : []}
                        selectedTargetId={selectedTargetId}
                        onTargetChange={setSelectedTargetId}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 使用結果訊息 */}
              {useResult && (
                <div className={`p-4 rounded-lg border-2 ${
                  useResult.success 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {useResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                    )}
                    <p className="font-medium">{useResult.message}</p>
                  </div>
                </div>
              )}
            </div>
            );
            })()}

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setSelectedSkill(null);
                setCheckResult(undefined);
                setUseResult(null);
              }}>
                關閉
              </Button>
              <Button
                onClick={handleUseSkill}
                disabled={(() => {
                  if (!selectedSkill) return true;
                  if (isUsing) return true;
                  if (selectedSkill.checkType === 'contest') return true;
                  const { canUse } = canUseSkill(selectedSkill);
                  return !canUse;
                })()}
              >
                {isUsing ? '使用中...' : 
                 selectedSkill.checkType === 'contest' ? '對抗檢定開發中' : 
                 (() => {
                   if (!selectedSkill) return '使用技能';
                   const { canUse, reason } = canUseSkill(selectedSkill);
                   if (!canUse && reason) {
                     return `使用技能 (${reason})`;
                   }
                   return '使用技能';
                 })()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

