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

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: Date;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
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

