'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { SaveButton } from '@/components/gm/save-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Zap, Pencil } from 'lucide-react';
import type { Skill, Stat } from '@/types/character';
import { AbilityEditWizard } from './ability-edit-wizard';

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
  const [isWizardOpen, setIsWizardOpen] = useState(false);

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
    setIsWizardOpen(true);
  };

  // 編輯技能
  const handleEditSkill = (skill: Skill) => {
    setEditingSkill({
      ...skill,
      effects: skill.effects ? [...skill.effects] : [],
      tags: skill.tags ? [...skill.tags] : [],
    });
    setIsWizardOpen(true);
  };

  /** Wizard 儲存回呼 — 接收已驗證+正規化的技能資料 */
  const handleWizardSave = (savedData: Skill) => {
    const existingIndex = skills.findIndex((s) => s.id === savedData.id);
    if (existingIndex >= 0) {
      const updatedSkills = [...skills];
      updatedSkills[existingIndex] = savedData;
      setSkills(updatedSkills);
    } else {
      setSkills([...skills, savedData]);
    }
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

  const isNew = editingSkill ? !skills.find((s) => s.id === editingSkill.id) : true;

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

      {/* 技能編輯 Wizard */}
      {editingSkill && (
        <AbilityEditWizard
          mode="skill"
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          initialData={editingSkill}
          isNew={isNew}
          stats={stats}
          randomContestMaxValue={randomContestMaxValue}
          onSave={(data) => handleWizardSave(data as Skill)}
        />
      )}
    </div>
  );
}
