'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/characters';
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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Zap, Pencil, X } from 'lucide-react';
import type { Skill, SkillEffect, Stat } from '@/types/character';

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
      // 調試：檢查技能資料
      console.log('準備儲存的技能資料:', JSON.stringify(skills, null, 2));
      skills.forEach((skill, index) => {
        if (skill.checkType === 'random') {
          console.log(`技能 ${index} (${skill.name}) randomConfig:`, skill.randomConfig);
        }
        if (skill.effects) {
          skill.effects.forEach((effect, effIndex) => {
            if (effect.type === 'stat_change') {
              console.log(`技能 ${index} (${skill.name}) 效果 ${effIndex}:`, {
                targetStat: effect.targetStat,
                value: effect.value,
                statChangeTarget: effect.statChangeTarget,
                syncValue: effect.syncValue,
                fullEffect: effect,
              });
            }
          });
        }
      });
      
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSkill?.id && skills.find(s => s.id === editingSkill.id) ? '編輯技能' : '新增技能'}</DialogTitle>
            <DialogDescription>
              設定技能的基本資訊、檢定系統、使用限制和效果
            </DialogDescription>
          </DialogHeader>

          {editingSkill && (
            <div className="space-y-6">
              {/* 基本資訊 */}
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

              {/* 檢定系統 */}
              <div className="space-y-4">
                <h3 className="font-semibold">檢定系統</h3>
                <div className="space-y-2">
                  <Label htmlFor="check-type">檢定類型</Label>
                  <Select
                    value={editingSkill.checkType}
                    onValueChange={(value: 'none' | 'contest' | 'random') => {
                      // 清除舊的檢定設定
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
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="contest-stat">使用的數值 *</Label>
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
                        <SelectTrigger id="contest-stat">
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
                    <div className="space-y-2">
                      <Label htmlFor="opponent-max-items">對方最多可使用道具數</Label>
                      <Input
                        id="opponent-max-items"
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
                      <Label htmlFor="opponent-max-skills">對方最多可使用技能數</Label>
                      <Input
                        id="opponent-max-skills"
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
                    <div className="space-y-2">
                      <Label htmlFor="tie-resolution">平手裁決方式</Label>
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
                        <SelectTrigger id="tie-resolution">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="attacker_wins">攻擊方獲勝</SelectItem>
                          <SelectItem value="defender_wins">防守方獲勝</SelectItem>
                          <SelectItem value="both_fail">雙方失敗</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {editingSkill.checkType === 'random' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="random-max-value">隨機數值上限 *</Label>
                      <Input
                        id="random-max-value"
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
                              threshold: Math.min(threshold, maxValue), // 確保門檻不超過上限
                            },
                          });
                        }}
                        placeholder="100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="random-threshold">檢定門檻 *</Label>
                      <Input
                        id="random-threshold"
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
                      <p className="text-sm text-muted-foreground">
                        門檻值必須 &le; {editingSkill.randomConfig?.maxValue || 100}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* 使用限制 */}
              <div className="space-y-4">
                <h3 className="font-semibold">使用限制</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>使用次數限制</Label>
                    <p className="text-sm text-muted-foreground">
                      設定技能可使用的最多次數（0 或留空表示無限制）
                    </p>
                  </div>
                  <Input
                    type="number"
                    className="w-32"
                    value={editingSkill.usageLimit || ''}
                    onChange={(e) =>
                      setEditingSkill({
                        ...editingSkill,
                        usageLimit: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder="無限制"
                    min={0}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>冷卻時間（秒）</Label>
                    <p className="text-sm text-muted-foreground">
                      設定技能使用後的冷卻時間（0 或留空表示無冷卻）
                    </p>
                  </div>
                  <Input
                    type="number"
                    className="w-32"
                    value={editingSkill.cooldown || ''}
                    onChange={(e) =>
                      setEditingSkill({
                        ...editingSkill,
                        cooldown: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder="無冷卻"
                    min={0}
                  />
                </div>
              </div>

              {/* 效果定義 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">效果定義</h3>
                  <Button onClick={handleAddEffect} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    新增效果
                  </Button>
                </div>

                {editingSkill.effects && editingSkill.effects.length > 0 ? (
                  <div className="space-y-3">
                    {editingSkill.effects.map((effect, index) => (
                      <Card key={index}>
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <Badge>效果 {index + 1}</Badge>
                              <Button
                                onClick={() => handleDeleteEffect(index)}
                                variant="ghost"
                                size="sm"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <Label>效果類型</Label>
                              <Select
                                value={effect.type}
                                onValueChange={(value: SkillEffect['type']) => {
                                  const updatedEffect = { ...effect, type: value };
                                  handleEditEffect(index, updatedEffect);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stat_change">數值變化</SelectItem>
                                  <SelectItem value="task_reveal">揭露任務</SelectItem>
                                  <SelectItem value="task_complete">完成任務</SelectItem>
                                  <SelectItem value="custom">自訂效果</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {effect.type === 'stat_change' && (() => {
                              const targetStatData = effect.targetStat 
                                ? stats.find((s) => s.name === effect.targetStat)
                                : null;
                              const hasMaxValue = targetStatData?.maxValue !== undefined && targetStatData.maxValue !== null;
                              const statChangeTarget = effect.statChangeTarget || 'value';
                              
                              return (
                                <>
                                  <div className="space-y-2">
                                    <Label>目標數值</Label>
                                    <Select
                                      value={effect.targetStat || ''}
                                      onValueChange={(value) => {
                                        const updatedEffect = { 
                                          ...effect, 
                                          targetStat: value,
                                          // 如果新選的數值沒有 maxValue，強制設為 'value'
                                          statChangeTarget: stats.find((s) => s.name === value)?.maxValue !== undefined 
                                            ? effect.statChangeTarget || 'value'
                                            : 'value',
                                        };
                                        handleEditEffect(index, updatedEffect);
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="選擇數值" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {stats.map((stat) => (
                                          <SelectItem key={stat.id} value={stat.name}>
                                            {stat.name}
                                            {stat.maxValue !== undefined && stat.maxValue !== null && (
                                              <span className="text-muted-foreground ml-2">
                                                (最大值: {stat.maxValue})
                                              </span>
                                            )}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {hasMaxValue && (
                                    <div className="space-y-2">
                                      <Label>修改目標</Label>
                                      <Select
                                        value={statChangeTarget}
                                        onValueChange={(value: 'value' | 'maxValue') => {
                                          const updatedEffect = { ...effect, statChangeTarget: value };
                                          handleEditEffect(index, updatedEffect);
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="value">目前值</SelectItem>
                                          <SelectItem value="maxValue">最大值</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {hasMaxValue && statChangeTarget === 'maxValue' && (
                                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                      <div className="space-y-0.5">
                                        <Label htmlFor={`sync-value-${index}`}>同步修改目前值</Label>
                                        <p className="text-sm text-muted-foreground">
                                          修改最大值時，是否同步調整目前值
                                        </p>
                                      </div>
                                      <Switch
                                        id={`sync-value-${index}`}
                                        checked={effect.syncValue || false}
                                        onCheckedChange={(checked) => {
                                          const updatedEffect = { ...effect, syncValue: checked };
                                          handleEditEffect(index, updatedEffect);
                                        }}
                                      />
                                    </div>
                                  )}
                                  <div className="space-y-2">
                                    <Label>變化值</Label>
                                    <Input
                                      type="number"
                                      value={effect.value || ''}
                                      onChange={(e) => {
                                        const updatedEffect = {
                                          ...effect,
                                          value: e.target.value ? parseInt(e.target.value) : undefined,
                                        };
                                        handleEditEffect(index, updatedEffect);
                                      }}
                                      placeholder="例如：+10 或 -5"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                      {statChangeTarget === 'value' 
                                        ? '將修改數值的目前值'
                                        : '將修改數值的最大值' + (effect.syncValue ? '，並同步調整目前值' : '')
                                      }
                                    </p>
                                  </div>
                                </>
                              );
                            })()}

                            {effect.type === 'task_reveal' && (
                              <div className="space-y-2">
                                <Label>目標任務 ID</Label>
                                <Input
                                  value={effect.targetTaskId || ''}
                                  onChange={(e) => {
                                    const updatedEffect = { ...effect, targetTaskId: e.target.value };
                                    handleEditEffect(index, updatedEffect);
                                  }}
                                  placeholder="任務 ID"
                                />
                              </div>
                            )}

                            {effect.type === 'task_complete' && (
                              <div className="space-y-2">
                                <Label>目標任務 ID</Label>
                                <Input
                                  value={effect.targetTaskId || ''}
                                  onChange={(e) => {
                                    const updatedEffect = { ...effect, targetTaskId: e.target.value };
                                    handleEditEffect(index, updatedEffect);
                                  }}
                                  placeholder="任務 ID"
                                />
                              </div>
                            )}

                            {effect.type === 'custom' && (
                              <div className="space-y-2">
                                <Label>效果描述</Label>
                                <Textarea
                                  value={effect.description || ''}
                                  onChange={(e) => {
                                    const updatedEffect = { ...effect, description: e.target.value };
                                    handleEditEffect(index, updatedEffect);
                                  }}
                                  placeholder="描述自訂效果"
                                  rows={2}
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">尚無效果，點擊「新增效果」開始新增</p>
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

