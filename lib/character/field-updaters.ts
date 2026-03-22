/**
 * 角色欄位更新器
 * 處理各個欄位的更新邏輯
 * 
 * 從 character-update.ts 提取
 */

import type { CharacterDocument } from '@/lib/db/models';
import { normalizeTags } from '@/lib/utils/tags';

/**
 * MongoDB lean() 返回的類型（可能包含 _id）
 */
interface MongoSecret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  // Phase 7.7: 自動揭露條件
  autoRevealCondition?: {
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    matchLogic?: string;
  };
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
  autoRevealCondition?: {
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    matchLogic?: string;
  };
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
  // Phase 7.6: 擴展為包含 random_contest
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

/**
 * 更新角色 Stats
 * 
 * @param stats Stats 陣列
 * @returns 更新後的 Stats 資料
 */
export function updateCharacterStats(stats: Array<{
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}>): Array<{
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}> {
  return stats.map((stat) => ({
    id: stat.id,
    name: stat.name,
    value: stat.value,
    maxValue: stat.maxValue,
  }));
}

/**
 * 更新角色 Skills
 * 
 * @param skills Skills 陣列
 * @returns 更新後的 Skills 資料
 */
export function updateCharacterSkills(skills: Array<{
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
    type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete' | 'custom';
    targetType?: 'self' | 'other' | 'any';
    requiresTarget?: boolean;
    targetStat?: string;
    value?: number;
    statChangeTarget?: 'value' | 'maxValue';
    syncValue?: boolean;
    targetItemId?: string;
    targetTaskId?: string;
    targetCharacterId?: string;
    duration?: number; // Phase 8: 時效性效果持續時間（秒）
    description?: string;
  }>;
}>): Array<Record<string, unknown>> {
  const normalizedSkills = (skills || []).filter((s) => s && s.id);
  return normalizedSkills.map((skill) => {
    const skillData: Record<string, unknown> = {
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      checkType: skill.checkType,
      usageCount: skill.usageCount || 0,
    };

    if (skill.iconUrl !== undefined) skillData.iconUrl = skill.iconUrl;
    // Phase 7.6: 處理標籤系統 - 使用統一的標準化函數
    skillData.tags = normalizeTags(skill.tags);
    if (skill.usageLimit !== undefined) skillData.usageLimit = skill.usageLimit;
    if (skill.cooldown !== undefined) skillData.cooldown = skill.cooldown;
    if (skill.lastUsedAt !== undefined) skillData.lastUsedAt = skill.lastUsedAt;

    skillData.effects = (skill.effects || [])
      .filter((effect) => effect && effect.type)
      .map((effect) => {
        const effectData: Record<string, unknown> = {
          type: effect.type,
        };

        // Phase 6.5 / Phase 7: 目標設定
        const effectAny = effect as Record<string, unknown>;
        // Phase 7: item_take 和 item_steal 效果預設為 "other"，其他效果預設為 "self"
        const defaultTargetType =
          (effect.type === 'item_take' || effect.type === 'item_steal')
            ? 'other'
            : 'self';
        const normalizedTargetType =
          (effectAny.targetType as 'self' | 'other' | 'any' | undefined) ??
          defaultTargetType;
        effectData.targetType = normalizedTargetType;
        const normalizedRequiresTarget =
          effectAny.requiresTarget !== undefined &&
          effectAny.requiresTarget !== null
            ? Boolean(effectAny.requiresTarget)
            : normalizedTargetType !== 'self';
        effectData.requiresTarget = normalizedRequiresTarget;

        // 明確設定所有可能的欄位
        if (effect.targetStat !== undefined && effect.targetStat !== null) {
          effectData.targetStat = String(effect.targetStat);
        }
        if (effect.value !== undefined && effect.value !== null) {
          effectData.value = Number(effect.value);
        }
        if (
          effect.statChangeTarget !== undefined &&
          effect.statChangeTarget !== null
        ) {
          effectData.statChangeTarget = String(effect.statChangeTarget);
        }
        if (effect.syncValue !== undefined && effect.syncValue !== null) {
          effectData.syncValue = Boolean(effect.syncValue);
        }
        if (
          effect.targetItemId !== undefined &&
          effect.targetItemId !== null
        ) {
          effectData.targetItemId = String(effect.targetItemId);
        }
        if (
          effect.targetTaskId !== undefined &&
          effect.targetTaskId !== null
        ) {
          effectData.targetTaskId = String(effect.targetTaskId);
        }
        if (
          effect.targetCharacterId !== undefined &&
          effect.targetCharacterId !== null
        ) {
          effectData.targetCharacterId = String(effect.targetCharacterId);
        }
        // Phase 8: 時效性效果持續時間（秒）
        if (
          effect.duration !== undefined &&
          effect.duration !== null
        ) {
          effectData.duration = Number(effect.duration);
        }
        if (
          effect.description !== undefined &&
          effect.description !== null
        ) {
          effectData.description = String(effect.description);
        }

        return effectData;
      });

    // 根據檢定類型設定對應的配置
    if (skill.checkType === 'contest' || skill.checkType === 'random_contest') {
      if (skill.contestConfig) {
        skillData.contestConfig = skill.contestConfig;
      } else {
        console.warn(
          `技能 ${skill.name} 設定為對抗檢定但沒有 contestConfig`
        );
      }
      delete skillData.randomConfig;
    } else if (skill.checkType === 'random') {
      const maxValue = skill.randomConfig?.maxValue;
      const threshold = skill.randomConfig?.threshold;

      if (!maxValue || threshold === undefined || threshold === null) {
        console.warn(
          `技能 ${skill.name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`
        );
        skillData.randomConfig = {
          maxValue: maxValue && maxValue > 0 ? maxValue : 100,
          threshold:
            threshold !== undefined && threshold !== null && threshold > 0
              ? threshold
              : 50,
        };
      } else {
        skillData.randomConfig = {
          maxValue,
          threshold: Math.min(threshold, maxValue),
        };
      }
      delete skillData.contestConfig;
    } else {
      delete skillData.randomConfig;
      delete skillData.contestConfig;
    }

    return skillData;
  });
}

