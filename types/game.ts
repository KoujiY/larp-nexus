// Game (劇本) 相關類型定義

import type { BackgroundBlock } from './character';

/**
 * Phase 3 擴展版劇本資料（用於 API 回傳）
 */
export interface GameData {
  id: string;
  gmUserId: string;
  name: string;
  description: string;
  gameCode: string; // Phase 10: 遊戲代碼（6 位英數字，必填）
  isActive: boolean;
  coverUrl?: string;
  publicInfo?: {
    blocks: BackgroundBlock[];
  };
  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;
  /** 角色數量（僅 getGames 列表頁回傳） */
  characterCount?: number;
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
  coverUrl?: string;
  publicInfo?: {
    blocks: BackgroundBlock[];
  };
  /** 同劇本角色列表（世界觀頁面用） */
  characters: GamePublicCharacter[];
}

/** 角色公開摘要（世界觀頁面角色列表用） */
export interface GamePublicCharacter {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
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
  gameCode: string; // Phase 10: 遊戲代碼（6 位英數字，必填）
  isActive: boolean;
  coverUrl?: string;
  publicInfo?: {
    blocks: BackgroundBlock[];
  };
  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGameInput {
  name: string;
  description?: string;
  publicInfo?: {
    blocks?: BackgroundBlock[];
  };
}

export interface UpdateGameInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  publicInfo?: {
    blocks?: BackgroundBlock[];
  };
  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;
}
