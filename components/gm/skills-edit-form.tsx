'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Zap, Pencil } from 'lucide-react';
import type { Skill, SkillEffect, Stat } from '@/types/character';
import { EditFormCard } from './edit-form-card';
import { EffectEditor } from './effect-editor';

interface SkillsEditFormProps {
  characterId: string;
  initialSkills: Skill[];
  stats: Stat[]; // 用於檢定選擇相關數值
}

export function SkillsEditForm({ characterId, initialSkills, stats }: SkillsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEffectIndex, setEditingEffectIndex] = useState<number | null>(null);

  // 新增技能
  const handleAddSkill = () => {
    const newSkill: Skill = {
      id: `skill-${Date.now()}`,
      name: '',
      description: '',
      checkType: 'none',
      usageCount: 0,
    };
    setEditingSkill(newSkill);
    setIsDialogOpen(true);
  };

  // 編輯技能
  const handleEditSkill = (skill: Skill) => {
    setEditingSkill({ ...skill, effects: skill.effects ? [...skill.effects] : [] });
    setIsDialogOpen(true);
  };

  // 儲存技能（新增或編輯）
  const handleSaveSkill = () => {
    if (!editingSkill) return;
    
    if (!editingSkill.name.trim()) {
      toast.error('技能名稱不可為空');
      return;
    }

    // 驗證檢定設定
    if (editingSkill.checkType === 'contest') {
      if (!editingSkill.contestConfig?.relatedStat) {
        toast.error('請選擇對抗檢定使用的數值');
        return;
      }
    }
    if (editingSkill.checkType === 'random') {
      if (!editingSkill.randomConfig) {
        toast.error('請設定隨機檢定配置');
        return;
      }
      if (editingSkill.randomConfig.threshold === undefined || editingSkill.randomConfig.threshold === null) {
        toast.error('請設定隨機檢定門檻值');
        return;
      }
      if (editingSkill.randomConfig.maxValue === undefined || editingSkill.randomConfig.maxValue === null) {
        toast.error('請設定隨機檢定上限值');
        return;
      }
      if (editingSkill.randomConfig.threshold > editingSkill.randomConfig.maxValue) {
        toast.error('門檻值不得超過上限值');
        return;
      }
    }

    // 確保 randomConfig 或 contestConfig 正確設定
    const finalSkill = { ...editingSkill };
    
    if (editingSkill.checkType === 'random') {
      // 確保 randomConfig 存在且有完整的值
      const maxValue = editingSkill.randomConfig?.maxValue;
      const threshold = editingSkill.randomConfig?.threshold;
      
      // 如果 maxValue 或 threshold 無效，使用預設值
      finalSkill.randomConfig = {
        maxValue: (maxValue && maxValue > 0) ? maxValue : 100,
        threshold: (threshold !== undefined && threshold !== null && threshold > 0) ? threshold : 50,
      };
      
      // 確保 threshold 不超過 maxValue
      if (finalSkill.randomConfig.threshold > finalSkill.randomConfig.maxValue) {
        finalSkill.randomConfig.threshold = finalSkill.randomConfig.maxValue;
      }
      
      // 清除 contestConfig
      finalSkill.contestConfig = undefined;
    } else if (editingSkill.checkType === 'contest') {
      // 確保 contestConfig 存在
      if (!editingSkill.contestConfig) {
        finalSkill.contestConfig = {
          relatedStat: '',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        };
      }
      // 清除 randomConfig
      finalSkill.randomConfig = undefined;
    } else {
      // 無檢定類型，清除所有配置
      finalSkill.randomConfig = undefined;
      finalSkill.contestConfig = undefined;
    }
    
    const existingIndex = skills.findIndex((s) => s.id === finalSkill.id);
    if (existingIndex >= 0) {
      // 編輯現有技能
      const updatedSkills = [...skills];
      updatedSkills[existingIndex] = finalSkill;
      setSkills(updatedSkills);
    } else {
      // 新增技能
      setSkills([...skills, finalSkill]);
    }
    
    setIsDialogOpen(false);
    setEditingSkill(null);
    setEditingEffectIndex(null);
  };

  // 刪除技能
  const handleDeleteSkill = (skillId: string) => {
    setSkills(skills.filter((s) => s.id !== skillId));
  };

  // 儲存所有技能
  const handleSaveAll = async () => {
    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { skills });
      if (result.success) {
        toast.success('技能儲存成功');
        router.refresh();
      } else {
        toast.error(result.message || '儲存失敗');
      }
    } catch {
      toast.error('儲存失敗');
    } finally {
      setIsLoading(false);
    }
  };

  // 新增效果
  const handleAddEffect = () => {
    if (!editingSkill) return;
    const newEffect: SkillEffect = {
      type: 'stat_change',
    };
    setEditingSkill({
      ...editingSkill,
      effects: [...(editingSkill.effects || []), newEffect],
    });
    setEditingEffectIndex((editingSkill.effects || []).length);
  };

  // 編輯效果
  const handleEditEffect = (index: number, effect: SkillEffect) => {
    if (!editingSkill) return;
    const updatedEffects = [...(editingSkill.effects || [])];
    updatedEffects[index] = effect;
    setEditingSkill({ ...editingSkill, effects: updatedEffects });
  };

  // 刪除效果
  const handleDeleteEffect = (index: number) => {
    if (!editingSkill) return;
    const updatedEffects = (editingSkill.effects || []).filter((_, i) => i !== index);
    setEditingSkill({ ...editingSkill, effects: updatedEffects });
    if (editingEffectIndex === index) {
      setEditingEffectIndex(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">技能管理</h2>
          <p className="text-muted-foreground text-sm mt-1">
            為角色新增、編輯或刪除技能
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAddSkill} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            新增技能
          </Button>
          <Button onClick={handleSaveAll} disabled={isLoading} size="sm">
            <Save className="h-4 w-4 mr-2" />
            儲存所有變更
          </Button>
        </div>
      </div>

      {skills.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="text-6xl">⚡</div>
              <div>
                <h3 className="text-xl font-semibold">尚無技能</h3>
                <p className="text-muted-foreground mt-2">
                  點擊「新增技能」開始為角色新增技能
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {skills.map((skill) => (
            <Card key={skill.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-500" />
                      {skill.name || '未命名技能'}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {skill.description || '尚無描述'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEditSkill(skill)}
                      variant="outline"
                      size="sm"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleDeleteSkill(skill.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    檢定：{skill.checkType === 'none' ? '無' : skill.checkType === 'contest' ? '對抗檢定' : '隨機檢定'}
                  </Badge>
                  {skill.checkType === 'contest' && skill.contestConfig?.relatedStat && (
                    <Badge variant="outline">
                      使用 {skill.contestConfig.relatedStat} 對抗
                    </Badge>
                  )}
                  {skill.checkType === 'random' && skill.randomConfig && (
                    <Badge variant="outline">
                      {skill.randomConfig.threshold} / {skill.randomConfig.maxValue}
                    </Badge>
                  )}
                  {skill.usageLimit && skill.usageLimit > 0 && (
                    <Badge variant="outline">
                      使用次數：{skill.usageCount || 0} / {skill.usageLimit}
                    </Badge>
                  )}
                  {skill.cooldown && skill.cooldown > 0 && (
                    <Badge variant="outline">
                      冷卻：{skill.cooldown} 秒
                    </Badge>
                  )}
                  {skill.effects && skill.effects.length > 0 && (
                    <Badge variant="outline">
                      {skill.effects.length} 個效果
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 編輯技能 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-[1400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSkill?.id && skills.find(s => s.id === editingSkill.id) ? '編輯技能' : '新增技能'}</DialogTitle>
            <DialogDescription>
              設定技能的基本資訊、檢定系統、使用限制和效果
            </DialogDescription>
          </DialogHeader>

          {editingSkill && (
            <div className="space-y-6">
              {/* 上排：基本資訊卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 基本資訊 */}
                <EditFormCard title="基本資訊" description="設定技能的基本屬性">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="skill-name">技能名稱 *</Label>
                      <Input
                        id="skill-name"
                        value={editingSkill.name}
                        onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                        placeholder="例如：治療術"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="skill-description">技能描述</Label>
                      <Textarea
                        id="skill-description"
                        value={editingSkill.description}
                        onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                        placeholder="描述技能的效果和使用方式"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="skill-icon">圖示 URL（選填）</Label>
                      <Input
                        id="skill-icon"
                        value={editingSkill.iconUrl || ''}
                        onChange={(e) => setEditingSkill({ ...editingSkill, iconUrl: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </EditFormCard>

                {/* 檢定系統 */}
                <EditFormCard title="檢定系統" description="設定技能使用時的檢定方式">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="check-type">檢定類型</Label>
                      <Select
                        value={editingSkill.checkType}
                        onValueChange={(value: 'none' | 'contest' | 'random') => {
                          const newSkill = { ...editingSkill, checkType: value };
                          if (value === 'contest') {
                            newSkill.contestConfig = {
                              relatedStat: '',
                              opponentMaxItems: 0,
                              opponentMaxSkills: 0,
                              tieResolution: 'attacker_wins',
                            };
                            newSkill.randomConfig = undefined;
                          } else if (value === 'random') {
                            newSkill.randomConfig = {
                              maxValue: 100,
                              threshold: 50,
                            };
                            newSkill.contestConfig = undefined;
                          } else {
                            newSkill.contestConfig = undefined;
                            newSkill.randomConfig = undefined;
                          }
                          setEditingSkill(newSkill);
                        }}
                      >
                        <SelectTrigger id="check-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">無檢定</SelectItem>
                          <SelectItem value="contest">對抗檢定</SelectItem>
                          <SelectItem value="random">隨機檢定</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editingSkill.checkType === 'contest' && (
                      <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                        <Label className="text-sm font-medium">對抗檢定設定</Label>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>使用的數值 *</Label>
                            <Select
                              value={editingSkill.contestConfig?.relatedStat || ''}
                              onValueChange={(value) =>
                                setEditingSkill({
                                  ...editingSkill,
                                  contestConfig: {
                                    ...editingSkill.contestConfig!,
                                    relatedStat: value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="選擇數值" />
                              </SelectTrigger>
                              <SelectContent>
                                {stats.map((stat) => (
                                  <SelectItem key={stat.id} value={stat.name}>
                                    {stat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>對方最多可使用道具數</Label>
                              <Input
                                type="number"
                                min={0}
                                value={editingSkill.contestConfig?.opponentMaxItems || 0}
                                onChange={(e) =>
                                  setEditingSkill({
                                    ...editingSkill,
                                    contestConfig: {
                                      ...editingSkill.contestConfig!,
                                      opponentMaxItems: e.target.value ? parseInt(e.target.value) : 0,
                                    },
                                  })
                                }
                                placeholder="0"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>對方最多可使用技能數</Label>
                              <Input
                                type="number"
                                min={0}
                                value={editingSkill.contestConfig?.opponentMaxSkills || 0}
                                onChange={(e) =>
                                  setEditingSkill({
                                    ...editingSkill,
                                    contestConfig: {
                                      ...editingSkill.contestConfig!,
                                      opponentMaxSkills: e.target.value ? parseInt(e.target.value) : 0,
                                    },
                                  })
                                }
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>平手裁決方式</Label>
                            <Select
                              value={editingSkill.contestConfig?.tieResolution || 'attacker_wins'}
                              onValueChange={(value: 'attacker_wins' | 'defender_wins' | 'both_fail') =>
                                setEditingSkill({
                                  ...editingSkill,
                                  contestConfig: {
                                    ...editingSkill.contestConfig!,
                                    tieResolution: value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="attacker_wins">攻擊方獲勝</SelectItem>
                                <SelectItem value="defender_wins">防守方獲勝</SelectItem>
                                <SelectItem value="both_fail">雙方失敗</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {editingSkill.checkType === 'random' && (
                      <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                        <Label className="text-sm font-medium">隨機檢定設定</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>隨機數值上限 *</Label>
                            <Input
                              type="number"
                              min={1}
                              value={editingSkill.randomConfig?.maxValue || 100}
                              onChange={(e) => {
                                const maxValue = e.target.value ? parseInt(e.target.value) : 100;
                                const threshold = editingSkill.randomConfig?.threshold || 50;
                                setEditingSkill({
                                  ...editingSkill,
                                  randomConfig: {
                                    maxValue,
                                    threshold: Math.min(threshold, maxValue),
                                  },
                                });
                              }}
                              placeholder="100"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>檢定門檻 *</Label>
                            <Input
                              type="number"
                              min={1}
                              max={editingSkill.randomConfig?.maxValue || 100}
                              value={editingSkill.randomConfig?.threshold ?? ''}
                              onChange={(e) => {
                                const threshold = e.target.value ? parseInt(e.target.value) : undefined;
                                const maxValue = editingSkill.randomConfig?.maxValue || 100;
                                if (threshold !== undefined && threshold > maxValue) {
                                  toast.error('門檻值不得超過上限值');
                                  return;
                                }
                                setEditingSkill({
                                  ...editingSkill,
                                  randomConfig: {
                                    maxValue: editingSkill.randomConfig?.maxValue || 100,
                                    threshold: threshold !== undefined ? threshold : (editingSkill.randomConfig?.threshold ?? 50),
                                  },
                                });
                              }}
                              placeholder="50"
                            />
                            <p className="text-xs text-muted-foreground">
                              門檻值必須 ≤ {editingSkill.randomConfig?.maxValue || 100}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </EditFormCard>

                {/* 使用限制 */}
                <EditFormCard title="使用限制" description="設定使用次數與冷卻時間">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>使用次數限制</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editingSkill.usageLimit || ''}
                        onChange={(e) =>
                          setEditingSkill({
                            ...editingSkill,
                            usageLimit: e.target.value ? parseInt(e.target.value) : undefined,
                          })
                        }
                        placeholder="0 或留空 = 無限制"
                      />
                      <p className="text-xs text-muted-foreground">
                        0 或留空表示無限制
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>冷卻時間（秒）</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editingSkill.cooldown || ''}
                        onChange={(e) =>
                          setEditingSkill({
                            ...editingSkill,
                            cooldown: e.target.value ? parseInt(e.target.value) : undefined,
                          })
                        }
                        placeholder="0 或留空 = 無冷卻"
                      />
                      <p className="text-xs text-muted-foreground">
                        0 或留空表示無冷卻
                      </p>
                    </div>
                  </div>
                </EditFormCard>
              </div>

              {/* 下排：效果列表 */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="text-base font-semibold">效果定義</h3>
                    <p className="text-sm text-muted-foreground">設定技能使用時的效果，可添加多個效果</p>
                  </div>
                  <Button onClick={handleAddEffect} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    新增效果
                  </Button>
                </div>

                {editingSkill.effects && editingSkill.effects.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {editingSkill.effects.map((effect, index) => (
                      <EffectEditor
                        key={index}
                        effect={effect}
                        index={index}
                        stats={stats}
                        onChange={(updatedEffect) => handleEditEffect(index, updatedEffect)}
                        onDelete={() => handleDeleteEffect(index)}
                        availableTypes={['stat_change', 'item_take', 'item_steal', 'task_reveal', 'task_complete', 'custom']}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      尚無效果，點擊「新增效果」開始新增
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSkill}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

