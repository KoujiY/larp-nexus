// MongoDB lean() 返回的類型（可能包含 _id）
interface MongoSecret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
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
  effect?: {
    type: 'stat_change' | 'custom';
    targetType?: 'self' | 'other' | 'any';
    requiresTarget?: boolean;
    targetStat?: string;
    value?: number;
    statChangeTarget?: 'value' | 'maxValue';
    syncValue?: boolean;
    duration?: number;
    description?: string;
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
  checkType: 'none' | 'contest' | 'random';
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
  effect?: {
    type: 'stat_change' | 'custom';
    targetType?: 'self' | 'other' | 'any';
    requiresTarget?: boolean;
    targetStat?: string;
    value?: number;
    statChangeTarget?: 'value' | 'maxValue';
    syncValue?: boolean;
    duration?: number;
    description?: string;
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
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      type: item.type,
      quantity: item.quantity,
      effect: item.effect ? {
        type: item.effect.type,
        targetType: item.effect.targetType,
        requiresTarget: item.effect.requiresTarget,
        targetStat: item.effect.targetStat,
        value: item.effect.value,
        statChangeTarget: item.effect.statChangeTarget,
        syncValue: item.effect.syncValue,
        duration: item.effect.duration,
        description: item.effect.description,
      } : undefined,
      usageLimit: item.usageLimit,
      usageCount: item.usageCount || 0,
      cooldown: item.cooldown,
      lastUsedAt: item.lastUsedAt,
      isTransferable: item.isTransferable,
      acquiredAt: item.acquiredAt,
    }));
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
      revealedAt: secret.revealedAt,
    }));
}
