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
export interface ItemEffect {
  type: 'stat_change' | 'buff' | 'custom';
  targetStat?: string;
  value?: number;
  duration?: number;
  description?: string;
}

/**
 * Phase 4.5: 道具系統（擴展版）
 */
export interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  // 道具類型與數量
  type: 'consumable' | 'equipment';
  quantity: number;
  // 使用效果
  effect?: ItemEffect;
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
 */
export interface CreateItemInput {
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity?: number;
  effect?: ItemEffect;
  usageLimit?: number;
  cooldown?: number;
  isTransferable?: boolean;
}

