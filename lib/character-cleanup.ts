import { normalizeTags } from './utils/tags';
import type { MongoSecret, MongoTask, MongoItem, MongoStat, MongoSkill } from '@/lib/db/types/mongo-helpers';

/**
 * 清理技能資料 - 移除無效的技能和效果，並確保必要的欄位存在
 */
export function cleanSkillData(skills: MongoSkill[] | undefined): MongoSkill[] {
  return (skills || [])
    .filter((skill): skill is MongoSkill => Boolean(skill && skill.id))
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      imageUrl: skill.imageUrl,
      // Phase 7.6: 標籤系統 - 使用統一的標準化函數
      tags: normalizeTags(skill.tags),
      checkType: skill.checkType,
      contestConfig: skill.contestConfig,
      randomConfig: skill.randomConfig,
      usageLimit: skill.usageLimit,
      usageCount: skill.usageCount || 0,
      cooldown: skill.cooldown,
      lastUsedAt: skill.lastUsedAt,
      effects: (skill.effects || [])
        .filter((effect): effect is NonNullable<typeof effect> => Boolean(effect && effect.type))
        .map((effect) => ({
          type: effect.type,
          targetType: effect.targetType,
          requiresTarget: effect.requiresTarget,
          targetStat: effect.targetStat,
          value: effect.value,
          statChangeTarget: effect.statChangeTarget,
          syncValue: effect.syncValue,
          duration: effect.duration, // Phase 8: 時效性效果持續時間（秒）
          targetItemId: effect.targetItemId,
          targetTaskId: effect.targetTaskId,
          description: effect.description,
        })),
    }));
}

/**
 * 清理道具資料 - 移除無效的道具
 */
export function cleanItemData(items: MongoItem[] | undefined): MongoItem[] {
  return (items || [])
    .filter((item): item is MongoItem => Boolean(item && item.id))
    .map((item) => {
      const processEffect = (effect: {
        type: string;
        targetType?: 'self' | 'other' | 'any';
        requiresTarget?: boolean;
        targetStat?: string;
        value?: number;
        statChangeTarget?: 'value' | 'maxValue';
        syncValue?: boolean;
        targetItemId?: string;
        duration?: number;
        description?: string;
      } | null | undefined) => {
        if (!effect || !effect.type) return undefined;
        return {
          type: effect.type as 'stat_change' | 'custom' | 'item_take' | 'item_steal',
          targetType: effect.targetType,
          requiresTarget: effect.requiresTarget,
          targetStat: effect.targetStat,
          value: effect.value,
          statChangeTarget: effect.statChangeTarget,
          syncValue: effect.syncValue,
          targetItemId: effect.targetItemId,
          duration: effect.duration,
          description: effect.description,
        };
      };

      // 優先處理 effects 陣列
      let effects: Array<{
        type: 'stat_change' | 'custom' | 'item_take' | 'item_steal';
        targetType?: 'self' | 'other' | 'any';
        requiresTarget?: boolean;
        targetStat?: string;
        value?: number;
        statChangeTarget?: 'value' | 'maxValue';
        syncValue?: boolean;
        targetItemId?: string;
        duration?: number;
        description?: string;
      }> | undefined;
      
      if (item.effects && Array.isArray(item.effects)) {
        // 處理 effects 陣列
        if (item.effects.length > 0) {
          const processedEffects = item.effects.map(processEffect).filter((e): e is NonNullable<typeof e> => e !== undefined);
          // 只有在處理後仍有有效效果時才設置 effects
          if (processedEffects.length > 0) {
            effects = processedEffects;
          } else {
            // 所有效果都被過濾掉（例如無效的效果），返回空陣列
            // 這樣可以保留「原本有 effects 但被過濾掉」的資訊
            effects = [];
          }
        } else {
          // 原始陣列為空，返回空陣列（保留資料庫中的空陣列狀態）
          effects = [];
        }
      }

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        type: item.type,
        quantity: item.quantity,
        effects,
        // Phase 7.6: 標籤系統 - 使用統一的標準化函數
        tags: normalizeTags(item.tags),
        // Phase 8: 檢定系統（Phase 7.6: 擴展為包含 random_contest）
        checkType: item.checkType,
        contestConfig: item.contestConfig,
        randomConfig: item.randomConfig,
        usageLimit: item.usageLimit,
        usageCount: item.usageCount || 0,
        cooldown: item.cooldown,
        lastUsedAt: item.lastUsedAt,
        isTransferable: item.isTransferable,
        acquiredAt: item.acquiredAt,
      };
    });
}

/**
 * 清理統計資料 - 移除無效的統計
 */
export function cleanStatData(stats: MongoStat[] | undefined): MongoStat[] {
  return (stats || [])
    .filter((stat): stat is MongoStat => Boolean(stat && stat.id))
    .map((stat) => ({
      id: stat.id,
      name: stat.name,
      value: stat.value,
      maxValue: stat.maxValue,
    }));
}

/**
 * 清理任務資料 - 移除無效的任務
 */
export function cleanTaskData(tasks: MongoTask[] | undefined): MongoTask[] {
  return (tasks || [])
    .filter((task): task is MongoTask => Boolean(task && task.id))
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      isHidden: task.isHidden,
      isRevealed: task.isRevealed,
      revealedAt: task.revealedAt,
      status: task.status,
      completedAt: task.completedAt,
      revealCondition: task.revealCondition,
      // Phase 7.7: 保留自動揭露條件（GM 端需要顯示）
      autoRevealCondition: task.autoRevealCondition,
      createdAt: task.createdAt,
    }));
}

/**
 * 清理秘密資料 - 移除無效的秘密
 */
export function cleanSecretData(secrets: MongoSecret[] | undefined): MongoSecret[] {
  return (secrets || [])
    .filter((secret): secret is MongoSecret => Boolean(secret && secret.id))
    .map((secret) => ({
      id: secret.id,
      title: secret.title,
      content: secret.content,
      isRevealed: secret.isRevealed,
      revealCondition: secret.revealCondition,
      // Phase 7.7: 保留自動揭露條件（GM 端需要顯示）
      autoRevealCondition: secret.autoRevealCondition,
      revealedAt: secret.revealedAt,
    }));
}
