'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { AbilityCard } from '@/components/gm/ability-card';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { GM_SECTION_TITLE_CLASS } from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import type { Skill, Stat } from '@/types/character';
import type { RegisterSaveHandler, RegisterDiscardHandler, SaveHandlerOptions } from '@/types/gm-edit';
import { AbilityEditWizard } from './ability-edit-wizard';

interface SkillsEditFormProps {
  characterId: string;
  initialSkills: Skill[];
  stats: Stat[];
  randomContestMaxValue?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: RegisterSaveHandler;
  onRegisterDiscard?: RegisterDiscardHandler;
}

/**
 * 技能管理 — 卡片 grid 佈局
 *
 * 與道具分頁共用 AbilityCard 元件，統一視覺。
 * 新增卡片排在 grid 第一位。
 * 空狀態使用 GmEmptyState 共用元件。
 */
export function SkillsEditForm({ characterId, initialSkills, stats, randomContestMaxValue = 100, onDirtyChange, onRegisterSave, onRegisterDiscard }: SkillsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [prevInitialSkills, setPrevInitialSkills] = useState(initialSkills);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  if (initialSkills !== prevInitialSkills) {
    setPrevInitialSkills(initialSkills);
    setSkills(initialSkills);
    setDeletedIds(new Set());
  }

  const effectiveSkills = useMemo(
    () => skills.filter((s) => !deletedIds.has(s.id)),
    [skills, deletedIds],
  );

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialSkills,
    currentData: effectiveSkills,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  /** 初始資料查找表 */
  const initialSkillsMap = useMemo(() => {
    const map = new Map<string, Skill>();
    for (const s of initialSkills) map.set(s.id, s);
    return map;
  }, [initialSkills]);

  /** 判斷狀態 */
  const getSkillStatus = useCallback(
    (skill: Skill) => {
      if (deletedIds.has(skill.id)) return 'deleted' as const;
      const original = initialSkillsMap.get(skill.id);
      if (!original) return 'new' as const;
      if (JSON.stringify(original) !== JSON.stringify(skill)) return 'modified' as const;
      return 'unchanged' as const;
    },
    [initialSkillsMap, deletedIds],
  );

  const handleAddSkill = useCallback(() => {
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
  }, []);

  const handleEditSkill = useCallback((skill: Skill) => {
    setEditingSkill({
      ...skill,
      effects: skill.effects ? [...skill.effects] : [],
      tags: skill.tags ? [...skill.tags] : [],
    });
    setIsWizardOpen(true);
  }, []);

  const handleWizardSave = useCallback((savedData: Skill) => {
    setSkills((prev) => {
      const existingIndex = prev.findIndex((s) => s.id === savedData.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = savedData;
        return updated;
      }
      return [...prev, savedData];
    });
    setEditingSkill(null);
  }, []);

  const handleSoftDelete = useCallback((skillId: string) => {
    setDeletedIds((prev) => new Set(prev).add(skillId));
  }, []);

  const handleRestore = useCallback((skillId: string) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(skillId);
      return next;
    });
  }, []);

  const save = useCallback(async (options?: SaveHandlerOptions) => {
    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { skills: effectiveSkills });
      if (result.success) {
        if (!options?.silent) toast.success('技能儲存成功');
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
  }, [characterId, effectiveSkills, resetDirty, router]);

  const discard = useCallback(() => {
    setSkills(initialSkills);
    setDeletedIds(new Set());
  }, [initialSkills]);

  useEffect(() => { onRegisterSave?.(save); }, [onRegisterSave, save]);
  useEffect(() => { onRegisterDiscard?.(discard); }, [onRegisterDiscard, discard]);

  const isNew = editingSkill ? !skills.find((s) => s.id === editingSkill.id) : true;

  return (
    <div className="space-y-6">
      <h2 className={GM_SECTION_TITLE_CLASS}>
        <span className="w-1 h-5 bg-primary rounded-full" />
        技能管理
      </h2>

      {skills.length === 0 ? (
        <GmEmptyState
          icon={<Zap className="h-10 w-10" />}
          title="尚無技能"
          description="目前此角色尚未配置任何技能，點擊下方按鈕開始新增。"
          actionLabel="新增第一個技能"
          onAction={handleAddSkill}
          disabled={isLoading}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <DashedAddButton
            label="新增技能"
            onClick={handleAddSkill}
            disabled={isLoading}
            variant="card"
            className="min-h-[180px]"
          />

          {skills.map((skill) => (
            <AbilityCard
              key={skill.id}
              ability={skill}
              mode="skill"
              status={getSkillStatus(skill)}
              onEdit={() => handleEditSkill(skill)}
              onRemove={() => handleSoftDelete(skill.id)}
              onRestore={() => handleRestore(skill.id)}
              disabled={isLoading}
            />
          ))}
        </div>
      )}

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