/**
 * 更新角色 Items
 * 
 * @param items Items 陣列
 * @param currentItems 當前 Items 陣列（用於判斷是否為新道具）
 * @returns 更新後的 Items 資料和差異列表
 */
export function updateCharacterItems(
  items: Array<{
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
    // Phase 7.6: 擴展為包含 random_contest
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
  }>,
  currentItems: MongoItem[] = []
): {
  items: Array<Record<string, unknown>>;
  inventoryDiffs: Array<{
    action: 'added' | 'updated' | 'deleted';
    item: {
      id: string;
      name: string;
      description: string;
      imageUrl?: string;
      acquiredAt?: string;
    };
  }>;
} {
  const inventoryDiffs: Array<{
    action: 'added' | 'updated' | 'deleted';
    item: {
      id: string;
      name: string;
      description: string;
      imageUrl?: string;
      acquiredAt?: string;
    };
  }> = [];

  const itemsData = items.map((item) => {
    const itemData: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      quantity: item.quantity,
      usageCount: item.usageCount || 0,
      isTransferable: item.isTransferable,
      acquiredAt: item.acquiredAt || new Date(),
    };

    if (item.imageUrl !== undefined) itemData.imageUrl = item.imageUrl;
    // Phase 7.6: 標籤系統 - 使用統一的標準化函數
    itemData.tags = normalizeTags(item.tags);

    // Phase 6.5 / Phase 7: 處理道具效果（優先處理 effects 陣列，向後兼容 effect）
    if (item.effects !== undefined && item.effects !== null) {
      if (Array.isArray(item.effects)) {
        if (item.effects.length > 0) {
          const processedEffects = item.effects
            .filter((effect) => effect && effect.type)
            .map((effect) => {
              const effectData: Record<string, unknown> = {
                type: effect.type,
              };

              const effectAny = effect as Record<string, unknown>;
              const defaultTargetType =
                (effect.type === 'item_take' || effect.type === 'item_steal')
                  ? 'other'
                  : 'self';
              const normalizedTargetType =
                (effectAny.targetType as 'self' | 'other' | 'any' | undefined) ??
                defaultTargetType;
              effectData.targetType = normalizedTargetType;
              const normalizedRequiresTarget =
                effectAny.requiresTarget !== undefined &&
                effectAny.requiresTarget !== null
                  ? Boolean(effectAny.requiresTarget)
                  : normalizedTargetType !== 'self';
              effectData.requiresTarget = normalizedRequiresTarget;

              if (effect.targetStat !== undefined && effect.targetStat !== null) {
                effectData.targetStat = String(effect.targetStat);
              }
              if (effect.value !== undefined && effect.value !== null) {
                effectData.value = Number(effect.value);
              }
              if (effect.statChangeTarget !== undefined && effect.statChangeTarget !== null) {
                effectData.statChangeTarget = String(effect.statChangeTarget);
              }
              if (effect.syncValue !== undefined && effect.syncValue !== null) {
                effectData.syncValue = Boolean(effect.syncValue);
              }
              if (effect.targetItemId !== undefined && effect.targetItemId !== null) {
                effectData.targetItemId = String(effect.targetItemId);
              }
              if (effect.duration !== undefined && effect.duration !== null) {
                effectData.duration = Number(effect.duration);
              }
              if (effect.description !== undefined && effect.description !== null) {
                effectData.description = String(effect.description);
              }

              return effectData;
            });

          if (processedEffects.length > 0) {
            itemData.effects = processedEffects;
          } else {
            itemData.effects = [];
          }
        } else {
          itemData.effects = [];
        }
      }
    } else {
      const originalItem = currentItems.find((i) => i.id === item.id);
      if (originalItem && originalItem.effects !== undefined) {
        itemData.effects = originalItem.effects;
      }
    }

    if (item.usageLimit !== undefined) itemData.usageLimit = item.usageLimit;
    if (item.cooldown !== undefined) itemData.cooldown = item.cooldown;
    if (item.lastUsedAt !== undefined) itemData.lastUsedAt = item.lastUsedAt;

    // Phase 8: 處理檢定設定
    if (item.checkType !== undefined) {
      itemData.checkType = item.checkType;
    }

    if (item.checkType === 'contest') {
      if (item.contestConfig) {
        itemData.contestConfig = item.contestConfig;
      }
      delete itemData.randomConfig;
    } else if (item.checkType === 'random') {
      const maxValue = item.randomConfig?.maxValue;
      const threshold = item.randomConfig?.threshold;

      if (!maxValue || threshold === undefined || threshold === null) {
        console.warn(
          `道具 ${item.name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`
        );
        itemData.randomConfig = {
          maxValue: maxValue && maxValue > 0 ? maxValue : 100,
          threshold:
            threshold !== undefined && threshold !== null && threshold > 0
              ? threshold
              : 50,
        };
      } else {
        itemData.randomConfig = {
          maxValue,
          threshold: Math.min(threshold, maxValue),
        };
      }
      delete itemData.contestConfig;
    } else {
      delete itemData.randomConfig;
      delete itemData.contestConfig;
    }

    return itemData;
  });

  // 比對新增/更新
  itemsData.forEach((newItem) => {
    const oldItem = currentItems.find((i) => i.id === newItem.id as string);
    if (!oldItem) {
      inventoryDiffs.push({
        action: 'added',
        item: {
          id: newItem.id as string,
          name: newItem.name as string,
          description: (newItem.description as string) || '',
          imageUrl: newItem.imageUrl as string | undefined,
          acquiredAt: newItem.acquiredAt
            ? new Date(newItem.acquiredAt as Date).toISOString()
            : undefined,
        },
      });
    } else if (
      oldItem.name !== newItem.name ||
      oldItem.description !== newItem.description ||
      oldItem.imageUrl !== newItem.imageUrl ||
      oldItem.quantity !== newItem.quantity
    ) {
      inventoryDiffs.push({
        action: 'updated',
        item: {
          id: newItem.id as string,
          name: newItem.name as string,
          description: (newItem.description as string) || '',
          imageUrl: newItem.imageUrl as string | undefined,
          acquiredAt: newItem.acquiredAt
            ? new Date(newItem.acquiredAt as Date).toISOString()
            : undefined,
        },
      });
    }
  });

  // 刪除
  currentItems.forEach((oldItem) => {
    const exist = items.some((i) => i.id === oldItem.id);
    if (!exist) {
      inventoryDiffs.push({
        action: 'deleted',
        item: {
          id: oldItem.id,
          name: oldItem.name,
          description: oldItem.description || '',
          imageUrl: oldItem.imageUrl,
          acquiredAt: oldItem.acquiredAt
            ? new Date(oldItem.acquiredAt).toISOString()
            : undefined,
        },
      });
    }
  });

  return {
    items: itemsData,
    inventoryDiffs,
  };
}

