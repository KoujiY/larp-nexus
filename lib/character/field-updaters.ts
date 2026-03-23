/**
 * 角色欄位更新器
 * 處理各個欄位的更新邏輯
 * 
 * 從 character-update.ts 提取
 */

import type { CharacterDocument } from '@/lib/db/models';
import { normalizeTags } from '@/lib/utils/tags';
import type { MongoSecret, MongoTask, MongoItem, MongoSkill } from '@/lib/db/types/mongo-helpers';

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

// ─── 私有 Helper ──────────────────────────────────────────────────────────────

/**
 * 正規化單一效果物件，供 Skills / Items 共用
 * @param effect 原始效果資料（以 Record 接收，避免重複定義型別）
 * @param withTaskId 是否包含 targetTaskId（技能效果專用）
 */
function normalizeEffectData(
  effect: Record<string, unknown>,
  withTaskId = false
): Record<string, unknown> {
  const type = effect.type as string;
  const defaultTargetType =
    (type === 'item_take' || type === 'item_steal') ? 'other' : 'self';
  const normalizedTargetType =
    (effect.targetType as string | undefined) ?? defaultTargetType;
  const effectData: Record<string, unknown> = {
    type,
    targetType: normalizedTargetType,
    requiresTarget: effect.requiresTarget != null
      ? Boolean(effect.requiresTarget)
      : normalizedTargetType !== 'self',
  };
  if (effect.targetStat != null) effectData.targetStat = String(effect.targetStat);
  if (effect.value != null) effectData.value = Number(effect.value);
  if (effect.statChangeTarget != null) effectData.statChangeTarget = String(effect.statChangeTarget);
  if (effect.syncValue != null) effectData.syncValue = Boolean(effect.syncValue);
  if (effect.targetItemId != null) effectData.targetItemId = String(effect.targetItemId);
  if (withTaskId && effect.targetTaskId != null) effectData.targetTaskId = String(effect.targetTaskId);
  if (effect.duration != null) effectData.duration = Number(effect.duration);
  if (effect.description != null) effectData.description = String(effect.description);
  return effectData;
}

/**
 * 正規化檢定設定，直接修改傳入的 data 物件
 * 供 Skills / Items 共用（HIGH-4：contestConfig 缺失升級為 error）
 */
function normalizeCheckConfig(
  name: string,
  checkType: string | undefined,
  contestConfig: unknown,
  randomConfig: { maxValue?: number; threshold?: number } | undefined,
  data: Record<string, unknown>
): void {
  if (checkType === 'contest' || checkType === 'random_contest') {
    if (contestConfig) {
      data.contestConfig = contestConfig;
    } else {
      console.error(`[field-updaters] ${name} 設定為對抗檢定但沒有 contestConfig`);
    }
    delete data.randomConfig;
  } else if (checkType === 'random') {
    const maxValue = randomConfig?.maxValue;
    const threshold = randomConfig?.threshold;
    if (!maxValue || threshold == null) {
      console.warn(`[field-updaters] ${name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`);
      data.randomConfig = {
        maxValue: maxValue && maxValue > 0 ? maxValue : 100,
        threshold: threshold != null && threshold > 0 ? threshold : 50,
      };
    } else {
      data.randomConfig = { maxValue, threshold: Math.min(threshold, maxValue) };
    }
    delete data.contestConfig;
  } else {
    delete data.randomConfig;
    delete data.contestConfig;
  }
}

/** 道具庫存差異項目型別 */
type InventoryDiff = {
  action: 'added' | 'updated' | 'deleted';
  item: {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    acquiredAt?: string;
  };
};

/**
 * 計算道具新增 / 更新 / 刪除的差異列表
 */
function calculateInventoryDiffs(
  newItems: Array<Record<string, unknown>>,
  inputItems: Array<{ id: string }>,
  currentItems: MongoItem[]
): InventoryDiff[] {
  const diffs: InventoryDiff[] = [];

  newItems.forEach((newItem) => {
    const oldItem = currentItems.find((i) => i.id === (newItem.id as string));
    const base = {
      id: newItem.id as string,
      name: newItem.name as string,
      description: (newItem.description as string) || '',
      imageUrl: newItem.imageUrl as string | undefined,
      acquiredAt: newItem.acquiredAt
        ? new Date(newItem.acquiredAt as Date).toISOString()
        : undefined,
    };
    if (!oldItem) {
      diffs.push({ action: 'added', item: base });
    } else if (
      oldItem.name !== newItem.name ||
      oldItem.description !== newItem.description ||
      oldItem.imageUrl !== newItem.imageUrl ||
      oldItem.quantity !== newItem.quantity
    ) {
      diffs.push({ action: 'updated', item: base });
    }
  });

  currentItems.forEach((oldItem) => {
    if (!inputItems.some((i) => i.id === oldItem.id)) {
      diffs.push({
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

  return diffs;
}

// ─── 公開函式 ─────────────────────────────────────────────────────────────────

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
    if (skill.iconUrl !== undefined) skillData.iconUrl = skill.iconUrl;
    if (skill.usageLimit !== undefined) skillData.usageLimit = skill.usageLimit;
    if (skill.cooldown !== undefined) skillData.cooldown = skill.cooldown;
    if (skill.lastUsedAt !== undefined) skillData.lastUsedAt = skill.lastUsedAt;

    skillData.effects = (skill.effects || [])
      .filter((e) => e && e.type)
      .map((e) => normalizeEffectData(e as unknown as Record<string, unknown>, true));

    normalizeCheckConfig(skill.name, skill.checkType, skill.contestConfig, skill.randomConfig, skillData);
    return skillData;
  })) as unknown as MongoSkill[];
}

/**
 * 更新角色 Items
 *
 * @param items Items 陣列
 * @param currentItems 當前 Items 陣列（用於判斷是否為新道具）
 * @returns 更新後的 Items 資料和差異列表
 */
export function updateCharacterItems(
  items: MongoItem[],
  currentItems: MongoItem[] = []
): { items: MongoItem[]; inventoryDiffs: InventoryDiff[] } {

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
      tags: normalizeTags(item.tags),
    };
    if (item.imageUrl !== undefined) itemData.imageUrl = item.imageUrl;
    if (item.usageLimit !== undefined) itemData.usageLimit = item.usageLimit;
    if (item.cooldown !== undefined) itemData.cooldown = item.cooldown;
    if (item.lastUsedAt !== undefined) itemData.lastUsedAt = item.lastUsedAt;
    if (item.checkType !== undefined) itemData.checkType = item.checkType;

    // Phase 6.5 / Phase 7: 處理道具效果（優先 effects 陣列，向後兼容 effect）
    if (item.effects != null) {
      itemData.effects = (item.effects as unknown as Array<Record<string, unknown>>)
        .filter((e) => e && e.type)
        .map((e) => normalizeEffectData(e));
    } else {
      const original = currentItems.find((i) => i.id === item.id);
      if (original?.effects !== undefined) itemData.effects = original.effects;
    }

    normalizeCheckConfig(item.name, item.checkType, item.contestConfig, item.randomConfig, itemData);
    return itemData;
  });

  return {
    items: itemsData as unknown as MongoItem[],
    inventoryDiffs: calculateInventoryDiffs(itemsData, items, currentItems),
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
): MongoTask[] {
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

    return cleanTask as unknown as MongoTask;
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
): MongoSecret[] {
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

    return cleanSecret as unknown as MongoSecret;
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

