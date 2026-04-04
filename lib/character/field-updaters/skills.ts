/**
 * 角色技能（Skills）欄位更新器
 */

import { normalizeTags } from '@/lib/utils/tags';
import type { MongoSkill } from '@/lib/db/types/mongo-helpers';
import { normalizeEffectData, normalizeCheckConfig } from './shared';

/**
 * 更新角色 Skills
 *
 * @param skills Skills 陣列
 * @returns 更新後的 Skills 資料
 */
export function updateCharacterSkills(skills: MongoSkill[]): MongoSkill[] {
  return ((skills || []).filter((s) => s && s.id).map((skill) => {
    const skillData: Record<string, unknown> = {
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      checkType: skill.checkType,
      usageCount: skill.usageCount || 0,
      tags: normalizeTags(skill.tags),
    };
    if (skill.imageUrl !== undefined) skillData.imageUrl = skill.imageUrl;
    if (skill.usageLimit !== undefined) skillData.usageLimit = skill.usageLimit;
    if (skill.cooldown !== undefined) skillData.cooldown = skill.cooldown;
    if (skill.lastUsedAt !== undefined) skillData.lastUsedAt = skill.lastUsedAt;

    skillData.effects = (skill.effects || [])
      .filter((e) => e && e.type)
      .map((e) => normalizeEffectData(e as unknown as Record<string, unknown>, true));

    const configPatch = normalizeCheckConfig(skill.name, skill.checkType, skill.contestConfig, skill.randomConfig);
    return { ...skillData, ...configPatch };
  })) as unknown as MongoSkill[];
}
