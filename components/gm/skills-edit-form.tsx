'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { SaveButton } from '@/components/gm/save-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Zap, Pencil } from 'lucide-react';
import type { Skill, SkillEffect, Stat } from '@/types/character';
import { EditFormCard } from './edit-form-card';
import { EffectEditor } from './effect-editor';
import { CheckConfigSection } from './check-config-section';
import { UsageLimitSection } from './usage-limit-section';
import { TagsSection } from './tags-section';
import { validateCheckConfig, type CheckType } from '@/lib/utils/check-config-validators';
import { normalizeCheckConfig } from '@/lib/utils/check-config-normalizers';

interface SkillsEditFormProps {
  characterId: string;
  initialSkills: Skill[];
  stats: Stat[];
  randomContestMaxValue?: number;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SkillsEditForm({ characterId, initialSkills, stats, randomContestMaxValue = 100, onDirtyChange }: SkillsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [prevInitialSkills, setPrevInitialSkills] = useState(initialSkills);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  /** 當 initialSkills props 變化時（例如 router.refresh() 後），同步更新本地 state */
  if (initialSkills !== prevInitialSkills) {
    setPrevInitialSkills(initialSkills);
    setSkills(initialSkills);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialSkills,
    currentData: skills,
  });

  /** 回報 dirty 狀態給父層（用於 tab 切換攔截） */
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // 新增技能
  const handleAddSkill = () => {
    const newSkill: Skill = {
      id: `skill-${Date.now()}`,
      name: '',
      description: '',
      checkType: 'none',
      usageCount: 0,
      usageLimit: 0,
      cooldown: 0,
      tags: [],
    };
    setEditingSkill(newSkill);
    setIsDialogOpen(true);
  };

  // 編輯技能
  const handleEditSkill = (skill: Skill) => {
    setEditingSkill({
      ...skill,
      effects: skill.effects ? [...skill.effects] : [],
      tags: skill.tags ? [...skill.tags] : [],
    });
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
    const validation = validateCheckConfig(
      editingSkill.checkType as CheckType,
      editingSkill.contestConfig,
      editingSkill.randomConfig,
    );
    if (!validation.valid) {
      toast.error(validation.errorMessage);
      return;
    }

    // 正規化檢定設定並建構最終技能
    const configPatch = normalizeCheckConfig(
      editingSkill.checkType as CheckType,
      editingSkill.contestConfig,
      editingSkill.randomConfig,
    );
    const finalSkill: Skill = { ...editingSkill, ...configPatch };

    const existingIndex = skills.findIndex((s) => s.id === finalSkill.id);
    if (existingIndex >= 0) {
      const updatedSkills = [...skills];
      updatedSkills[existingIndex] = finalSkill;
      setSkills(updatedSkills);
    } else {
      setSkills([...skills, finalSkill]);
    }

    setIsDialogOpen(false);
    setEditingSkill(null);
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
        resetDirty();
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
    const newEffect: SkillEffect = { type: 'stat_change' };
    setEditingSkill({
      ...editingSkill,
      effects: [...(editingSkill.effects || []), newEffect],
    });
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
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">技能管理</h2>
          <p className="text-muted-foreground text-sm mt-1">為角色新增、編輯或刪除技能</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAddSkill} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            新增技能
          </Button>
          <SaveButton
            isDirty={isDirty}
            isLoading={isLoading}
            label="儲存所有變更"
            type="button"
            onClick={handleSaveAll}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {skills.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="text-6xl">⚡</div>
              <div>
                <h3 className="text-xl font-semibold">尚無技能</h3>
                <p className="text-muted-foreground mt-2">點擊「新增技能」開始為角色新增技能</p>
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
                      <Zap className="h-5 w-5 text-primary" />
                      {skill.name || '未命名技能'}
                    </CardTitle>
                    <CardDescription className="mt-1">{skill.description || '尚無描述'}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleEditSkill(skill)} variant="outline" size="sm">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => handleDeleteSkill(skill.id)} variant="outline" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    檢定：{skill.checkType === 'none' ? '無' : skill.checkType === 'contest' ? '對抗檢定' : skill.checkType === 'random_contest' ? '隨機對抗檢定' : '隨機檢定'}
                  </Badge>
                  {(skill.checkType === 'contest' || skill.checkType === 'random_contest') && skill.contestConfig?.relatedStat && (
                    <Badge variant="outline">使用 {skill.contestConfig.relatedStat} 對抗</Badge>
                  )}
                  {skill.tags && skill.tags.length > 0 && (
                    <Badge variant="outline">
                      標籤：{skill.tags.map((tag) => (tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag)).join('、')}
                    </Badge>
                  )}
                  {skill.checkType === 'random' && skill.randomConfig && (
                    <Badge variant="outline">{skill.randomConfig.threshold} / {skill.randomConfig.maxValue}</Badge>
                  )}
                  {skill.usageLimit != null && (
                    <Badge variant="outline">
                      {skill.usageLimit > 0 ? `使用次數：${skill.usageCount || 0} / ${skill.usageLimit}` : '使用次數：無限制'}
                    </Badge>
                  )}
                  {skill.cooldown != null && (
                    <Badge variant="outline">
                      {skill.cooldown > 0 ? `冷卻：${skill.cooldown} 秒` : '冷卻：無冷卻時間'}
                    </Badge>
                  )}
                  {skill.effects && skill.effects.length > 0 && (
                    <Badge variant="outline">{skill.effects.length} 個效果</Badge>
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
            <DialogTitle>
              {editingSkill?.id && skills.find((s) => s.id === editingSkill.id) ? '編輯技能' : '新增技能'}
            </DialogTitle>
            <DialogDescription>設定技能的基本資訊、檢定系統、使用限制和效果</DialogDescription>
          </DialogHeader>

          {editingSkill && (
            <div className="space-y-6">
              {/* 上排：基本資訊、檢定系統、使用限制 */}
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
                    <div className="space-y-2 pt-2 border-t">
                      <TagsSection
                        tags={editingSkill.tags}
                        onChange={(tags) => setEditingSkill({ ...editingSkill, tags })}
                      />
                    </div>
                  </div>
                </EditFormCard>

                {/* 檢定系統 */}
                <EditFormCard title="檢定系統" description="設定技能使用時的檢定方式">
                  <CheckConfigSection
                    checkType={editingSkill.checkType as CheckType}
                    contestConfig={editingSkill.contestConfig}
                    randomConfig={editingSkill.randomConfig}
                    stats={stats}
                    randomContestMaxValue={randomContestMaxValue}
                    onChange={(patch) => setEditingSkill({ ...editingSkill, ...patch })}
                    onCheckTypeChange={(newCheckType) => {
                      // 切換為對抗檢定時，將所有效果的目標對象設為「其他玩家」
                      if ((newCheckType === 'contest' || newCheckType === 'random_contest') &&
                          editingSkill.effects && editingSkill.effects.length > 0) {
                        setEditingSkill((prev) => prev ? {
                          ...prev,
                          effects: prev.effects?.map((effect) => ({
                            ...effect,
                            targetType: 'other' as const,
                            requiresTarget: true,
                          })),
                        } : null);
                      }
                    }}
                  />
                </EditFormCard>

                {/* 使用限制 */}
                <EditFormCard title="使用限制" description="設定使用次數與冷卻時間">
                  <UsageLimitSection
                    usageLimit={editingSkill.usageLimit}
                    cooldown={editingSkill.cooldown}
                    onChange={(patch) => setEditingSkill({ ...editingSkill, ...patch })}
                  />
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
                        checkType={editingSkill.checkType}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">尚無效果，點擊「新增效果」開始新增</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveSkill}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
