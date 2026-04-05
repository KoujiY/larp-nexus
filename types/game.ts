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
  /** 預設事件列表 */
  presetEvents?: PresetEvent[];
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
  /** 預設事件列表 */
  presetEvents?: PresetEvent[];
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

// ─── Preset Events（預設事件系統）───────────────────

/** 預設事件動作類型 */
export type PresetEventActionType =
  | 'broadcast'
  | 'stat_change'
  | 'reveal_secret'
  | 'reveal_task';

/** 預設事件動作目標：全體角色或指定角色 ID 陣列 */
export type ActionTarget = 'all' | string[];

/**
 * 預設事件動作
 *
 * 依 `type` 使用對應欄位：
 * - broadcast → broadcastTargets, broadcastTitle, broadcastMessage
 * - stat_change → statTargets, statName, statChangeTarget, statChangeValue, syncValue, duration
 * - reveal_secret / reveal_task → revealCharacterId, revealTargetId
 */
export interface PresetEventAction {
  id: string;
  type: PresetEventActionType;
  // ── broadcast ──
  broadcastTargets?: ActionTarget;
  broadcastTitle?: string;
  broadcastMessage?: string;
  // ── stat_change ──
  statTargets?: ActionTarget;
  statName?: string;
  statChangeTarget?: 'value' | 'maxValue';
  statChangeValue?: number;
  syncValue?: boolean;
  duration?: number;
  // ── reveal_secret / reveal_task ──
  revealCharacterId?: string;
  revealTargetId?: string;
}

/** 預設事件（Baseline 定義） */
export interface PresetEvent {
  id: string;
  name: string;
  description?: string;
  /** 執行時是否向玩家顯示事件名稱（時效性效果、通知等） */
  showName?: boolean;
  actions: PresetEventAction[];
}

/** 預設事件（Runtime，含執行狀態） */
export interface PresetEventRuntime extends PresetEvent {
  executedAt?: Date;
  executionCount: number;
  /** 標記此事件僅存在於 Runtime（遊戲進行中新增），不會寫回 Baseline */
  runtimeOnly?: boolean;
}

/** 預設事件 CRUD 輸入 */
export interface PresetEventInput {
  name: string;
  description?: string;
  showName?: boolean;
  actions: PresetEventAction[];
}
