// Character (角色) 相關類型定義

/**
 * Phase 4 擴展版角色資料（用於 API 回傳）
 */
export interface CharacterData {
  id: string;
  gameId: string;
  name: string;
  description: string;
  imageUrl?: string;
  hasPinLock: boolean;
  publicInfo?: PublicInfo;
  secretInfo?: SecretInfo;
  tasks?: Task[];
  items?: Item[];
  stats?: Stat[];
  skills?: Skill[];
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 完整版角色資料（Phase 4 使用）
 */
export interface Character {
  _id: string;
  gameId: string;
  name: string;
  avatar?: string;
  hasPinLock: boolean;
  pinHash?: string;
  publicInfo: PublicInfo;
  secretInfo: SecretInfo;
  tasks: Task[];
  items: Item[];
  stats: Stat[];
  wsChannelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicInfo {
  background: string;
  personality: string;
  relationships: Relationship[];
}

export interface Relationship {
  targetName: string;
  description: string;
}

/**
 * Phase 3.5: 隱藏資訊
 */
export interface SecretInfo {
  secrets: Secret[];
}

export interface Secret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  revealedAt?: Date;
}

/**
 * Phase 4.5: 任務系統（擴展版）
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  // 隱藏目標機制
  isHidden: boolean;
  isRevealed: boolean;
  revealedAt?: Date;
  // 完成狀態
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  completedAt?: Date;
  // GM 專用欄位（玩家端不顯示）
  gmNotes?: string;
  revealCondition?: string;
  createdAt: Date;
}

/**
 * Phase 4.5: 道具效果
 */
/**
 * Phase 4.5: 道具效果
 * Phase 6.5: 擴展跨角色效果（方案 A）
 * 重構：與 SkillEffect 統一結構，支援多個效果
 */
export interface ItemEffect {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal'; // Phase 7: 添加 item_take 和 item_steal
  
  // Phase 6.5 方案 A: 目標設定
  targetType?: 'self' | 'other' | 'any';  // 目標對象類型（GM 設定）
  requiresTarget?: boolean;                // 是否需要玩家選擇目標角色
  
  targetStat?: string;
  value?: number;
  // 數值變化目標：'value' 修改目前值，'maxValue' 修改最大值
  statChangeTarget?: 'value' | 'maxValue';
  // 當 statChangeTarget === 'maxValue' 時，是否同步修改目前值
  syncValue?: boolean;
  duration?: number;
  description?: string;
  targetItemId?: string; // Phase 7: 目標道具 ID（用於 item_take 和 item_steal，由玩家在執行時選擇）
}

/**
 * Phase 4.5: 道具系統（擴展版）
 * Phase 8: 添加檢定系統
 * 重構：支援多個效果（與技能一致）
 */
export interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  // 道具類型與數量
  type: 'consumable' | 'equipment';
  quantity: number;
  // 使用效果（重構：改為陣列，支援多個效果）
  effects?: ItemEffect[];
  // 向後兼容：保留 effect 欄位（單一效果），但優先使用 effects
  /** @deprecated 使用 effects 陣列代替 */
  effect?: ItemEffect;
  // Phase 7.6: 標籤系統
  tags?: string[];
  // 檢定系統（Phase 8，Phase 7.6: 擴展為包含 random_contest）
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  // 對抗檢定設定（checkType === 'contest' 時使用）
  contestConfig?: ContestConfig;
  // 隨機檢定設定（checkType === 'random' 時使用）
  randomConfig?: RandomConfig;
  // 使用限制
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  // 流通性
  isTransferable: boolean;
  acquiredAt: Date;
}

/**
 * Phase 4: 數值系統
 */
export interface Stat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}

/**
 * Phase 5: 技能效果
 * Phase 6.5: 擴展跨角色效果（方案 A）
 */
export interface SkillEffect {
  type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' | 
        'task_reveal' | 'task_complete' | 'custom';
  
  // Phase 6.5 方案 A: 目標設定
  targetType?: 'self' | 'other' | 'any';  // 目標對象類型（GM 設定）
  requiresTarget?: boolean;                // 是否需要玩家選擇目標角色
  
  targetStat?: string;
  value?: number;
  // 數值變化目標：'value' 修改目前值，'maxValue' 修改最大值（需要該數值有 maxValue）
  statChangeTarget?: 'value' | 'maxValue';
  // 當 statChangeTarget === 'maxValue' 時，是否同步修改目前值
  syncValue?: boolean;
  targetItemId?: string;
  targetTaskId?: string;
  description?: string;
}

/**
 * Phase 5: 對抗檢定設定
 */
export interface ContestConfig {
  relatedStat: string; // 使用的數值名稱
  opponentMaxItems?: number; // 對方最多可使用道具數（預設 0）
  opponentMaxSkills?: number; // 對方最多可使用技能數（預設 0）
  tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail'; // 平手裁決方式
}

/**
 * Phase 5: 隨機檢定設定
 */
export interface RandomConfig {
  maxValue: number; // 隨機數值上限（預設 100）
  threshold: number; // 門檻值（必須 <= maxValue）
}

/**
 * Phase 5: 技能系統
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  // Phase 7.6: 標籤系統
  tags?: string[];
  // 檢定系統（Phase 7.6: 擴展為包含 random_contest）
  checkType: 'none' | 'contest' | 'random' | 'random_contest';
  // 對抗檢定設定（checkType === 'contest' 時使用）
  contestConfig?: ContestConfig;
  // 隨機檢定設定（checkType === 'random' 時使用）
  randomConfig?: RandomConfig;
  // 使用限制
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  // 效果定義（可多個）
  effects?: SkillEffect[];
}

export interface CreateCharacterInput {
  name: string;
  avatar?: string;
  hasPinLock: boolean;
  pin?: string;
  publicInfo: PublicInfo;
  secretInfo: Omit<SecretInfo, 'isUnlocked'>;
}

export interface UpdateCharacterInput {
  name?: string;
  avatar?: string;
  hasPinLock?: boolean;
  pin?: string;
  publicInfo?: Partial<PublicInfo>;
  secretInfo?: Partial<SecretInfo>;
  tasks?: Task[];
  items?: Item[];
  stats?: Stat[];
  skills?: Skill[];
}

/**
 * Phase 4.5: 任務建立輸入
 */
export interface CreateTaskInput {
  title: string;
  description: string;
  isHidden?: boolean;
  gmNotes?: string;
  revealCondition?: string;
}

/**
 * Phase 4.5: 道具建立輸入
 * Phase 8: 添加檢定系統
 */
export interface CreateItemInput {
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity?: number;
  effects?: ItemEffect[];
  /** @deprecated 使用 effects 陣列代替 */
  effect?: ItemEffect;
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: ContestConfig;
  randomConfig?: RandomConfig;
  usageLimit?: number;
  cooldown?: number;
  isTransferable?: boolean;
}

/**
 * Phase 5: 技能建立輸入
 */
export interface CreateSkillInput {
  name: string;
  description: string;
  iconUrl?: string;
  checkType: 'none' | 'stat' | 'random';
  checkThreshold?: number;
  relatedStat?: string;
  usageLimit?: number;
  cooldown?: number;
  effects?: SkillEffect[];
}

