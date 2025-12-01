// Character (角色) 相關類型定義
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

export interface SecretInfo {
  isUnlocked: boolean;
  secrets: Secret[];
  hiddenGoals: string;
}

export interface Secret {
  title: string;
  content: string;
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
}

