// Game (劇本) 相關類型定義

/**
 * Phase 2 簡化版劇本資料（用於 API 回傳）
 */
export interface GameData {
  id: string;
  gmUserId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 完整版劇本資料（Phase 3/4 使用）
 */
export interface Game {
  _id: string;
  gmId: string;
  title: string;
  description: string;
  coverImage?: string;
  publicInfo: {
    intro: string;
    worldSetting: string;
    chapters: Chapter[];
  };
  status: 'draft' | 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  title: string;
  content: string;
  order: number;
}

export interface CreateGameInput {
  title: string;
  description?: string;
  coverImage?: string;
  publicInfo: {
    intro: string;
    worldSetting: string;
    chapters: Chapter[];
  };
}

export interface UpdateGameInput {
  title?: string;
  description?: string;
  coverImage?: string;
  publicInfo?: {
    intro?: string;
    worldSetting?: string;
    chapters?: Chapter[];
  };
  status?: 'draft' | 'active' | 'completed';
}