/**
 * 更新角色 Tasks
 * 
 * @param tasks Tasks 陣列
 * @param currentTasks 當前 Tasks 陣列（用於保留時間戳）
 * @returns 更新後的 Tasks 資料
 */
export function updateCharacterTasks(
  tasks: Array<{
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
    autoRevealCondition?: {
      type: string;
      itemIds?: string[];
      secretIds?: string[];
      matchLogic?: string;
    };
    createdAt: Date;
  }>,
  currentTasks: MongoTask[] = []
): Array<Record<string, unknown>> {
  return tasks.map((newTask) => {
    const oldTask = currentTasks.find(
      (t) => t.id === newTask.id
    );

    const cleanTask: Record<string, unknown> = {
      id: newTask.id,
      title: newTask.title,
      description: newTask.description,
      isHidden: newTask.isHidden,
      isRevealed: newTask.isRevealed,
      revealedAt: newTask.revealedAt,
      status: newTask.status,
      completedAt: newTask.completedAt,
      gmNotes: newTask.gmNotes || '',
      revealCondition: newTask.revealCondition || '',
      createdAt: newTask.createdAt || new Date(),
    };

    // Phase 7.7: 處理自動揭露條件
    if (newTask.autoRevealCondition && newTask.autoRevealCondition.type !== 'none') {
      cleanTask.autoRevealCondition = newTask.autoRevealCondition;
    } else if (oldTask?.autoRevealCondition && !newTask.autoRevealCondition) {
      // 保留資料庫中的既有條件（前端未傳送時）
      cleanTask.autoRevealCondition = oldTask.autoRevealCondition;
    }
    // 若 type 為 'none' 或 undefined，不設定 autoRevealCondition（清除）

    // 如果隱藏目標從未揭露變為已揭露，設定揭露時間
    if (
      newTask.isHidden &&
      newTask.isRevealed &&
      (!oldTask || !oldTask.isRevealed)
    ) {
      cleanTask.revealedAt = new Date();
    } else if (oldTask?.revealedAt) {
      cleanTask.revealedAt = oldTask.revealedAt;
    }

    // 如果狀態變為已完成/失敗，設定完成時間
    if (
      (newTask.status === 'completed' || newTask.status === 'failed') &&
      (!oldTask ||
        (oldTask.status !== 'completed' && oldTask.status !== 'failed'))
    ) {
      cleanTask.completedAt = new Date();
    } else if (oldTask?.completedAt) {
      cleanTask.completedAt = oldTask.completedAt;
    }

    return cleanTask;
  });
}

