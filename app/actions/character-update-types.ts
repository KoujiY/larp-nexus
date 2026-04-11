/**
 * updateCharacter Server Action 的輸入型別
 *
 * 從 character-update.ts 抽取，避免 667 行內聯型別定義。
 */

/** 效果目標類型 */
type EffectTargetType = 'self' | 'other' | 'any';

/** 數值變化目標 */
type StatChangeTarget = 'value' | 'maxValue';

/** 平手裁決方式 */
type TieResolution = 'attacker_wins' | 'defender_wins' | 'both_fail';

/** 檢定類型 */
type CheckType = 'none' | 'contest' | 'random' | 'random_contest';

/** 對抗檢定設定 */
type ContestConfig = {
  relatedStat: string;
  opponentMaxItems?: number;
  opponentMaxSkills?: number;
  tieResolution?: TieResolution;
};

/** 隨機檢定設定 */
type RandomConfig = {
  maxValue: number;
  threshold: number;
};

/** 自動揭露條件 */
type AutoRevealCondition = {
  type: string;
  itemIds?: string[];
  secretIds?: string[];
  matchLogic?: string;
};

/** 道具效果（item） */
type ItemEffect = {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal';
  targetType?: EffectTargetType;
  requiresTarget?: boolean;
  targetStat?: string;
  value?: number;
  statChangeTarget?: StatChangeTarget;
  syncValue?: boolean;
  targetItemId?: string;
  duration?: number;
  description?: string;
};

/** 技能效果（skill） */
type SkillEffect = {
  type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete' | 'custom';
  targetType?: EffectTargetType;
  requiresTarget?: boolean;
  targetStat?: string;
  value?: number;
  statChangeTarget?: StatChangeTarget;
  syncValue?: boolean;
  targetItemId?: string;
  targetTaskId?: string;
  targetCharacterId?: string;
  description?: string;
};

/** updateCharacter 的完整輸入資料 */
export type UpdateCharacterInput = {
  name?: string;
  description?: string;
  slogan?: string;
  hasPinLock?: boolean;
  pin?: string;
  publicInfo?: {
    background?: Array<{ type: 'title' | 'body'; content: string }>;
    personality?: string;
    relationships?: Array<{
      targetName: string;
      description: string;
    }>;
  };
  secretInfo?: {
    secrets: Array<{
      id: string;
      title: string;
      content: string | string[];
      isRevealed: boolean;
      revealCondition?: string;
      autoRevealCondition?: AutoRevealCondition;
      revealedAt?: Date;
    }>;
  };
  stats?: Array<{
    id: string;
    name: string;
    value: number;
    maxValue?: number;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    isHidden: boolean;
    isRevealed: boolean;
    revealedAt?: string | Date;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    completedAt?: string | Date;
    revealCondition?: string;
    autoRevealCondition?: AutoRevealCondition;
    createdAt: string | Date;
  }>;
  items?: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    type: 'consumable' | 'tool' | 'equipment';
    quantity: number;
    effects?: ItemEffect[];
    /** @deprecated 使用 effects 陣列代替 */
    effect?: ItemEffect;
    tags?: string[];
    checkType?: CheckType;
    contestConfig?: ContestConfig;
    randomConfig?: RandomConfig;
    usageLimit?: number;
    usageCount?: number;
    cooldown?: number;
    lastUsedAt?: Date;
    isTransferable: boolean;
    acquiredAt: Date;
    equipped?: boolean;
    statBoosts?: Array<{ statName: string; value: number; target?: 'value' | 'maxValue' | 'both' }>;
  }>;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    tags?: string[];
    checkType: CheckType;
    contestConfig?: ContestConfig;
    randomConfig?: RandomConfig;
    usageLimit?: number;
    usageCount?: number;
    cooldown?: number;
    lastUsedAt?: Date;
    effects?: SkillEffect[];
  }>;
};
