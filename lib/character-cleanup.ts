import { normalizeTags } from './utils/tags';
import type { AutoRevealCondition } from '@/types/character';

// MongoDB lean() 返回的類型（可能包含 _id）
interface MongoSecret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  // Phase 7.7: 自動揭露條件
  autoRevealCondition?: AutoRevealCondition;
  revealedAt?: Date;
  _id?: unknown;
}

interface MongoTask {
  id: string;
  title: string;
  description: string;
  isHidden: boolean;
  isRevealed: boolean;
  revealedAt?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  completedAt?: Date;
  gmNotes?: string;
  revealCondition?: string;
  // Phase 7.7: 自動揭露條件
  autoRevealCondition?: AutoRevealCondition;
  createdAt: Date;
  _id?: unknown;
}

interface MongoItem {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity: number;
  // 使用效果（重構：改為陣列，支援多個效果）
  effects?: Array<{
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
  }>;
  // 向後兼容：保留 effect 欄位（單一效果），但優先使用 effects
  /** @deprecated 使用 effects 陣列代替 */
  effect?: {
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
  };
  // Phase 7.6: 標籤系統
  tags?: string[];
  // Phase 8: 檢定系統（Phase 7.6: 擴展為包含 random_contest）
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  };
  randomConfig?: {
    maxValue: number;
    threshold: number;
  };
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  isTransferable: boolean;
  acquiredAt: Date;
  _id?: unknown;
}

interface MongoStat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  _id?: unknown;
}

interface MongoSkill {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  // Phase 7.6: 標籤系統
  tags?: string[];
  // Phase 7.6: 擴展為包含 random_contest
  checkType: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  };
  randomConfig?: {
    maxValue: number;
    threshold: number;
  };
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  effects?: Array<{
    type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' |
          'task_reveal' | 'task_complete' | 'custom';
    targetType?: 'self' | 'other' | 'any';
    requiresTarget?: boolean;
    targetStat?: string;
    value?: number;
    statChangeTarget?: 'value' | 'maxValue';
    syncValue?: boolean;
    targetItemId?: string;
    targetTaskId?: string;
    targetCharacterId?: string;
    description?: string;
  }>;
  _id?: unknown;
}

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
      iconUrl: skill.iconUrl,
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
          targetItemId: effect.targetItemId,
          targetTaskId: effect.targetTaskId,
          targetCharacterId: effect.targetCharacterId,
          description: effect.description,
        })),
    }));
}

/**
 * 清理道具資料 - 移除無效的道具
 */
export function cleanItemData(items: MongoItem[] | undefined): Array<{
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity: number;
  effects?: Array<{
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
  }>;
  effect?: {
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
  };
  // Phase 7.6: 標籤系統
  tags?: string[];
  // Phase 8: 檢定系統（Phase 7.6: 擴展為包含 random_contest）
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
  };
  randomConfig?: {
    maxValue: number;
    threshold: number;
  };
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  isTransferable: boolean;
  acquiredAt: Date;
}> {
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

      // 向後兼容：如果沒有 effects 但有 effect，轉換為 effects
      const singleEffect = processEffect(item.effect);
      const finalEffects = effects !== undefined 
        ? effects 
        : (singleEffect ? [singleEffect] : undefined);

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        type: item.type,
        quantity: item.quantity,
        effects: finalEffects,
        // 向後兼容：如果只有單一效果，也保留 effect 欄位
        effect: finalEffects && finalEffects.length === 1 ? finalEffects[0] : undefined,
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
      gmNotes: task.gmNotes,
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