/**
 * 更新角色 Secrets
 * 
 * @param secrets Secrets 陣列
 * @param currentSecrets 當前 Secrets 陣列（用於保留時間戳）
 * @returns 更新後的 Secrets 資料
 */
export function updateCharacterSecrets(
  secrets: Array<{
    id: string;
    title: string;
    content: string;
    isRevealed: boolean;
    revealCondition?: string;
    // Phase 7.7: 自動揭露條件
    autoRevealCondition?: {
      type: string;
      itemIds?: string[];
      secretIds?: string[];
      matchLogic?: string;
    };
    revealedAt?: Date;
  }>,
  currentSecrets: MongoSecret[] = []
): Array<Record<string, unknown>> {
  return secrets.map((newSecret) => {
    const oldSecret = currentSecrets.find(
      (s) => s.id === newSecret.id
    );

    const cleanSecret: Record<string, unknown> = {
      id: newSecret.id,
      title: newSecret.title,
      content: newSecret.content,
      isRevealed: newSecret.isRevealed,
      revealCondition: newSecret.revealCondition || '',
      revealedAt: undefined as Date | undefined,
    };

    // Phase 7.7: 處理自動揭露條件
    if (newSecret.autoRevealCondition && newSecret.autoRevealCondition.type !== 'none') {
      cleanSecret.autoRevealCondition = newSecret.autoRevealCondition;
    } else if (oldSecret?.autoRevealCondition && !newSecret.autoRevealCondition) {
      // 保留資料庫中的既有條件（前端未傳送時）
      cleanSecret.autoRevealCondition = oldSecret.autoRevealCondition;
    }
    // 若 type 為 'none' 或 undefined，不設定 autoRevealCondition（清除）

    // 如果從未揭露變為已揭露，設定揭露時間
    if (newSecret.isRevealed && (!oldSecret || !oldSecret.isRevealed)) {
      cleanSecret.revealedAt = new Date();
    } else if (oldSecret?.revealedAt) {
      cleanSecret.revealedAt = oldSecret.revealedAt;
    }

    return cleanSecret;
  });
}

/**
 * 更新角色 PublicInfo
 * 
 * @param publicInfo PublicInfo 資料
 * @param currentPublicInfo 當前 PublicInfo 資料
 * @returns 更新後的 PublicInfo 資料
 */
export function updateCharacterPublicInfo(
  publicInfo: {
    background?: string;
    personality?: string;
    relationships?: Array<{
      targetName: string;
      description: string;
    }>;
  },
  currentPublicInfo?: CharacterDocument['publicInfo']
): Record<string, unknown> {
  return {
    background:
      publicInfo.background ?? currentPublicInfo?.background ?? '',
    personality:
      publicInfo.personality ?? currentPublicInfo?.personality ?? '',
    relationships:
      publicInfo.relationships ??
      currentPublicInfo?.relationships ??
      [],
  };
}

