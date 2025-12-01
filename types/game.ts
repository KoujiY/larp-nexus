// Game (劇本) 相關類型定義
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

