// Game (劇本) 相關類型定義

/**
 * Phase 3 擴展版劇本資料（用於 API 回傳）
 */
export interface GameData {
  id: string;
  gmUserId: string;
  name: string;
  description: string;
  isActive: boolean;
  publicInfo?: {
    intro: string;
    worldSetting: string;
    chapters: Chapter[];
  };
  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 劇本公開資訊（玩家端使用）
 */
export interface GamePublicData {
  id: string;
  name: string;
  description: string;
  publicInfo?: {
    intro: string;
    worldSetting: string;
    chapters: Chapter[];
  };
}

/**
 * 完整版劇本資料（Phase 3/4 使用）
 * 注意：實際模型使用 gmUserId、name、isActive，而非 gmId、title、status
 */
export interface Game {
  _id: string;
  gmUserId: string;
  name: string;
  description: string;
  isActive: boolean;
  publicInfo?: {
    intro: string;
    worldSetting: string;
    chapters: Chapter[];
  };
  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  title: string;
  content: string;
  order: number;
}

export interface CreateGameInput {
  name: string;
  description?: string;
  publicInfo?: {
    intro?: string;
    worldSetting?: string;
    chapters?: Chapter[];
  };
}

export interface UpdateGameInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  publicInfo?: {
    intro?: string;
    worldSetting?: string;
    chapters?: Chapter[];
  };
  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;
}

